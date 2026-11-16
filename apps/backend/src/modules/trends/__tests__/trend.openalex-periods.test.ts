import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ openAlexGroupBy: vi.fn(), openAlexGet: vi.fn(), openAlexYearCounts: vi.fn() }));
vi.mock("../trend.openalex-client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../trend.openalex-client.js")>()),
  ...client,
}));

const prisma = vi.hoisted(() => ({ paperTopic: { findMany: vi.fn(async () => []) } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import { getOpenAlexTrendPeriods } from "../trend.openalex-periods.js";
import { subYearPeriods } from "../trend.openalex-topics.js";
import { itScopeWorkClauses } from "../trend.scope.js";
import { TrendPeriodsQuerySchema } from "../dto/trends.schema.js";

const T = "type:article|review|preprint|conference-paper|book-chapter";
const NOW = new Date("2026-10-21T08:00:00Z");
const [CHUNK_A, CHUNK_B] = itScopeWorkClauses() as [string, string];

describe("subYearPeriods", () => {
  it("returns the last N complete months and the running one", () => {
    const periods = subYearPeriods("month", "rolling", 3, NOW);
    expect(periods.map((period) => [period.key, period.from, period.to, period.complete])).toEqual([
      ["2026-07", "2026-07-01", "2026-07-31", true],
      ["2026-08", "2026-08-01", "2026-08-31", true],
      ["2026-09", "2026-09-01", "2026-09-30", true],
      ["2026-10", "2026-10-01", "2026-10-31", false],
    ]);
    expect(periods[0]!.clause).toBe("from_publication_date:2026-07-01,to_publication_date:2026-07-31");
  });

  it("crosses the year boundary and handles February", () => {
    const periods = subYearPeriods("month", "rolling", 3, new Date("2026-02-10T00:00:00Z"));
    expect(periods.map((period) => period.key)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(periods.at(-1)!.to).toBe("2026-02-28");
  });

  it("builds quarters and the year-to-date window", () => {
    expect(subYearPeriods("quarter", "rolling", 2, NOW).map((period) => [period.key, period.from, period.to])).toEqual([
      ["2026-Q2", "2026-04-01", "2026-06-30"],
      ["2026-Q3", "2026-07-01", "2026-09-30"],
      ["2026-Q4", "2026-10-01", "2026-12-31"],
    ]);
    expect(subYearPeriods("quarter", "year-to-date", 99, NOW).map((period) => period.key)).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
    const months = subYearPeriods("month", "year-to-date", 99, NOW);
    expect(months).toHaveLength(10);
    expect(months.filter((period) => period.complete)).toHaveLength(9);
    // In January the year has no complete month yet.
    expect(subYearPeriods("month", "year-to-date", 99, new Date("2026-01-15T00:00:00Z")).map((period) => period.complete)).toEqual([false]);
  });
});

describe("getOpenAlexTrendPeriods", () => {
  const periods = subYearPeriods("month", "rolling", 12, NOW);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    client.openAlexGroupBy.mockImplementation(async (filter: string, key: string) => {
      // The scope is queried in two OR chunks of subfields; the fixtures put every paper in the first one.
      if (filter.includes(CHUNK_B)) return { groups: [], nextCursor: null };
      const month = /from_publication_date:(\d{4}-\d{2})-01,to_publication_date:\1-\d{2}$/.exec(filter)?.[1];
      const index = month ? periods.findIndex((period) => period.key === month) : -1;
      if (key === "type" && index >= 0) return { groups: [{ key: "article", name: "article", count: 900 }, { key: "review", name: "review", count: 100 }], nextCursor: null };
      if (key === "primary_topic.id" && index >= 0) {
        const ids = /primary_topic\.id:([^,]+)/.exec(filter)![1]!.split("|");
        // T1 rises 10, 12, 14, ...; T2 stays at 40.
        return { groups: ids.map((id) => ({ key: id, name: id, count: id === "T1" ? 10 + index * 2 : 40 })), nextCursor: null };
      }
      if (key === "primary_topic.id") return { groups: [{ key: "T2", name: "Steady topic", count: 520 }, { key: "T1", name: "Rising topic", count: 380 }], nextCursor: null };
      if (key === "primary_topic.subfield.id") {
        return { groups: [{ key: "1702", name: "Artificial Intelligence", count: 13000 }, { key: "9999", name: "Outside the scope", count: 500 }, { key: "1712", name: "Software", count: 12 }], nextCursor: null };
      }
      return { groups: [], nextCursor: null };
    });
    client.openAlexGet.mockImplementation(async (_path: string, params: Record<string, string>) => ({
      results: params.filter!.replace(/^id:/, "").split("|").map((id) => ({
        id: `https://openalex.org/${id}`,
        field: { id: "https://openalex.org/fields/17", display_name: "Computer Science" },
      })),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tests monthly shares of the IT scope over the complete months only", async () => {
    const overview = await getOpenAlexTrendPeriods(TrendPeriodsQuerySchema.parse({}));
    const window = "from_publication_date:2025-10-01,to_publication_date:2026-10-31";

    expect(overview).toMatchObject({ dataSource: "openalex", scopeVersion: "it-v1", granularity: "month", window: "rolling" });
    expect(overview.periods).toHaveLength(13);
    expect(overview.periods.at(-1)).toEqual({ key: "2026-10", from: "2026-10-01", to: "2026-10-31", complete: false });
    // Totals and denominators are the papers of the whole scope: one request per month and subfield chunk.
    expect(overview.periodTotalPapers[0]).toEqual({ period: "2025-10", count: 1000 });
    expect(overview.totalPapersInWindow).toBe(13000);
    expect(client.openAlexGroupBy).toHaveBeenCalledWith(`${T},${CHUNK_A},from_publication_date:2026-09-01,to_publication_date:2026-09-30`, "type");
    expect(client.openAlexGroupBy).toHaveBeenCalledWith(`${T},${CHUNK_B},from_publication_date:2026-09-01,to_publication_date:2026-09-30`, "type");
    // Candidates: the largest topics of the scope in the window plus the largest of every subfield of the scope.
    expect(client.openAlexGroupBy).toHaveBeenCalledWith(`${T},${CHUNK_A},${window}`, "primary_topic.id");
    expect(client.openAlexGroupBy).toHaveBeenCalledWith(`${T},primary_topic.subfield.id:1702,${window}`, "primary_topic.id");
    // A subfield outside the scope, or one below 30 papers, is not a stratum.
    const filters = client.openAlexGroupBy.mock.calls.map((call) => String(call[0]));
    expect(filters.some((filter) => filter.includes("primary_topic.subfield.id:9999"))).toBe(false);
    expect(filters.some((filter) => filter.includes("primary_topic.subfield.id:1712,"))).toBe(false);
    expect(filters.some((filter) => filter.includes("primary_topic.field.id"))).toBe(false);
    expect(client.openAlexGroupBy).toHaveBeenCalledWith(`${T},primary_topic.id:T2|T1,from_publication_date:2026-09-01,to_publication_date:2026-09-30`, "primary_topic.id");

    const [rising, steady] = overview.topics;
    expect(rising!.topic).toBe("Rising topic");
    expect(rising!.periodBreakdown).toHaveLength(13);
    // The running month (index 12) is counted in the total but not tested.
    expect(rising!.totalPapers).toBe(Array.from({ length: 13 }, (_, i) => 10 + i * 2).reduce((a, b) => a + b, 0));
    expect(rising!.classification).toMatchObject({ verdict: "rising", confidence: "high", yearsUsed: 12 });
    // Share +0.2 points per month.
    expect(rising!.classification.senSlope).toBeCloseTo(0.2, 10);
    expect(steady!.classification.verdict).toBe("stable");
    expect(overview.verdictCounts).toEqual({ rising: 1, saturated: 0, past_peak: 0, stable: 1, declining: 0, insufficient: 0 });
    expect(overview.candidateStrata).toEqual({ level: "subfield", strata: 1, perStratum: 3 });
    expect(overview.scopeNotice).toEqual({ ignoredFilters: [] });

    const risingOnly = await getOpenAlexTrendPeriods(TrendPeriodsQuerySchema.parse({ verdict: "rising" }));
    expect(risingOnly.topics.map((topic) => topic.topic)).toEqual(["Rising topic"]);
    expect(risingOnly.matchedTopicCount).toBe(1);
    expect(risingOnly.testedTopicCount).toBe(2);
  });

  it("a subfield filter lists that part of the scope against the whole scope, and wider filters are ignored", async () => {
    const bySubfield = await getOpenAlexTrendPeriods(TrendPeriodsQuerySchema.parse({ subfieldIds: "1702" }));
    const window = "from_publication_date:2025-10-01,to_publication_date:2026-10-31";
    expect(client.openAlexGroupBy).toHaveBeenCalledWith(`${T},primary_topic.subfield.id:1702,${window}`, "primary_topic.id");
    expect(bySubfield.candidateStrata).toBeNull();
    expect(bySubfield.testedTopicCount).toBe(2);
    // The denominator is still the whole scope.
    expect(client.openAlexGroupBy).toHaveBeenCalledWith(`${T},${CHUNK_A},from_publication_date:2026-09-01,to_publication_date:2026-09-30`, "type");
    expect(bySubfield.topics[0]!.classification.senSlope).toBeCloseTo(0.2, 10);

    const byField = await getOpenAlexTrendPeriods(TrendPeriodsQuerySchema.parse({ fieldIds: "17" }));
    expect(byField.scopeNotice!.ignoredFilters).toEqual([{ filter: "fields", values: ["17"], reason: expect.stringContaining("Information Technology scope") }]);
    expect(byField.candidateStrata).toEqual({ level: "subfield", strata: 1, perStratum: 3 });
  });

  it("marks a too-short year-to-date window as insufficient", async () => {
    vi.setSystemTime(new Date("2026-03-05T00:00:00Z"));
    const overview = await getOpenAlexTrendPeriods(TrendPeriodsQuerySchema.parse({ window: "year-to-date" }));

    expect(overview.periods.map((period) => period.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    for (const topic of overview.topics) {
      expect(topic.classification.verdict).toBe("insufficient");
      expect(topic.classification.reasons).toContain("TOO_FEW_YEARS");
    }
  });

  it("validates the query", () => {
    expect(TrendPeriodsQuerySchema.parse({})).toMatchObject({ granularity: "month", window: "rolling", limit: 10, sortBy: "trend" });
    expect(() => TrendPeriodsQuerySchema.parse({ granularity: "week" })).toThrow();
    expect(() => TrendPeriodsQuerySchema.parse({ periods: "4" })).toThrow();
    expect(() => TrendPeriodsQuerySchema.parse({ periods: "25" })).toThrow();
  });
});
