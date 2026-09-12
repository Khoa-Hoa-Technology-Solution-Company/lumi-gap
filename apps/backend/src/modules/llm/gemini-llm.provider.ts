import type { LlmProvider } from "./llm.provider.js";
import { generateText } from "./gemini.client.js";

export class GeminiLlmProvider implements LlmProvider {
  readonly name = "gemini";

  generate(
    prompt: string,
    opts?: {
      system?: string;
      temperature?: number;
      maxOutputTokens?: number;
    },
  ): Promise<string> {
    return generateText(prompt, opts);
  }
}
