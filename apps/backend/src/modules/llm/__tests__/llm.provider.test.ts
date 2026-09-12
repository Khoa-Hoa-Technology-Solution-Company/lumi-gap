import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaLlmProvider } from "../ollama-llm.provider.js";

describe("OllamaLlmProvider.generate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the OpenAI-compatible chat completions endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Xin chao" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaLlmProvider("http://localhost:11434", "llama3.2:3b");
    const result = await provider.generate("Hello", {
      system: "System prompt",
      temperature: 0.2,
      maxOutputTokens: 123,
    });

    expect(result).toBe("Xin chao");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      temperature: number;
      max_tokens: number;
    };
    expect(body).toEqual({
      model: "llama3.2:3b",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: "Hello" },
      ],
      temperature: 0.2,
      max_tokens: 123,
    });
  });
});

describe("getLlmProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns Gemini by default", async () => {
    vi.stubEnv("VITEST", "true");
    vi.stubEnv("LLM_PROVIDER", "gemini");
    const { getLlmProvider } = await import("../llm.factory.js");
    expect(getLlmProvider().name).toBe("gemini");
  });

  it("returns Ollama when LLM_PROVIDER=ollama", async () => {
    vi.stubEnv("VITEST", "true");
    vi.stubEnv("LLM_PROVIDER", "ollama");
    const { getLlmProvider } = await import("../llm.factory.js");
    expect(getLlmProvider().name).toBe("ollama");
  });
});
