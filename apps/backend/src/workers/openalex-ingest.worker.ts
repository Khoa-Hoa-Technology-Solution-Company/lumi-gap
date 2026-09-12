import os from "node:os";

import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../infrastructure/db.js";
import { logger } from "../infrastructure/logger.js";
import { makeConnection, openAlexIngestQueue, QUEUE_NAMES } from "../infrastructure/queue.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { runCampaignPartitionPage } from "../modules/api-sync/scale/campaign-partition-runner.js";

interface CampaignPageJob {
  campaignId: string;
}

/**
 * Durable worker for the million-scale OpenAlex campaign layer. A job processes
 * exactly one page then schedules a successor, keeping shutdown/retry blast
 * radius bounded to a single idempotent page attempt.
 */
async function main() {
  if (!env.OPENALEX_API_KEY) {
    throw new Error("OPENALEX_API_KEY is required for the million-scale ingest worker");
  }

  await connectMongo();
  const stopHeartbeat = startWorkerHeartbeat({
    workerName: "worker:openalex-ingest",
    queueName: QUEUE_NAMES.openAlexIngest,
  });
  const workerId = `${os.hostname()}:${process.pid}`;

  const worker = new Worker(
    QUEUE_NAMES.openAlexIngest,
    async (job) => {
      const data = job.data as CampaignPageJob;
      const result = await runCampaignPartitionPage({
        campaignId: data.campaignId,
        workerId,
        leaseMs: env.OPENALEX_INGEST_LEASE_SECONDS * 1_000,
      });

      // Keep a single logical chain alive until every partition is exhausted.
      // Leasing makes this safe when an operator intentionally raises worker
      // concurrency later: only one worker may own a partition page at a time.
      if (result.status === "continued" || result.status === "completed") {
        await openAlexIngestQueue.add("campaign-page", { campaignId: data.campaignId });
      }
      return result;
    },
    { connection: makeConnection(), concurrency: env.OPENALEX_INGEST_CONCURRENCY },
  );

  worker.on("completed", (job, result) => logger.info({ jobId: job.id, result }, "OpenAlex campaign page completed"));
  worker.on("failed", (job, error) => logger.error({ jobId: job?.id, error }, "OpenAlex campaign page failed"));
  logger.info({ workerId, concurrency: env.OPENALEX_INGEST_CONCURRENCY }, "OpenAlex campaign worker listening");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "OpenAlex campaign worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectMongo();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal({ error }, "OpenAlex campaign worker crashed on startup");
  process.exit(1);
});
