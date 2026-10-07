import { env } from "../../config/env.js";
import type { LlmProvider } from "./llm.provider.js";
import { GeminiLlmProvider } from "./gemini-llm.provider.js";
import { OllamaLlmProvider } from "./ollama-llm.provider.js";
import { personalAiRuntime } from "../user-ai/user-ai.runtime.js";
import { generateText } from "./gemini.client.js";

let singleton: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  const personal = personalAiRuntime();
  if (personal) return { name: personal.provider, generate: generateText };
  if (!singleton) {
    singleton = env.LLM_PROVIDER === "ollama" ? new OllamaLlmProvider() : new GeminiLlmProvider();
  }
  return singleton;
}

export function resetLlmProviderForTests(): void {
  singleton = null;
}
