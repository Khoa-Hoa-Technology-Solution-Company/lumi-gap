import { UnrecoverableError, Worker } from "bullmq";
import { connectMongo, disconnectMongo } from "../infrastructure/db.js";
import { makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { GapAnalysisModel } from "../modules/gaps/models/gap-analysis.model.js";
import { gapsService, type GapJob } from "../modules/gaps/gaps.service.js";

/**
 * Standalone gaps worker — a SEPARATE Node process from the API.
 * Run with: pnpm --filter backend worker:gaps
 *
 * Consumes the "gaps" BullMQ queue: each job is one gap-analysis pipeline run
 * (embed → vector search → Gemini → persist). Concurrency 1 keeps us inside the
 * Gemini free-tier rate limit; BullMQ retries transient failures (5 attempts,
 * exponential backoff). Non-retryable errors short-circuit via UnrecoverableError.
 */

/** Analyses stuck in "analyzing" longer than this are orphans of a dead worker. */
const STUCK_ANALYZING_MS = 5 * 60_000;

/** Generic user-facing failure text — raw error internals stay in server logs. */
const USER_FACING_FAILURE = "Gap analysis failed. Please try again later.";

async function main() {
  await connectMongo();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:gaps", queueName: QUEUE_NAMES.gaps });

  // Startup sweep: a hard-killed worker leaves analyses frozen in "analyzing".
  // Fail them cleanly so the FE poll terminates instead of spinning forever.
  const swept = await GapAnalysisModel.updateMany(
    { status: "analyzing", updatedAt: { $lt: new Date(Date.now() - STUCK_ANALYZING_MS) } },
    {
      $set: {
        status: "failed",
        errorMessage: "Gap analysis was interrupted (worker restarted). Please try again.",
      },
    },
  );
  if (swept.modifiedCount > 0) {
    logger.warn({ swept: swept.modifiedCount }, "swept stuck gap analyses");
  }

  // Also sweep orphaned "queued" docs (no matching BullMQ job, stuck for > 30 min)
  const orphaned = await GapAnalysisModel.updateMany(
    { status: "queued", updatedAt: { $lt: new Date(Date.now() - 30 * 60_000) } },
    {
      $set: {
        status: "failed",
        errorMessage: "Gap analysis was stuck in queue (worker restarted). Please try again.",
      },
    },
  );
  if (orphaned.modifiedCount > 0) {
    logger.warn({ swept: orphaned.modifiedCount }, "swept orphaned queued gap analyses");
  }

  const worker = new Worker(
    QUEUE_NAMES.gaps,
    async (job) => {
      logger.info({ jobId: job.id, attempt: job.attemptsMade + 1 }, "gap job received");
      try {
        await gapsService.runGapPipeline(job.data as GapJob);
      } catch (err) {
        // Non-retryable errors (e.g. output truncation) skip the backoff dance.
        if (err instanceof Error && (err as { nonRetryable?: boolean }).nonRetryable) {
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    },
    { connection: makeConnection(), concurrency: 1 },
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "gap job completed"));
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, "gap job failed");
    // Out of retries (or unrecoverable) → surface a SAFE message to the user;
    // the raw error stays in the log line above.
    const exhausted = job && job.attemptsMade >= (job.opts.attempts ?? 1);
    const unrecoverable = err instanceof UnrecoverableError;
    if (job && (exhausted || unrecoverable)) {
      const { analysisId } = job.data as GapJob;
      void gapsService.markAnalysisFailed(analysisId, USER_FACING_FAILURE);
    }
  });

  logger.info("gaps worker listening on gaps queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "gaps worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectMongo();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "gaps worker crashed on startup");
  process.exit(1);
});
