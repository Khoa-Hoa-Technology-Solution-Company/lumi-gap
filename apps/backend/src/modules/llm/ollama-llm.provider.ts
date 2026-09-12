import { env } from "../../config/env.js";
import type { LlmProvider } from "./llm.provider.js";

interface OllamaChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OllamaLlmProvider implements LlmProvider {
  readonly name = "ollama";

  constructor(
    private readonly baseUrl = env.OLLAMA_BASE_URL,
    private readonly model = env.OLLAMA_MODEL,
  ) {}

  async generate(
    prompt: string,
    opts?: {
      system?: string;
      temperature?: number;
      maxOutputTokens?: number;
    },
  ): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const messages = [
      ...(opts?.system ? [{ role: "system", content: opts.system }] : []),
      { role: "user", content: prompt },
    ];

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxOutputTokens ?? 1024,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama request failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as OllamaChatCompletionResponse;
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("Ollama returned no assistant content");
    return text;
  }
}
