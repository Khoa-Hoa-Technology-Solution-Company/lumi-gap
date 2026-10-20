import { beforeEach, describe, expect, it, vi } from "vitest";

import { cache } from "../../../infrastructure/cache.js";
import { fetchOpenAlexGroupCounts } from "../../api-sync/providers/openalex.client.js";
import { buildIntersectionFilter, countOpenAlexIntersection, openAlexSearchValue } from "../gap-global-evidence.js";

const settings = vi.hoisted(() => ({ enabled: true, timeoutMs: 1000 }));

vi.mock("../../../config/env.js", () => ({
  env: { get GAP_GLOBAL_EVIDENCE_ENABLED() { return settings.enabled; }, get GAP_GLOBAL_EVIDENCE_TIMEOUT_MS() { return settings.timeoutMs; } },
}));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../../infrastructure/cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../infrastructure/cache.js")>()),
  cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));
// The real client would call api.openalex.org.
vi.mock("../../api-sync/providers/openalex.client.js", () => ({ fetchOpenAlexGroupCounts: vi.fn() }));

const totals = (filter?: string) => (filter?.includes("alpha") && filter.includes("beta") ? 7 : filter?.includes("alpha") ? 1000 : filter?.includes("beta") ? 2000 : 5_000_000);

beforeEach(() => {
  settings.enabled = true;
  settings.timeoutMs = 1000;
  vi.mocked(cache.get).mockReset().mockResolvedValue(null);
  vi.mocked(cache.set).mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchOpenAlexGroupCounts).mockReset().mockImplementation(async ({ filterExpression }) => ({ total: totals(filterExpression), groups: [] }));
});

describe("openAlexSearchValue", () => {
  it("removes characters that would break the filter and collapses spaces", () => {
    expect(openAlexSearchValue('  "deep, learning" | NLP: ! ')).toBe("deep learning NLP");
  });

  it("returns null when nothing is left", () => {
    expect(openAlexSearchValue(' , | : ! "')).toBeNull();
  });
});

describe("buildIntersectionFilter", () => {
  it("searches every topic in title and abstract and closes the year window", () => {
    expect(buildIntersectionFilter(["alpha", "beta"], { yearFrom: 2020, yearTo: 2024 })).toBe(
      "title_and_abstract.search:alpha,title_and_abstract.search:beta,publication_year:2020-2024",
    );
  });

  it("uses exclusive comparisons for a single year bound", () => {
    expect(buildIntersectionFilter(["alpha"], { yearFrom: 2020 })).toBe("title_and_abstract.search:alpha,publication_year:>2019");
    expect(buildIntersectionFilter(["alpha"], { yearTo: 2024 })).toBe("title_and_abstract.search:alpha,publication_year:<2025");
  });

  it("omits the year filter without a window", () => {
    expect(buildIntersectionFilter(["alpha"], {})).toBe("title_and_abstract.search:alpha");
  });
});

describe("countOpenAlexIntersection", () => {
  it("counts the intersection, both parents and all works in the window, then caches the result", async () => {
    const result = await countOpenAlexIntersection("alpha", "beta", { yearFrom: 2020, yearTo: 2024 });

    expect(result).toMatchObject({ source: "openalex", intersectionCount: 7, parentCounts: { a: 1000, b: 2000 }, scopeSize: 5_000_000, yearFrom: 2020, yearTo: 2024 });
    const filters = vi.mocked(fetchOpenAlexGroupCounts).mock.calls.map(([params]) => params.filterExpression);
    expect(filters).toHaveLength(4);
    expect(filters).toContain("publication_year:2020-2024");
    expect(filters).toContain("title_and_abstract.search:alpha,title_and_abstract.search:beta,publication_year:2020-2024");
    expect(filters).toContain("title_and_abstract.search:alpha,publication_year:2020-2024");
    expect(filters).toContain("title_and_abstract.search:beta,publication_year:2020-2024");
    expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^gap:openalex:v2:/), result, expect.any(Number));
  });

  it("counts every work when no year window is chosen", async () => {
    const result = await countOpenAlexIntersection("alpha", "beta", {});

    expect(result?.scopeSize).toBe(5_000_000);
    expect(vi.mocked(fetchOpenAlexGroupCounts).mock.calls.map(([params]) => params.filterExpression)).toContain("");
  });

  it("returns a cached result without calling OpenAlex", async () => {
    const cached = { source: "openalex", intersectionCount: 1, parentCounts: { a: 2, b: 3 }, fetchedAt: "2026-10-16T00:00:00.000Z" };
    vi.mocked(cache.get).mockResolvedValue(cached);

    expect(await countOpenAlexIntersection("alpha", "beta", {})).toEqual(cached);
    expect(fetchOpenAlexGroupCounts).not.toHaveBeenCalled();
  });

  it("gives the same cache key to phrases that differ only in case", async () => {
    await countOpenAlexIntersection("Alpha", "Beta", {});
    await countOpenAlexIntersection("alpha", "beta", {});

    const keys = vi.mocked(cache.get).mock.calls.map(([key]) => key);
    expect(keys[0]).toBe(keys[1]);
  });

  it("returns null instead of throwing when OpenAlex fails, and does not cache it", async () => {
    vi.mocked(fetchOpenAlexGroupCounts).mockRejectedValue(new Error("OpenAlex 429"));

    await expect(countOpenAlexIntersection("alpha", "beta", {})).resolves.toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("returns null when OpenAlex does not answer in time", async () => {
    settings.timeoutMs = 20;
    vi.mocked(fetchOpenAlexGroupCounts).mockImplementation(() => new Promise(() => undefined));

    await expect(countOpenAlexIntersection("alpha", "beta", {})).resolves.toBeNull();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", async () => {
    settings.enabled = false;

    await expect(countOpenAlexIntersection("alpha", "beta", {})).resolves.toBeNull();
    expect(fetchOpenAlexGroupCounts).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
  });

  it("returns null for a phrase with nothing searchable", async () => {
    await expect(countOpenAlexIntersection(" , | ", "beta", {})).resolves.toBeNull();
    expect(fetchOpenAlexGroupCounts).not.toHaveBeenCalled();
  });
});
