import { beforeEach, describe, expect, it, vi } from "vitest";
import { personalGenerate, personalOpenAiTools } from "../personal-ai.client.js";
import type { PersonalAiRuntime } from "../user-ai.runtime.js";

const request = vi.hoisted(() => vi.fn());
vi.mock("../provider-http.js", () => ({ providerJson: request }));
const config: PersonalAiRuntime = { id: "test", userId: "owner", provider: "openai-compatible", baseUrl: "https://gateway.example/v1", model: "chosen-model", apiKey: "test-secret", cacheNamespace: "owner:test" };
const tool = { name: "findPapers", description: "Find papers", parameters: { type: "object" } };
beforeEach(() => request.mockReset());

describe("personal AI generation adapters", () => {
  it("uses the selected model, credential and system prompt for compatible gateways", async () => {
    request.mockResolvedValue({ choices: [{ message: { role: "assistant", content: "answer" }, finish_reason: "stop" }] });
    expect(await personalGenerate(config, "question", { system: "instructions", maxOutputTokens: 200 })).toMatchObject({ text: "answer" });
    expect(request).toHaveBeenCalledWith("https://gateway.example/v1/chat/completions", "test-secret", "openai-compatible", {
      model: "chosen-model", messages: [{ role: "system", content: "instructions" }, { role: "user", content: "question" }], temperature: 0.4, max_tokens: 200,
    });
  });
  it("uses completion token budgets for official OpenAI reasoning models", async () => {
    request.mockResolvedValue({ choices: [{ message: { content: "partial" }, finish_reason: "length" }] });
    const result = await personalGenerate({ ...config, baseUrl: "https://api.openai.com/v1" }, "question", {});
    expect(request.mock.calls[0]?.[3]).toMatchObject({ max_completion_tokens: 1024 });
    expect(request.mock.calls[0]?.[3]).not.toHaveProperty("temperature");
    expect(result.candidates[0]?.finishReason).toBe("MAX_TOKENS");
  });
  it("maps Gemini text and excludes hidden thought parts", async () => {
    request.mockResolvedValue({ candidates: [{ content: { parts: [{ text: "hidden", thought: true }, { text: "visible" }] }, finishReason: "STOP" }] });
    const result = await personalGenerate({ ...config, provider: "gemini", baseUrl: "https://gemini.example" }, "question", { system: "instructions" }, [tool]);
    expect(result.text).toBe("visible");
    expect(request).toHaveBeenCalledWith("https://gemini.example/v1beta/models/chosen-model:generateContent", "test-secret", "gemini", expect.objectContaining({
      contents: [{ role: "user", parts: [{ text: "question" }] }], tools: [{ functionDeclarations: [tool] }], systemInstruction: { parts: [{ text: "instructions" }] },
    }));
  });
  it("sends assistant tool history and tool results back to the selected model", async () => {
    const assistant = { role: "assistant", content: null, tool_calls: [{ id: "call1", type: "function", function: { name: tool.name, arguments: '{"topic":"AI"}' } }] };
    request.mockResolvedValueOnce({ choices: [{ message: assistant }] }).mockResolvedValueOnce({ choices: [{ message: { role: "assistant", content: "final" } }] });
    const executor = vi.fn().mockResolvedValue({ papers: ["paper1"] });
    expect(await personalOpenAiTools(config, "question", [tool], executor, {}, 3)).toEqual({ truncated: false, text: "final" });
    expect(executor).toHaveBeenCalledWith({ name: tool.name, args: { topic: "AI" } });
    expect(request.mock.calls[1]?.[3].messages).toEqual([{ role: "user", content: "question" }, assistant, { role: "tool", tool_call_id: "call1", content: '{"papers":["paper1"]}' }]);
  });
  it.each([['unknown', '{}'], [tool.name, '[]'], [tool.name, 'invalid']])("rejects unsafe tool requests %s %s without executing", async (name, args) => {
    request.mockResolvedValue({ choices: [{ message: { tool_calls: [{ id: "call1", function: { name, arguments: args } }] } }] });
    const executor = vi.fn();
    await expect(personalOpenAiTools(config, "question", [tool], executor, {}, 3)).rejects.toMatchObject({ statusCode: 503 });
    expect(executor).not.toHaveBeenCalled();
  });
  it("does not execute tools or return partial content when output truncates", async () => {
    request.mockResolvedValue({ choices: [{ message: { content: "partial" }, finish_reason: "length" }] });
    expect(await personalOpenAiTools(config, "question", [tool], vi.fn(), {}, 3)).toEqual({ truncated: true, text: "" });
  });
});
