import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  env: { GEMINI_API_KEY: "env-gemini", OPENALEX_API_KEY: "env-openalex" as string | undefined },
}));
vi.mock("../../../config/env.js", () => ({ env: mocks.env }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ platformApiKey: { findMany: mocks.findMany, updateMany: mocks.updateMany } }) }));
// The stored value is the secret itself in these tests.
vi.mock("../../user-ai/user-ai.crypto.js", () => ({ decryptAiKey: (value: string) => value }));

import { currentApiKey, hasApiKey, refreshApiKeys, resetApiKeyPoolForTests, withApiKey } from "../api-key-pool.js";
import { classifyGeminiKeyError, classifyOpenAlexKeyResponse } from "../api-key-errors.js";
import { openAlexFetch } from "../openalex-key-fetch.js";

const row = (id: string, provider: "GEMINI" | "OPENALEX", priority: number, extra: Partial<{ cooldownUntil: Date | null; invalidAt: Date | null }> = {}) => ({
  id, provider, priority, encryptedKey: `secret-${id}`, cooldownUntil: null, invalidAt: null, ...extra,
});
const geminiError = (status: number, message: string) => Object.assign(new Error(message), { status });
const keyRejected = (error: unknown) => classifyGeminiKeyError(error);

beforeEach(() => {
  resetApiKeyPoolForTests();
  mocks.findMany.mockReset();
  mocks.updateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.env.GEMINI_API_KEY = "env-gemini";
  mocks.env.OPENALEX_API_KEY = "env-openalex";
});
afterEach(() => vi.unstubAllGlobals());

describe("key selection", () => {
  it("uses enabled pool keys in priority order, skipping invalid and cooling-down keys, then the env key", async () => {
    mocks.findMany.mockResolvedValue([
      row("a", "GEMINI", 1, { invalidAt: new Date() }),
      row("b", "GEMINI", 2, { cooldownUntil: new Date(Date.now() + 60_000) }),
      row("c", "GEMINI", 3),
    ]);
    await refreshApiKeys(true);
    expect(currentApiKey("GEMINI")).toMatchObject({ id: "c", secret: "secret-c" });
  });

  it("falls back to the env key when the pool is empty or unreadable", async () => {
    mocks.findMany.mockRejectedValue(new Error("db down"));
    await refreshApiKeys(true);
    expect(currentApiKey("GEMINI")).toEqual({ id: null, secret: "env-gemini" });
  });

  it("reports a key as available from either the pool or the env", async () => {
    mocks.env.OPENALEX_API_KEY = undefined;
    mocks.findMany.mockResolvedValue([]);
    expect(await hasApiKey("OPENALEX")).toBe(false);
    resetApiKeyPoolForTests();
    mocks.findMany.mockResolvedValue([row("o", "OPENALEX", 1)]);
    expect(await hasApiKey("OPENALEX")).toBe(true);
  });
});

describe("withApiKey failover", () => {
  it("moves to the next key when Gemini denies the key, and records the cooldown for every process", async () => {
    mocks.findMany.mockResolvedValue([row("a", "GEMINI", 1), row("b", "GEMINI", 2)]);
    const call = vi.fn(async (key: { secret: string }) => {
      if (key.secret === "secret-a") throw geminiError(403, '{"error":{"code":403,"message":"Access requires an eligible paid billing account in a supported region","status":"PERMISSION_DENIED"}}');
      return "ok";
    });
    await expect(withApiKey("GEMINI", call, keyRejected)).resolves.toBe("ok");
    expect(call.mock.calls.map(([key]) => key.secret)).toEqual(["secret-a", "secret-b"]);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a" }, data: expect.objectContaining({ cooldownUntil: expect.any(Date), failureCount: { increment: 1 } }) }));
    // Later calls start from the healthy key.
    call.mockClear();
    await withApiKey("GEMINI", call, keyRejected);
    expect(call.mock.calls.map(([key]) => key.secret)).toEqual(["secret-b"]);
  });

  it("marks an invalid key and ends with the env key when every pool key is rejected", async () => {
    mocks.findMany.mockResolvedValue([row("a", "GEMINI", 1)]);
    const call = vi.fn(async (key: { secret: string }) => {
      if (key.secret === "secret-a") throw geminiError(400, "API key not valid. Please pass a valid API key. [API_KEY_INVALID]");
      return key.secret;
    });
    await expect(withApiKey("GEMINI", call, keyRejected)).resolves.toBe("env-gemini");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ invalidAt: expect.any(Date) }) }));
  });

  it("throws the last rejection once no key is left", async () => {
    mocks.env.GEMINI_API_KEY = "mock-gemini-key";
    mocks.findMany.mockResolvedValue([row("a", "GEMINI", 1), row("b", "GEMINI", 2)]);
    const quota = geminiError(429, '{"error":{"message":"You exceeded your current quota","details":[{"violations":[{"quotaId":"EmbedContentRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}');
    const call = vi.fn().mockRejectedValue(quota);
    await expect(withApiKey("GEMINI", call, keyRejected)).rejects.toBe(quota);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not rotate on errors that are not about the key", async () => {
    mocks.findMany.mockResolvedValue([row("a", "GEMINI", 1), row("b", "GEMINI", 2)]);
    const perMinute = geminiError(429, '{"error":{"message":"Quota exceeded","details":[{"violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel"}]}]}}');
    for (const error of [perMinute, geminiError(503, "overloaded"), new Error("network")]) {
      const call = vi.fn().mockRejectedValue(error);
      await expect(withApiKey("GEMINI", call, keyRejected)).rejects.toBe(error);
      expect(call).toHaveBeenCalledTimes(1);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});

describe("OpenAlex", () => {
  it("classifies key rejections and daily budget, but not a too-fast 429", () => {
    expect(classifyOpenAlexKeyResponse(401, "Invalid api_key")?.kind).toBe("INVALID");
    expect(classifyOpenAlexKeyResponse(429, "You have used your daily credits")?.kind).toBe("COOLDOWN");
    expect(classifyOpenAlexKeyResponse(429, "Too many requests per second")).toBeNull();
    expect(classifyOpenAlexKeyResponse(500, "error")).toBeNull();
  });

  it("repeats the request with the next key when OpenAlex rejects the api_key", async () => {
    mocks.findMany.mockResolvedValue([row("a", "OPENALEX", 1), row("b", "OPENALEX", 2)]);
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      const key = url.searchParams.get("api_key")!;
      seen.push(key);
      return key === "secret-a" ? new Response("Invalid api_key", { status: 401 }) : new Response("{}", { status: 200 });
    }));
    const response = await openAlexFetch("https://api.openalex.org/works?per_page=1&api_key=stale");
    expect(response.status).toBe(200);
    expect(seen).toEqual(["secret-a", "secret-b"]);
  });

  it("returns the provider response unchanged when no other key is left", async () => {
    mocks.env.OPENALEX_API_KEY = undefined;
    mocks.findMany.mockResolvedValue([row("a", "OPENALEX", 1)]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Invalid api_key", { status: 401 })));
    expect((await openAlexFetch("https://api.openalex.org/works")).status).toBe(401);
  });
});
