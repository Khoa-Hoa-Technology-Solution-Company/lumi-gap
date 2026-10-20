import { Worker } from "bullmq";
import { connectPostgres, disconnectPostgres, getPrisma } from "../infrastructure/database/prisma.js";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { logger } from "../infrastructure/logger.js";
import { makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";
import { processCompilation } from "../modules/workspaces/manuscript-compiler.js";

enforcePostgresOnlyRuntime();
async function main() {
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({ workerName: "worker:manuscript-compile", queueName: QUEUE_NAMES.manuscriptCompile });
  const worker = new Worker(QUEUE_NAMES.manuscriptCompile, async job => {
    try { await processCompilation(job.data.compilationId); }
    catch (error) {
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await getPrisma().manuscriptCompilation.updateMany({ where: { id: job.data.compilationId, status: { in: ["QUEUED", "COMPILING"] } }, data: { status: final ? "FAILED" : "QUEUED", completedAt: final ? new Date() : null, diagnostics: final ? "Compilation was interrupted or access ended. Please try again." : "The compiler is reconnecting; this job will retry automatically." } });
      throw error;
    }
  }, { connection: makeConnection(), concurrency: 1, lockDuration: 120000 });
  worker.on("failed", (job, error) => logger.warn({ jobId: job?.id, error: error.message }, "Manuscript compilation attempt failed"));
  const shutdown = async () => { await stopHeartbeat(); await worker.close(); await disconnectPostgres(); process.exit(0); };
  process.on("SIGINT", () => void shutdown()); process.on("SIGTERM", () => void shutdown());
  logger.info("Manuscript compilation worker ready");
}
main().catch(error => { logger.fatal({ error }, "Manuscript compilation worker startup failed"); process.exit(1); });
