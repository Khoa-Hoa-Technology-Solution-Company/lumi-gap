import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("../../../infrastructure/cache.js", () => ({ cache: store, hashKey: (value: unknown) => JSON.stringify(value) }));

import { openAlexGet, resetOpenAlexBudget, withOpenAlexRefresh } from "../trend.openalex-client.js";

const fresh = { results: ["fresh"] };

describe("withOpenAlexRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOpenAlexBudget();
    store.get.mockResolvedValue({ results: ["cached"] });
    store.set.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fresh), { status: 200, headers: { "content-type": "application/json" } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers from the cache outside a refresh", async () => {
    expect(await openAlexGet("topics", { search: "nlp" })).toEqual({ results: ["cached"] });
    expect(fetch).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("skips the cache read inside a refresh and rewrites the entry", async () => {
    const result = await withOpenAlexRefresh(() => openAlexGet("topics", { search: "nlp" }));

    expect(result).toEqual(fresh);
    expect(store.get).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith(expect.stringContaining("trends:openalex:"), fresh, 7 * 24 * 3600);
  });

  it("only affects calls made inside it", async () => {
    await withOpenAlexRefresh(() => openAlexGet("topics", { search: "nlp" }));
    vi.clearAllMocks();
    store.get.mockResolvedValue({ results: ["cached"] });

    expect(await openAlexGet("topics", { search: "nlp" })).toEqual({ results: ["cached"] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
