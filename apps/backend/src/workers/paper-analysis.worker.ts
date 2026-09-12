import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../infrastructure/db.js";
import { makeConnection, paperAnalysisQueue, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { runPaperAnalysis, type RunPaperAnalysisJob } from "../modules/papers/paper-analysis.service.js";

/**
 * Standalone structured paper knowledge worker.
 * Run with: pnpm --filter backend worker:paper-analysis
 *
 * Extracts aiAnalysis once per active AI-analyzable paper, versioned by
 * PAPER_AI_ANALYSIS_PROMPT_VERSION. This keeps richer reasoning data out of
 * request handlers and avoids re-reading raw abstracts for every AI feature.
 */
async function main() {
  await connectMongo();
  const stopHeartbeat = startWorkerHeartbeat({
    workerName: "worker:paper-analysis",
    queueName: QUEUE_NAMES.paperAnalysis,
  });

  const worker = new Worker(
    QUEUE_NAMES.paperAnalysis,
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, "paper analysis job received");
      return runPaperAnalysis(job.data as RunPaperAnalysisJob);
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
    await disconnectMongo();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "paper analysis worker crashed on startup");
  process.exit(1);
});
