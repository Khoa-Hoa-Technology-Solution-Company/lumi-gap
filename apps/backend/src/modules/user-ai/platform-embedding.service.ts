import crypto from "node:crypto";
import type { PlatformEmbeddingSettings } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { embeddingProviderFor } from "../embeddings/embedding.factory.js";
import { paperEmbeddingText } from "../embeddings/embedding.service.js";
import type { EmbeddingEndpoint } from "../embeddings/openai-embedding.provider.js";
import { cosine } from "../gaps/gap-mmr.js";
import { invalidatePlatformEmbedding, platformEmbeddingKeyScope } from "./platform-embedding.runtime.js";
import { AiProviderHttpError, normalizeAiBaseUrl } from "./provider-http.js";
import { decryptAiKey, encryptAiKey } from "./user-ai.crypto.js";
import type { SavePlatformEmbeddingConnectionInput } from "./user-ai.schema.js";

const MAX_CONNECTIONS = 20;
/** The same model on the same text gives cosine 1 up to rounding; another model stays far below this. */
const MIN_SAME_VECTORS_SIMILARITY = 0.999;
const SAMPLE_PAPERS = 3;
const REFUSED_STATUSES = new Set([401, 403, 404]);

type Row = { id: string; name: string; baseUrl: string; model: string; encryptedKey: string | null; isActive: boolean; verifiedSimilarity: number | null; updatedAt: Date };
function publicConnection(row: Row) {
  return { id: row.id, name: row.name, baseUrl: row.baseUrl, model: row.model, hasApiKey: Boolean(row.encryptedKey), isActive: row.isActive, verifiedSimilarity: row.verifiedSimilarity, updatedAt: row.updatedAt.toISOString() };
}

async function existing(id: string) {
  const row = await getPrisma().platformEmbeddingConnection.findUnique({ where: { id } });
  if (!row) throw AppError.notFound("Embedding connection not found");
  return row;
}

const savedKey = (row: { id: string; encryptedKey: string | null }) => row.encryptedKey ? decryptAiKey(row.encryptedKey, platformEmbeddingKeyScope(row.id)) : "";

/**
 * Stored vectors are compared with new query vectors, so an endpoint is accepted only if it reproduces them: it embeds
 * stored papers again and keeps the best match, since a paper edited after embedding no longer matches its vector.
 * Only public papers leave the platform. Returns null when no stored vector exists yet, after checking the vector shape.
 */
async function verifySameVectors(endpoint: EmbeddingEndpoint): Promise<number | null> {
  const samples = await getPrisma().$queryRaw<Array<{ title: string; abstractText: string | null; embedding: string }>>(Prisma.sql`
    SELECT title, abstract_text AS "abstractText", embedding::text AS embedding
    FROM papers
    WHERE embedding IS NOT NULL
      AND embedding_model = ${env.GEMINI_EMBEDDING_MODEL}
      AND embedding_version = ${env.GEMINI_EMBEDDING_VERSION}
      AND embedding_dimensions = ${env.GEMINI_EMBEDDING_DIMENSIONS}
      AND uploaded_by_id IS NULL
      AND data_status = 'active'
    ORDER BY citation_count DESC, id
    LIMIT ${SAMPLE_PAPERS}
  `);
  const provider = embeddingProviderFor(endpoint);
  const vectors = await provider.embedBatch(samples.length ? samples.map((paper) => paperEmbeddingText(paper.title, paper.abstractText)) : ["embedding connection check"]).catch((error: unknown) => {
    // Gateways also answer 403 for a model id they do not know, so a refusal is about these values, not an outage.
    if (error instanceof AiProviderHttpError && REFUSED_STATUSES.has(error.status)) {
      throw AppError.badRequest(`The endpoint refused this request (HTTP ${error.status}). Check the API key and the model id: it must be the endpoint's own id, which can differ from ${env.GEMINI_EMBEDDING_MODEL}.`);
    }
    throw error;
  });
  if (!samples.length) return null;
  const similarity = Math.max(...samples.map((paper, index) => cosine(JSON.parse(paper.embedding) as number[], vectors[index]!)));
  if (similarity < MIN_SAME_VECTORS_SIMILARITY) {
    throw AppError.badRequest(`This model does not produce the stored ${env.GEMINI_EMBEDDING_MODEL} vectors (cosine ${similarity.toFixed(4)}), so search results would be wrong. Choose the same model.`);
  }
  return similarity;
}

/** Admin management of the platform-wide embedding connection, chosen independently of the text-generation one. */
export const platformEmbeddingService = {
  async list(): Promise<PlatformEmbeddingSettings> {
    const rows = await getPrisma().platformEmbeddingConnection.findMany({ orderBy: { createdAt: "asc" } });
    return {
      connections: rows.map(publicConnection),
      activeConnectionId: rows.find((row) => row.isActive)?.id ?? null,
      environmentDefaults: { provider: "gemini", model: env.GEMINI_EMBEDDING_MODEL, dimensions: env.GEMINI_EMBEDDING_DIMENSIONS },
    };
  },

  async save(adminId: string, input: SavePlatformEmbeddingConnectionInput) {
    const baseUrl = normalizeAiBaseUrl(input.baseUrl, "openai-compatible");
    const saved = input.connectionId ? await existing(input.connectionId) : null;
    if (!saved && await getPrisma().platformEmbeddingConnection.count() >= MAX_CONNECTIONS) throw AppError.badRequest(`You can save up to ${MAX_CONNECTIONS} embedding connections`);
    // Same rule as AI connections: a saved key is reused only for the same endpoint.
    const apiKey = input.apiKey || (saved?.baseUrl === baseUrl ? savedKey(saved) : "");
    const verifiedSimilarity = await verifySameVectors({ baseUrl, model: input.model, apiKey });
    // The id is fixed before encrypting, because the key is bound to it.
    const id = saved?.id ?? crypto.randomUUID();
    const data = { name: input.name, baseUrl, model: input.model, verifiedSimilarity, encryptedKey: apiKey ? encryptAiKey(apiKey, platformEmbeddingKeyScope(id)) : null };
    const row = saved
      ? await getPrisma().platformEmbeddingConnection.update({ where: { id }, data })
      : await getPrisma().platformEmbeddingConnection.create({ data: { ...data, id, createdById: adminId } });
    invalidatePlatformEmbedding();
    await auditService.log("platform_embedding.connection.saved", { userId: adminId, targetTableName: "platform_embedding_connections", targetRecordId: id, details: { name: input.name, baseUrl, model: input.model, verifiedSimilarity } });
    return publicConnection(row);
  },

  /** Makes one connection serve embeddings, or none (back to the env Gemini key). Checks again: a model can change behind its id. */
  async activate(adminId: string, connectionId: string | null) {
    const row = connectionId ? await existing(connectionId) : null;
    const verifiedSimilarity = row ? await verifySameVectors({ baseUrl: row.baseUrl, model: row.model, apiKey: savedKey(row) }) : null;
    await getPrisma().$transaction(async (tx) => {
      // Deactivate first: the partial unique index allows only one active row.
      await tx.platformEmbeddingConnection.updateMany({ where: { isActive: true }, data: { isActive: false } });
      if (connectionId) await tx.platformEmbeddingConnection.update({ where: { id: connectionId }, data: { isActive: true, verifiedSimilarity } });
    });
    invalidatePlatformEmbedding();
    await auditService.log("platform_embedding.connection.activated", { userId: adminId, targetTableName: "platform_embedding_connections", targetRecordId: connectionId ?? undefined, details: { connectionId, verifiedSimilarity } });
    return { activeConnectionId: connectionId };
  },

  async remove(adminId: string, connectionId: string) {
    const result = await getPrisma().platformEmbeddingConnection.deleteMany({ where: { id: connectionId } });
    if (!result.count) throw AppError.notFound("Embedding connection not found");
    invalidatePlatformEmbedding();
    await auditService.log("platform_embedding.connection.deleted", { userId: adminId, targetTableName: "platform_embedding_connections", targetRecordId: connectionId });
  },
};
