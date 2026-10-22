import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import recorded from "./fixtures/openalex-recorded-2026-10-21.json";

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../../../infrastructure/cache.js", () => ({
  cache: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => void store.set(key, value)),
    del: vi.fn(),
  },
  hashKey: (value: unknown) => JSON.stringify(value),
}));

type Client = typeof import("../trend.openalex-client.js");
const GROUP_BY_BODY = { meta: { count: 1 }, group_by: [{ key: "2024", key_display_name: "2024", count: 1 }] };

function response(status: number, headers: Record<string, string>, body: unknown = GROUP_BY_BODY) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** Headers recorded from a real keyless group_by call (G0), with Remaining overridden. */
function keyless(remaining: number, extra: Record<string, string> = {}) {
  return { ...recorded.keylessGroupByHeaders, "X-RateLimit-Remaining": String(remaining), ...extra };
}

let client: Client;
const fetchMock = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  store.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  client = await import("../trend.openalex-client.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAlex trend budget", () => {
  it("keeps using OpenAlex after a keyless request (Limit 1000, Remaining 999)", async () => {
    expect(recorded.keylessGroupByHeaders["X-RateLimit-Limit"]).toBe("1000");
    fetchMock.mockResolvedValueOnce(response(200, keyless(999)));
    await client.openAlexGroupBy("type:article", "publication_year");
    expect(client.isOpenAlexBudgetAvailable()).toBe(true);
  });

  it("stops when less than the reserve fraction of the daily limit is left", async () => {
    expect(client.BUDGET_RESERVE_FRACTION).toBe(0.2);
    fetchMock.mockResolvedValueOnce(response(200, keyless(199)));
    await client.openAlexGroupBy("type:article", "publication_year");
    expect(client.isOpenAlexBudgetAvailable()).toBe(false);
  });

  it("uses the limit of the key, not a fixed number of credits (free key: 10 000)", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { "X-RateLimit-Limit": "10000", "X-RateLimit-Remaining": "2001", "X-RateLimit-Reset": "60" }));
    await client.openAlexGroupBy("type:article", "publication_year");
    expect(client.isOpenAlexBudgetAvailable()).toBe(true);
    fetchMock.mockResolvedValueOnce(response(200, { "X-RateLimit-Limit": "10000", "X-RateLimit-Remaining": "1999", "X-RateLimit-Reset": "60" }));
    await client.openAlexGroupBy("type:review", "publication_year");
    expect(client.isOpenAlexBudgetAvailable()).toBe(false);
  });

  it("ignores responses without rate-limit headers", async () => {
    fetchMock.mockResolvedValueOnce(response(200, {}));
    await client.openAlexGroupBy("type:article", "publication_year");
    expect(client.isOpenAlexBudgetAvailable()).toBe(true);
  });
});

describe("OpenAlex 429 handling", () => {
  it("does not retry a 429 when the daily budget is spent, and locks until reset", async () => {
    fetchMock.mockResolvedValueOnce(response(429, keyless(0), { error: "Rate limit exceeded" }));
    await expect(client.openAlexGroupBy("type:article", "publication_year")).rejects.toBeInstanceOf(client.OpenAlexBudgetError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.isOpenAlexBudgetAvailable()).toBe(false);
  });

  it("retries a per-second 429 while budget is left", async () => {
    fetchMock
      .mockResolvedValueOnce(response(429, keyless(900, { "Retry-After": "0" }), { error: "Too many requests" }))
      .mockResolvedValueOnce(response(200, keyless(899)));
    const page = await client.openAlexGroupBy("type:article", "publication_year");
    expect(page.groups).toEqual([{ key: "2024", name: "2024", count: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.isOpenAlexBudgetAvailable()).toBe(true);
  });

  it("does not retry other 4xx answers and keeps the 'OpenAlex <status>' message", async () => {
    fetchMock.mockResolvedValueOnce(response(404, keyless(900), { error: "not found" }));
    await expect(client.openAlexGet("topics/T999999", {})).rejects.toThrow("OpenAlex 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("OpenAlex request URL", () => {
  it("sends no mailto parameter and no key in the URL", async () => {
    fetchMock.mockResolvedValueOnce(response(200, keyless(999)));
    await client.openAlexGroupBy("type:article", "publication_year");
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.has("mailto")).toBe(false);
    expect(url.searchParams.has("api_key")).toBe(false);
  });
});

describe("OpenAlex data provenance (P0.6)", () => {
  it("sends corpus=core on works queries only", async () => {
    fetchMock.mockImplementation(async () => response(200, keyless(999)));
    await client.openAlexGroupBy("type:article", "publication_year");
    await client.openAlexGet("topics/T10028", { select: "id" });
    const works = new URL(String(fetchMock.mock.calls[0]![0]));
    const topic = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(works.searchParams.get("corpus")).toBe("core");
    expect(topic.searchParams.has("corpus")).toBe(false);
    expect(client.OPENALEX_CORPUS).toBe("core");
    expect(client.OPENALEX_CACHE_VERSION).toBe("v3");
  });

  it("a cached answer reports the time it was fetched, not the time it was read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-21T08:00:00.000Z"));
      fetchMock.mockResolvedValueOnce(response(200, keyless(999)));
      const first = await client.withOpenAlexProvenance(() => client.openAlexGroupBy("type:article", "publication_year"));
      expect(first.fetchedAt).toBe("2026-10-21T08:00:00.000Z");

      vi.setSystemTime(new Date("2026-10-23T09:30:00.000Z"));
      const second = await client.withOpenAlexProvenance(() => client.openAlexGroupBy("type:article", "publication_year"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(second.fetchedAt).toBe("2026-10-21T08:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports the oldest fetch time of all answers used, and null when none was used", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-20T00:00:00.000Z"));
      fetchMock.mockResolvedValueOnce(response(200, keyless(999)));
      await client.openAlexGroupBy("type:article", "publication_year");
      vi.setSystemTime(new Date("2026-10-21T00:00:00.000Z"));
      fetchMock.mockResolvedValueOnce(response(200, keyless(998)));
      const both = await client.withOpenAlexProvenance(async () => {
        await client.openAlexGroupBy("type:review", "publication_year");
        return client.openAlexGroupBy("type:article", "publication_year");
      });
      expect(both.fetchedAt).toBe("2026-10-20T00:00:00.000Z");
      const none = await client.withOpenAlexProvenance(async () => 1);
      expect(none).toEqual({ result: 1, fetchedAt: null });
    } finally {
      vi.useRealTimers();
    }
  });
});
