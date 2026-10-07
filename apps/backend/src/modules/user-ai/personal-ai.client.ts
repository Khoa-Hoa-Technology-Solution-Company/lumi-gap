import type { PersonalAiRuntime } from "./user-ai.runtime.js";
import { providerJson } from "./provider-http.js";
import { AppError } from "../../common/exceptions/app-error.js";

type Tool = { name: string; description: string; parameters: object };
type GenerationOptions = { system?: string; temperature?: number; maxOutputTokens?: number };

export async function personalGenerate(config: PersonalAiRuntime, contents: unknown, options: GenerationOptions, tools?: readonly Tool[]) {
  if (config.provider === "gemini") {
    const result = await providerJson(`${config.baseUrl}/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, config.apiKey, "gemini", {
      contents: typeof contents === "string" ? [{ role: "user", parts: [{ text: contents }] }] : contents,
      ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
      generationConfig: { temperature: options.temperature ?? 0.4, maxOutputTokens: options.maxOutputTokens ?? 1024 },
      ...(tools ? { tools: [{ functionDeclarations: tools }] } : {}),
    });
    return { ...result, text: result.candidates?.[0]?.content?.parts?.filter((part: { text?: string; thought?: boolean }) => part.text && !part.thought).map((part: { text: string }) => part.text).join("") ?? "" };
  }
  const messages = typeof contents === "string" ? [{ role: "user", content: contents }] : contents as object[];
  const result = await providerJson(`${config.baseUrl}/chat/completions`, config.apiKey, "openai-compatible", {
    model: config.model,
    messages: [...(options.system ? [{ role: "system", content: options.system }] : []), ...messages],
    ...(new URL(config.baseUrl).hostname === "api.openai.com" ? {} : { temperature: options.temperature ?? 0.4 }),
    [new URL(config.baseUrl).hostname === "api.openai.com" ? "max_completion_tokens" : "max_tokens"]: options.maxOutputTokens ?? 1024,
    ...(tools ? { tools: tools.map((tool) => ({ type: "function", function: tool })) } : {}),
  });
  const choice = result.choices?.[0];
  if (!choice?.message) throw AppError.serviceUnavailable("AI provider returned no assistant response");
  const message = choice.message;
  return { text: typeof message.content === "string" ? message.content : "", message,
    candidates: [{ finishReason: choice.finish_reason === "length" ? "MAX_TOKENS" : "STOP" }] };
}

export async function personalOpenAiTools(config: PersonalAiRuntime, prompt: string, tools: readonly Tool[], executor: (call: { name: string; args: Record<string, unknown> }) => Promise<unknown>, options: GenerationOptions, maxTurns: number) {
  const messages: object[] = [{ role: "user", content: prompt }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const result = await personalGenerate(config, messages, options, tools);
    if (result.candidates?.[0]?.finishReason === "MAX_TOKENS") return { truncated: true, text: "" };
    const calls = result.message?.tool_calls;
    if (!calls?.length) return { truncated: false, text: result.text };
    messages.push(result.message);
    for (const call of calls) {
      if (!tools.some((tool) => tool.name === call.function?.name)) throw AppError.serviceUnavailable("AI provider requested an unknown tool");
      let args: Record<string, unknown>;
      try { args = JSON.parse(call.function.arguments); if (!args || Array.isArray(args) || typeof args !== "object") throw new Error(); }
      catch { throw AppError.serviceUnavailable("AI provider returned invalid tool arguments"); }
      const output = await executor({ name: call.function.name, args });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
    }
  }
  return { truncated: true, text: "" };
}
