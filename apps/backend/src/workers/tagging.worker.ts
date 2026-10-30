import { UnrecoverableError, Worker } from "bullmq";
import { AppError } from "../common/exceptions/app-error.js";
import { env } from "../config/env.js";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { logger } from "../infrastructure/logger.js";
import { makeConnection, QUEUE_NAMES, taggingQueue } from "../infrastructure/queue.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import {
  APPLY_ALL_TAGS_JOB, APPLY_TAG_JOB, tagAssignmentService, type ApplyTagJobData,
} from "../modules/tags/tag-assignment.service.js";

enforcePostgresOnlyRuntime();

/** Stable id so restarting the worker never stacks a second schedule. */
const CRON_JOB_ID = "apply-all-tags-cron";

/**
 * Standalone tagging worker — a SEPARATE Node process from the API.
 * Run with: pnpm --filter backend worker:tagging
 *
 * Consumes the "tagging" queue: `apply-tag` recomputes one tag, `apply-all-tags` every tag.
 * Also registers a daily cron (TAGGING_CRON) so papers synced since the last run get tagged.
 */
async function registerCron() {
  // BullMQ keys a repeatable job by name + id + pattern, so a changed TAGGING_CRON would leave the old schedule running.
  for (const existing of await taggingQueue.getRepeatableJobs()) {
    if (existing.name === APPLY_ALL_TAGS_JOB && existing.pattern !== env.TAGGING_CRON) {
      await taggingQueue.removeRepeatableByKey(existing.key);
    }
  }
  await taggingQueue.add(APPLY_ALL_TAGS_JOB, {}, {
    jobId: CRON_JOB_ID,
    repeat: { pattern: env.TAGGING_CRON },
  });
}

async function main() {
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:tagging", queueName: QUEUE_NAMES.tagging });

  const worker = new Worker(
    QUEUE_NAMES.tagging,
    async (job) => {
      logger.info({ jobId: job.id, name: job.name, data: job.data }, "tagging job received");
      if (job.name === APPLY_TAG_JOB) {
        try {
          const result = await tagAssignmentService.applyTag((job.data as ApplyTagJobData).tagId);
          logger.info({ jobId: job.id, ...result }, "tag applied");
          return result;
        } catch (error) {
          // The tag was deleted after the job was queued: retrying cannot help.
          if (error instanceof AppError && error.statusCode === 404) throw new UnrecoverableError(error.message);
          throw error;
        }
      }
      if (job.name === APPLY_ALL_TAGS_JOB) {
        const { results, failures } = await tagAssignmentService.applyAllTags();
        logger.info({
          jobId: job.id,
          tags: results.length,
          failed: failures.length,
          ruleTagged: results.reduce((sum, r) => sum + r.ruleTagged, 0),
          embeddingTagged: results.reduce((sum, r) => sum + r.embeddingTagged, 0),
        }, "all tags applied");
        return { tags: results.length, failures };
      }
      logger.warn({ jobId: job.id, name: job.name }, "unknown tagging job ignored");
      return null;
    },
    { connection: makeConnection(), concurrency: 1 },
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id, name: job.name }, "tagging job completed"));
  worker.on("failed", (job, error) => logger.error({ jobId: job?.id, name: job?.name, error }, "tagging job failed"));

  await registerCron();
  logger.info({ cron: env.TAGGING_CRON }, "tagging worker listening on tagging queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "tagging worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal({ error }, "tagging worker crashed on startup");
  process.exit(1);
});
