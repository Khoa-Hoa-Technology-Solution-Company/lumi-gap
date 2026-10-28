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
import { TrendPeriodsQuerySchema } from "../dto/trends.schema.js";

const T = "type:article|review|preprint|conference-paper|book-chapter";
const NOW = new Date("2026-10-21T08:00:00Z");

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
      const month = /from_publication_date:(\d{4}-\d{2})-01,to_publication_date:\1-\d{2}$/.exec(filter)?.[1];
      const index = month ? periods.findIndex((period) => period.key === month) : -1;
      if (key === "type" && index >= 0) return { groups: [{ key: "article", name: "article", count: 900 }, { key: "review", name: "review", count: 100 }], nextCursor: null };
      if (key === "primary_topic.field.id" && index >= 0) return { groups: [{ key: "17", name: "Computer Science", count: 1000 }], nextCursor: null };
      if (key === "primary_topic.id" && index >= 0) {
        const ids = /primary_topic\.id:([^,]+)/.exec(filter)![1]!.split("|");
        // T1 rises 10, 12, 14, ...; T2 stays at 40.
        return { groups: ids.map((id) => ({ key: id, name: id, count: id === "T1" ? 10 + index * 2 : 40 })), nextCursor: null };
      }
      if (key === "primary_topic.id") return { groups: [{ key: "T2", name: "Steady topic", count: 520 }, { key: "T1", name: "Rising topic", count: 380 }], nextCursor: null };
      if (key === "primary_topic.field.id") return { groups: [{ key: "17", name: "Computer Science", count: 13000 }], nextCursor: null };
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

  it("tests monthly field shares over the complete months only", async () => {
    const overview = await getOpenAlexTrendPeriods(TrendPeriodsQuerySchema.parse({}));

    expect(overview).toMatchObject({ dataSource: "openalex", granularity: "month", window: "rolling" });
    expect(overview.periods).toHaveLength(13);
    expect(overview.periods.at(-1)).toEqual({ key: "2026-10", from: "2026-10-01", to: "2026-10-31", complete: false });
    expect(overview.periodTotalPapers[0]).toEqual({ period: "2025-10", count: 1000 });
    expect(overview.totalPapersInWindow).toBe(13000);
    expect(client.openAlexGroupBy).toHaveBeenCalledWith(`${T},from_publication_date:2025-10-01,to_publication_date:2026-10-31`, "primary_topic.id");
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
    expect(overview.verdictCounts).toEqual({ rising: 1, stable: 1, declining: 0, insufficient: 0 });
    expect(overview.candidateStrata).toEqual({ level: "field", strata: 1, perStratum: 3 });

    const risingOnly = await getOpenAlexTrendPeriods(TrendPeriodsQuerySchema.parse({ verdict: "rising" }));
    expect(risingOnly.topics.map((topic) => topic.topic)).toEqual(["Rising topic"]);
    expect(risingOnly.matchedTopicCount).toBe(1);
    expect(risingOnly.testedTopicCount).toBe(2);
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
