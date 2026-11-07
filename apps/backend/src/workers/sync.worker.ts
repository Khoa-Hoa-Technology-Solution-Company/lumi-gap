import { UnrecoverableError, Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { env } from "../config/env.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { apiSyncQueue, paperAnalysisQueue, makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { isNonRetryableOpenAlexError } from "../modules/api-sync/providers/openalex.client.js";
import { runSync, type RunSyncJob } from "../modules/api-sync/sync.service.js";
import { TOPIC_WATCH_DAILY_JOB, TOPIC_WATCH_RUN_JOB } from "../modules/topic-watch/topic-watch.rules.js";
import { topicWatchService } from "../modules/topic-watch/topic-watch.service.js";

enforcePostgresOnlyRuntime();

/** The fixed-query cron this worker used to register. Its schedule lives in Redis until it is removed. */
const RETIRED_CRON_JOB = "scheduled-sync";

/**
 * Standalone OpenAlex sync worker — a SEPARATE Node process from the API.
 * Run with: pnpm --filter backend worker:sync
 *
 * Consumes the "api-sync" BullMQ queue: admin-started syncs and the topic watches. Also registers the daily
 * topic-watch run (SYNC_CRON) as a repeatable job; it does nothing until an admin follows an entry.
 */
async function main() {
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:sync", queueName: QUEUE_NAMES.apiSync });

  const worker = new Worker(
    QUEUE_NAMES.apiSync,
    async (job) => {
      logger.info({ jobId: job.id, name: job.name, data: job.data }, "sync job received");
      if (job.name === RETIRED_CRON_JOB) return { ignored: true };
      if (job.name === TOPIC_WATCH_DAILY_JOB || job.name === TOPIC_WATCH_RUN_JOB) return topicWatchService.runDaily();
      let result: Awaited<ReturnType<typeof runSync>>;
      try {
        result = await runSync(job.data as RunSyncJob);
      } catch (error) {
        // A request OpenAlex rejected (bad filter, bad api_key, ...) fails identically on every attempt.
        if (isNonRetryableOpenAlexError(error)) throw new UnrecoverableError((error as Error).message);
        throw error;
      }
      await paperAnalysisQueue.add("synced-paper-knowledge", {});
      return result;
    },
    { connection: makeConnection(), concurrency: 1 }, // one sync at a time → respect rate limit
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "sync job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "sync job failed"));

  // BullMQ keys a repeatable job by name + id + pattern, so a retired job or a changed SYNC_CRON would keep running.
  for (const existing of await apiSyncQueue.getRepeatableJobs()) {
    if (existing.name === RETIRED_CRON_JOB || (existing.name === TOPIC_WATCH_DAILY_JOB && existing.pattern !== env.SYNC_CRON)) {
      await apiSyncQueue.removeRepeatableByKey(existing.key);
    }
  }
  await apiSyncQueue.add(TOPIC_WATCH_DAILY_JOB, {}, { repeat: { pattern: env.SYNC_CRON } });

  logger.info({ cron: env.SYNC_CRON }, "sync worker listening on api-sync queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "sync worker crashed on startup");
  process.exit(1);
});
