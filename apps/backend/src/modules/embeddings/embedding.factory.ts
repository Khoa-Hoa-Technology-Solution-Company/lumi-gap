import type { EmbeddingProvider } from "./embedding.provider.js";
import { GeminiEmbeddingProvider } from "./gemini-embedding.provider.js";
import { CachingEmbeddingProvider } from "./caching-embedding.provider.js";

let singleton: EmbeddingProvider | null = null;

/**
 * Return the configured embedding provider. Centralize the choice here so the
 * rest of the codebase stays provider-agnostic. Query embeddings are cached
 * (CachingEmbeddingProvider) so repeated search/report/gap queries don't re-spend
 * the Gemini free-tier embed quota. To swap in a local Xenova provider later,
 * change the inner provider here.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!singleton) singleton = new CachingEmbeddingProvider(new GeminiEmbeddingProvider());
  return singleton;
}
