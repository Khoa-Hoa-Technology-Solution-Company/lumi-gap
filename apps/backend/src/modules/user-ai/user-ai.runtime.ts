import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { decryptAiKey } from "./user-ai.crypto.js";

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
export function aiModel(tier: "fast" | "deep" = "fast") {
  return personalAiRuntime()?.model ?? (tier === "deep" ? env.GEMINI_MODEL_DEEP : env.GEMINI_MODEL_FAST);
}
export function aiCacheNamespace() { return personalAiRuntime()?.cacheNamespace ?? "platform"; }

export async function withUserAi<T>(userInput: string, operation: () => T): Promise<Awaited<T>> {
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
