import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { getEmbeddingProvider } from "./embedding.factory.js";
import type { EmbeddingProvider } from "./embedding.provider.js";

export interface RunEmbeddingJob {
  /** Override env.EMBED_BATCH_SIZE for this run. */
  batchSize?: number;
  /** Override env.EMBED_MAX_PAPERS_PER_RUN for this run. */
  maxPapers?: number;
}

export interface EmbeddingRunResult {
  totalEmbedded: number;
  totalFailed: number;
  batches: number;
}

export interface EmbeddingProvenance {
  embeddingModel: string;
  embeddingVersion: string;
  embeddingDimensions: number;
  embeddingUpdatedAt: Date;
}

export function buildEmbeddingCandidateFilter(provider: EmbeddingProvider): Record<string, unknown> {
  return {
    isAiAnalyzable: true,
    dataStatus: "active",
    $or: [
      { embedding: { $exists: false } },
      { embeddingModel: { $ne: provider.modelName } },
      { embeddingVersion: { $ne: provider.modelVersion } },
      { embeddingDimensions: { $ne: provider.dimensions } },
    ],
  };
}

export function buildEmbeddingProvenance(
  provider: EmbeddingProvider,
  updatedAt = new Date(),
): EmbeddingProvenance {
  return {
    embeddingModel: provider.modelName,
    embeddingVersion: provider.modelVersion,
    embeddingDimensions: provider.dimensions,
    embeddingUpdatedAt: updatedAt,
  };
}

/**
 * Generate vector embeddings for every active, AI-analyzable paper whose
 * vector is absent or stale for the configured model/version/dimensions.
 *
 * Existing vectors without provenance remain readable, but are selected once
 * for a compatibility backfill. A paper drops out after vector + provenance are
 * written atomically.
 */
export async function runEmbedding(job: RunEmbeddingJob = {}): Promise<EmbeddingRunResult> {
  const provider = getEmbeddingProvider();
  const batchSize = job.batchSize ?? env.EMBED_BATCH_SIZE;
  const maxPapers = job.maxPapers ?? env.EMBED_MAX_PAPERS_PER_RUN;

  // Only ACTIVE papers good enough for AI, that don't have a vector yet. The
  // `dataStatus: "active"` gate keeps unreviewed user submissions (draft/pending)
  // out of the embedding quota + semantic index until an admin approves them.
  const filter = buildEmbeddingCandidateFilter(provider);

  let totalEmbedded = 0;
  let totalFailed = 0;
  let batches = 0;

  await auditService.log("embedding.run.started", { details: { batchSize, maxPapers } });
  logger.info(
    {
      batchSize,
      maxPapers,
      model: provider.modelName,
      version: provider.modelVersion,
      dims: provider.dimensions,
    },
    "embedding run started",
  );

  while (totalEmbedded + totalFailed < maxPapers) {
    const candidates = await PaperModel.find(filter)
      // Prioritize user-contributed/requested papers first (uploadedBy exists)
      .sort({ uploadedBy: -1, citationCount: -1, publicationYear: -1 })
      .select("_id title abstractText")
      .limit(batchSize)
      .lean();

    if (candidates.length === 0) break;
    batches += 1;

    // Input text = title + abstract. Abstract may be missing → still embeddable.
    const texts = candidates.map((p) => `${p.title ?? ""}\n\n${p.abstractText ?? ""}`.trim());

    let vectors: number[][];
    try {
      vectors = await provider.embedBatch(texts);
    } catch (err) {
      // Batch failed (rate limit / network). Papers from earlier batches in this
      // run are already persisted (we store per batch). RETHROW — do not `break`
      // and return — so the worker's job actually FAILS and BullMQ retries it with
      // exponential backoff (a transient blip recovers in minutes instead of
      // waiting for the next daily cron). Returning normally marks the job COMPLETED
      // and no retry ever happens. Throwing also can't loop: it exits runEmbedding.
      totalFailed += candidates.length;
      logger.error(
        { err, batch: batches, size: candidates.length, totalEmbedded, totalFailed },
        "embedding batch failed — rethrowing for BullMQ retry",
      );
      throw err;
    }

    if (
      vectors.length !== candidates.length
      || vectors.some((vector) => vector.length !== provider.dimensions)
    ) {
      throw new Error(
        `Embedding batch shape mismatch: expected ${candidates.length} vectors of ${provider.dimensions} dimensions`,
      );
    }

    const provenance = buildEmbeddingProvenance(provider);
    await Promise.all(
      candidates.map((p, i) => {
        const vec = vectors[i];
        return PaperModel.updateOne(
          { _id: p._id, ...filter },
          { $set: { embedding: vec, ...provenance } },
        );
      }),
    );
    totalEmbedded += candidates.length;
    logger.info({ batch: batches, embedded: totalEmbedded }, "embedding batch stored");
  }

  await auditService.log("embedding.run.completed", {
    details: { totalEmbedded, totalFailed, batches },
  });
  logger.info({ totalEmbedded, totalFailed, batches }, "embedding run completed");

  return { totalEmbedded, totalFailed, batches };
}
