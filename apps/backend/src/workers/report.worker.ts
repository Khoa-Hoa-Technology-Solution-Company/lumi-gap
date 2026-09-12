import { UnrecoverableError, Worker } from "bullmq";
import { connectMongo, disconnectMongo } from "../infrastructure/db.js";
import { makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { ReportModel } from "../modules/reports/models/report.model.js";
import { markReportFailed, runRagPipeline, type ReportJob } from "../modules/reports/rag.service.js";
import { PROMPT_VERSION } from "../modules/reports/report.prompt.js";

/**
 * Standalone report worker — a SEPARATE Node process from the API.
 * Run with: pnpm --filter backend worker:report
 *
 * Consumes the "report" BullMQ queue: each job is one RAG pipeline run
 * (embed → vector search → Gemini → persist). Concurrency 1 keeps us inside
 * the Gemini free-tier rate limit; BullMQ retries transient failures
 * (5 attempts, exponential backoff). Non-retryable errors (e.g. output
 * truncation) short-circuit via UnrecoverableError so quota isn't wasted.
 */

/** Reports stuck in "generating" longer than this are orphans of a dead worker. */
const STUCK_GENERATING_MS = 5 * 60_000;
/** Reports stuck in "queued" longer than this had their job lost (never picked up). */
const STUCK_QUEUED_MS = 30 * 60_000;

/** Generic user-facing failure text — raw error internals stay in server logs. */
const USER_FACING_FAILURE = "Report generation failed. Please try again later.";

async function main() {
  await connectMongo();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:report", queueName: QUEUE_NAMES.report });

  // Startup sweep: a hard-killed worker leaves reports frozen in "generating", and
  // a lost job (Redis flush / enqueue failure) leaves one stuck in "queued" forever.
  // Both keep counting against the user's pending-report quota until cleared, so fail
  // them cleanly. (Mirrors gaps.worker, which already sweeps orphaned queued jobs.)
  const now = Date.now();
  const swept = await ReportModel.updateMany(
    {
      $or: [
        { status: "generating", updatedAt: { $lt: new Date(now - STUCK_GENERATING_MS) } },
        { status: "queued", updatedAt: { $lt: new Date(now - STUCK_QUEUED_MS) } },
      ],
    },
    {
      $set: {
        status: "failed",
        errorMessage: "Report generation was interrupted (worker restarted). Please try again.",
      },
    },
  );
  if (swept.modifiedCount > 0) logger.warn({ swept: swept.modifiedCount }, "swept stuck reports");

  const worker = new Worker(
    QUEUE_NAMES.report,
    async (job) => {
      logger.info({ jobId: job.id, attempt: job.attemptsMade + 1 }, "report job received");
      try {
        await runRagPipeline(job.data as ReportJob);
      } catch (err) {
        // Truncation & friends can never succeed on retry — skip the backoff dance.
        if (err instanceof Error && (err as { nonRetryable?: boolean }).nonRetryable) {
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    },
    { connection: makeConnection(), concurrency: 1 },
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "report job completed"));
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, "report job failed");
    // Out of retries (or unrecoverable) → surface a SAFE message to the user;
    // the raw error stays in the log line above.
    const exhausted = job && job.attemptsMade >= (job.opts.attempts ?? 1);
    const unrecoverable = err instanceof UnrecoverableError;
    if (job && (exhausted || unrecoverable)) {
      const { reportId } = job.data as ReportJob;
      void markReportFailed(reportId, USER_FACING_FAILURE);
    }
  });

  logger.info({ promptVersion: PROMPT_VERSION }, "report worker listening on report queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "report worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectMongo();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "report worker crashed on startup");
  process.exit(1);
});
