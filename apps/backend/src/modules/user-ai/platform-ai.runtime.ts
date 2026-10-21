import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { decryptAiKey } from "./user-ai.crypto.js";

/** Additional data bound into the encryption of a platform key, so it cannot be swapped with a user's key. */
export const platformKeyScope = (connectionId: string) => `platform:${connectionId}`;

export interface PlatformAiRuntime {
  id: string;
  provider: "gemini" | "openai-compatible";
  baseUrl: string;
  fastModel: string;
  deepModel: string;
  readonly apiKey: string;
  /** Changes when the connection is edited, so cached LLM output of an older configuration is not reused. */
  cacheNamespace: string;
}

/** Each process (API, every worker) re-reads the active connection at most this often; an admin change applies within it. */
const TTL_MS = 30_000;
let current: { value: PlatformAiRuntime | null; loadedAt: number } | null = null;
let inFlight: Promise<PlatformAiRuntime | null> | null = null;

function toRuntime(row: { id: string; provider: string; baseUrl: string; fastModel: string; deepModel: string; encryptedKey: string | null; updatedAt: Date }): PlatformAiRuntime {
  return {
    id: row.id, provider: row.provider as PlatformAiRuntime["provider"], baseUrl: row.baseUrl, fastModel: row.fastModel, deepModel: row.deepModel,
    // Decrypted lazily, only when a call is actually made (CLAUDE.md §6, personal keys rule applies to platform keys too).
    get apiKey() { return row.encryptedKey ? decryptAiKey(row.encryptedKey, platformKeyScope(row.id)) : ""; },
    cacheNamespace: `platform:${row.id}:${row.updatedAt.toISOString()}`,
  };
}

/** The active platform connection as last loaded; null when none is active or it was never loaded in this process. */
export function platformAiRuntime(): PlatformAiRuntime | null {
  return current?.value ?? null;
}

/**
 * Loads the active platform connection when the cached copy is older than the TTL. A database failure keeps the
 * previous value (or none, falling back to the env settings) rather than failing the AI call.
 */
export async function refreshPlatformAi(force = false): Promise<PlatformAiRuntime | null> {
  if (!force && current && Date.now() - current.loadedAt < TTL_MS) return current.value;
  inFlight ??= (async () => {
    try {
      const row = await getPrisma().platformAiConnection.findFirst({ where: { isActive: true } });
      current = { value: row ? toRuntime(row) : null, loadedAt: Date.now() };
    } catch (error) {
      logger.warn({ err: error }, "could not load the platform AI connection; using the previous or env settings");
      current = { value: current?.value ?? null, loadedAt: Date.now() };
    } finally {
      inFlight = null;
    }
    return current.value;
  })();
  return inFlight;
}

/** Drops the cached copy in this process (after an admin change); other processes follow within the TTL. */
export function invalidatePlatformAi(): void {
  current = null;
}
