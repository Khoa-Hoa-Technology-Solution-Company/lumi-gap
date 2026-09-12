import mongoose from "mongoose";
import { redis } from "./redis.js";

type DependencyName = "mongo" | "redis";

export interface DependencyReadiness {
  ok: boolean;
  latencyMs: number;
}

export interface ReadinessResult {
  status: "ready" | "not_ready";
  dependencies: Record<DependencyName, DependencyReadiness>;
}

type ReadinessProbes = Record<DependencyName, () => Promise<void>>;

const DEFAULT_TIMEOUT_MS = 2_000;
const CACHE_TTL_MS = 5_000;
let cachedReadiness: { expiresAt: number; result: ReadinessResult } | undefined;

async function runProbe(probe: () => Promise<void>, timeoutMs: number): Promise<DependencyReadiness> {
  const startedAt = performance.now();
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      probe(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("readiness probe timed out")), timeoutMs);
      }),
    ]);

    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - startedAt) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function evaluateReadiness(
  probes: ReadinessProbes,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ReadinessResult> {
  const [mongo, redisResult] = await Promise.all([
    runProbe(probes.mongo, timeoutMs),
    runProbe(probes.redis, timeoutMs),
  ]);
  const dependencies = { mongo, redis: redisResult };

  return {
    status: mongo.ok && redisResult.ok ? "ready" : "not_ready",
    dependencies,
  };
}

export async function getReadiness(): Promise<ReadinessResult> {
  const now = Date.now();
  if (cachedReadiness && cachedReadiness.expiresAt > now) return cachedReadiness.result;

  const result = await evaluateReadiness({
    mongo: async () => {
      if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
        throw new Error("mongo is not connected");
      }
      await mongoose.connection.db.admin().ping();
    },
    redis: async () => {
      if (redis.status !== "ready") throw new Error("redis is not connected");
      const response = await redis.ping();
      if (response !== "PONG") throw new Error("redis ping failed");
    },
  });
  cachedReadiness = { expiresAt: now + CACHE_TTL_MS, result };
  return result;
}
