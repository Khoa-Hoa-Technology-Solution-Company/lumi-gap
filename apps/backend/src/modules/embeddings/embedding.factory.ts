import { refreshPlatformEmbedding } from "../user-ai/platform-embedding.runtime.js";
import type { EmbeddingProvider } from "./embedding.provider.js";
import { GeminiEmbeddingProvider } from "./gemini-embedding.provider.js";
import { CachingEmbeddingProvider } from "./caching-embedding.provider.js";
import { OpenAiEmbeddingProvider, type EmbeddingEndpoint } from "./openai-embedding.provider.js";

/**
 * The admin's active embedding connection, else the env Gemini key. Both produce the same vectors (a connection is
 * verified against stored ones), so the provenance is fixed and only where a request goes depends on the connection.
 */
class RoutingEmbeddingProvider implements EmbeddingProvider {
  private readonly gemini = new GeminiEmbeddingProvider();
  private connection: { key: string; provider: EmbeddingProvider } | null = null;
  readonly modelName = this.gemini.modelName;
  readonly modelVersion = this.gemini.modelVersion;
  readonly dimensions = this.gemini.dimensions;

  private async target(): Promise<EmbeddingProvider> {
    const active = await refreshPlatformEmbedding();
    if (!active) return this.gemini;
    const key = `${active.id}:${active.version}`;
    if (this.connection?.key !== key) this.connection = { key, provider: new OpenAiEmbeddingProvider(active) };
    return this.connection.provider;
  }

  async embed(text: string): Promise<number[]> {
    return (await this.target()).embed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return (await this.target()).embedBatch(texts);
  }
}

let singleton: EmbeddingProvider | null = null;

/**
 * Return the configured embedding provider. Centralize the choice here so the
 * rest of the codebase stays provider-agnostic. Query embeddings are cached
 * (CachingEmbeddingProvider) so repeated search/report/gap queries don't re-spend
 * the embed quota, on whichever endpoint serves them.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!singleton) singleton = new CachingEmbeddingProvider(new RoutingEmbeddingProvider());
  return singleton;
}

/** A provider for one endpoint regardless of the active connection, for checking a connection before it is used. */
export function embeddingProviderFor(endpoint: EmbeddingEndpoint): EmbeddingProvider {
  return new OpenAiEmbeddingProvider(endpoint);
}
