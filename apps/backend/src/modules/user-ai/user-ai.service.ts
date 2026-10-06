import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { encryptAiKey, decryptAiKey } from "./user-ai.crypto.js";
import { normalizeAiBaseUrl, providerJson } from "./provider-http.js";
import type { AiConnectionDraft, SaveAiConnectionInput } from "./user-ai.schema.js";

export interface AiModelOption { id: string; name: string }
export async function resolveAiUser(input: string) {
  const parsed = parseDatabaseId(input);
  const user = parsed ? await getPrisma().user.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }, select: { id: true } }) : null;
  if (!user) throw AppError.unauthorized();
  return user.id;
}
async function owned(userId: string, id: string) {
  const connection = await getPrisma().userAiConnection.findFirst({ where: { id, userId } });
  if (!connection) throw AppError.notFound("AI connection not found");
  return connection;
}
export async function resolveAiDraft(userId: string, input: AiConnectionDraft) {
  const baseUrl = normalizeAiBaseUrl(input.baseUrl, input.provider);
  const existing = input.connectionId ? await owned(userId, input.connectionId) : null;
  // Never reuse a saved credential after changing its destination or protocol.
  const canReuseKey = existing?.baseUrl === baseUrl && existing.provider === input.provider;
  const apiKey = input.apiKey || (canReuseKey && existing?.encryptedKey ? decryptAiKey(existing.encryptedKey, userId) : "");
  if (input.provider === "gemini" && !apiKey) throw AppError.badRequest("Enter a Gemini API key. Changing the Base URL requires entering the key again.");
  return { existing, baseUrl, apiKey, provider: input.provider };
}
async function discoverModels(connection: { baseUrl: string; apiKey: string; provider: string }): Promise<AiModelOption[]> {
  const { baseUrl, apiKey, provider } = connection;
  const models: AiModelOption[] = [];
  if (provider === "gemini") {
    let token: string | undefined;
    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({ pageSize: "1000", ...(token ? { pageToken: token } : {}) });
      const response = await providerJson(`${baseUrl}/v1beta/models?${query}`, apiKey, provider);
      if (!Array.isArray(response.models)) throw AppError.serviceUnavailable("AI provider did not return a model list");
      for (const model of response.models) {
        if (typeof model.name === "string" && model.supportedGenerationMethods?.includes("generateContent") &&
            !/tts|image|robotics|computer-use/i.test(model.name)) {
          models.push({ id: model.name.replace(/^models\//, ""), name: String(model.displayName ?? model.name) });
        }
      }
      token = response.nextPageToken;
      if (!token) break;
      if (page === 19) throw AppError.serviceUnavailable("The provider model list is too large");
    }
  } else {
    const response = await providerJson(`${baseUrl}/models`, apiKey, provider);
    if (!Array.isArray(response.data)) throw AppError.serviceUnavailable("AI provider did not return an OpenAI-compatible model list");
    for (const model of response.data) {
      if (typeof model.id === "string" && !/embedding|whisper|tts|dall-e|moderation|realtime|transcribe|(?:^|-)image(?:-|$)/i.test(model.id)) {
        models.push({ id: model.id, name: model.id });
      }
    }
  }
  const result = [...new Map(models.filter((model) => model.id.length <= 200).map((model) => [model.id, model])).values()].sort((a, b) => a.id.localeCompare(b.id));
  if (!result.length) throw AppError.badRequest("No text-generation models were found for this connection");
  return result;
}
function publicConnection(row: { id: string; name: string; provider: string; baseUrl: string; model: string; encryptedKey: string | null; updatedAt: Date }) {
  return { id: row.id, name: row.name, provider: row.provider, baseUrl: row.baseUrl, model: row.model, hasApiKey: Boolean(row.encryptedKey), updatedAt: row.updatedAt.toISOString() };
}

export const userAiService = {
  async list(userInput: string) {
    const userId = await resolveAiUser(userInput);
    const [connections, preference] = await Promise.all([
      getPrisma().userAiConnection.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      getPrisma().userAiPreference.findUnique({ where: { userId } }),
    ]);
    return { connections: connections.map(publicConnection), activeConnectionId: preference?.connectionId ?? null };
  },
  async models(userInput: string, input: AiConnectionDraft) {
    const userId = await resolveAiUser(userInput);
    return discoverModels(await resolveAiDraft(userId, input));
  },
  async save(userInput: string, input: SaveAiConnectionInput) {
    const userId = await resolveAiUser(userInput);
    const connection = await resolveAiDraft(userId, input);
    const models = await discoverModels(connection);
    if (!models.some((model) => model.id === input.model)) throw AppError.badRequest("Choose a model returned by Fetch models for this connection");
    if (!connection.existing && await getPrisma().userAiConnection.count({ where: { userId } }) >= 20) {
      throw AppError.badRequest("You can save up to 20 AI connections");
    }
    const data = { name: input.name, provider: connection.provider, baseUrl: connection.baseUrl, model: input.model,
      encryptedKey: connection.apiKey ? encryptAiKey(connection.apiKey, userId) : null };
    const saved = connection.existing
      ? await getPrisma().userAiConnection.update({ where: { id: connection.existing.id }, data })
      : await getPrisma().userAiConnection.create({ data: { ...data, userId } });
    return publicConnection(saved);
  },
  async activate(userInput: string, connectionId: string | null) {
    const userId = await resolveAiUser(userInput);
    // Transaction plus ownership check prevents selecting another user's key.
    await getPrisma().$transaction(async (tx) => {
      if (connectionId && !await tx.userAiConnection.findFirst({ where: { id: connectionId, userId } })) throw AppError.notFound("AI connection not found");
      await tx.userAiPreference.upsert({ where: { userId }, create: { userId, connectionId }, update: { connectionId } });
    });
    return { activeConnectionId: connectionId };
  },
  async remove(userInput: string, connectionId: string) {
    const userId = await resolveAiUser(userInput);
    const result = await getPrisma().userAiConnection.deleteMany({ where: { id: connectionId, userId } });
    if (!result.count) throw AppError.notFound("AI connection not found");
  },
};
