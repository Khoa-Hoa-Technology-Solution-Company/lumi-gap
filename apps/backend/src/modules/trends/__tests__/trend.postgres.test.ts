import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import { getPostgresTrendsOverview } from "../trend.postgres.js";
import { TrendsOverviewQuerySchema } from "../dto/trends.schema.js";

type SqlCall = { sql: string; values: unknown[] };
const calls = (): SqlCall[] => prisma.$queryRaw.mock.calls.map((call) => call[0] as SqlCall);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T00:00:00.000Z"));
  prisma.$queryRaw.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("local trends overview (P0.4)", () => {
  it("counts each paper in its primary topic only", async () => {
    await getPostgresTrendsOverview(TrendsOverviewQuerySchema.parse({}));
    const topicQuery = calls().find((call) => call.sql.includes("pt.topic_name AS topic"));
    expect(topicQuery).toBeDefined();
    expect(topicQuery!.sql).toContain("pt.is_primary = TRUE");
  });

  it("uses the same default window as OpenAlex: 10 complete years", async () => {
    const overview = await getPostgresTrendsOverview(TrendsOverviewQuerySchema.parse({}));
    expect(overview.yearFrom).toBe(2016);
    expect(overview.yearTo).toBe(2026);
    expect(overview.lastCompleteYear).toBe(2025);
  });

  it("selects keywords with the two-period log odds test, not with raw YoY growth", async () => {
    // 6 complete years 2020–2025 with 1 000 papers each: A = 2020–2022, B = 2023–2025.
    const years = [2020, 2021, 2022, 2023, 2024, 2025];
    prisma.$queryRaw.mockImplementation(async (query: SqlCall) => {
      if (query.sql.includes('AS "totalCitations"')) return years.map((year) => ({ year, count: 1000, totalCitations: 0 }));
      if (query.sql.includes("pk.keyword_name AS keyword")) {
        return [
          // Steady keyword with a +100% jump in the last year (old rule: first).
          ...years.map((year) => ({ keyword: "jumpy", year, count: year === 2025 ? 40 : 20 })),
          // Keyword that grew from 5 to 60 papers a year.
          ...years.map((year, i) => ({ keyword: "grower", year, count: [5, 5, 5, 40, 50, 60][i]! })),
        ];
      }
      return [];
    });
    const overview = await getPostgresTrendsOverview(TrendsOverviewQuerySchema.parse({}));
    const terms = overview.risingKeywords.map((keyword) => keyword.keyword);
    expect(terms[0]).toBe("grower");
    const grower = overview.risingKeywords[0]!;
    expect(grower.shift).toMatchObject({ papersA: 15, papersB: 150, periodA: { yearFrom: 2020, yearTo: 2022 }, periodB: { yearFrom: 2023, yearTo: 2025 } });
    expect(grower.shift!.qValue).toBeLessThan(0.05);
  });
});
