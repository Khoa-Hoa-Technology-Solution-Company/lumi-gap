import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../infrastructure/db.js";
import { embeddingQueue, makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { runEmbedding, type RunEmbeddingJob } from "../modules/embeddings/embedding.service.js";

/**
 * Standalone embedding worker — a SEPARATE Node process from the API.
 * Run with: pnpm --filter backend worker:embedding
 *
 * Consumes the "embedding" BullMQ queue and vectorises AI-analyzable papers.
 * Also registers a daily cron (EMBED_CRON) so newly-synced papers get embedded.
 */
async function main() {
  await connectMongo();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:embedding", queueName: QUEUE_NAMES.embedding });

  const worker = new Worker(
    QUEUE_NAMES.embedding,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "embedding job received");
      return runEmbedding(job.data as RunEmbeddingJob);
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
    await disconnectMongo();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "embedding worker crashed on startup");
  process.exit(1);
});
