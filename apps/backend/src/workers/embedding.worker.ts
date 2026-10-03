import { Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { env } from "../config/env.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { embeddingQueue, makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { COMMUNITY_EMBEDDING_JOB, runCommunityEmbedding } from "../modules/communities/community-embedding.service.js";
import { runEmbedding, type RunEmbeddingJob } from "../modules/embeddings/embedding.service.js";

enforcePostgresOnlyRuntime();

/**
 * Standalone embedding worker — a SEPARATE Node process from the API.
 * Run with: pnpm --filter backend worker:embedding
 *
 * Consumes the "embedding" BullMQ queue and vectorises ACTIVE communities and AI-analyzable papers.
 * Also registers a daily cron (EMBED_CRON) so newly-synced papers get embedded.
 */
async function main() {
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:embedding", queueName: QUEUE_NAMES.embedding });

  const worker = new Worker(
    QUEUE_NAMES.embedding,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "embedding job received");
      // Community-only job: cheap and triggered by a content change, so skip the paper batch.
      if (job.name === COMMUNITY_EMBEDDING_JOB) return { communities: await runCommunityEmbedding() };
      // Communities are few and cheap; embed them first so they never wait behind a large paper batch.
      const communities = await runCommunityEmbedding();
      return { communities, papers: await runEmbedding(job.data as RunEmbeddingJob) };
    },
    { connection: makeConnection(), concurrency: 1 }, // one run at a time → respect Gemini rate limit
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "embedding job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "embedding job failed"));

  // Daily cron. BullMQ dedups by repeat key, so re-running the worker does not
  // stack duplicate schedules.
  await embeddingQueue.add("scheduled-embedding", {} satisfies RunEmbeddingJob, {
    repeat: { pattern: env.EMBED_CRON },
  });

  logger.info({ cron: env.EMBED_CRON }, "embedding worker listening on embedding queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "embedding worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "embedding worker crashed on startup");
  process.exit(1);
});
