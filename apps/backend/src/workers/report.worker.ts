import { UnrecoverableError, Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { getPrisma } from "../infrastructure/database/prisma.js";
import { makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { markReportFailed, runRagPipeline, type ReportJob } from "../modules/reports/rag.service.js";
import { PROMPT_VERSION } from "../modules/reports/report.prompt.js";
import { withUserAi } from "../modules/user-ai/user-ai.runtime.js";

enforcePostgresOnlyRuntime();

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
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:report", queueName: QUEUE_NAMES.report });

  // Startup sweep: a hard-killed worker leaves reports frozen in "generating", and
  // a lost job (Redis flush / enqueue failure) leaves one stuck in "queued" forever.
  // Both keep counting against the user's pending-report quota until cleared, so fail
  // them cleanly. (Mirrors gaps.worker, which already sweeps orphaned queued jobs.)
  const now = Date.now();
  const swept = await getPrisma().report.updateMany({
    where: { OR: [
      { status: "generating", updatedAt: { lt: new Date(now - STUCK_GENERATING_MS) } },
      { status: "queued", updatedAt: { lt: new Date(now - STUCK_QUEUED_MS) } },
    ] },
    data: { status: "failed", errorMessage: "Report generation was interrupted (worker restarted). Please try again." },
  });
  if (swept.count > 0) logger.warn({ swept: swept.count }, "swept stuck reports");

  const worker = new Worker(
    QUEUE_NAMES.report,
    async (job) => {
      logger.info({ jobId: job.id, attempt: job.attemptsMade + 1 }, "report job received");
      try {
        const input = job.data as ReportJob;
        const report = await getPrisma().report.findUnique({ where: { id: input.reportId }, select: { userId: true } });
        if (report) await withUserAi(report.userId, () => runRagPipeline(input));
        else await runRagPipeline(input);
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
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "report worker crashed on startup");
  process.exit(1);
});
