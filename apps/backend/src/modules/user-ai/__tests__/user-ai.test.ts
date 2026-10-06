import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptAiKey, decryptAiKey } from "../user-ai.crypto.js";
import { aiCacheNamespace, aiModel, personalAiRuntime, withUserAi } from "../user-ai.runtime.js";
import { userAiService } from "../user-ai.service.js";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  userAiConnection: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  userAiPreference: { findUnique: vi.fn(), upsert: vi.fn() },
  request: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ ...mocks, $transaction: async (operation: (db: typeof mocks) => unknown) => operation(mocks) }) }));
vi.mock("../provider-http.js", async (original) => ({ ...await original<typeof import("../provider-http.js")>(), providerJson: mocks.request }));
const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const connectionId = "00000000-0000-4000-8000-000000000003";
const base = { id: connectionId, userId: userA, name: "Personal", provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com", model: "test-model", updatedAt: new Date(), encryptedKey: "" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.findUnique.mockResolvedValue({ id: userA });
  mocks.userAiConnection.findFirst.mockResolvedValue(null);
  mocks.userAiConnection.count.mockResolvedValue(0);
  mocks.request.mockResolvedValue({ models: [{ name: "models/test-model", displayName: "Test", supportedGenerationMethods: ["generateContent"] }, { name: "models/embedding", supportedGenerationMethods: ["embedContent"] }] });
});

describe("personal AI secrets and ownership", () => {
  it("encrypts with random IVs and binds the key to its owner", () => {
    const encrypted = encryptAiKey("private-test-key", userA);
    expect(encrypted).not.toContain("private-test-key");
    expect(encryptAiKey("private-test-key", userA)).not.toBe(encrypted);
    expect(decryptAiKey(encrypted, userA)).toBe("private-test-key");
    expect(() => decryptAiKey(encrypted, userB)).toThrow("cannot be read");
  });
  it("does not expose credentials or ciphertext in connection responses", async () => {
    mocks.userAiConnection.findMany.mockResolvedValue([{ ...base, encryptedKey: encryptAiKey("private-test-key", userA) }]);
    mocks.userAiPreference.findUnique.mockResolvedValue({ connectionId });
    const result = await userAiService.list(userA);
    expect(result.connections[0]).toMatchObject({ hasApiKey: true, model: "test-model" });
    expect(JSON.stringify(result)).not.toContain("encryptedKey");
    expect(JSON.stringify(result)).not.toContain("private-test-key");
  });
  it("cannot use another user's saved key for model discovery or activation", async () => {
    await expect(userAiService.models(userB, { connectionId, provider: "gemini", baseUrl: base.baseUrl })).rejects.toMatchObject({ statusCode: 404 });
    await expect(userAiService.activate(userB, connectionId)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.userAiPreference.upsert).not.toHaveBeenCalled();
  });
  it("does not forward a saved key when the URL changes", async () => {
    mocks.userAiConnection.findFirst.mockResolvedValue({ ...base, encryptedKey: encryptAiKey("private-test-key", userA) });
    await expect(userAiService.models(userA, { connectionId, provider: "gemini", baseUrl: "https://example.com" })).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("fetches only generative Gemini models and rejects a model outside the fetched list", async () => {
    expect(await userAiService.models(userA, { provider: "gemini", baseUrl: base.baseUrl, apiKey: "private-test-key" })).toEqual([{ id: "test-model", name: "Test" }]);
    await expect(userAiService.save(userA, { name: "Test", provider: "gemini", baseUrl: base.baseUrl, apiKey: "private-test-key", model: "unlisted" })).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.userAiConnection.create).not.toHaveBeenCalled();
  });
  it("keeps concurrent user models, credentials and cache namespaces separate", async () => {
    mocks.user.findUnique.mockImplementation(async ({ where }) => {
      const userId = where.id;
      return { id: userId, aiPreference: { connection: { ...base, id: userId, userId, model: userId === userA ? "model-A" : "model-B", encryptedKey: encryptAiKey(`key-${userId}`, userId) } } };
    });
    const seen = await Promise.all([userA, userB].map((userId) => withUserAi(userId, async () => {
      await new Promise((resolve) => setTimeout(resolve, userId === userA ? 5 : 1));
      return { model: aiModel(), key: personalAiRuntime()!.apiKey, cache: aiCacheNamespace() };
    })));
    expect(seen[0]).toMatchObject({ model: "model-A", key: `key-${userA}` });
    expect(seen[1]).toMatchObject({ model: "model-B", key: `key-${userB}` });
    expect(seen[0]?.cache).not.toBe(seen[1]?.cache);
    expect(personalAiRuntime()).toBeNull();
  });
  it("rejects a corrupt preference pointing at another user", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: userB, aiPreference: { connection: base } });
    await withUserAi(userB, async () => expect(personalAiRuntime()).toBeNull());
  });
});
