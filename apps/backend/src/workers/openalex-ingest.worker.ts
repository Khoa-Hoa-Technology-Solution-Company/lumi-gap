import os from "node:os";

import { UnrecoverableError, Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { env } from "../config/env.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { logger } from "../infrastructure/logger.js";
import { makeConnection, openAlexIngestQueue, paperAnalysisQueue, QUEUE_NAMES } from "../infrastructure/queue.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { isNonRetryableOpenAlexError } from "../modules/api-sync/providers/openalex.client.js";
import { runCampaignPartitionPage } from "../modules/api-sync/scale/campaign-partition-runner.js";
import { ingestCampaignService } from "../modules/api-sync/scale/ingest-campaign.service.js";

enforcePostgresOnlyRuntime();

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

  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({
    workerName: "worker:openalex-ingest",
    queueName: QUEUE_NAMES.openAlexIngest,
  });
  const workerId = `${os.hostname()}:${process.pid}`;

  const worker = new Worker(
    QUEUE_NAMES.openAlexIngest,
    async (job) => {
      const data = job.data as CampaignPageJob;
      let result: Awaited<ReturnType<typeof runCampaignPartitionPage>>;
      try {
        result = await runCampaignPartitionPage({
          campaignId: data.campaignId,
          workerId,
          leaseMs: env.OPENALEX_INGEST_LEASE_SECONDS * 1_000,
        });
      } catch (error) {
        // A request OpenAlex rejected (bad filter, bad api_key, ...) fails identically on every attempt. The
        // "failed" handler below treats UnrecoverableError as final and pauses the campaign.
        if (isNonRetryableOpenAlexError(error)) throw new UnrecoverableError((error as Error).message);
        throw error;
      }

      // Keep a single logical chain alive until every partition is exhausted.
      // Leasing makes this safe when an operator intentionally raises worker
      // concurrency later: only one worker may own a partition page at a time.
      if (result.status === "continued" || result.status === "completed") {
        await openAlexIngestQueue.add("campaign-page", { campaignId: data.campaignId });
      }
      if (result.status === "completed") await paperAnalysisQueue.add("ingested-paper-knowledge", {});
      return result;
    },
    { connection: makeConnection(), concurrency: env.OPENALEX_INGEST_CONCURRENCY },
  );

  worker.on("completed", (job, result) => logger.info({ jobId: job.id, result }, "OpenAlex campaign page completed"));
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, error }, "OpenAlex campaign page failed");
    // BullMQ increments attemptsMade before emitting "failed", so on the last attempt it equals opts.attempts.
    // UnrecoverableError skips the remaining retries. Either way no successor is enqueued, so stop the campaign visibly.
    const finalFailure = job && (job.attemptsMade >= (job.opts.attempts ?? 1) || error.name === "UnrecoverableError");
    if (!job || !finalFailure) return;
    const { campaignId } = job.data as CampaignPageJob;
    void ingestCampaignService.pauseAfterFailure(campaignId, error.message)
      .then((paused) => { if (paused) logger.warn({ jobId: job.id, campaignId }, "OpenAlex campaign paused after its final page attempt failed; restart it from the admin pipeline page"); })
      .catch((pauseError) => logger.error({ jobId: job.id, campaignId, error: pauseError }, "Could not pause OpenAlex campaign after final page failure"));
  });
  logger.info({ workerId, concurrency: env.OPENALEX_INGEST_CONCURRENCY }, "OpenAlex campaign worker listening");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "OpenAlex campaign worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal({ error }, "OpenAlex campaign worker crashed on startup");
  process.exit(1);
});
