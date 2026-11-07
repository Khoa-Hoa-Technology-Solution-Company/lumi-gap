import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env.js";
import { getEmbeddingProvider } from "../../embeddings/embedding.factory.js";
import { OpenAiEmbeddingProvider } from "../../embeddings/openai-embedding.provider.js";
import { AiProviderHttpError } from "../provider-http.js";
import { invalidatePlatformEmbedding, platformEmbeddingKeyScope } from "../platform-embedding.runtime.js";
import { platformEmbeddingService } from "../platform-embedding.service.js";
import { decryptAiKey, encryptAiKey } from "../user-ai.crypto.js";

const mocks = vi.hoisted(() => ({
  platformEmbeddingConnection: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  $queryRaw: vi.fn(),
  request: vi.fn(),
  geminiEmbed: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ ...mocks, $transaction: async (operation: (db: typeof mocks) => unknown) => operation(mocks) }) }));
vi.mock("../../../infrastructure/cache.js", () => ({ cache: { get: async () => null, set: async () => undefined }, hashKey: (value: unknown) => JSON.stringify(value) }));
vi.mock("../provider-http.js", async (original) => ({ ...await original<typeof import("../provider-http.js")>(), providerJson: mocks.request }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));
vi.mock("../../llm/gemini.client.js", () => ({ geminiClient: { models: { embedContent: mocks.geminiEmbed } } }));

const adminId = "00000000-0000-4000-8000-0000000000a1";
const connectionId = "00000000-0000-4000-8000-0000000000e1";
const dims = env.GEMINI_EMBEDDING_DIMENSIONS;
const baseUrl = "https://gateway.example/v1";
const unit = (axis: number) => Array.from({ length: dims }, (_, index) => (index === axis ? 1 : 0));
const answer = (...vectors: number[][]) => ({ data: vectors.map((embedding, index) => ({ index, embedding })) });
const stored = [{ title: "Stored paper", abstractText: "Abstract", embedding: JSON.stringify(unit(0)) }];
const row = (overrides: Record<string, unknown> = {}) => ({ id: connectionId, name: "Gateway", baseUrl, model: "vendor/embedding-model", encryptedKey: encryptAiKey("gateway-secret", platformEmbeddingKeyScope(connectionId)), verifiedSimilarity: 1, isActive: true, createdById: adminId, createdAt: new Date(), updatedAt: new Date("2026-10-31T00:00:00Z"), ...overrides });
const input = { name: "Gateway", baseUrl, apiKey: "gateway-secret", model: "vendor/embedding-model" };

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePlatformEmbedding();
  mocks.platformEmbeddingConnection.findFirst.mockResolvedValue(null);
  mocks.platformEmbeddingConnection.count.mockResolvedValue(0);
  mocks.$queryRaw.mockResolvedValue(stored);
  mocks.request.mockResolvedValue(answer(unit(0)));
  mocks.geminiEmbed.mockResolvedValue({ embeddings: [{ values: unit(1) }] });
});

describe("embedding routing", () => {
  it("uses the env Gemini key while no connection is active", async () => {
    expect(await getEmbeddingProvider().embed("env route")).toEqual(unit(1));
    expect(mocks.geminiEmbed).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("sends requests to the active connection and keeps the stored provenance", async () => {
    mocks.platformEmbeddingConnection.findFirst.mockResolvedValue(row());
    const provider = getEmbeddingProvider();
    expect(await provider.embed("connection route")).toEqual(unit(0));
    expect(mocks.request).toHaveBeenCalledWith(`${baseUrl}/embeddings`, "gateway-secret", "openai-compatible", expect.objectContaining({ model: "vendor/embedding-model", input: ["connection route"], dimensions: dims }), 15_000);
    expect(mocks.geminiEmbed).not.toHaveBeenCalled();
    expect(provider.modelName).toBe(env.GEMINI_EMBEDDING_MODEL);
  });
});

describe("OpenAI-compatible embedding provider", () => {
  const provider = new OpenAiEmbeddingProvider({ baseUrl, model: "m", apiKey: "k" });

  it("keeps the input order when the endpoint answers out of order", async () => {
    mocks.request.mockResolvedValue({ data: [{ index: 1, embedding: unit(1) }, { index: 0, embedding: unit(0) }] });
    expect(await provider.embedBatch(["a", "b"])).toEqual([unit(0), unit(1)]);
  });

  it("splits large batches into several requests", async () => {
    mocks.request.mockImplementation(async (_url, _key, _provider, body: { input: string[] }) => answer(...body.input.map(() => unit(0))));
    expect(await provider.embedBatch(Array.from({ length: 40 }, () => "text"))).toHaveLength(40);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it("rejects vectors of another size before they reach the database", async () => {
    mocks.request.mockResolvedValue(answer([1, 2, 3]));
    await expect(provider.embed("x")).rejects.toThrow(`${dims}-dimensional`);
    mocks.request.mockResolvedValue({ data: [] });
    await expect(provider.embed("x")).rejects.toThrow("returned 0 vectors");
  });

  it("does not repeat a request the provider will refuse again", async () => {
    mocks.request.mockRejectedValue(new AiProviderHttpError(401));
    await expect(provider.embedBatch(["x"])).rejects.toBeInstanceOf(AiProviderHttpError);
    expect(mocks.request).toHaveBeenCalledOnce();
  });
});

describe("embedding connection administration", () => {
  it("saves a connection that reproduces the stored vectors, binding the key to it and never returning it", async () => {
    mocks.platformEmbeddingConnection.create.mockImplementation(async ({ data }) => ({ ...row(), ...data, isActive: false }));
    const saved = await platformEmbeddingService.save(adminId, input);
    const data = mocks.platformEmbeddingConnection.create.mock.calls[0]![0].data;
    expect(decryptAiKey(data.encryptedKey, platformEmbeddingKeyScope(data.id))).toBe("gateway-secret");
    expect(() => decryptAiKey(data.encryptedKey, data.id)).toThrow("cannot be read");
    expect(saved).toMatchObject({ hasApiKey: true, verifiedSimilarity: 1, model: "vendor/embedding-model" });
    expect(JSON.stringify(saved)).not.toContain(data.encryptedKey);
    expect(mocks.request.mock.calls[0]![3]).toMatchObject({ input: ["Stored paper\n\nAbstract"] });
  });

  it("refuses a model that does not reproduce the stored vectors", async () => {
    mocks.request.mockResolvedValue(answer(unit(1)));
    await expect(platformEmbeddingService.save(adminId, input)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.platformEmbeddingConnection.create).not.toHaveBeenCalled();
  });

  it("reports a refused key or model id as a problem with the form, not an outage", async () => {
    mocks.request.mockRejectedValue(new AiProviderHttpError(403));
    await expect(platformEmbeddingService.save(adminId, input)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("model id") });
    mocks.request.mockRejectedValue(new Error("connection reset"));
    await expect(platformEmbeddingService.save(adminId, input)).rejects.toThrow("connection reset");
  });

  it("accepts the best match, because a paper can change after it was embedded", async () => {
    mocks.$queryRaw.mockResolvedValue([{ title: "Edited", abstractText: null, embedding: JSON.stringify(unit(2)) }, ...stored]);
    mocks.request.mockResolvedValue(answer(unit(0), unit(0)));
    mocks.platformEmbeddingConnection.create.mockImplementation(async ({ data }) => ({ ...row(), ...data }));
    expect(await platformEmbeddingService.save(adminId, input)).toMatchObject({ verifiedSimilarity: 1 });
  });

  it("checks only the vector shape while nothing is stored", async () => {
    mocks.$queryRaw.mockResolvedValue([]);
    mocks.platformEmbeddingConnection.create.mockImplementation(async ({ data }) => ({ ...row(), ...data }));
    expect(await platformEmbeddingService.save(adminId, input)).toMatchObject({ verifiedSimilarity: null });
    mocks.request.mockResolvedValue(answer([1, 2, 3]));
    await expect(platformEmbeddingService.save(adminId, input)).rejects.toThrow(`${dims}-dimensional`);
  });

  it("does not reuse a saved key for a different endpoint", async () => {
    mocks.platformEmbeddingConnection.findUnique.mockResolvedValue(row());
    mocks.platformEmbeddingConnection.update.mockImplementation(async ({ data }) => ({ ...row(), ...data }));
    await platformEmbeddingService.save(adminId, { name: "Gateway", baseUrl: "https://other.example/v1", connectionId, model: "m" });
    expect(mocks.request.mock.calls[0]![1]).toBe("");
    await platformEmbeddingService.save(adminId, { name: "Gateway", baseUrl, connectionId, model: "m" });
    expect(mocks.request.mock.calls[1]![1]).toBe("gateway-secret");
  });

  it("checks again before activating, and stays inactive when the model no longer matches", async () => {
    mocks.platformEmbeddingConnection.findUnique.mockResolvedValue(row({ isActive: false }));
    await platformEmbeddingService.activate(adminId, connectionId);
    expect(mocks.platformEmbeddingConnection.update).toHaveBeenCalledWith({ where: { id: connectionId }, data: { isActive: true, verifiedSimilarity: 1 } });
    vi.clearAllMocks();
    mocks.$queryRaw.mockResolvedValue(stored);
    mocks.request.mockResolvedValue(answer(unit(1)));
    await expect(platformEmbeddingService.activate(adminId, connectionId)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.platformEmbeddingConnection.updateMany).not.toHaveBeenCalled();
  });

  it("goes back to the env key without calling any endpoint", async () => {
    await platformEmbeddingService.activate(adminId, null);
    expect(mocks.platformEmbeddingConnection.updateMany).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("lists connections with the env defaults, without keys", async () => {
    mocks.platformEmbeddingConnection.findMany.mockResolvedValue([row()]);
    const settings = await platformEmbeddingService.list();
    expect(settings.activeConnectionId).toBe(connectionId);
    expect(settings.environmentDefaults).toEqual({ provider: "gemini", model: env.GEMINI_EMBEDDING_MODEL, dimensions: dims });
    expect(JSON.stringify(settings)).not.toContain("encryptedKey");
  });
});
