import { Redis } from "ioredis";
import { env } from "../src/config/env.js";

const CONNECT_TIMEOUT_MS = 5000;

function maskRedisUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return rawUrl.startsWith("rediss://") ? "rediss://<redis-host>" : "redis://<redis-host>";
  }
}

function isCloudRedis(rawUrl: string): boolean {
  const lower = rawUrl.toLowerCase();
  return lower.startsWith("rediss://") || lower.includes("upstash") || lower.includes("redis-cloud");
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${CONNECT_TIMEOUT_MS}ms`));
    }, CONNECT_TIMEOUT_MS);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

async function checkRedis(): Promise<void> {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    retryStrategy: () => null,
    reconnectOnError: () => false,
  });
  client.on("error", () => {
    // The explicit try/catch below prints a cleaner startup banner.
  });

  try {
    await withTimeout(client.connect(), "Redis connect");
    await withTimeout(client.ping(), "Redis ping");
  } finally {
    client.disconnect();
  }
}

function printFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const redisUrl = maskRedisUrl(env.REDIS_URL);
  const cloud = isCloudRedis(env.REDIS_URL);
  const quotaExceeded = message.toLowerCase().includes("max requests limit exceeded");

  console.error("");
  console.error("  ┌──────────────────────────────────────────────────────────┐");
  console.error("  │  Cannot start backend dev:all — Redis is unavailable     │");
  console.error("  │                                                          │");
  console.error(`  │  REDIS_URL: ${redisUrl}`.padEnd(61) + "│");
  console.error(`  │  Reason: ${message}`.slice(0, 60).padEnd(61) + "│");
  console.error("  │                                                          │");
  if (quotaExceeded || cloud) {
    console.error("  │  Local dev should use local Redis, not Upstash quota.    │");
    console.error("  │  1. Start Docker Desktop.                               │");
    console.error("  │  2. Run: docker compose up -d redis                     │");
    console.error("  │  3. Set REDIS_URL=redis://localhost:6379 in .env        │");
  } else {
    console.error("  │  Start Redis locally: docker compose up -d redis         │");
    console.error("  │  Then re-run: pnpm --filter backend dev:all              │");
  }
  console.error("  └──────────────────────────────────────────────────────────┘");
  console.error("");
}

try {
  await checkRedis();
  console.log(`Redis OK (${maskRedisUrl(env.REDIS_URL)})`);
} catch (error) {
  printFailure(error);
  process.exit(1);
}
