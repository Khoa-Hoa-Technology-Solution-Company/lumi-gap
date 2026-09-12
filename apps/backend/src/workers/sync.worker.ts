import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../infrastructure/db.js";
import { apiSyncQueue, makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { runSync, type RunSyncJob } from "../modules/api-sync/sync.service.js";

/**
 * Standalone OpenAlex sync worker — a SEPARATE Node process from the API.
 * Run with: pnpm --filter backend worker:sync
 *
 * Consumes the "api-sync" BullMQ queue and runs the full ingest pipeline.
 * Also registers the daily cron (SYNC_CRON) as a repeatable job.
 */
async function main() {
  await connectMongo();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:sync", queueName: QUEUE_NAMES.apiSync });

  const worker = new Worker(
    QUEUE_NAMES.apiSync,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "sync job received");
      return runSync(job.data as RunSyncJob);
    },
    { connection: makeConnection(), concurrency: 1 }, // one sync at a time → respect rate limit
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "sync job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "sync job failed"));

  // Register the daily cron as a repeatable job. BullMQ dedups by repeat key,
  // so re-running the worker does not stack duplicate schedules.
  await apiSyncQueue.add(
    "scheduled-sync",
    {
      searchText: "large language model education",
      yearFrom: 2022,
      maxPages: env.SYNC_MAX_PAGES_PER_RUN,
    } satisfies RunSyncJob,
    { repeat: { pattern: env.SYNC_CRON } },
  );

  logger.info({ cron: env.SYNC_CRON }, "sync worker listening on api-sync queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectMongo();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "sync worker crashed on startup");
  process.exit(1);
});
