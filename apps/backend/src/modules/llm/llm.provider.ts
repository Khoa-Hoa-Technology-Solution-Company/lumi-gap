export interface LlmProvider {
  readonly name: string;
  generate(
    prompt: string,
    opts?: {
      system?: string;
      temperature?: number;
      maxOutputTokens?: number;
    },
  ): Promise<string>;
}
