import { env } from "../../config/env.js";
import { geminiClient } from "../llm/gemini.client.js";
import { logger } from "../../infrastructure/logger.js";
import { AppError } from "../../common/exceptions/app-error.js";
import type { EmbeddingProvider } from "./embedding.provider.js";

/** True when an error looks like an expired/invalid Gemini API key. */
function isApiKeyError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return msg.includes("api key") || msg.includes("api_key") || msg.includes("expired");
}

/** Daily/free-tier quota exhaustion is not transient within this request. */
function isQuotaExhausted(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    msg.includes("quota exceeded") ||
    msg.includes("exceeded your current quota") ||
    msg.includes("free_tier_requests") ||
    msg.includes("resource_exhausted")
  );
}

/**
 * Gemini embedding provider. Uses `gemini-embedding-2` by default.
 *
 * NOTE: this model's `embedContent` collapses an array of texts into a SINGLE
 * content (one embedding) — true request batching does NOT work here, confirmed
 * in practice ("count mismatch: got 1, expected N"). So `embedBatch` embeds each
 * text individually in small concurrent waves. The real throughput limit is the
 * Gemini free-tier RPM, not the request count — handled by retry/backoff below.
 */
const EMBED_CONCURRENCY = 3; // small waves to stay under free-tier RPM
const MAX_RETRIES = 4;
const EMBED_REQUEST_TIMEOUT_MS = 15_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function withEmbedTimeout<T>(op: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Gemini embedding timed out after ${EMBED_REQUEST_TIMEOUT_MS}ms`)),
      EMBED_REQUEST_TIMEOUT_MS,
    );
  });
  return Promise.race([op, timeout]).finally(() => clearTimeout(timer));
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = env.GEMINI_EMBEDDING_MODEL;
  readonly modelVersion = env.GEMINI_EMBEDDING_VERSION;
  readonly dimensions = env.GEMINI_EMBEDDING_DIMENSIONS;

  async embed(text: string): Promise<number[]> {
    return this.embedWithRetry(text, 1);
  }

  /** Single embedding with exponential-backoff retry on 429/503 (free-tier
   *  rate limits and transient server errors). */
  private async embedWithRetry(text: string, attempt: number): Promise<number[]> {
    try {
      const res = await withEmbedTimeout(
        geminiClient.models.embedContent({
          model: this.modelName,
          contents: text,
          config: { outputDimensionality: this.dimensions },
        }),
      );
      return this.validateVec(res.embeddings?.[0]?.values);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429 && isQuotaExhausted(err)) {
        logger.warn({ status }, "gemini embed quota exhausted; failing fast");
        throw AppError.serviceUnavailable("AI embedding quota exhausted. Retry later or use fallback retrieval.");
      }
      if ((status === 429 || status === 503) && attempt <= MAX_RETRIES) {
        const backoff = 3000 * 2 ** (attempt - 1); // 3s, 6s, 12s, 24s
        logger.warn({ status, attempt, backoffMs: backoff }, "gemini embed rate-limited — retrying");
        await sleep(backoff);
        return this.embedWithRetry(text, attempt + 1);
      }
      // Expired/invalid key is a server config problem, not the caller's fault —
      // surface an actionable 503 (raw error stays in the log, never the client).
      if (isApiKeyError(err)) {
        logger.error({ err }, "gemini API key appears expired/invalid");
        throw AppError.serviceUnavailable(
          "AI service is unavailable (Gemini API key expired or invalid). Check GEMINI_API_KEY.",
        );
      }
      throw err;
    }
  }

  /** Embed each text individually (this model returns one vector per request),
   *  in small concurrent waves to balance speed against the free-tier RPM. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const out: number[][] = new Array(texts.length);
    for (let i = 0; i < texts.length; i += EMBED_CONCURRENCY) {
      const slice = texts.slice(i, i + EMBED_CONCURRENCY);
      const vecs = await Promise.all(slice.map((t) => this.embed(t)));
      vecs.forEach((v, j) => (out[i + j] = v));
    }
    return out;
  }

  /** Reject empty or wrong-dimension vectors before they reach the DB — a bad
   *  vector would corrupt the 768-dim Atlas index (vector search errors / drops it). */
  private validateVec(vec: number[] | undefined): number[] {
    if (!vec || vec.length === 0) throw new Error("Empty embedding response from Gemini");
    if (vec.length !== this.dimensions) {
      throw new Error(`Embedding dimension mismatch: got ${vec.length}, expected ${this.dimensions}`);
    }
    return vec;
  }
}
