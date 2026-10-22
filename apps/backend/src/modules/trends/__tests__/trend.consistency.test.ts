import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P0.2: the overview list and the topic page must test the same share series
 * for the same topic and Data Scope, and one response must use one source.
 */
const client = vi.hoisted(() => ({
  openAlexYearCounts: vi.fn(),
  openAlexGroupBy: vi.fn(),
  openAlexGet: vi.fn(),
  isOpenAlexBudgetAvailable: vi.fn(() => true),
}));
vi.mock("../trend.openalex-client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../trend.openalex-client.js")>()),
  ...client,
}));

const prisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  paperTopic: { findMany: vi.fn(), findFirst: vi.fn() },
  paper: { findMany: vi.fn() },
  paperAuthor: { groupBy: vi.fn() },
  paperKeyword: { groupBy: vi.fn(), findMany: vi.fn() },
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import { TopicTrendQuerySchema, TrendsOverviewQuerySchema } from "../dto/trends.schema.js";
import { getOpenAlexTrendsOverview } from "../trend.openalex-overview.js";
import { trendService } from "../trend.service.js";

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021];
const SCOPE = { yearFrom: "2016", yearTo: "2021", paperKinds: "article", languages: "en" };
const T1 = {
  id: "https://openalex.org/T1",
  display_name: "Rising topic",
  works_count: 210,
  domain: { id: "https://openalex.org/domains/3", display_name: "Physical Sciences" },
  field: { id: "https://openalex.org/fields/17", display_name: "Computer Science" },
  subfield: { id: "https://openalex.org/subfields/1702", display_name: "Artificial Intelligence" },
};

function yearCounts(filter: string): Map<number, number> {
  if (filter.includes("is_in_top_10_percent")) return new Map(YEARS.map((year) => [year, 3]));
  if (filter.includes("primary_topic.id:T1")) return new Map(YEARS.map((year, i) => [year, [11, 19, 33, 38, 52, 61][i]!]));
  if (filter.includes("primary_topic.field.id:17")) return new Map(YEARS.map((year, i) => [year, [1000, 1040, 1100, 1090, 1200, 1250][i]!]));
  if (filter.includes("cited_by_count")) return new Map();
  return new Map(YEARS.map((year) => [year, 5000]));
}

const filtersCalled = () => client.openAlexYearCounts.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  vi.clearAllMocks();
  client.isOpenAlexBudgetAvailable.mockReturnValue(true);
  client.openAlexYearCounts.mockImplementation(async (filter: string) => yearCounts(filter));
  client.openAlexGroupBy.mockImplementation(async (_filter: string, groupBy: string) => ({
    groups: groupBy === "primary_topic.id" ? [{ key: "T1", name: "Rising topic", count: 214 }] : [],
    nextCursor: null,
  }));
  client.openAlexGet.mockImplementation(async (path: string) => (path === "topics" ? { results: [T1] } : T1));
  prisma.paperTopic.findFirst.mockResolvedValue(null);
});

describe("overview and topic page use the same share series", () => {
  it("gives the same Mann–Kendall result for the same topic and Data Scope", async () => {
    const overview = await getOpenAlexTrendsOverview(TrendsOverviewQuerySchema.parse(SCOPE));
    const listed = overview.topics.find((topic) => topic.taxonomy?.openalexTopicId === "T1")!;
    const fromList = listed.classification;
    const overviewFilters = new Set(filtersCalled());

    client.openAlexYearCounts.mockClear();
    const detail = await trendService.topic("Rising topic", TopicTrendQuerySchema.parse({ ...SCOPE, topicId: "T1" }));
    const stats = detail.statistics!;

    expect(detail.dataSource).toBe("openalex");
    expect(stats.source).toBe("openalex");
    // P0.6: only observed provenance, no classifier version.
    expect(Object.keys(detail.dataProvenance).sort()).toEqual(["cacheVersion", "corpus", "fetchedAt", "source"]);
    expect(detail.dataProvenance).toMatchObject({ source: "openalex", cacheVersion: "v3", corpus: "core" });
    expect(stats.classification.mannKendall).toEqual(fromList.mannKendall);
    expect(stats.classification.senSlope).toBe(fromList.senSlope);
    expect(stats.classification.senSlopeCi95).toEqual(fromList.senSlopeCi95);
    expect(stats.classification.yearsUsed).toBe(fromList.yearsUsed);
    expect(stats.classification.totalPapers).toBe(fromList.totalPapers);
    // P1.3: GGT of the same share series, identical on both pages.
    expect(stats.ggt).toBeDefined();
    expect(stats.ggt).toEqual(listed.ggt);
    expect(stats.ggt!.annual.map((row) => row.year)).toEqual(stats.yearsUsed);
    // The overview adjusts across the list; the topic page reports one p-value.
    expect(fromList.qValue).not.toBeNull();
    expect(stats.classification.qValue).toBeNull();

    // Same filter strings as the overview for the topic and its population.
    const topicFilter = "type:article,language:en,primary_topic.id:T1,publication_year:2016-2021";
    const populationFilter = "type:article,language:en,primary_topic.field.id:17,publication_year:2016-2021";
    expect(overviewFilters.has(topicFilter)).toBe(true);
    expect(overviewFilters.has(populationFilter)).toBe(true);
    expect(filtersCalled()).toContain(topicFilter);
    expect(filtersCalled()).toContain(populationFilter);
  });

  it("applies the Data Scope to the statistics (not only to the chart)", async () => {
    await trendService.topic("Rising topic", TopicTrendQuerySchema.parse({ ...SCOPE, topicId: "T1" }));
    const statisticsFilters = filtersCalled().filter((filter) => filter.includes("primary_topic.field.id:17") || filter.includes("primary_topic.id:T1"));
    expect(statisticsFilters.length).toBeGreaterThan(0);
    for (const filter of statisticsFilters) {
      expect(filter).toContain("type:article");
      expect(filter).toContain("language:en");
    }
  });
});

describe("one source per topic response", () => {
  it("moves chart and statistics to the local corpus together when OpenAlex fails", async () => {
    client.openAlexGet.mockRejectedValue(new Error("OpenAlex 503"));
    prisma.paperTopic.findMany.mockResolvedValue([
      { paperId: "p1", topicName: "Rising topic", openalexTopicId: "T1", domainId: "3", domainName: "Physical Sciences", fieldId: "17", fieldName: "Computer Science", subfieldId: null, subfieldName: null, isPrimary: true },
    ]);
    prisma.paper.findMany.mockResolvedValue([{ id: "p1", publicationYear: 2020, citationCount: 3, journalName: null, citationNormalizedPercentile: null }]);
    prisma.paperAuthor.groupBy.mockResolvedValue([]);
    prisma.paperKeyword.groupBy.mockResolvedValue([]);
    prisma.paperKeyword.findMany.mockResolvedValue([]);
    // 1st raw query: ids of the topic's papers in the Data Scope; then N_t.
    prisma.$queryRaw.mockImplementation(async (query: { sql: string }) => (query.sql.includes("SELECT DISTINCT p.id") ? [{ id: "p1" }] : [{ year: 2020, count: 40 }]));

    const detail = await trendService.topic("Rising topic", TopicTrendQuerySchema.parse({ ...SCOPE, topicId: "T1" }));

    expect(detail.dataSource).toBe("local");
    expect(detail.dataProvenance).toEqual({ source: "local", fetchedAt: null, cacheVersion: null, corpus: null });
    expect(detail.statistics!.source).toBe("local");
    expect(detail.statistics!.classification.reasons).toContain("LOCAL_CORPUS");
    // P0.4 + P1.1: exact topic id, primary topics only, inside the Data Scope.
    const idQuery = prisma.$queryRaw.mock.calls.map((call) => call[0] as { sql: string; values: unknown[] }).find((q) => q.sql.includes("SELECT DISTINCT p.id"))!;
    expect(idQuery.sql).toContain("pt.is_primary = TRUE");
    expect(idQuery.sql).toContain("LOWER(pt.openalex_topic_id) = LOWER(");
    expect(idQuery.values).toContain("T1");
    expect(idQuery.values).toContain("article"); // Data Scope paperKinds=article is applied
    expect(prisma.paperTopic.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isPrimary: true, openalexTopicId: { equals: "T1", mode: "insensitive" } }),
    }));
    // No OpenAlex count was used for the statistics of a local response.
    expect(client.openAlexYearCounts).not.toHaveBeenCalled();
  });
});
