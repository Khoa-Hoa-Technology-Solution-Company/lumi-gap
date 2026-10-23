import { describe, expect, it } from "vitest";
import { computeGgt } from "../trend.ggt.js";
import { buildShareRows } from "../trend.series.js";
import { benjaminiHochberg } from "../trend.statistics.js";
import { classifyTrend, shareTrendStatistics } from "../trend.verdict.js";
import { computeSnapshotAnalytics, globalPopulation, SNAPSHOT_BASELINE_LEVELS } from "../trend.snapshot-analytics.js";

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const series = (f: (y: number) => number) => new Map(YEARS.map((y, i) => [y, f(i)]));
// Field A: T1 rising, T2 flat, T3 falling. Field B: T4 rising, T5 tiny with a zero base.
const topicCounts = new Map([
  ["T1", series((i) => 100 + i * 40)],
  ["T2", series(() => 300)],
  ["T3", series((i) => 400 - i * 25)],
  ["T4", series((i) => 50 + i * 20)],
  ["T5", series((i) => (i < 3 ? 0 : i))],
  ["T6", series(() => 0)], // no works in the window: not a trend unit
]);
const catalogue = new Map([
  ["T1", { domainId: "1", fieldId: "A", subfieldId: "A1" }],
  ["T2", { domainId: "1", fieldId: "A", subfieldId: "A1" }],
  ["T3", { domainId: "1", fieldId: "A", subfieldId: "A2" }],
  ["T4", { domainId: "1", fieldId: "B", subfieldId: "B1" }],
  ["T5", { domainId: "1", fieldId: "B", subfieldId: "B1" }],
  ["T6", { domainId: "1", fieldId: "B", subfieldId: "B1" }],
]);
const roll = (key: "domainId" | "fieldId" | "subfieldId") => {
  const m = new Map<string, Map<number, number>>();
  for (const [id, years] of topicCounts) {
    const unit = catalogue.get(id)![key];
    const u = m.get(unit) ?? new Map<number, number>();
    for (const [y, c] of years) u.set(y, (u.get(y) ?? 0) + c + 50); // + works of topics outside this test
    m.set(unit, u);
  }
  return m;
};
const input = { yearFrom: 2016, lastCompleteYear: 2025, topicCounts, levelCounts: { domain: roll("domainId"), field: roll("fieldId"), subfield: roll("subfieldId") }, catalogue };

describe("snapshot analytics reuse the P1 functions (P2.1)", () => {
  const results = computeSnapshotAnalytics(input);

  it("covers every topic with works, for every baseline", () => {
    expect(SNAPSHOT_BASELINE_LEVELS).toEqual(["global", "domain", "field", "subfield"]);
    expect(results).toHaveLength(4 * 5);
    expect(results.some((r) => r.topicId === "T6")).toBe(false);
  });

  it("is exactly the P1 pipeline for one topic (field baseline, BH over the field)", () => {
    const fieldA = ["T1", "T2", "T3"];
    const rows = fieldA.map((id) => buildShareRows(topicCounts.get(id)!, input.levelCounts.field.get("A")!, 2016, 2025));
    const stats = rows.map((r) => shareTrendStatistics(r));
    const q = benjaminiHochberg(stats.map((s) => s.mannKendall?.pValue ?? null));
    fieldA.forEach((id, i) => {
      const r = results.find((x) => x.baselineLevel === "field" && x.topicId === id)!;
      expect(r.baselineUnit).toBe("A");
      expect(r.qFamilyKey).toBe("field:A");
      expect(r.qFamilySize).toBe(3);
      expect(r.shareSeries).toEqual(rows[i]);
      expect(r.classification).toEqual(classifyTrend({ ...stats[i]!, source: "openalex", qValue: q[i] ?? null, qFamilySize: 3 }));
      expect(r.ggt).toEqual(computeGgt(rows[i]!));
    });
  });

  it("uses one BH family for global and one per unit for the other levels", () => {
    const global = results.filter((r) => r.baselineLevel === "global");
    expect(new Set(global.map((r) => r.qFamilyKey))).toEqual(new Set(["global:all"]));
    expect(global.every((r) => r.qFamilySize === 5)).toBe(true);
    const field = results.filter((r) => r.baselineLevel === "field");
    expect(new Set(field.map((r) => r.qFamilyKey))).toEqual(new Set(["field:A", "field:B"]));
    expect(field.filter((r) => r.qFamilyKey === "field:B").every((r) => r.qFamilySize === 2)).toBe(true);
  });

  it("global N_t is the sum of the topics' classified works", () => {
    expect(globalPopulation(topicCounts).get(2016)).toBe(100 + 300 + 400 + 50 + 0 + 0);
  });

  it("never gives a Nelis threshold group to a tiny topic and never claims stability", () => {
    for (const r of results) {
      expect(r.ggt.stabilityChecked).toBe(false);
      if (r.ggt.nelisClass !== null) expect(r.ggt.conditions.atLeast50PapersEveryYear && r.ggt.conditions.allAnnualBelow100Pct).toBe(true);
    }
    expect(results.filter((r) => r.topicId === "T5").every((r) => r.ggt.nelisClass === null)).toBe(true);
  });

  it("fails loudly when a topic has no parent unit in the catalogue", () => {
    expect(() => computeSnapshotAnalytics({ ...input, catalogue: new Map([...catalogue].filter(([id]) => id !== "T4")) })).toThrow(/T4 has no domain/);
  });
});
