import { cache, hashKey } from "../../infrastructure/cache.js";
import type { EmbeddingProvider } from "./embedding.provider.js";

/** Embeddings for a given (model, text) are stable, so cache them long. */
const EMBED_CACHE_TTL_SECONDS = 30 * 24 * 3600; // 30 days

/**
 * Wraps an EmbeddingProvider and caches single-query embeddings in Redis. The
 * SAME query (search / report / gap) then costs ZERO embed-API calls after the
 * first — critical on the Gemini free tier (1000 embed/day per project): rehearse
 * the demo queries once, and every replay is quota-free.
 *
 * `embedBatch` is passed straight through — paper embeddings are unique and
 * embedded once (idempotent via `embedding: {$exists:false}`), so caching them
 * would only waste Redis memory.
 */
export class CachingEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly inner: EmbeddingProvider) {}

  get modelName(): string {
    return this.inner.modelName;
  }
  get modelVersion(): string {
    return this.inner.modelVersion;
  }
  get dimensions(): number {
    return this.inner.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const key = `emb:${this.inner.modelName}:${this.inner.modelVersion}:${this.inner.dimensions}:${hashKey(text)}`;
    const cached = await cache.get<number[]>(key);
    // Guard against a stale/corrupt entry of the wrong dimension.
    if (cached && cached.length === this.inner.dimensions) return cached;

    const vec = await this.inner.embed(text);
    await cache.set(key, vec, EMBED_CACHE_TTL_SECONDS);
    return vec;
  }

  embedBatch(texts: string[]): Promise<number[][]> {
    return this.inner.embedBatch(texts);
  }
}
