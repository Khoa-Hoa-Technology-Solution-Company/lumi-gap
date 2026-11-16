import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  openAlexYearCounts: vi.fn(),
  openAlexGroupBy: vi.fn(),
  openAlexGet: vi.fn(),
}));

vi.mock("../trend.openalex-client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../trend.openalex-client.js")>()),
  ...client,
}));

const evidence = vi.hoisted(() => ({ openAlexKeywordCounts: vi.fn() }));
vi.mock("../trend.evidence.js", () => evidence);

const prisma = vi.hoisted(() => ({ paperTopic: { findMany: vi.fn(async () => []) } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import { getOpenAlexTrendsOverview } from "../trend.openalex-overview.js";
import { IT_SCOPE_VERSION, itScopeWorkClauses } from "../trend.scope.js";
import { TrendsOverviewQuerySchema } from "../dto/trends.schema.js";

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021];
const each = (value: number) => new Map(YEARS.map((year) => [year, value]));
const TYPES = "type:article|review|preprint|conference-paper|book-chapter";
/** The scope is queried in two OR chunks of subfields; the fixtures put every paper in the first one. */
const [CHUNK_A, CHUNK_B] = itScopeWorkClauses() as [string, string];

function query(raw: Record<string, string> = {}) {
  return TrendsOverviewQuerySchema.parse({ yearFrom: "2016", yearTo: "2021", ...raw });
}

/** Fixed span of the per-topic and scope yearly series (window-independent, so cached across windows). */
const SPAN = `publication_year:1900-${new Date().getUTCFullYear()}`;

function yearCounts(filter: string): Map<number, number> {
  if (filter.includes(CHUNK_B)) return new Map();
  const topic = filter.endsWith(SPAN) ? /primary_topic\.id:(T\d+),/.exec(filter)?.[1] : undefined;
  if (topic) return new Map(YEARS.map((year) => [year, topicYearCount(topic, year)]));
  if (filter.includes("keywords.id:large-language-models")) return new Map([[2018, 5], [2019, 40], [2020, 100], [2021, 160]]);
  if (filter.includes("is_in_top_10_percent")) return each(5);
  if (filter.includes("cited_by_count:0-9")) return new Map([[2016, 100]]);
  if (filter.includes("cited_by_count:>999")) return new Map([[2020, 1]]);
  if (filter.includes("cited_by_count")) return new Map();
  return each(1000);
}

/** Topic papers of one year: T1 rises 10→60, T2 alternates 48/52, T3 has 2 papers in all, T4 has none. */
function topicYearCount(id: string, year: number): number {
  const i = YEARS.indexOf(year);
  if (id === "T1") return 10 + i * 10;
  if (id === "T2") return i % 2 === 0 ? 48 : 52;
  if (id === "T3") return i === 0 ? 2 : 0;
  return 0;
}

const GROUPS: Record<string, Array<{ key: string; name: string; count: number }>> = {
  type: [{ key: "article", name: "article", count: 5000 }],
  "open_access.oa_status": [{ key: "gold", name: "gold", count: 3000 }],
  language: [{ key: "en", name: "English", count: 5500 }],
  "primary_location.source.id": [{ key: "S4306400194", name: "arXiv (Cornell University)", count: 900 }],
  "primary_topic.domain.id": [{ key: "3", name: "Physical Sciences", count: 5000 }],
  "primary_topic.field.id": [{ key: "17", name: "Computer Science", count: 5000 }],
  "primary_topic.subfield.id": [{ key: "1702", name: "Artificial Intelligence", count: 4000 }],
  "primary_topic.id": [
    { key: "T1", name: "Rising topic", count: 210 },
    { key: "T2", name: "Flat topic", count: 300 },
    { key: "T3", name: "Tiny topic", count: 2 },
  ],
};

const NAMES: Record<string, string> = { T1: "Rising topic", T2: "Flat topic", T3: "Tiny topic", T4: "Empty topic" };

const entity = (id: string) => ({
  id: `https://openalex.org/${id}`,
  display_name: NAMES[id],
  domain: { id: "https://openalex.org/domains/3", display_name: "Physical Sciences" },
  field: { id: "https://openalex.org/fields/17", display_name: "Computer Science" },
  subfield: { id: "https://openalex.org/subfields/1702", display_name: "Artificial Intelligence" },
});

function allFilters(): string[] {
  return [
    ...client.openAlexYearCounts.mock.calls.map((call) => String(call[0])),
    ...client.openAlexGroupBy.mock.calls.map((call) => String(call[0])),
    ...evidence.openAlexKeywordCounts.mock.calls.map((call) => String(call[0])),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  client.openAlexYearCounts.mockImplementation(async (filter: string) => yearCounts(filter));
  client.openAlexGroupBy.mockImplementation(async (filter: string, key: string) => ({ groups: filter.includes(CHUNK_B) ? [] : GROUPS[key] ?? [], nextCursor: null }));
  // The topics of the scope: all four belong to the first subfield chunk.
  client.openAlexGet.mockImplementation(async (_path: string, params: Record<string, string>) => ({
    results: params.filter!.includes("1702") ? ["T1", "T2", "T3", "T4"].map(entity) : [],
  }));
  evidence.openAlexKeywordCounts.mockResolvedValue([
    { key: "large-language-models", term: "large language models", papersA: 10, papersB: 300 },
    { key: "support-vector-machines", term: "support vector machines", papersA: 200, papersB: 50 },
  ]);
});

describe("getOpenAlexTrendsOverview", () => {
  it("tests every topic of the IT scope against the yearly total of the scope", async () => {
    const overview = await getOpenAlexTrendsOverview(query());

    expect(overview.dataSource).toBe("openalex");
    expect(overview.scopeVersion).toBe(IT_SCOPE_VERSION);
    expect(overview.lastCompleteYear).toBe(2021);
    expect(overview.candidateStrata).toBeNull();
    // The topic list comes from /topics, one request per subfield chunk, not from a size-ordered group_by page.
    expect(client.openAlexGet).toHaveBeenCalledTimes(2);
    expect(client.openAlexGet).toHaveBeenCalledWith("topics", expect.objectContaining({ filter: expect.stringMatching(/^subfield\.id:1702\|/) }));
    // One yearly series per topic of the scope, the small and empty ones included, over the fixed span.
    for (const id of ["T1", "T2", "T3", "T4"]) {
      expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${TYPES},primary_topic.id:${id},${SPAN}`);
    }
    // Population: the scope itself, one series per subfield chunk.
    expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${TYPES},${CHUNK_A},${SPAN}`);
    expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${TYPES},${CHUNK_B},${SPAN}`);
    expect(allFilters().some((filter) => filter.includes("primary_topic.field.id:17") && filter.endsWith(SPAN))).toBe(false);

    // T3 has 2 papers (below minPapers 3) and T4 none: neither is listed.
    expect(overview.topics.map((topic) => topic.topic)).toEqual(["Rising topic", "Flat topic"]);
    expect(overview.testedTopicCount).toBe(2);
    expect(overview.uniqueTopicsInScope).toBe(2);
    const [rising, flat] = overview.topics;
    expect(rising!.taxonomy).toEqual({
      openalexTopicId: "T1",
      domainId: "3",
      domainName: "Physical Sciences",
      fieldId: "17",
      fieldName: "Computer Science",
      subfieldId: "1702",
      subfieldName: "Artificial Intelligence",
    });
    expect(rising!.totalPapers).toBe(10 + 20 + 30 + 40 + 50 + 60);
    expect(rising!.yearlyBreakdown).toHaveLength(6);
    // Share 1%..6% of the scope: S = 15 over 6 years. The flat topic alternates 4.8%/5.2%.
    expect(rising!.classification).toMatchObject({ verdict: "rising", confidence: "medium", yearsUsed: 6, totalPapers: 210, reasons: ["SIGNIFICANT_INCREASE"] });
    expect(rising!.classification.senSlope).toBeCloseTo(1, 10);
    expect(rising!.classification.relativeChangePct).toBeCloseTo((1 / 3.5) * 100, 10);
    expect(rising!.classification.peakRatio).toBeCloseTo(5 / 6, 10);
    expect(flat!.classification.verdict).toBe("stable");
    // BH runs over every tested topic of the scope (T3 too), so q ≥ p.
    expect(rising!.classification.qValue!).toBeGreaterThanOrEqual(rising!.classification.mannKendall!.pValue);
  });

  it("lists small topics when minPapers allows them", async () => {
    const overview = await getOpenAlexTrendsOverview(query({ minPapers: "1" }));
    expect(overview.topics.map((topic) => topic.topic)).toEqual(["Rising topic", "Flat topic", "Tiny topic"]);
    expect(overview.topics[2]!.classification).toMatchObject({ verdict: "insufficient", reasons: ["TOO_FEW_PAPERS"] });
    // A topic without any paper in the window is never listed.
    expect(overview.topics.some((topic) => topic.topic === "Empty topic")).toBe(false);
  });

  it("queries the facets over both chunks of the scope and adds them up", async () => {
    const overview = await getOpenAlexTrendsOverview(query());
    const window = "publication_year:2016-2021";

    for (const chunk of [CHUNK_A, CHUNK_B]) {
      expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${TYPES},${chunk},${window}`);
      expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${TYPES},${chunk},${window},citation_normalized_percentile.is_in_top_10_percent:true`);
      expect(client.openAlexGroupBy).toHaveBeenCalledWith(`${TYPES},${chunk},${window}`, "primary_topic.id");
    }
    expect(overview.totalPapersInWindow).toBe(6000);
    expect(overview.citationTrend[0]).toEqual({ year: 2016, count: 1000, totalCitations: null, avgCitations: null, topCitedCount: 5, ppTop10Pct: 0.5 });
    expect(overview.facets.topSources).toEqual([{ id: "S4306400194", name: "arXiv (Cornell University)", count: 900, openalexId: "S4306400194" }]);
    expect(overview.facets.fields).toEqual([{ id: "Computer Science", name: "Computer Science", count: 5000, openalexId: "17" }]);
    expect(overview.facets.topics[0]).toEqual({ id: "Flat topic", name: "Flat topic", count: 300, openalexId: "T2" });
    expect(overview.facets.languages).toEqual([{ id: "en", name: "English", count: 5500 }]);
    expect(overview.facets.providers).toEqual([]);
    expect(overview.facets.citationBands).toEqual([
      { id: "0-9", name: "0-9", count: 100 },
      { id: "1000+", name: "1000+", count: 1 },
    ]);
    expect(overview.taxonomyCoverage).toMatchObject({ totalPapers: 6000, papersWithPrimaryTopic: 5000, primaryTopicCoveragePct: 83.3 });
    for (const filter of allFilters()) expect(filter).not.toMatch(/^,|,,|,$/);
  });

  it("reports domain and field filters as ignored: they are wider than the scope", async () => {
    const overview = await getOpenAlexTrendsOverview(query({ domainIds: "3", fieldIds: "17" }));

    expect(overview.scopeNotice!.ignoredFilters).toEqual([
      { filter: "domains", values: ["3"], reason: expect.stringContaining("Information Technology scope") },
      { filter: "fields", values: ["17"], reason: expect.stringContaining("Information Technology scope") },
    ]);
    expect(allFilters().some((filter) => filter.includes("primary_topic.domain.id"))).toBe(false);
    expect(overview.testedTopicCount).toBe(2);
    expect((await getOpenAlexTrendsOverview(query())).scopeNotice).toEqual({ ignoredFilters: [] });
  });

  it("a subfield filter narrows the list and the facets, not the population", async () => {
    const original = GROUPS["primary_topic.id"]!;
    GROUPS["primary_topic.id"] = [{ key: "T2", name: "Flat topic", count: 300 }];
    try {
      const overview = await getOpenAlexTrendsOverview(query({ subfieldIds: "1702" }));
      const base = `${TYPES},primary_topic.subfield.id:1702,publication_year:2016-2021`;

      expect(client.openAlexYearCounts).toHaveBeenCalledWith(base);
      expect(client.openAlexGroupBy).toHaveBeenCalledWith(base, "primary_topic.id");
      // Only the topics of the filter are listed...
      expect(overview.topics.map((topic) => topic.topic)).toEqual(["Flat topic"]);
      expect(overview.testedTopicCount).toBe(1);
      // ...but every topic of the scope is still fetched and tested, against the whole scope.
      expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${TYPES},primary_topic.id:T1,${SPAN}`);
      expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${TYPES},${CHUNK_A},${SPAN}`);
      expect(overview.scopeNotice).toEqual({ ignoredFilters: [] });
    } finally {
      GROUPS["primary_topic.id"] = original;
    }
  });

  it("sorts by verdict, slices to limit and recommends only rising topics", async () => {
    const byTrend = await getOpenAlexTrendsOverview(query({ limit: "1" }));
    expect(byTrend.topics.map((topic) => topic.topic)).toEqual(["Rising topic"]);
    // Only one rising topic: nothing to compare.
    expect(byTrend.recommendedComparisons).toEqual([]);
    // Counts cover every listed topic, not only the one returned under limit 1.
    expect(byTrend.testedTopicCount).toBe(2);
    expect(byTrend.verdictCounts).toEqual({ rising: 1, saturated: 0, past_peak: 0, stable: 1, declining: 0, insufficient: 0 });

    const byTotal = await getOpenAlexTrendsOverview(query({ sortBy: "total" }));
    expect(byTotal.topics.map((topic) => topic.topic)).toEqual(["Flat topic", "Rising topic"]);
  });

  it("pages the listed topics by verdict without changing which topics are tested", async () => {
    const stable = await getOpenAlexTrendsOverview(query({ verdict: "stable" }));
    expect(stable.topics.map((topic) => topic.topic)).toEqual(["Flat topic"]);
    expect(stable.matchedTopicCount).toBe(1);
    expect(stable.testedTopicCount).toBe(2);
    expect(stable.verdictCounts).toEqual({ rising: 1, saturated: 0, past_peak: 0, stable: 1, declining: 0, insufficient: 0 });

    const second = await getOpenAlexTrendsOverview(query({ limit: "1", offset: "1" }));
    expect(second.topics.map((topic) => topic.topic)).toEqual(["Flat topic"]);
    expect(second.matchedTopicCount).toBe(2);

    const saturated = await getOpenAlexTrendsOverview(query({ verdict: "saturated" }));
    expect(saturated.topics).toEqual([]);
    expect(saturated.matchedTopicCount).toBe(0);
    expect(() => query({ verdict: "bogus" })).toThrow();
  });

  it("accepts only trend and total as sortBy", () => {
    expect(query().sortBy).toBe("trend");
    expect(() => query({ sortBy: "momentum" })).toThrow();
    expect(() => query({ sortBy: "growth" })).toThrow();
    expect(query({ sortBy: "total" }).sortBy).toBe("total");
    expect(() => query({ sortBy: "bogus" })).toThrow();
  });

  it("tests keywords between the two halves inside Computer Science and returns the rising ones with their series", async () => {
    const overview = await getOpenAlexTrendsOverview(query());
    const keywordScope = `${TYPES},primary_topic.field.id:17`;

    expect(evidence.openAlexKeywordCounts).toHaveBeenCalledWith(keywordScope, [2016, 2017, 2018], [2019, 2020, 2021]);
    // The keyword totals are the papers of the same filter.
    expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${keywordScope},publication_year:2016-2021`);
    expect(overview.risingKeywords).toHaveLength(1);
    const [keyword] = overview.risingKeywords;
    expect(keyword!.keyword).toBe("large language models");
    expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${keywordScope},publication_year:2016-2021,keywords.id:large-language-models`);
    expect(keyword!.yearlyBreakdown.map((row) => row.count)).toEqual([0, 0, 5, 40, 100, 160]);
    expect(keyword!.totalPapers).toBe(305);
    expect(keyword!.growthRatePct).toBe(60);
    expect(keyword!.shift).toMatchObject({
      term: "large language models",
      papersA: 10,
      papersB: 300,
      periodA: { yearFrom: 2016, yearTo: 2018 },
      periodB: { yearFrom: 2019, yearTo: 2021 },
    });
    expect(keyword!.shift!.z).toBeGreaterThan(0);
    // BH over both tested keywords (m = 2), not only the rising one.
    expect(keyword!.shift!.qValue).toBeGreaterThanOrEqual(keyword!.shift!.pValue);
  });

  it("asks for the same topic and scope series whatever the window, so a year change reuses the cache", async () => {
    const seriesFilters = () => client.openAlexYearCounts.mock.calls.map((call) => String(call[0])).filter((filter) => filter.endsWith(SPAN)).sort();
    await getOpenAlexTrendsOverview(query());
    const first = seriesFilters();
    vi.clearAllMocks();
    await getOpenAlexTrendsOverview(query({ yearFrom: "2017", yearTo: "2021" }));

    expect(first).toHaveLength(4 + 2);
    expect(seriesFilters()).toEqual(first);
  });

  it("defaults to a window of 15 complete years", async () => {
    const overview = await getOpenAlexTrendsOverview(TrendsOverviewQuerySchema.parse({}));
    const thisYear = new Date().getFullYear();
    expect(overview.yearTo).toBe(thisYear);
    expect(overview.yearFrom).toBe(thisYear - 15);
    expect(overview.lastCompleteYear - overview.yearFrom + 1).toBe(15);
  });

  it("lets OpenAlex errors propagate so the caller can fall back to local data", async () => {
    client.openAlexGroupBy.mockRejectedValue(new Error("OpenAlex 503"));
    await expect(getOpenAlexTrendsOverview(query())).rejects.toThrow("OpenAlex 503");
  });
});
