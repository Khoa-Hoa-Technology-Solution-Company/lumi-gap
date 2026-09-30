import { UnrecoverableError, Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { logger } from "../infrastructure/logger.js";
import { makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { communitySummaryService } from "../modules/communities/community-summary.service.js";

enforcePostgresOnlyRuntime();

interface CommunitySummaryJob {
  communityId: string;
  postIds: string[];
}

async function main() {
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:community-summary", queueName: QUEUE_NAMES.communitySummary });
  const worker = new Worker(
    QUEUE_NAMES.communitySummary,
    async (job) => {
      const { communityId, postIds } = job.data as CommunitySummaryJob;
      try {
        // The summary lands in the Redis LLM cache; the API reads it from there.
        await communitySummaryService.generate(communityId, postIds);
      } catch (err) {
        if (err instanceof Error && (err as { nonRetryable?: boolean }).nonRetryable) throw new UnrecoverableError(err.message);
        throw err;
      }
    },
    { connection: makeConnection(), concurrency: 2 },
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "community summary completed"));
  worker.on("failed", (job, error) => logger.error({ jobId: job?.id, error }, "community summary failed"));
  logger.info("Community summary worker listening on community-summary queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Community summary worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal({ error }, "Community summary worker crashed on startup");
  process.exit(1);
});
