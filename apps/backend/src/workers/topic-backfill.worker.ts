import { UnrecoverableError, Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { logger } from "../infrastructure/logger.js";
import { makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import {
  scrubErrorMessage, TOPIC_BACKFILL_JOB, topicBackfillService, type TopicBackfillJobData,
} from "../modules/topic-backfill/topic-backfill.service.js";

enforcePostgresOnlyRuntime();

/**
 * Standalone topic backfill worker — a SEPARATE Node process from the API.
 * Run with: pnpm --filter backend worker:topic-backfill
 *
 * Consumes the "topic-backfill" queue: each job imports the OpenAlex works one thin catalogue entry is missing.
 * Concurrency 1 keeps it to one import at a time, polite to OpenAlex. No cron and no LLM calls.
 */
async function main() {
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:topic-backfill", queueName: QUEUE_NAMES.topicBackfill });

  // A row whose job is gone would hold the one-live-run-per-target index and block that entry for ever.
  const orphaned = await topicBackfillService.failOrphanedRuns();
  if (orphaned) logger.warn({ orphaned }, "marked orphaned topic backfill runs as failed");

  const worker = new Worker(
    QUEUE_NAMES.topicBackfill,
    async (job) => {
      if (job.name !== TOPIC_BACKFILL_JOB) {
        logger.warn({ jobId: job.id, name: job.name }, "unknown topic backfill job ignored");
        return null;
      }
      logger.info({ jobId: job.id, runId: (job.data as TopicBackfillJobData).runId }, "topic backfill job received");
      return topicBackfillService.runBackfill((job.data as TopicBackfillJobData).runId);
    },
    { connection: makeConnection(), concurrency: 1 },
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "topic backfill job completed"));
  worker.on("failed", (job, error) => {
    // The message, not the error object: provider errors can quote URLs that carry the API key.
    logger.error({ jobId: job?.id, message: scrubErrorMessage(error) }, "topic backfill job failed");
    if (!job) return;
    // A failure with attempts left is retried from the first page; only the last one ends the run.
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1) || error instanceof UnrecoverableError;
    if (!exhausted) return;
    void topicBackfillService.markFailed((job.data as TopicBackfillJobData).runId, error)
      .catch((markError) => logger.error({ jobId: job.id, message: scrubErrorMessage(markError) }, "could not mark topic backfill run failed"));
  });

  logger.info("topic backfill worker listening on topic-backfill queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "topic backfill worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal({ message: scrubErrorMessage(error) }, "topic backfill worker crashed on startup");
  process.exit(1);
});
