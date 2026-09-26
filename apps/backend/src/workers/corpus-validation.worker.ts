import { Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";

import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { logger } from "../infrastructure/logger.js";
import { makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { corpusValidationService } from "../modules/api-sync/scale/corpus-validation.service.js";

enforcePostgresOnlyRuntime();

interface CorpusValidationJob {
  validationRunId: string;
}

async function main() {
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({
    workerName: "worker:corpus-validation",
    queueName: QUEUE_NAMES.corpusValidation,
  });
  const worker = new Worker(
    QUEUE_NAMES.corpusValidation,
    (job) => corpusValidationService.execute((job.data as CorpusValidationJob).validationRunId),
    { connection: makeConnection(), concurrency: 1 },
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "corpus validation completed"));
  worker.on("failed", (job, error) => logger.error({ jobId: job?.id, error }, "corpus validation failed"));
  logger.info("corpus validation worker listening");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "corpus validation worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal({ error }, "corpus validation worker crashed on startup");
  process.exit(1);
});
