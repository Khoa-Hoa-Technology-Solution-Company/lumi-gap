import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import {
  ListAiOperationsQuerySchema,
  ListAuditLogsQuerySchema,
  ListUsersQuerySchema,
  UpdateAdminApiProviderSchema,
  UpdateAdminInstitutionSchema,
} from "../dto/admin.schema.js";
import { deriveSystemHealth, redactAuditDetails, sanitizeOperationalError } from "../admin-redaction.js";
import { VerificationListQuerySchema } from "../../academic-profiles/dto/academic-profile.schema.js";

describe("admin overhaul schemas & security redaction", () => {
  it("parses extended user filters including academicRole, verificationStatus, and institution", () => {
    const parsed = ListUsersQuerySchema.parse({
      academicRole: "LECTURER",
      verificationStatus: "PENDING",
      institution: "FPT University",
      page: "2",
      pageSize: "50",
    });
    expect(parsed).toMatchObject({
      academicRole: "LECTURER",
      verificationStatus: "PENDING",
      institution: "FPT University",
      page: 2,
      pageSize: 50,
    });
    expect(ListUsersQuerySchema.safeParse({ academicRole: "SUPERADMIN" }).success).toBe(false);
  });

  it("parses audit log filters with date range and target table", () => {
    const parsed = ListAuditLogsQuerySchema.parse({
      search: "admin@lumigap.edu",
      targetTableName: "users",
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-30T23:59:59.999Z",
    });
    expect(parsed).toMatchObject({
      search: "admin@lumigap.edu",
      targetTableName: "users",
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-30T23:59:59.999Z",
    });
    expect(ListAuditLogsQuerySchema.safeParse({ from: "not-a-date" }).success).toBe(false);
  });

  it("parses AI operations query filters safely", () => {
    const parsed = ListAiOperationsQuerySchema.parse({
      kind: "report",
      status: "failed",
      search: "gemini",
      page: "1",
      pageSize: "20",
    });
    expect(parsed).toMatchObject({ kind: "report", status: "failed", search: "gemini", page: 1, pageSize: 20 });
    expect(ListAiOperationsQuerySchema.safeParse({ kind: "invalid" }).success).toBe(false);
  });

  it("validates institution and API provider settings updates strictly", () => {
    expect(UpdateAdminInstitutionSchema.safeParse({ isActive: false, reason: "Domain sunset" }).success).toBe(true);
    expect(UpdateAdminInstitutionSchema.safeParse({}).success).toBe(false);

    expect(UpdateAdminApiProviderSchema.safeParse({ rateLimitPerMin: 500, providerStatus: "enabled" }).success).toBe(true);
    expect(UpdateAdminApiProviderSchema.safeParse({ rateLimitPerMin: 0 }).success).toBe(false);
    expect(UpdateAdminApiProviderSchema.safeParse({ rateLimitPerMin: 50000 }).success).toBe(false);
    expect(UpdateAdminApiProviderSchema.safeParse({}).success).toBe(false);
  });

  it("parses full-dataset academic verification search & filters", () => {
    const parsed = VerificationListQuerySchema.parse({
      status: "PENDING",
      search: "nguyen",
      verificationType: "POSITION",
      sortOrder: "asc",
      page: "2",
      pageSize: "25",
    });
    expect(parsed).toMatchObject({
      status: "PENDING",
      search: "nguyen",
      verificationType: "POSITION",
      sortOrder: "asc",
      page: 2,
      pageSize: 25,
    });
    expect(VerificationListQuerySchema.safeParse({ verificationType: "INVALID" }).success).toBe(false);
  });

  it("recursively redacts secrets, tokens, storage keys, and private research/prompt payloads", () => {
    const input = {
      reason: "Revoked suspicious session",
      apiKey: "AIzaSyFakeKey12345678901234567890",
      nested: {
        passwordHash: "bcrypt$secret",
        storageKey: "private/manuscripts/file.pdf",
        promptText: "Confidential research draft...",
        safeField: "ok",
        leakedJwt: `Bearer ${jwt.sign({ sub: "redaction-test" }, randomBytes(32), { expiresIn: "1m" })}`,
      },
    };
    const redacted = redactAuditDetails(input) as Record<string, unknown>;
    expect(redacted.reason).toBe("Revoked suspicious session");
    expect(redacted.apiKey).toBe("[REDACTED]");
    const nested = redacted.nested as Record<string, unknown>;
    expect(nested.passwordHash).toBe("[REDACTED]");
    expect(nested.storageKey).toBe("[REDACTED]");
    expect(nested.promptText).toBe("[REDACTED]");
    expect(nested.safeField).toBe("ok");
    expect(nested.leakedJwt).toBe("[REDACTED]");
  });

  it("sanitizes operational errors by stripping inline tokens", () => {
    const cleaned = sanitizeOperationalError("Upstream error using Bearer secretTokenValue123456789");
    expect(cleaned).not.toContain("secretTokenValue123456789");
    expect(cleaned).toContain("[REDACTED]");
  });

  it("derives truthful degraded/unavailable/healthy system health from real probes", () => {
    const now = new Date("2026-11-26T04:00:00.000Z");

    const healthy = deriveSystemHealth({
      checkedAt: now,
      readiness: {
        ok: true,
        dependencies: {
          postgres: { ok: true, latencyMs: 4 },
          redis: { ok: true, latencyMs: 2 },
        },
      },
      pipeline: {
        redis: { ok: true, error: null },
        workers: { expected: 4, alive: 4, stale: 0, missing: 0, details: [] },
        queues: [],
        recentFailedJobs: [],
      } as never,
      aiConnection: {
        activeName: "Prod LLM",
        fastModel: "gpt-4.1-mini",
        deepModel: "gpt-4.1",
        envFastModel: "gemini-2.5-flash",
        envDeepModel: "gemini-2.5-pro",
        hasEnvKey: false,
      },
      embeddingConnection: {
        activeName: null,
        model: null,
        envModel: "gemini-embedding-001",
        envDimensions: 768,
        hasEnvKey: true,
      },
    });
    expect(healthy.overall).toBe("healthy");
    expect(healthy.dependencies.database.status).toBe("healthy");
    expect(healthy.dependencies.workers.status).toBe("healthy");
    expect(healthy.dependencies.aiProvider.source).toBe("platform_connection");

    const degradedStale = deriveSystemHealth({
      checkedAt: now,
      readiness: {
        ok: true,
        dependencies: {
          postgres: { ok: true, latencyMs: 5 },
          redis: { ok: true, latencyMs: 3 },
        },
      },
      pipeline: {
        redis: { ok: true, error: null },
        workers: { expected: 4, alive: 0, stale: 2, missing: 2, details: [] },
        queues: [],
        recentFailedJobs: [],
      } as never,
      aiConnection: {
        activeName: null,
        fastModel: null,
        deepModel: null,
        envFastModel: "gemini-2.5-flash",
        envDeepModel: "gemini-2.5-pro",
        hasEnvKey: false,
      },
      embeddingConnection: {
        activeName: null,
        model: null,
        envModel: "gemini-embedding-001",
        envDimensions: 768,
        hasEnvKey: false,
      },
    });
    expect(degradedStale.overall).toBe("degraded");
    expect(degradedStale.dependencies.workers.status).toBe("stale");
    expect(degradedStale.dependencies.aiProvider.status).toBe("not_configured");

    const dbDown = deriveSystemHealth({
      checkedAt: now,
      readiness: {
        ok: false,
        dependencies: {
          postgres: { ok: false, latencyMs: 12 },
          redis: { ok: false, latencyMs: 15 },
        },
      },
      pipeline: null,
      aiConnection: {
        activeName: null,
        fastModel: null,
        deepModel: null,
        envFastModel: "gemini-2.5-flash",
        envDeepModel: "gemini-2.5-pro",
        hasEnvKey: true,
      },
      embeddingConnection: {
        activeName: null,
        model: null,
        envModel: "gemini-embedding-001",
        envDimensions: 768,
        hasEnvKey: true,
      },
    });
    expect(dbDown.overall).toBe("unavailable");
    expect(dbDown.db).toBe("down");
    expect(dbDown.redis).toBe("down");
  });
});
