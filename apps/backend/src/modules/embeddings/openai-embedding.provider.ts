import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";
import { AiProviderHttpError, providerJson } from "../user-ai/provider-http.js";
import type { EmbeddingProvider } from "./embedding.provider.js";

export interface EmbeddingEndpoint {
  baseUrl: string;
  model: string;
  readonly apiKey: string;
}

const REQUEST_BATCH_SIZE = 32;
const QUERY_TIMEOUT_MS = 15_000;
const BATCH_TIMEOUT_MS = 60_000;
const QUERY_RETRIES = 1; // a search must fail fast and fall back to text retrieval
const BATCH_RETRIES = 4;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(error: unknown): error is AiProviderHttpError {
  return error instanceof AiProviderHttpError && RETRYABLE_STATUSES.has(error.status) && !error.nonRetryable;
}

/**
 * Embeddings through an OpenAI-compatible `/embeddings` endpoint. The provenance fields name the stored vector space,
 * not the endpoint's id for the model: a connection is saved only after its vectors matched the stored ones.
 */
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = env.GEMINI_EMBEDDING_MODEL;
  readonly modelVersion = env.GEMINI_EMBEDDING_VERSION;
  readonly dimensions = env.GEMINI_EMBEDDING_DIMENSIONS;

  constructor(private readonly endpoint: EmbeddingEndpoint) {}

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.request([text], QUERY_TIMEOUT_MS, QUERY_RETRIES);
    return vector!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += REQUEST_BATCH_SIZE) {
      out.push(...await this.request(texts.slice(i, i + REQUEST_BATCH_SIZE), BATCH_TIMEOUT_MS, BATCH_RETRIES));
    }
    return out;
  }

  private async request(input: string[], timeoutMs: number, retries: number, attempt = 1): Promise<number[][]> {
    try {
      const body = { model: this.endpoint.model, input, dimensions: this.dimensions, encoding_format: "float" };
      return this.vectors(await providerJson(`${this.endpoint.baseUrl}/embeddings`, this.endpoint.apiKey, "openai-compatible", body, timeoutMs), input.length);
    } catch (error) {
      if (!isRetryable(error) || attempt > retries) throw error;
      const backoffMs = Math.max(3000 * 2 ** (attempt - 1), error.retryDelayMs ?? 0); // 3s, 6s, 12s, 24s
      logger.warn({ status: error.status, attempt, backoffMs }, "embedding endpoint unavailable; retrying");
      await sleep(backoffMs);
      return this.request(input, timeoutMs, retries, attempt + 1);
    }
  }

  /** Reject a wrong count or shape before a vector reaches the DB: the columns are vector(768). */
  private vectors(result: { data?: Array<{ index?: number; embedding?: unknown }> }, expected: number): number[][] {
    const rows = [...(result?.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (rows.length !== expected) throw AppError.serviceUnavailable(`The embedding endpoint returned ${rows.length} vectors for ${expected} texts.`);
    return rows.map((row) => {
      const vector = row.embedding;
      if (!Array.isArray(vector) || vector.length !== this.dimensions || !vector.every(Number.isFinite)) {
        throw AppError.serviceUnavailable(`The embedding endpoint must return ${this.dimensions}-dimensional vectors${Array.isArray(vector) ? ` (got ${vector.length})` : ""}.`);
      }
      return vector as number[];
    });
  }
}
