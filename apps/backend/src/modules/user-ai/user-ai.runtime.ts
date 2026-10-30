import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "../../common/exceptions/app-error.js";
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
/** Runs `operation` on the platform AI key and cache namespace, ignoring any personal connection bound to the request. */
export function withPlatformAi<T>(operation: () => T): T { return context.run(null, operation); }
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

/**
 * Enforces a project's AI data-handling policy before sending unpublished project content to an LLM:
 * - DISABLED: rejects external AI processing of project content.
 * - PLATFORM_AI_ONLY: forces platform AI credentials, preventing a collaborator's custom third-party endpoint from receiving shared project text.
 * - ALLOW_PERSONAL_AI: uses the caller's personal AI connection if configured, else platform AI.
 */
export async function withProjectAi<T>(projectInput: string | null | undefined, userInput: string, operation: () => T): Promise<Awaited<T>> {
  if (!projectInput) return withUserAi(userInput, operation);
  const parsedProject = parseDatabaseId(projectInput);
  if (!parsedProject) return withUserAi(userInput, operation);
  const project = await getPrisma().project.findUnique({
    where: parsedProject.kind === "uuid" ? { id: parsedProject.value } : { legacyMongoId: parsedProject.value },
    select: { aiDataPolicy: true },
  });
  const policy = project?.aiDataPolicy ?? "ALLOW_PERSONAL_AI";
  if (policy === "DISABLED") {
    throw AppError.forbidden("External AI processing is disabled by this project's security policy");
  }
  if (policy === "PLATFORM_AI_ONLY") {
    return await withPlatformAi(operation);
  }
  return withUserAi(userInput, operation);
}
