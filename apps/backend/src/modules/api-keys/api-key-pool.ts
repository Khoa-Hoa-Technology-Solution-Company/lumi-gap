import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { decryptAiKey } from "../user-ai/user-ai.crypto.js";

export type ApiKeyProvider = "GEMINI" | "OPENALEX";

/** Additional data bound into the encryption of a pooled key, so it cannot be swapped with another row's key. */
export const apiKeyScope = (id: string) => `api-key:${id}`;

/**
 * Why the provider rejected a key. INVALID: the key itself is wrong, revoked or expired; it is skipped until an admin
 * tests or replaces it. COOLDOWN: quota, billing or permission; retried after `cooldownMs`.
 */
export interface ApiKeyFailure {
  kind: "INVALID" | "COOLDOWN";
  reason: string;
  cooldownMs?: number;
}

/** The key a call uses. `id` is null for the env key (GEMINI_API_KEY / OPENALEX_API_KEY). */
export interface SelectedApiKey {
  id: string | null;
  secret: string;
}

interface PoolEntry {
  id: string;
  priority: number;
  cooldownUntil: number;
  invalid: boolean;
  readonly secret: string;
}

export const DEFAULT_COOLDOWN_MS = 60 * 60_000;
/** Each process (API, every worker) re-reads the pool at most this often; admin changes apply within it. */
const TTL_MS = 30_000;
const MAX_ERROR_LENGTH = 500;

let snapshot: { entries: Record<ApiKeyProvider, PoolEntry[]>; loadedAt: number } | null = null;
let inFlight: Promise<void> | null = null;
/** Marks made in this process, kept until the database copy catches up (the write is asynchronous). */
const localCooldown = new Map<string, number>();
const localInvalid = new Set<string>();
/** Successful calls not yet written to the database; flushed on the next refresh. */
const pendingSuccess = new Map<string, { count: number; at: Date }>();

const ENV_ID = (provider: ApiKeyProvider) => `env:${provider}`;

function envKey(provider: ApiKeyProvider): string {
  const value = provider === "GEMINI" ? env.GEMINI_API_KEY : env.OPENALEX_API_KEY;
  return value && value !== "mock-gemini-key" ? value : "";
}

function toEntry(row: { id: string; priority: number; encryptedKey: string; cooldownUntil: Date | null; invalidAt: Date | null }): PoolEntry {
  let decrypted: string | undefined;
  return {
    id: row.id,
    priority: row.priority,
    cooldownUntil: row.cooldownUntil?.getTime() ?? 0,
    invalid: row.invalidAt !== null,
    // Decrypted lazily, only when a call actually uses the key.
    get secret() { return (decrypted ??= decryptAiKey(row.encryptedKey, apiKeyScope(row.id))); },
  };
}

async function flushSuccess(): Promise<void> {
  if (!pendingSuccess.size) return;
  const batch = [...pendingSuccess.entries()];
  pendingSuccess.clear();
  await Promise.all(batch.map(([id, { count, at }]) => getPrisma().platformApiKey.updateMany({
    where: { id },
    data: { successCount: { increment: count }, lastUsedAt: at },
  }).catch((error: unknown) => logger.debug({ err: error, id }, "could not record API key usage"))));
}

/**
 * Loads the enabled pool keys when the cached copy is older than the TTL. A database failure keeps the previous
 * pool (or none, so the env keys are used) rather than failing the provider call.
 */
export async function refreshApiKeys(force = false): Promise<void> {
  if (!force && snapshot && Date.now() - snapshot.loadedAt < TTL_MS) return;
  inFlight ??= (async () => {
    try {
      await flushSuccess();
      const rows = await getPrisma().platformApiKey.findMany({
        where: { isEnabled: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        select: { id: true, provider: true, priority: true, encryptedKey: true, cooldownUntil: true, invalidAt: true },
      });
      const entries: Record<ApiKeyProvider, PoolEntry[]> = { GEMINI: [], OPENALEX: [] };
      for (const row of rows) if (row.provider === "GEMINI" || row.provider === "OPENALEX") entries[row.provider].push(toEntry(row));
      snapshot = { entries, loadedAt: Date.now() };
    } catch (error) {
      logger.warn({ err: error }, "could not load the platform API key pool; using the previous pool or env keys");
      snapshot = { entries: snapshot?.entries ?? { GEMINI: [], OPENALEX: [] }, loadedAt: Date.now() };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Drops the cached pool in this process (after an admin change); other processes follow within the TTL. */
export function invalidateApiKeys(): void {
  snapshot = null;
  localCooldown.clear();
  localInvalid.clear();
}

function cooldownOf(id: string, entry?: PoolEntry): number {
  return Math.max(entry?.cooldownUntil ?? 0, localCooldown.get(id) ?? 0);
}

function usable(entry: PoolEntry, now: number): boolean {
  return !entry.invalid && !localInvalid.has(entry.id) && cooldownOf(entry.id, entry) <= now;
}

/** Pool keys in the order calls try them: usable keys by priority, then the env key. */
function candidates(provider: ApiKeyProvider, now = Date.now()): SelectedApiKey[] {
  const entries = snapshot?.entries[provider] ?? [];
  const out: SelectedApiKey[] = [];
  for (const entry of entries) if (usable(entry, now)) out.push({ id: entry.id, get secret() { return entry.secret; } });
  const fallback = envKey(provider);
  if (fallback && cooldownOf(ENV_ID(provider)) <= now && !localInvalid.has(ENV_ID(provider))) out.push({ id: null, secret: fallback });
  return out;
}

/**
 * The key a call should use now: the first usable pool key, else the env key. When every key is cooling down it
 * returns the one that recovers first (or the env key), so the provider's own error reaches the caller.
 * Call `refreshApiKeys()` first in long-lived code paths.
 */
export function currentApiKey(provider: ApiKeyProvider): SelectedApiKey | null {
  const first = candidates(provider)[0];
  if (first) return first;
  const fallback = envKey(provider);
  if (fallback) return { id: null, secret: fallback };
  const entries = (snapshot?.entries[provider] ?? []).filter((entry) => !entry.invalid && !localInvalid.has(entry.id));
  const soonest = entries.sort((a, b) => cooldownOf(a.id, a) - cooldownOf(b.id, b))[0];
  return soonest ? { id: soonest.id, get secret() { return soonest.secret; } } : null;
}

/** True when any key (pool or env) can be used for the provider; refreshes the pool first. */
export async function hasApiKey(provider: ApiKeyProvider): Promise<boolean> {
  await refreshApiKeys();
  return Boolean(envKey(provider)) || (snapshot?.entries[provider].some((entry) => !entry.invalid) ?? false);
}

/** Maps a secret back to its pool entry, for callers that only carry the key inside a URL. */
export function apiKeyIdForSecret(provider: ApiKeyProvider, secret: string): string | null | undefined {
  if (secret && secret === envKey(provider)) return null;
  return snapshot?.entries[provider].find((entry) => entry.secret === secret)?.id;
}

export function reportApiKeySuccess(key: SelectedApiKey): void {
  if (!key.id) return;
  const pending = pendingSuccess.get(key.id);
  pendingSuccess.set(key.id, { count: (pending?.count ?? 0) + 1, at: new Date() });
}

/** Takes a rejected key out of rotation in this process now and in every process through the database. */
export function reportApiKeyFailure(provider: ApiKeyProvider, key: SelectedApiKey, failure: ApiKeyFailure): void {
  const id = key.id ?? ENV_ID(provider);
  const now = new Date();
  const lastError = failure.reason.slice(0, MAX_ERROR_LENGTH);
  if (failure.kind === "INVALID") localInvalid.add(id);
  else localCooldown.set(id, now.getTime() + (failure.cooldownMs ?? DEFAULT_COOLDOWN_MS));
  logger.warn({ provider, keyId: key.id ?? "env", kind: failure.kind, reason: lastError }, "platform API key rejected; rotating to the next key");
  if (!key.id) return;
  void getPrisma().platformApiKey.updateMany({
    where: { id: key.id },
    data: {
      ...(failure.kind === "INVALID" ? { invalidAt: now } : { cooldownUntil: new Date(now.getTime() + (failure.cooldownMs ?? DEFAULT_COOLDOWN_MS)) }),
      lastError,
      lastErrorAt: now,
      failureCount: { increment: 1 },
    },
  }).catch((error: unknown) => logger.warn({ err: error, id: key.id }, "could not record the API key failure"));
}

/**
 * Runs `call` with the current key and, when `classify` says the provider rejected that key, retries with the next
 * usable key until one succeeds or none is left. Any other error is thrown unchanged. The last key's error is
 * thrown when every key was rejected.
 */
export async function withApiKey<T>(
  provider: ApiKeyProvider,
  call: (key: SelectedApiKey) => Promise<T>,
  classify: (error: unknown) => ApiKeyFailure | null,
): Promise<T> {
  await refreshApiKeys();
  const tried = new Set<string>();
  let key = currentApiKey(provider);
  if (!key) return call({ id: null, secret: "" });
  for (;;) {
    tried.add(key.id ?? ENV_ID(provider));
    try {
      const result = await call(key);
      reportApiKeySuccess(key);
      return result;
    } catch (error) {
      const failure = classify(error);
      if (!failure) throw error;
      reportApiKeyFailure(provider, key, failure);
      const next = candidates(provider).find((candidate) => !tried.has(candidate.id ?? ENV_ID(provider)));
      if (!next) throw error;
      key = next;
    }
  }
}

/** Test hook: forget all cached state. */
export function resetApiKeyPoolForTests(): void {
  snapshot = null;
  inFlight = null;
  localCooldown.clear();
  localInvalid.clear();
  pendingSuccess.clear();
}
