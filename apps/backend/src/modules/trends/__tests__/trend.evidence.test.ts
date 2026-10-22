import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  openAlexYearCounts: vi.fn(),
  openAlexGroupBy: vi.fn(),
  isOpenAlexBudgetAvailable: vi.fn(() => true),
}));

vi.mock("../trend.openalex-client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../trend.openalex-client.js")>()),
  ...client,
}));

const prisma = vi.hoisted(() => ({ $queryRaw: vi.fn(), paperKeyword: { findMany: vi.fn() } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import { Prisma } from "../../../generated/prisma/client.js";
import { computeLocalTopicStatistics, computeOpenAlexTopicStatistics } from "../trend.evidence.js";

/** The default Data Scope (no filters chosen): only the default work types. */
const DEFAULT_SCOPE = { filter: "type:article|review|preprint|conference-paper|book-chapter", nonTaxonomyFilter: "type:article|review|preprint|conference-paper|book-chapter" };

const years = [2016, 2017, 2018, 2019, 2020, 2021];
const topicCounts = new Map(years.map((year, i) => [year, 10 + i * 10]));
const fieldCounts = new Map(years.map((year) => [year, 1000]));
const topCounts = new Map(years.map((year) => [year, 2]));

beforeEach(() => {
  vi.clearAllMocks();
  client.isOpenAlexBudgetAvailable.mockReturnValue(true);
  client.openAlexYearCounts.mockImplementation(async (filter: string) => {
    if (filter.includes("is_in_top_10_percent")) return topCounts;
    if (filter.includes("primary_topic.field.id")) return fieldCounts;
    return topicCounts;
  });
});

describe("computeOpenAlexTopicStatistics", () => {
  it("tests the topic share of its field and the keyword shift between periods", async () => {
    client.openAlexGroupBy.mockImplementation(async (filter: string) =>
      filter.includes("publication_year:2016-2018")
        ? { groups: [{ key: "svm", name: "SVM", count: 30 }, { key: "nlp", name: "NLP", count: 20 }], nextCursor: null }
        : { groups: [{ key: "nlp", name: "NLP", count: 50 }, { key: "svm", name: "SVM", count: 4 }], nextCursor: null },
    );

    const stats = await computeOpenAlexTopicStatistics({
      topicId: "https://openalex.org/T10028",
      taxonomy: { fieldId: "https://openalex.org/fields/17", fieldName: "Computer Science" },
      scope: DEFAULT_SCOPE,
      yearFrom: 2016,
      yearTo: 2021,
      lastCompleteYear: 2021,
    });

    expect(stats.source).toBe("openalex");
    expect(stats.baseline).toEqual({ level: "field", id: "17", label: "Computer Science" });
    expect(stats.totalPapers).toBe(10 + 20 + 30 + 40 + 50 + 60);
    expect(stats).not.toHaveProperty("poisson");
    // Share 1%..6% over 6 years: S = 15, p ≈ 0.0085 → rising, medium (n < 8).
    expect(stats.classification).toMatchObject({
      verdict: "rising",
      confidence: "medium",
      yearsUsed: 6,
      totalPapers: 210,
      qValue: null,
      reasons: ["SIGNIFICANT_INCREASE"],
    });
    expect(stats.classification.mannKendall!.s).toBe(15);
    expect(stats.classification.senSlope).toBeCloseTo(1, 10);
    expect(stats.classification.senSlopeCi95).not.toBeNull();
    expect(stats.impact[0]).toEqual({ year: 2016, papers: 10, topPapers: 2, ppTop10Pct: 20 });
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.id:T10028,publication_year:2016-2021");
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.field.id:17,publication_year:2016-2021");
    expect(client.openAlexGroupBy).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.id:T10028,publication_year:2016-2018", "keywords.id");

    const shift = stats.termShift!;
    expect(shift.periodA).toEqual({ yearFrom: 2016, yearTo: 2018, papers: 60 });
    expect(shift.periodB).toEqual({ yearFrom: 2019, yearTo: 2021, papers: 150 });
    expect(shift.termsTested).toBe(2);
    expect(shift.falling[0]).toMatchObject({ term: "SVM", papersA: 30, papersB: 4 });
  });

  it("gives a keyword missing from one period's ranking an exact count from its own query", async () => {
    client.openAlexGroupBy.mockImplementation(async (filter: string) =>
      filter.includes("publication_year:2016-2018")
        ? { groups: [{ key: "svm", name: "SVM", count: 30 }], nextCursor: null }
        : { groups: [{ key: "llm", name: "LLM", count: 80 }, { key: "svm", name: "SVM", count: 4 }], nextCursor: null },
    );
    client.openAlexYearCounts.mockImplementation(async (filter: string) => {
      if (filter.includes("keywords.id:llm")) return new Map([[2018, 1], [2019, 20], [2021, 60]]);
      if (filter.includes("is_in_top_10_percent")) return topCounts;
      if (filter.includes("primary_topic.field.id")) return fieldCounts;
      return topicCounts;
    });

    const stats = await computeOpenAlexTopicStatistics({
      topicId: "T10028",
      taxonomy: { fieldId: "17" },
      scope: DEFAULT_SCOPE,
      yearFrom: 2016,
      yearTo: 2021,
      lastCompleteYear: 2021,
    });

    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.id:T10028,publication_year:2016-2021,keywords.id:llm");
    expect(stats.termShift!.rising[0]).toMatchObject({ term: "LLM", papersA: 1, papersB: 80 });
  });

  it("local corpus statistics are descriptive only (LOCAL_CORPUS)", async () => {
    prisma.$queryRaw.mockResolvedValue([{ year: 2020, count: 10 }, { year: 2021, count: 10 }]);
    prisma.paperKeyword.findMany.mockResolvedValue([]);

    const stats = await computeLocalTopicStatistics({
      taxonomy: { fieldId: "17" },
      scopeWhere: Prisma.sql`p.data_status = 'active'`,
      papers: [{ id: "p1", publicationYear: 2021, citationNormalizedPercentile: { isInTop10Percent: true } }],
      yearFrom: 2016,
      lastCompleteYear: 2021,
    });

    expect(stats.source).toBe("local");
    expect(stats.yearsUsed).toEqual([2020, 2021]);
    expect(stats.impact[1]).toEqual({ year: 2021, papers: 1, topPapers: 1, ppTop10Pct: 100 });
    expect(stats.classification.verdict).toBe("insufficient");
    expect(stats.classification.reasons).toContain("LOCAL_CORPUS");
  });
});
