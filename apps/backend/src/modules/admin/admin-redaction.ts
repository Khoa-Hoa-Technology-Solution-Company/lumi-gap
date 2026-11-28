import type { AdminDependencyHealth, AdminOperationalStatus, AdminSystemHealth } from "@trend/shared-types";
import type { ReadinessResult } from "../../infrastructure/readiness.js";
import type { PipelineStatus } from "../pipeline/pipeline.service.js";

const REDACTED_KEY_PATTERN =
  /(password|passwd|secret|token|apikey|api_key|authorization|cookie|privatekey|private_key|encryptedkey|encrypted_key|storagekey|storage_key|credential|refresh|jwt|bearer|prompt|manuscript|markdown|rawcontent|raw_content|bodytext|evidenceurl|evidence_url)/i;

const SECRET_VALUE_PATTERN =
  /(Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;

const MAX_REDACT_DEPTH = 5;
const MAX_REDACT_KEYS = 40;
const MAX_REDACT_ARRAY = 25;
const MAX_STRING_LEN = 320;

export function sanitizeOperationalError(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(SECRET_VALUE_PATTERN, "[REDACTED]").slice(0, 400);
}

/**
 * Recursively redacts credentials, tokens, private storage keys, and raw research/prompt payloads
 * before exposing audit log JSON details to admin views.
 */
export function redactAuditDetails(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(SECRET_VALUE_PATTERN, "[REDACTED]");
    return cleaned.length > MAX_STRING_LEN ? `${cleaned.slice(0, MAX_STRING_LEN)}…` : cleaned;
  }
  if (depth >= MAX_REDACT_DEPTH) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_REDACT_ARRAY).map((entry) => redactAuditDetails(entry, depth + 1));
    if (value.length > MAX_REDACT_ARRAY) slice.push(`[+${value.length - MAX_REDACT_ARRAY} more]`);
    return slice;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    let count = 0;
    for (const [key, entry] of entries) {
      if (count >= MAX_REDACT_KEYS) {
        out._truncatedKeys = entries.length - MAX_REDACT_KEYS;
        break;
      }
      if (REDACTED_KEY_PATTERN.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactAuditDetails(entry, depth + 1);
      }
      count += 1;
    }
    return out;
  }
  return String(value);
}

export interface SystemHealthInput {
  checkedAt: Date;
  readiness: ReadinessResult | null;
  pipeline: PipelineStatus | null;
  aiConnection: {
    activeName: string | null;
    fastModel: string | null;
    deepModel: string | null;
    envFastModel: string;
    envDeepModel: string;
    hasEnvKey: boolean;
  };
  embeddingConnection: {
    activeName: string | null;
    model: string | null;
    envModel: string;
    envDimensions: number;
    hasEnvKey: boolean;
  };
}

export function deriveSystemHealth(input: SystemHealthInput): AdminSystemHealth {
  const checkedAt = input.checkedAt.toISOString();
  const dbDep = input.readiness?.dependencies?.postgres;
  const redisDep = input.readiness?.dependencies?.redis;

  const database: AdminDependencyHealth = !input.readiness
    ? { status: "unknown", latencyMs: null, detail: "Readiness probe unavailable" }
    : dbDep?.ok
      ? { status: "healthy", latencyMs: dbDep.latencyMs, detail: null }
      : { status: "unavailable", latencyMs: dbDep?.latencyMs ?? null, detail: "PostgreSQL probe failed" };

  const redisFromPipeline = input.pipeline?.redis;
  let redis: AdminDependencyHealth;
  if (redisDep) {
    redis = redisDep.ok
      ? { status: "healthy", latencyMs: redisDep.latencyMs, detail: null }
      : { status: "unavailable", latencyMs: redisDep.latencyMs, detail: redisFromPipeline?.error ?? "Redis probe failed" };
  } else if (redisFromPipeline) {
    redis = redisFromPipeline.ok
      ? { status: "healthy", latencyMs: null, detail: null }
      : { status: "unavailable", latencyMs: null, detail: redisFromPipeline.error ?? "Redis unavailable" };
  } else {
    redis = { status: "unknown", latencyMs: null, detail: "Redis status not reported" };
  }

  const workerStats = input.pipeline?.workers;
  let workerStatus: AdminOperationalStatus = "unknown";
  let workerDetail: string | null = null;
  let legacyWorkers: "active" | "degraded" | "idle" = "idle";
  if (!workerStats) {
    workerStatus = redis.status === "unavailable" ? "unavailable" : "unknown";
    workerDetail = "Worker heartbeat telemetry unavailable";
    legacyWorkers = "degraded";
  } else if (workerStats.alive === workerStats.expected && workerStats.expected > 0) {
    workerStatus = "healthy";
    workerDetail = `${workerStats.alive}/${workerStats.expected} alive`;
    legacyWorkers = "active";
  } else if (workerStats.alive === 0 && workerStats.stale > 0) {
    workerStatus = "stale";
    workerDetail = `0/${workerStats.expected} alive, ${workerStats.stale} stale`;
    legacyWorkers = "degraded";
  } else if (workerStats.alive === 0) {
    workerStatus = "unavailable";
    workerDetail = `0/${workerStats.expected} workers reporting heartbeats`;
    legacyWorkers = "idle";
  } else {
    workerStatus = "degraded";
    workerDetail = `${workerStats.alive}/${workerStats.expected} alive (${workerStats.stale} stale, ${workerStats.missing} missing)`;
    legacyWorkers = "degraded";
  }

  const aiSource = input.aiConnection.activeName
    ? "platform_connection"
    : input.aiConnection.hasEnvKey
      ? "environment_default"
      : "not_configured";
  const aiProvider = {
    status: (aiSource === "not_configured" ? "not_configured" : "unknown") as AdminOperationalStatus,
    detail: aiSource === "not_configured"
      ? "No platform AI provider configured"
      : "Configured; reachability is verified on demand via connection test",
    source: aiSource,
    name: input.aiConnection.activeName ?? (aiSource === "environment_default" ? "Environment Gemini" : null),
    fastModel: input.aiConnection.fastModel ?? (aiSource === "environment_default" ? input.aiConnection.envFastModel : null),
    deepModel: input.aiConnection.deepModel ?? (aiSource === "environment_default" ? input.aiConnection.envDeepModel : null),
  } as const;

  const embSource = input.embeddingConnection.activeName
    ? "platform_connection"
    : input.embeddingConnection.hasEnvKey
      ? "environment_default"
      : "not_configured";
  const embeddingProvider = {
    status: (embSource === "not_configured" ? "not_configured" : "unknown") as AdminOperationalStatus,
    detail: embSource === "not_configured"
      ? "No embedding provider configured"
      : "Configured; vector compatibility verified on connection save",
    source: embSource,
    name: input.embeddingConnection.activeName ?? (embSource === "environment_default" ? "Environment Gemini Embedding" : null),
    model: input.embeddingConnection.model ?? (embSource === "environment_default" ? input.embeddingConnection.envModel : null),
    dimensions: input.embeddingConnection.envDimensions,
  } as const;

  const api: AdminDependencyHealth = { status: "healthy", latencyMs: 0, detail: "Responding to authenticated request" };

  let overall: "healthy" | "degraded" | "unavailable" = "healthy";
  if (database.status === "unavailable") {
    overall = "unavailable";
  } else if (
    redis.status !== "healthy"
    || workerStatus !== "healthy"
    || database.status !== "healthy"
    || aiSource === "not_configured"
  ) {
    overall = "degraded";
  }

  return {
    overall,
    checkedAt,
    timestamp: checkedAt,
    api: "healthy",
    db: database.status === "healthy" ? "healthy" : database.status === "unavailable" ? "down" : "degraded",
    redis: redis.status === "healthy" ? "healthy" : redis.status === "unavailable" ? "down" : "degraded",
    workers: legacyWorkers,
    dependencies: {
      api,
      database,
      redis,
      workers: {
        status: workerStatus,
        detail: workerDetail,
        expected: workerStats?.expected ?? 0,
        alive: workerStats?.alive ?? 0,
        stale: workerStats?.stale ?? 0,
        missing: workerStats?.missing ?? 0,
      },
      aiProvider,
      embeddingProvider,
    },
  };
}
