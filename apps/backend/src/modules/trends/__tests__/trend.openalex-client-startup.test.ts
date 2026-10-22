import { beforeEach, describe, expect, it, vi } from "vitest";

/** P0.1: the trend OpenAlex client warns at load time when production has no API key. */
const state = vi.hoisted(() => ({ env: { NODE_ENV: "production", OPENALEX_API_KEY: undefined as string | undefined } }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }));

vi.mock("../../../config/env.js", () => ({ env: state.env }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger }));
vi.mock("../../../infrastructure/cache.js", () => ({ cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() }, hashKey: JSON.stringify }));

const MISSING_KEY = /OPENALEX_API_KEY is not set/;
const warnedAboutKey = () => logger.warn.mock.calls.some((call) => call.some((arg) => typeof arg === "string" && MISSING_KEY.test(arg)));

beforeEach(() => {
  vi.resetModules();
  logger.warn.mockClear();
});

describe("OpenAlex API key warning at start (P0.1)", () => {
  it("warns in production without OPENALEX_API_KEY", async () => {
    Object.assign(state.env, { NODE_ENV: "production", OPENALEX_API_KEY: undefined });
    await import("../trend.openalex-client.js");
    expect(warnedAboutKey()).toBe(true);
  });

  it("does not warn in production with a key", async () => {
    Object.assign(state.env, { NODE_ENV: "production", OPENALEX_API_KEY: "a-key" });
    await import("../trend.openalex-client.js");
    expect(warnedAboutKey()).toBe(false);
  });

  it("does not warn outside production", async () => {
    Object.assign(state.env, { NODE_ENV: "development", OPENALEX_API_KEY: undefined });
    await import("../trend.openalex-client.js");
    expect(warnedAboutKey()).toBe(false);
  });

  it("sends the key as a Bearer header, never in the URL", async () => {
    Object.assign(state.env, { NODE_ENV: "production", OPENALEX_API_KEY: "secret-key" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ group_by: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const client = await import("../trend.openalex-client.js");
      await client.openAlexGroupBy("type:article", "publication_year");
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(String(url)).not.toContain("secret-key");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
