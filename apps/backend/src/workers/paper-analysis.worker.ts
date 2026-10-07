import { UnrecoverableError, Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { env } from "../config/env.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { makeConnection, paperAnalysisQueue, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { runPaperAnalysis, type RunPaperAnalysisJob } from "../modules/papers/paper-analysis.service.js";
import { withUserAi } from "../modules/user-ai/user-ai.runtime.js";

enforcePostgresOnlyRuntime();

/**
 * Standalone structured paper knowledge worker.
 * Run with: pnpm --filter backend worker:paper-analysis
 *
 * Indexes approved PDFs/abstracts into page chunks, vectors and grounded graph
 * relations, versioned by RAG_INDEX_VERSION. Runs scheduled backfills and
 * targeted user jobs outside request handlers.
 */
async function main() {
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({
    workerName: "worker:paper-analysis",
    queueName: QUEUE_NAMES.paperAnalysis,
  });

  const worker = new Worker(
    QUEUE_NAMES.paperAnalysis,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "paper analysis job received");
      try {
        const input = job.data as RunPaperAnalysisJob;
        return await (input.userId ? withUserAi(input.userId, () => runPaperAnalysis(input)) : runPaperAnalysis(input));
      } catch (err) {
        if (err instanceof Error && (err as { nonRetryable?: boolean }).nonRetryable) {
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    },
    { connection: makeConnection(), concurrency: 1 },
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "paper analysis job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "paper analysis job failed"));

  await paperAnalysisQueue.add("scheduled-paper-analysis", {} satisfies RunPaperAnalysisJob, {
    repeat: { pattern: env.PAPER_ANALYSIS_CRON },
  });

  logger.info({ cron: env.PAPER_ANALYSIS_CRON }, "paper analysis worker listening on queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "paper analysis worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "paper analysis worker crashed on startup");
  process.exit(1);
});
