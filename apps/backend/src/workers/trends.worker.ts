import os from "node:os";

import { Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { env } from "../config/env.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { logger } from "../infrastructure/logger.js";
import { makeConnection, QUEUE_NAMES, trendsSnapshotQueue } from "../infrastructure/queue.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { runTrendSnapshotJob } from "../modules/trends/trend.snapshot.service.js";

enforcePostgresOnlyRuntime();

/**
 * Research Trends snapshot worker (P2.1): collects one OpenAlex snapshot of the
 * default Data Scope, validates it and activates its precomputed analytics.
 * Collection resumes from its checkpoint; a budget pause re-enqueues the job
 * for the reset time. Nothing is scheduled unless TRENDS_COLLECTION_CRON is set.
 */
async function main() {
  if (!env.OPENALEX_API_KEY) {
    throw new Error("OPENALEX_API_KEY is required for trend snapshots (cursor paging needs a key)");
  }

  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:trends", queueName: QUEUE_NAMES.trendsSnapshot });
  const workerId = `${os.hostname()}:${process.pid}`;

  const worker = new Worker(
    QUEUE_NAMES.trendsSnapshot,
    async () => {
      const outcome = await runTrendSnapshotJob({
        workerId,
        leaseMs: env.TRENDS_COLLECTION_LEASE_SECONDS * 1_000,
        pageDelayMs: env.TRENDS_COLLECTION_PAGE_DELAY_MS,
        collectionFraction: env.TRENDS_COLLECTION_BUDGET_FRACTION,
      });
      if (outcome.status === "paused_budget" && outcome.resumeAfter) {
        // Resume after the budget resets (+ a few minutes so the reset has happened everywhere).
        const delay = Math.max(60_000, outcome.resumeAfter.getTime() - Date.now() + 5 * 60_000);
        await trendsSnapshotQueue.add("snapshot", {}, { delay, jobId: `resume:${outcome.snapshotId}:${outcome.resumeAfter.toISOString()}` });
      }
      return outcome;
    },
    // One job at a time: the lease also guards against a second worker process.
    { connection: makeConnection(), concurrency: 1 },
  );

  if (env.TRENDS_COLLECTION_CRON) {
    await trendsSnapshotQueue.add("snapshot", {}, { repeat: { pattern: env.TRENDS_COLLECTION_CRON } });
  }

  worker.on("completed", (job, outcome) => logger.info({ jobId: job.id, outcome }, "trend snapshot job finished"));
  worker.on("failed", (job, error) => logger.error({ jobId: job?.id, error }, "trend snapshot job failed; it retries from its checkpoint"));
  logger.info({ workerId, cron: env.TRENDS_COLLECTION_CRON ?? null }, "trends snapshot worker listening");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "trends snapshot worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal({ error }, "trends snapshot worker crashed on startup");
  process.exit(1);
});
