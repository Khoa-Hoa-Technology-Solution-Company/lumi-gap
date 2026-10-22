import { beforeEach, describe, expect, it, vi } from "vitest";

/** P1.1: one reference population definition for every path. */
const client = vi.hoisted(() => ({ openAlexYearCounts: vi.fn(), openAlexGroupBy: vi.fn(), openAlexGet: vi.fn(), isOpenAlexBudgetAvailable: vi.fn(() => true) }));
vi.mock("../trend.openalex-client.js", async (importOriginal) => ({ ...(await importOriginal<typeof import("../trend.openalex-client.js")>()), ...client }));
const prisma = vi.hoisted(() => ({ $queryRaw: vi.fn(), paperKeyword: { findMany: vi.fn(async () => []) } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import { DEFAULT_TREND_BASELINE } from "@trend/shared-types";
import { Prisma } from "../../../generated/prisma/client.js";
import { assertBaselineContainsUnit, openAlexBaselineClause, resolveBaseline, unclassifiedSharePct } from "../trend.baseline.js";
import { computeLocalTopicStatistics, computeOpenAlexTopicStatistics } from "../trend.evidence.js";

const TAXONOMY = {
  domainId: "https://openalex.org/domains/3", domainName: "Physical Sciences",
  fieldId: "https://openalex.org/fields/17", fieldName: "Computer Science",
  subfieldId: "https://openalex.org/subfields/1702", subfieldName: "Artificial Intelligence",
};
const SCOPE = { filter: "type:article", nonTaxonomyFilter: "type:article" };

beforeEach(() => {
  vi.clearAllMocks();
  client.openAlexGroupBy.mockResolvedValue({ groups: [], nextCursor: null });
  client.openAlexYearCounts.mockImplementation(async (filter: string) => {
    if (filter.includes("primary_topic.id:null")) return new Map([[2020, 10], [2021, 30]]);
    if (filter.includes("primary_topic.id:T1")) return new Map([[2020, 5], [2021, 6]]);
    return new Map([[2020, 990], [2021, 970]]);
  });
});

describe("resolveBaseline", () => {
  it("defaults to the field, the P0 behaviour", () => {
    expect(DEFAULT_TREND_BASELINE).toBe("field");
    expect(resolveBaseline(undefined, TAXONOMY)).toEqual({ level: "field", id: "17", label: "Computer Science" });
  });

  it("resolves every level to the short OpenAlex id and its name", () => {
    expect(resolveBaseline("domain", TAXONOMY)).toEqual({ level: "domain", id: "3", label: "Physical Sciences" });
    expect(resolveBaseline("subfield", TAXONOMY)).toEqual({ level: "subfield", id: "1702", label: "Artificial Intelligence" });
    expect(resolveBaseline("global", TAXONOMY)).toEqual({ level: "global", label: "All works with a primary topic" });
  });

  it("falls back to global, and says so, when the topic has no id at the level", () => {
    expect(resolveBaseline("subfield", { fieldId: "17" })).toEqual({ level: "global", fallbackFrom: "subfield", label: "All works with a primary topic" });
  });
});

describe("OpenAlex baseline clauses", () => {
  it("selects works by PRIMARY topic at each level; global excludes works without a topic", () => {
    expect(openAlexBaselineClause(resolveBaseline("field", TAXONOMY))).toBe("primary_topic.field.id:17");
    expect(openAlexBaselineClause(resolveBaseline("domain", TAXONOMY))).toBe("primary_topic.domain.id:3");
    expect(openAlexBaselineClause(resolveBaseline("subfield", TAXONOMY))).toBe("primary_topic.subfield.id:1702");
    expect(openAlexBaselineClause(resolveBaseline("global", TAXONOMY))).toBe("primary_topic.id:!null");
  });

  it("topic statistics use the chosen baseline and report the unclassified share for global", async () => {
    const stats = await computeOpenAlexTopicStatistics({ topicId: "T1", taxonomy: TAXONOMY, baseline: "global", scope: SCOPE, yearFrom: 2020, yearTo: 2021, lastCompleteYear: 2021 });
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article,primary_topic.id:!null,publication_year:2020-2021");
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article,primary_topic.id:null,publication_year:2020-2021");
    expect(stats.baseline.level).toBe("global");
    // (10 + 30) / (10 + 30 + 990 + 970) = 2%
    expect(stats.baseline.unclassifiedSharePct).toBeCloseTo(2, 12);
    expect(stats.shareSeries.map((row) => row.total)).toEqual([990, 970]);
    // P1.3: GGT uses the same reference population: [(6−5)/5 − (970−990)/990] × 100.
    expect(stats.ggt!.annual[0]!.nullReason).toBe("MISSING_PREVIOUS_YEAR");
    expect(stats.ggt!.annual[1]!.ggtPct).toBeCloseTo((1 / 5 + 20 / 990) * 100, 10);
    expect(stats.ggt!.stabilityChecked).toBe(false);
  });

  it("field baseline keeps the exact P0 filter string (same numbers, same cache entry)", async () => {
    await computeOpenAlexTopicStatistics({ topicId: "T1", taxonomy: TAXONOMY, scope: SCOPE, yearFrom: 2020, yearTo: 2021, lastCompleteYear: 2021 });
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article,primary_topic.field.id:17,publication_year:2020-2021");
    expect(client.openAlexYearCounts.mock.calls.some((call) => String(call[0]).includes("primary_topic.id:null"))).toBe(false);
  });
});

describe("local baseline SQL", () => {
  it("counts primary topics of the baseline unit inside the scope without taxonomy clauses", async () => {
    prisma.$queryRaw.mockResolvedValue([{ year: 2021, count: 40 }]);
    await computeLocalTopicStatistics({ taxonomy: TAXONOMY, baseline: "subfield", scopeWhere: Prisma.sql`p.data_status = 'active'`, papers: [], yearFrom: 2020, lastCompleteYear: 2021 });
    const query = prisma.$queryRaw.mock.calls[0]![0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain("pt.is_primary = TRUE");
    expect(query.sql).toContain("pt.subfield_id");
    expect(query.values).toContain("1702");
  });
});

describe("baseline containment and unclassified share", () => {
  it("rejects a baseline that cannot contain the unit", () => {
    expect(() => assertBaselineContainsUnit("topic", "subfield")).not.toThrow();
    expect(() => assertBaselineContainsUnit("field", "field")).toThrow(/does not contain/);
    expect(() => assertBaselineContainsUnit("field", "subfield")).toThrow(/does not contain/);
    expect(() => assertBaselineContainsUnit("field", "domain")).not.toThrow();
  });

  it("computes the unclassified share over the years used only", () => {
    const classified = new Map([[2020, 90], [2021, 80], [2022, 1000]]);
    const unclassified = new Map([[2020, 10], [2021, 20], [2022, 1000]]);
    expect(unclassifiedSharePct(classified, unclassified, [2020, 2021])).toBeCloseTo(15, 12);
    expect(unclassifiedSharePct(new Map(), new Map(), [2020])).toBeNull();
  });
});
