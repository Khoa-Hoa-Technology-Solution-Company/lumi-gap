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
import { benjaminiHochberg } from "../trend.statistics.js";
import { TrendsOverviewQuerySchema } from "../dto/trends.schema.js";

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021];
const each = (value: number) => new Map(YEARS.map((year) => [year, value]));

function query(raw: Record<string, string> = {}) {
  return TrendsOverviewQuerySchema.parse({ yearFrom: "2016", yearTo: "2021", ...raw });
}

function yearCounts(filter: string): Map<number, number> {
  if (filter.includes("keywords.id:large-language-models")) return new Map([[2018, 5], [2019, 40], [2020, 100], [2021, 160]]);
  if (filter.includes("is_in_top_10_percent")) return each(5);
  if (filter.includes("cited_by_count:0-9")) return new Map([[2016, 100]]);
  if (filter.includes("cited_by_count:>999")) return new Map([[2020, 1]]);
  if (filter.includes("cited_by_count")) return new Map();
  if (filter.includes("primary_topic.id:T1")) return new Map(YEARS.map((year, i) => [year, 10 + i * 10]));
  if (filter.includes("primary_topic.id:T2")) return new Map(YEARS.map((year, i) => [year, i % 2 === 0 ? 48 : 52]));
  if (filter.includes("primary_topic.field.id:")) return each(1000);
  return each(1000);
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
  "keywords.id": [
    { key: "support-vector-machines", name: "support vector machines", count: 200 },
    { key: "large-language-models", name: "large language models", count: 300 },
  ],
};

const entity = (id: string) => ({
  id: `https://openalex.org/${id}`,
  display_name: id,
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
  client.openAlexGroupBy.mockImplementation(async (_filter: string, groupBy: string) => ({ groups: GROUPS[groupBy] ?? [], nextCursor: null }));
  client.openAlexGet.mockImplementation(async (_path: string, params: Record<string, string>) => ({
    results: params.filter!.replace(/^id:/, "").split("|").map(entity),
  }));
  evidence.openAlexKeywordCounts.mockResolvedValue([
    { key: "large-language-models", term: "large language models", papersA: 10, papersB: 300 },
    { key: "support-vector-machines", term: "support vector machines", papersA: 200, papersB: 50 },
  ]);
});

describe("getOpenAlexTrendsOverview", () => {
  it("sends scoped filters and tests each topic against its field population", async () => {
    const overview = await getOpenAlexTrendsOverview(query({ domainIds: "3" }));

    expect(overview.dataSource).toBe("openalex");
    expect(overview.lastCompleteYear).toBe(2021);
    const base = "type:article|review|preprint|conference-paper|book-chapter,primary_topic.domain.id:3,publication_year:2016-2021";
    expect(client.openAlexYearCounts).toHaveBeenCalledWith(base);
    expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${base},citation_normalized_percentile.is_in_top_10_percent:true`);
    expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${base},cited_by_count:>999`);
    expect(client.openAlexGroupBy).toHaveBeenCalledWith(base, "primary_topic.id");
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.domain.id:3,primary_topic.id:T1,publication_year:2016-2021");
    // Population: the field, without the scope's taxonomy clauses.
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.field.id:17,publication_year:2016-2021");
    // T3 is below minPapers (3) and is neither fetched nor tested.
    expect(client.openAlexGet).toHaveBeenCalledTimes(1);
    expect(client.openAlexGet).toHaveBeenCalledWith("topics", expect.objectContaining({ filter: "id:T1|T2" }));
    expect(client.openAlexYearCounts.mock.calls.some((call) => String(call[0]).includes("T3"))).toBe(false);

    const [rising, flat] = overview.topics;
    expect(rising!.topic).toBe("Rising topic");
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
    expect(rising).not.toHaveProperty("shareTest");
    // Share 1%..6%: S = 15 over 6 years. The flat topic alternates 4.8%/5.2%.
    expect(rising!.classification).toMatchObject({ verdict: "rising", confidence: "medium", yearsUsed: 6, totalPapers: 210, reasons: ["SIGNIFICANT_INCREASE"] });
    expect(rising!.classification.senSlope).toBeCloseTo(1, 10);
    expect(rising!.classification.relativeChangePct).toBeCloseTo((1 / 3.5) * 100, 10);
    expect(flat!.classification.verdict).toBe("stable");
    const q = benjaminiHochberg([rising!.classification.mannKendall!.pValue, flat!.classification.mannKendall!.pValue]);
    expect(rising!.classification.qValue).toBeCloseTo(q[0]!, 12);
    expect(flat!.classification.qValue).toBeCloseTo(q[1]!, 12);
    // One population request per distinct field.
    expect(client.openAlexYearCounts.mock.calls.filter((call) => String(call[0]).includes("primary_topic.field.id:17,publication_year"))).toHaveLength(1);
  });

  it("baseline=global: one population request for every topic, and GGT against it (P1.1, P1.3)", async () => {
    const overview = await getOpenAlexTrendsOverview(query({ domainIds: "3", baseline: "global" }));
    expect(overview.baselineLevel).toBe("global");
    const populations = client.openAlexYearCounts.mock.calls.map((call) => String(call[0])).filter((filter) => filter.includes("primary_topic.id:!null"));
    expect(populations).toEqual(["type:article|review|preprint|conference-paper|book-chapter,primary_topic.id:!null,publication_year:2016-2021"]);
    expect(client.openAlexYearCounts.mock.calls.some((call) => String(call[0]).includes("primary_topic.field.id:17,publication_year"))).toBe(false);
    const rising = overview.topics.find((topic) => topic.topic === "Rising topic")!;
    // n = 10, 20, … 60 against a constant N = 1000: GGT_2017 = (20 − 10)/10 × 100.
    expect(rising.ggt!.annual[1]).toMatchObject({ year: 2017, nullReason: null });
    expect(rising.ggt!.annual[1]!.ggtPct).toBeCloseTo(100, 10);
    expect(rising.ggt!.conditions.allAnnualBelow100Pct).toBe(false);
    expect(rising.ggt!.nelisClass).toBeNull();
  });

  it("sorts by verdict, slices to limit and recommends only rising topics", async () => {
    const byTrend = await getOpenAlexTrendsOverview(query({ limit: "1" }));
    expect(byTrend.topics.map((topic) => topic.topic)).toEqual(["Rising topic"]);
    // Only one rising topic: nothing to compare.
    expect(byTrend.recommendedComparisons).toEqual([]);
    expect(byTrend.uniqueTopicsInScope).toBe(3);

    const byTotal = await getOpenAlexTrendsOverview(query({ sortBy: "total" }));
    expect(byTotal.topics.map((topic) => topic.topic)).toEqual(["Flat topic", "Rising topic"]);
  });

  it("accepts the legacy sortBy values as trend", () => {
    expect(query().sortBy).toBe("trend");
    expect(query({ sortBy: "momentum" }).sortBy).toBe("trend");
    expect(query({ sortBy: "growth" }).sortBy).toBe("trend");
    expect(query({ sortBy: "total" }).sortBy).toBe("total");
    expect(() => query({ sortBy: "bogus" })).toThrow();
  });

  it("builds facets, citation trend and coverage in the shapes the web expects", async () => {
    const overview = await getOpenAlexTrendsOverview(query());

    expect(overview.totalPapersInWindow).toBe(6000);
    expect(overview.citationTrend[0]).toEqual({ year: 2016, count: 1000, totalCitations: null, avgCitations: null, topCitedCount: 5, ppTop10Pct: 0.5 });
    expect(overview.facets.topSources).toEqual([
      { id: "S4306400194", name: "arXiv (Cornell University)", count: 900, openalexId: "S4306400194" },
    ]);
    expect(overview.facets.fields).toEqual([{ id: "Computer Science", name: "Computer Science", count: 5000, openalexId: "17" }]);
    expect(overview.facets.topics[0]).toEqual({ id: "Rising topic", name: "Rising topic", count: 210, openalexId: "T1" });
    expect(overview.facets.languages).toEqual([{ id: "en", name: "English", count: 5500 }]);
    expect(overview.facets.providers).toEqual([]);
    expect(overview.facets.citationBands).toEqual([
      { id: "0-9", name: "0-9", count: 100 },
      { id: "1000+", name: "1000+", count: 1 },
    ]);
    expect(overview.taxonomyCoverage).toMatchObject({ totalPapers: 6000, papersWithPrimaryTopic: 5000, primaryTopicCoveragePct: 83.3, fullHierarchyCoveragePct: 83.3 });
  });

  it("tests keywords between the two halves and returns the rising ones with their series", async () => {
    const overview = await getOpenAlexTrendsOverview(query({ fieldIds: "17" }));

    expect(evidence.openAlexKeywordCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.field.id:17", [2016, 2017, 2018], [2019, 2020, 2021]);
    expect(overview.risingKeywords).toHaveLength(1);
    const [keyword] = overview.risingKeywords;
    expect(keyword!.keyword).toBe("large language models");
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.field.id:17,publication_year:2016-2021,keywords.id:large-language-models");
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

  it("never sends an empty clause when the scope is empty", async () => {
    const overview = await getOpenAlexTrendsOverview(query());

    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,publication_year:2016-2021");
    expect(evidence.openAlexKeywordCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter", [2016, 2017, 2018], [2019, 2020, 2021]);
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.id:T1,publication_year:2016-2021");
    for (const filter of allFilters()) {
      expect(filter).not.toMatch(/^,|,,|,$/);
    }
    expect(overview.scopeNotice).toEqual({ ignoredFilters: [] });
  });

  it("lets OpenAlex errors propagate so the caller can fall back to local data", async () => {
    client.openAlexGroupBy.mockRejectedValue(new Error("OpenAlex 503"));
    await expect(getOpenAlexTrendsOverview(query())).rejects.toThrow("OpenAlex 503");
  });
});
