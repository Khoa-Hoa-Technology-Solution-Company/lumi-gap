import crypto from "node:crypto";
import type { PlatformApiKey, PlatformApiKeyProvider, PlatformApiKeySettings, PlatformApiKeyStatus, PlatformApiKeyTestResult } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { probeGeminiKey } from "../llm/gemini.client.js";
import { decryptAiKey, encryptAiKey } from "../user-ai/user-ai.crypto.js";
import { classifyGeminiKeyError, classifyOpenAlexKeyResponse } from "./api-key-errors.js";
import { apiKeyScope, invalidateApiKeys } from "./api-key-pool.js";
import type { CreateApiKeyInput, UpdateApiKeyInput } from "./api-key.schema.js";

const MAX_KEYS_PER_PROVIDER = 20;
const PROVIDERS: PlatformApiKeyProvider[] = ["GEMINI", "OPENALEX"];

type Row = Awaited<ReturnType<ReturnType<typeof getPrisma>["platformApiKey"]["findMany"]>>[number];

function statusOf(row: Row, now: number): PlatformApiKeyStatus {
  if (!row.isEnabled) return "DISABLED";
  if (row.invalidAt) return "INVALID";
  if (row.cooldownUntil && row.cooldownUntil.getTime() > now) return "COOLDOWN";
  return "ACTIVE";
}

function present(row: Row, inUseId: string | null, now: number): PlatformApiKey {
  const status = statusOf(row, now);
  return {
    id: row.id,
    provider: row.provider as PlatformApiKeyProvider,
    label: row.label,
    keyHint: row.keyHint,
    priority: row.priority,
    isEnabled: row.isEnabled,
    status,
    inUse: row.id === inUseId,
    cooldownUntil: status === "COOLDOWN" ? row.cooldownUntil!.toISOString() : null,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    successCount: Number(row.successCount),
    failureCount: row.failureCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const hint = (secret: string) => secret.slice(-4);
const envKeyFor = (provider: PlatformApiKeyProvider) => provider === "GEMINI"
  ? (env.GEMINI_API_KEY && env.GEMINI_API_KEY !== "mock-gemini-key" ? env.GEMINI_API_KEY : "")
  : (env.OPENALEX_API_KEY ?? "");

async function rowsFor(provider?: PlatformApiKeyProvider) {
  return getPrisma().platformApiKey.findMany({
    where: provider ? { provider } : undefined,
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

async function existing(id: string) {
  const row = await getPrisma().platformApiKey.findUnique({ where: { id } });
  if (!row) throw AppError.notFound("API key not found");
  return row;
}

async function presentOne(row: Row): Promise<PlatformApiKey> {
  const now = Date.now();
  const rows = await rowsFor(row.provider as PlatformApiKeyProvider);
  const inUse = rows.find((candidate) => statusOf(candidate, now) === "ACTIVE")?.id ?? null;
  return present(row, inUse, now);
}

/** A key already in the pool for the provider, compared on the decrypted secret (pools are small). */
async function assertNotDuplicate(provider: PlatformApiKeyProvider, secret: string, exceptId?: string) {
  const rows = await getPrisma().platformApiKey.findMany({ where: { provider, keyHint: hint(secret) }, select: { id: true, encryptedKey: true } });
  for (const row of rows) {
    if (row.id === exceptId) continue;
    let saved = "";
    try { saved = decryptAiKey(row.encryptedKey, apiKeyScope(row.id)); } catch { continue; }
    if (saved === secret) throw AppError.conflict("This API key is already in the pool");
  }
}

/** Calls the provider with the key once; returns null when it works, else the provider's reason. */
async function probe(provider: PlatformApiKeyProvider, secret: string): Promise<{ failure: ReturnType<typeof classifyGeminiKeyError>; message: string } | null> {
  if (provider === "GEMINI") {
    try {
      await probeGeminiKey(secret);
      return null;
    } catch (error) {
      const failure = classifyGeminiKeyError(error);
      const status = (error as { status?: unknown } | null)?.status;
      return { failure, message: failure?.reason ?? `Gemini test call failed${typeof status === "number" ? ` (${status})` : ""}: ${String((error as Error)?.message ?? error).split("\n")[0]!.slice(0, 300)}` };
    }
  }
  // cursor=* requires a valid key, so this proves the key works for paging, not just anonymous access.
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("per_page", "1");
  url.searchParams.set("select", "id");
  url.searchParams.set("cursor", "*");
  if (env.OPENALEX_MAILTO) url.searchParams.set("mailto", env.OPENALEX_MAILTO);
  url.searchParams.set("api_key", secret);
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
    if (response.ok) return null;
    const body = (await response.text().catch(() => "")).slice(0, 1000);
    const failure = classifyOpenAlexKeyResponse(response.status, body);
    return { failure, message: failure?.reason ?? `OpenAlex test call failed (${response.status})` };
  } catch (error) {
    return { failure: null, message: `OpenAlex test call failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300) };
  }
}

/** Stores a test result: success clears the key's errors; a key rejection takes it out of rotation like a live call. */
async function recordProbe(id: string, result: Awaited<ReturnType<typeof probe>>) {
  const now = new Date();
  if (!result) {
    return getPrisma().platformApiKey.update({ where: { id }, data: { invalidAt: null, cooldownUntil: null, lastError: null, lastErrorAt: null } });
  }
  const { failure, message } = result;
  return getPrisma().platformApiKey.update({
    where: { id },
    data: {
      ...(failure?.kind === "INVALID" ? { invalidAt: now } : {}),
      ...(failure?.kind === "COOLDOWN" ? { cooldownUntil: new Date(now.getTime() + (failure.cooldownMs ?? 3_600_000)) } : {}),
      lastError: message,
      lastErrorAt: now,
    },
  });
}

/** Admin management of the platform API key pool (Gemini and OpenAlex) behind automatic key rotation. */
export const apiKeyService = {
  async list(): Promise<PlatformApiKeySettings> {
    const rows = await rowsFor();
    const now = Date.now();
    return {
      providers: PROVIDERS.map((provider) => {
        const own = rows.filter((row) => row.provider === provider);
        const inUse = own.find((row) => statusOf(row, now) === "ACTIVE")?.id ?? null;
        const hasEnvKey = Boolean(envKeyFor(provider));
        return { provider, keys: own.map((row) => present(row, inUse, now)), hasEnvKey, usingEnvKey: !inUse && hasEnvKey };
      }),
    };
  },

  /** Adds a key, then tests it so the admin sees at once whether the provider accepts it. */
  async create(adminId: string, input: CreateApiKeyInput): Promise<PlatformApiKeyTestResult> {
    if (await getPrisma().platformApiKey.count({ where: { provider: input.provider } }) >= MAX_KEYS_PER_PROVIDER) {
      throw AppError.badRequest(`You can save up to ${MAX_KEYS_PER_PROVIDER} keys per provider`);
    }
    await assertNotDuplicate(input.provider, input.apiKey);
    // The id is fixed before encrypting, because the key is bound to it.
    const id = crypto.randomUUID();
    await getPrisma().platformApiKey.create({
      data: { id, provider: input.provider, label: input.label, priority: input.priority, encryptedKey: encryptAiKey(input.apiKey, apiKeyScope(id)), keyHint: hint(input.apiKey), createdById: adminId },
    });
    await auditService.log("platform_api_key.created", { userId: adminId, targetTableName: "platform_api_keys", targetRecordId: id, details: { provider: input.provider, label: input.label, priority: input.priority } });
    const result = await probe(input.provider, input.apiKey);
    const row = await recordProbe(id, result);
    invalidateApiKeys();
    return { ok: !result, message: result?.message ?? "The provider accepted the key.", key: await presentOne(row) };
  },

  async update(adminId: string, id: string, input: UpdateApiKeyInput): Promise<PlatformApiKey> {
    const row = await existing(id);
    const provider = row.provider as PlatformApiKeyProvider;
    if (input.apiKey) await assertNotDuplicate(provider, input.apiKey, id);
    const updated = await getPrisma().platformApiKey.update({
      where: { id },
      data: {
        label: input.label,
        priority: input.priority,
        isEnabled: input.isEnabled,
        ...(input.apiKey ? {
          encryptedKey: encryptAiKey(input.apiKey, apiKeyScope(id)), keyHint: hint(input.apiKey),
          invalidAt: null, cooldownUntil: null, lastError: null, lastErrorAt: null, successCount: 0, failureCount: 0, lastUsedAt: null,
        } : {}),
        // Re-enabling gives the key a fresh chance; a still-bad key is taken out again on its next call.
        ...(input.isEnabled === true && !row.isEnabled ? { cooldownUntil: null } : {}),
      },
    });
    invalidateApiKeys();
    await auditService.log("platform_api_key.updated", { userId: adminId, targetTableName: "platform_api_keys", targetRecordId: id, details: { label: input.label, priority: input.priority, isEnabled: input.isEnabled, keyReplaced: Boolean(input.apiKey) } });
    return presentOne(updated);
  },

  /** Calls the provider with the key; success puts an invalid or cooling-down key back into rotation. */
  async test(adminId: string, id: string): Promise<PlatformApiKeyTestResult> {
    const row = await existing(id);
    const result = await probe(row.provider as PlatformApiKeyProvider, decryptAiKey(row.encryptedKey, apiKeyScope(row.id)));
    const updated = await recordProbe(id, result);
    invalidateApiKeys();
    await auditService.log("platform_api_key.tested", { userId: adminId, targetTableName: "platform_api_keys", targetRecordId: id, details: { ok: !result } });
    return { ok: !result, message: result?.message ?? "The provider accepted the key. It is back in rotation.", key: await presentOne(updated) };
  },

  async remove(adminId: string, id: string): Promise<void> {
    const result = await getPrisma().platformApiKey.deleteMany({ where: { id } });
    if (!result.count) throw AppError.notFound("API key not found");
    invalidateApiKeys();
    await auditService.log("platform_api_key.deleted", { userId: adminId, targetTableName: "platform_api_keys", targetRecordId: id });
  },
};
