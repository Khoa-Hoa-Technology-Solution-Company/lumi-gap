/**
 * Generic embedding interface — backend code should depend on this, never on
 * a specific provider. Swap implementations (Gemini → local Xenova → Cohere)
 * by changing one wire-up in `embedding.factory.ts`.
 */
export interface EmbeddingProvider {
  readonly modelName: string;
  readonly modelVersion: string;
  readonly dimensions: number;

  embed(text: string): Promise<number[]>;

  /** Implementations should batch internally when supported. */
  embedBatch(texts: string[]): Promise<number[][]>;
}
