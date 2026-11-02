import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { decryptAiKey } from "./user-ai.crypto.js";

/** Additional data bound into the encryption of the key, so it cannot be swapped with another connection's key. */
export const platformEmbeddingKeyScope = (connectionId: string) => `platform-embedding:${connectionId}`;

export interface PlatformEmbeddingRuntime {
  id: string;
  baseUrl: string;
  model: string;
  readonly apiKey: string;
  /** Changes when the connection is edited. */
  version: string;
}

/** Each process (API, every worker) re-reads the active connection at most this often; an admin change applies within it. */
const TTL_MS = 30_000;
let current: { value: PlatformEmbeddingRuntime | null; loadedAt: number } | null = null;
let inFlight: Promise<PlatformEmbeddingRuntime | null> | null = null;

function toRuntime(row: { id: string; baseUrl: string; model: string; encryptedKey: string | null; updatedAt: Date }): PlatformEmbeddingRuntime {
  return {
    id: row.id, baseUrl: row.baseUrl, model: row.model,
    // Decrypted lazily, only when a call is actually made (CLAUDE.md §6, personal keys rule applies here too).
    get apiKey() { return row.encryptedKey ? decryptAiKey(row.encryptedKey, platformEmbeddingKeyScope(row.id)) : ""; },
    version: row.updatedAt.toISOString(),
  };
}

/**
 * Loads the active embedding connection when the cached copy is older than the TTL. A database failure keeps the
 * previous value (or none, falling back to the env Gemini key) rather than failing the embedding call.
 */
export async function refreshPlatformEmbedding(): Promise<PlatformEmbeddingRuntime | null> {
  if (current && Date.now() - current.loadedAt < TTL_MS) return current.value;
  inFlight ??= (async () => {
    try {
      const row = await getPrisma().platformEmbeddingConnection.findFirst({ where: { isActive: true } });
      current = { value: row ? toRuntime(row) : null, loadedAt: Date.now() };
    } catch (error) {
      logger.warn({ err: error }, "could not load the platform embedding connection; using the previous or env settings");
      current = { value: current?.value ?? null, loadedAt: Date.now() };
    } finally {
      inFlight = null;
    }
    return current.value;
  })();
  return inFlight;
}

/** Drops the cached copy in this process (after an admin change); other processes follow within the TTL. */
export function invalidatePlatformEmbedding(): void {
  current = null;
}
