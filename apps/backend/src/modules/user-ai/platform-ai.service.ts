import crypto from "node:crypto";
import type { PlatformAiSettings } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { invalidatePlatformAi, platformKeyScope } from "./platform-ai.runtime.js";
import { normalizeAiBaseUrl } from "./provider-http.js";
import { decryptAiKey, encryptAiKey } from "./user-ai.crypto.js";
import { discoverModels } from "./user-ai.service.js";
import type { AiConnectionDraft, SavePlatformAiConnectionInput } from "./user-ai.schema.js";

const MAX_CONNECTIONS = 20;

type Row = { id: string; name: string; provider: string; baseUrl: string; fastModel: string; deepModel: string; encryptedKey: string | null; isActive: boolean; updatedAt: Date };
function publicConnection(row: Row) {
  return { id: row.id, name: row.name, provider: row.provider as "gemini" | "openai-compatible", baseUrl: row.baseUrl, fastModel: row.fastModel, deepModel: row.deepModel, hasApiKey: Boolean(row.encryptedKey), isActive: row.isActive, updatedAt: row.updatedAt.toISOString() };
}

async function existing(id: string) {
  const row = await getPrisma().platformAiConnection.findUnique({ where: { id } });
  if (!row) throw AppError.notFound("Platform AI connection not found");
  return row;
}

/** Same rules as a personal draft: a saved key is reused only for the same endpoint and protocol. */
async function resolveDraft(input: AiConnectionDraft) {
  const baseUrl = normalizeAiBaseUrl(input.baseUrl, input.provider);
  const saved = input.connectionId ? await existing(input.connectionId) : null;
  const canReuseKey = saved?.baseUrl === baseUrl && saved.provider === input.provider;
  const apiKey = input.apiKey || (canReuseKey && saved?.encryptedKey ? decryptAiKey(saved.encryptedKey, platformKeyScope(saved.id)) : "");
  if (input.provider === "gemini" && !apiKey) throw AppError.badRequest("Enter a Gemini API key. Changing the Base URL requires entering the key again.");
  return { saved, baseUrl, apiKey, provider: input.provider };
}

/** Admin management of the platform-wide AI connection (text generation for every user without a personal one). */
export const platformAiService = {
  async list(): Promise<PlatformAiSettings> {
    const rows = await getPrisma().platformAiConnection.findMany({ orderBy: { createdAt: "asc" } });
    return {
      connections: rows.map(publicConnection),
      activeConnectionId: rows.find((row) => row.isActive)?.id ?? null,
      environmentDefaults: { provider: "gemini", fastModel: env.GEMINI_MODEL_FAST, deepModel: env.GEMINI_MODEL_DEEP },
    };
  },

  async models(input: AiConnectionDraft) {
    return discoverModels(await resolveDraft(input));
  },

  async save(adminId: string, input: SavePlatformAiConnectionInput) {
    const connection = await resolveDraft(input);
    const models = await discoverModels(connection);
    for (const model of [input.fastModel, input.deepModel]) {
      if (!models.some((option) => option.id === model)) throw AppError.badRequest("Choose models returned by Fetch models for this connection");
    }
    if (!connection.saved && await getPrisma().platformAiConnection.count() >= MAX_CONNECTIONS) throw AppError.badRequest(`You can save up to ${MAX_CONNECTIONS} platform AI connections`);
    // The id is fixed before encrypting, because the key is bound to it.
    const id = connection.saved?.id ?? crypto.randomUUID();
    const data = { name: input.name, provider: connection.provider, baseUrl: connection.baseUrl, fastModel: input.fastModel, deepModel: input.deepModel, encryptedKey: connection.apiKey ? encryptAiKey(connection.apiKey, platformKeyScope(id)) : null };
    const saved = connection.saved
      ? await getPrisma().platformAiConnection.update({ where: { id }, data })
      : await getPrisma().platformAiConnection.create({ data: { ...data, id, createdById: adminId } });
    invalidatePlatformAi();
    await auditService.log("platform_ai.connection.saved", { userId: adminId, targetTableName: "platform_ai_connections", targetRecordId: id, details: { name: input.name, provider: connection.provider, baseUrl: connection.baseUrl, fastModel: input.fastModel, deepModel: input.deepModel } });
    return publicConnection(saved);
  },

  /** Makes one connection the platform default, or none (back to the env GEMINI_* settings). */
  async activate(adminId: string, connectionId: string | null) {
    await getPrisma().$transaction(async (tx) => {
      if (connectionId && !await tx.platformAiConnection.findUnique({ where: { id: connectionId } })) throw AppError.notFound("Platform AI connection not found");
      // Deactivate first: the partial unique index allows only one active row.
      await tx.platformAiConnection.updateMany({ where: { isActive: true }, data: { isActive: false } });
      if (connectionId) await tx.platformAiConnection.update({ where: { id: connectionId }, data: { isActive: true } });
    });
    invalidatePlatformAi();
    await auditService.log("platform_ai.connection.activated", { userId: adminId, targetTableName: "platform_ai_connections", targetRecordId: connectionId ?? undefined, details: { connectionId } });
    return { activeConnectionId: connectionId };
  },

  async remove(adminId: string, connectionId: string) {
    const result = await getPrisma().platformAiConnection.deleteMany({ where: { id: connectionId } });
    if (!result.count) throw AppError.notFound("Platform AI connection not found");
    invalidatePlatformAi();
    await auditService.log("platform_ai.connection.deleted", { userId: adminId, targetTableName: "platform_ai_connections", targetRecordId: connectionId });
  },
};
