import { getPrisma } from "./database/prisma.js";
import { redis } from "./redis.js";

export interface DependencyReadiness {
  ok: boolean;
  latencyMs: number;
}

export interface ReadinessResult {
  status: "ready" | "not_ready";
  dependencies: Record<string, DependencyReadiness>;
}

type ReadinessProbes = Record<string, () => Promise<void>>;

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
  const entries = await Promise.all(
    Object.entries(probes).map(async ([name, probe]) => [name, await runProbe(probe, timeoutMs)] as const),
  );
  const dependencies = Object.fromEntries(entries);

  return {
    status: Object.values(dependencies).every((dependency) => dependency.ok) ? "ready" : "not_ready",
    dependencies,
  };
}

export async function getReadiness(): Promise<ReadinessResult> {
  const now = Date.now();
  if (cachedReadiness && cachedReadiness.expiresAt > now) return cachedReadiness.result;

  const probes: ReadinessProbes = {
    redis: async () => {
      if (redis.status !== "ready") throw new Error("redis is not connected");
      const response = await redis.ping();
      if (response !== "PONG") throw new Error("redis ping failed");
    },
  };
  probes.postgres = async () => { await getPrisma().$queryRaw`SELECT 1`; };
  const result = await evaluateReadiness(probes);
  cachedReadiness = { expiresAt: now + CACHE_TTL_MS, result };
  return result;
}
