import { disconnectRedis } from "../src/infrastructure/redis.js";
import { readWorkerHeartbeats, type WorkerName } from "../src/infrastructure/worker-heartbeat.js";

const REQUIRED_WORKERS: WorkerName[] = [
  "worker:report",
  "worker:gaps",
  "worker:notifications",
  "worker:embedding",
  "worker:paper-analysis",
  "worker:corpus-validation",
];

const MAX_AGE_MS = 90_000;
const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 5_000;

try {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const heartbeats = await readWorkerHeartbeats();
    const now = Date.now();
    const freshNames = new Set(
      heartbeats
        .filter((heartbeat) => now - Date.parse(heartbeat.lastSeenAt) <= MAX_AGE_MS)
        .map((heartbeat) => heartbeat.workerName),
    );
    const missing = REQUIRED_WORKERS.filter((workerName) => !freshNames.has(workerName));

    if (missing.length === 0) {
      process.stdout.write(`Verified ${REQUIRED_WORKERS.length} fresh worker heartbeats.\n`);
      process.exitCode = 0;
      break;
    }

    if (attempt === MAX_ATTEMPTS) {
      throw new Error(`Missing or stale worker heartbeats: ${missing.join(", ")}`);
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown worker heartbeat verification error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await disconnectRedis().catch(() => undefined);
}
