import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptAiKey, decryptAiKey } from "../user-ai.crypto.js";
import { invalidatePlatformAi, platformAiRuntime, platformKeyScope, refreshPlatformAi } from "../platform-ai.runtime.js";
import { aiCacheNamespace, aiModel, resolveAiConnection, withUserAi } from "../user-ai.runtime.js";
import { platformAiService } from "../platform-ai.service.js";
import { routeLlmModel } from "../../llm/llm.run.js";
import { env } from "../../../config/env.js";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  platformAiConnection: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  request: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ ...mocks, $transaction: async (operation: (db: typeof mocks) => unknown) => operation(mocks) }) }));
vi.mock("../provider-http.js", async (original) => ({ ...await original<typeof import("../provider-http.js")>(), providerJson: mocks.request }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));

const adminId = "00000000-0000-4000-8000-0000000000a1";
const connectionId = "00000000-0000-4000-8000-0000000000c1";
const row = (overrides: Record<string, unknown> = {}) => ({ id: connectionId, name: "Paid Gemini", provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com", fastModel: "fast-model", deepModel: "deep-model", encryptedKey: encryptAiKey("platform-secret", platformKeyScope(connectionId)), isActive: true, createdById: adminId, createdAt: new Date(), updatedAt: new Date("2026-10-21T00:00:00Z"), ...overrides });
const models = { models: ["fast-model", "deep-model"].map((id) => ({ name: `models/${id}`, displayName: id, supportedGenerationMethods: ["generateContent"] })) };

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePlatformAi();
  mocks.user.findUnique.mockResolvedValue({ id: adminId, aiPreference: null });
  mocks.platformAiConnection.findFirst.mockResolvedValue(null);
  mocks.platformAiConnection.count.mockResolvedValue(0);
  mocks.request.mockResolvedValue(models);
});

describe("platform AI routing", () => {
  it("uses the env defaults while no platform connection is active", async () => {
    await refreshPlatformAi();
    expect(platformAiRuntime()).toBeNull();
    expect(aiModel("deep")).toBe(env.GEMINI_MODEL_DEEP);
    expect(routeLlmModel("summary")).toBe(env.GEMINI_MODEL_FAST);
    expect(resolveAiConnection("any")).toBeNull();
    expect(aiCacheNamespace()).toBe("platform");
  });

  it("routes every tier to the active platform connection and scopes the cache to its version", async () => {
    mocks.platformAiConnection.findFirst.mockResolvedValue(row());
    await refreshPlatformAi();
    expect(aiModel("fast")).toBe("fast-model");
    expect(aiModel("deep")).toBe("deep-model");
    expect(routeLlmModel("gap")).toBe("deep-model");
    expect(routeLlmModel("summary")).toBe("fast-model");
    const connection = resolveAiConnection("deep-model");
    expect(connection).toMatchObject({ provider: "gemini", model: "deep-model", baseUrl: "https://generativelanguage.googleapis.com" });
    expect(connection!.apiKey).toBe("platform-secret");
    expect(aiCacheNamespace()).toBe(`platform:${connectionId}:2026-10-21T00:00:00.000Z`);
  });

  it("lets a user's personal connection win over the platform connection", async () => {
    mocks.platformAiConnection.findFirst.mockResolvedValue(row());
    const personal = { id: "00000000-0000-4000-8000-0000000000p1", userId: adminId, provider: "openai-compatible", baseUrl: "https://gateway.example/v1", model: "personal-model", encryptedKey: null, updatedAt: new Date() };
    mocks.user.findUnique.mockResolvedValue({ id: adminId, aiPreference: { connection: personal } });
    await withUserAi(adminId, () => {
      expect(aiModel("deep")).toBe("personal-model");
      expect(resolveAiConnection("deep-model")).toMatchObject({ model: "personal-model", baseUrl: "https://gateway.example/v1" });
    });
  });

  it("re-reads the database only after the TTL, and keeps the last value when the read fails", async () => {
    mocks.platformAiConnection.findFirst.mockResolvedValue(row());
    await refreshPlatformAi();
    await refreshPlatformAi();
    expect(mocks.platformAiConnection.findFirst).toHaveBeenCalledTimes(1);
    mocks.platformAiConnection.findFirst.mockRejectedValue(new Error("db down"));
    await refreshPlatformAi(true);
    expect(platformAiRuntime()?.deepModel).toBe("deep-model");
  });
});

describe("platform AI administration", () => {
  it("binds the saved key to the connection, never returns it, and checks both models", async () => {
    mocks.platformAiConnection.create.mockImplementation(async ({ data }) => ({ ...row(), ...data, isActive: false }));
    const saved = await platformAiService.save(adminId, { name: "Paid Gemini", provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com", apiKey: "platform-secret", fastModel: "fast-model", deepModel: "deep-model" });
    const data = mocks.platformAiConnection.create.mock.calls[0]![0].data;
    expect(decryptAiKey(data.encryptedKey, platformKeyScope(data.id))).toBe("platform-secret");
    expect(() => decryptAiKey(data.encryptedKey, data.id)).toThrow("cannot be read");
    expect(saved).toMatchObject({ hasApiKey: true, fastModel: "fast-model", deepModel: "deep-model" });
    expect(JSON.stringify(saved)).not.toContain(data.encryptedKey);
    expect(mocks.audit).toHaveBeenCalledWith("platform_ai.connection.saved", expect.objectContaining({ userId: adminId }));
    await expect(platformAiService.save(adminId, { name: "x", provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com", apiKey: "k", fastModel: "fast-model", deepModel: "missing-model" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("does not reuse a saved key for a different endpoint", async () => {
    mocks.platformAiConnection.findUnique.mockResolvedValue(row());
    await expect(platformAiService.models({ connectionId, provider: "gemini", baseUrl: "https://other.example.com" })).rejects.toMatchObject({ statusCode: 400 });
    await platformAiService.models({ connectionId, provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com" });
    expect(mocks.request).toHaveBeenCalledWith(expect.any(String), "platform-secret", "gemini");
  });

  it("activates one connection at a time, or none for the server defaults", async () => {
    mocks.platformAiConnection.findUnique.mockResolvedValue(row({ isActive: false }));
    await platformAiService.activate(adminId, connectionId);
    expect(mocks.platformAiConnection.updateMany).toHaveBeenCalledWith({ where: { isActive: true }, data: { isActive: false } });
    expect(mocks.platformAiConnection.update).toHaveBeenCalledWith({ where: { id: connectionId }, data: { isActive: true } });
    vi.clearAllMocks();
    await platformAiService.activate(adminId, null);
    expect(mocks.platformAiConnection.updateMany).toHaveBeenCalledOnce();
    expect(mocks.platformAiConnection.update).not.toHaveBeenCalled();
  });

  it("lists connections with the env defaults for comparison", async () => {
    mocks.platformAiConnection.findMany.mockResolvedValue([row()]);
    const settings = await platformAiService.list();
    expect(settings.activeConnectionId).toBe(connectionId);
    expect(settings.environmentDefaults.provider).toBe("gemini");
    expect(JSON.stringify(settings)).not.toContain("encryptedKey");
  });
});
