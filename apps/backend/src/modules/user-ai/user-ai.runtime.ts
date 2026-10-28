import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { decryptAiKey } from "./user-ai.crypto.js";
import { platformAiRuntime, refreshPlatformAi } from "./platform-ai.runtime.js";

export type AiProtocol = "gemini" | "openai-compatible";
export interface PersonalAiRuntime {
  id: string;
  userId: string;
  provider: AiProtocol;
  baseUrl: string;
  model: string;
  readonly apiKey: string;
  cacheNamespace: string;
}
const context = new AsyncLocalStorage<PersonalAiRuntime | null>();

export function personalAiRuntime() { return context.getStore() ?? null; }
/** Model for a tier: the user's personal connection, else the admin's platform connection, else the env defaults. */
export function aiModel(tier: "fast" | "deep" = "fast") {
  const platform = platformAiRuntime();
  return personalAiRuntime()?.model ?? (platform ? (tier === "deep" ? platform.deepModel : platform.fastModel) : (tier === "deep" ? env.GEMINI_MODEL_DEEP : env.GEMINI_MODEL_FAST));
}

/**
 * The connection a generation call goes through, shaped for personal-ai.client: the personal connection, else the
 * platform connection with `model`. Null means the env Gemini key (the SDK path in gemini.client.ts).
 */
export function resolveAiConnection(model: string): PersonalAiRuntime | null {
  const personal = personalAiRuntime();
  if (personal) return personal;
  const platform = platformAiRuntime();
  if (!platform) return null;
  return { id: platform.id, userId: "platform", provider: platform.provider, baseUrl: platform.baseUrl, model, get apiKey() { return platform.apiKey; }, cacheNamespace: platform.cacheNamespace };
}
/** Runs `operation` on the platform AI key and cache namespace, ignoring any personal connection bound to the request. */
export function withPlatformAi<T>(operation: () => T): T { return context.run(null, operation); }
export function aiCacheNamespace() { return personalAiRuntime()?.cacheNamespace ?? platformAiRuntime()?.cacheNamespace ?? "platform"; }

export async function withUserAi<T>(userInput: string, operation: () => T): Promise<Awaited<T>> {
  // Every request and AI job passes here, so the platform connection is fresh before any model is chosen.
  await refreshPlatformAi();
  const parsed = parseDatabaseId(userInput);
  if (!parsed) return await context.run(null, operation);
  const user = await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true, aiPreference: { select: { connection: true } } },
  });
  const connection = user?.aiPreference?.connection;
  // Ownership is checked here too, even if a preference was corrupted outside the API.
  if (!connection || connection.userId !== user?.id) return await context.run(null, operation);
  const runtime: PersonalAiRuntime = {
    id: connection.id, userId: connection.userId, provider: connection.provider as AiProtocol,
    baseUrl: connection.baseUrl, model: connection.model,
    get apiKey() { return connection.encryptedKey ? decryptAiKey(connection.encryptedKey, connection.userId) : ""; },
    cacheNamespace: `${connection.userId}:${connection.id}:${connection.updatedAt.toISOString()}`,
  };
  return await context.run(runtime, operation);
}
