import { describe, expect, it } from "vitest";
import g1 from "./fixtures/g1-ggt-nelis-2022.json";
import { annualGgt, computeGgt, ggtClass, summarizeGgt } from "../trend.ggt.js";
import { buildShareRows } from "../trend.series.js";
import { classifyTrend, shareTrendStatistics } from "../trend.verdict.js";

/** Golden dataset G1 (fixtures/README.md): Nelis et al. (2022) supplementary data. */
type Row = { year: number; unitCount: number; baselineCount: number; authorsGgtFraction: number | null };
const rowsOf = (name: string) => (g1.fields.find((field) => field.name === name)!.rows as Row[]).map((row) => ({ year: row.year, count: row.unitCount, total: row.baselineCount, authors: row.authorsGgtFraction }));

describe("annual GGT reproduces the authors' own values (G1)", () => {
  for (const field of g1.fields) {
    it(`${field.name}: every annual GGT equals the authors' cached value`, () => {
      const rows = rowsOf(field.name);
      const ours = new Map(annualGgt(rows).map((row) => [row.year, row]));
      let compared = 0;
      for (const row of rows) {
        // The first listed year has no previous year in the sheet: the authors'
        // cell refers to data outside the sheet, our engine says so explicitly.
        if (ours.get(row.year)!.nullReason === "MISSING_PREVIOUS_YEAR") {
          expect(row.year).toBe(rows[0]!.year);
          continue;
        }
        if (row.authors === null) continue;
        expect(ours.get(row.year)!.ggtPct).not.toBeNull();
        expect(ours.get(row.year)!.ggtPct!).toBeCloseTo(row.authors * 100, 9);
        compared++;
      }
      expect(compared).toBeGreaterThan(10);
    });
  }
});

describe("mean ± SEM against values printed in the paper (G1 claims)", () => {
  // The 4 printed values that arithmetic mean + sample SEM reproduces (8 others
  // reproduce with no candidate statistic; see fixtures/README.md). `from` is
  // the first GGT year; the window conventions differ between these claims.
  const reproducible = [
    { name: "NAFLD", from: 1999, to: 2005, mean: 29, sem: 3, digits: 0 },
    { name: "Proteomics", from: 2008, to: 2018, mean: 1.2, sem: 1.4, digits: 1 },
    { name: "Microplastics", from: 2005, to: 2011, mean: 4, sem: 8, digits: 0 },
    { name: "Climate Change", from: 2009, to: 2018, mean: 12, sem: 2, digits: 0 },
  ];
  for (const claim of reproducible) {
    it(`${claim.name} ${claim.from}–${claim.to}: ${claim.mean}% ± ${claim.sem}%`, () => {
      const values = annualGgt(rowsOf(claim.name)).filter((row) => row.year >= claim.from && row.year <= claim.to && row.ggtPct !== null).map((row) => row.ggtPct!);
      const summary = summarizeGgt(values);
      const round = (x: number) => Math.round(x * 10 ** claim.digits) / 10 ** claim.digits;
      expect(round(summary.meanPct!)).toBe(claim.mean);
      expect(round(summary.semPct!)).toBe(claim.sem);
    });
  }

  it("records which printed claims are not reproducible (no hidden mismatch)", () => {
    const matched = g1.claims.filter((claim) => claim.meanMatches && claim.spreadMatches.includes("sampleSEM"));
    const claimsMatched = new Set(matched.map((claim) => claim.claim));
    const all = new Set(g1.claims.map((claim) => claim.claim));
    expect(all.size).toBe(12);
    expect(claimsMatched.size).toBe(4);
  });
});

describe("hand examples (G1)", () => {
  it("clean series: annual GGT, mean, sample SD and SEM", () => {
    const { rows, annual, summary } = g1.handExamples.clean;
    const ggt = computeGgt(rows.map((row) => ({ year: row.year, count: row.unitCount, total: row.baselineCount })));
    ggt.annual.forEach((row, index) => {
      const expected = annual[index]!.ggtPct;
      if (expected === null) expect(row.ggtPct).toBeNull();
      else expect(row.ggtPct!).toBeCloseTo(expected, 10);
    });
    expect(ggt.n).toBe(summary.n);
    expect(ggt.meanPct!).toBeCloseTo(summary.meanPct!, 10);
    expect(ggt.sdPct!).toBeCloseTo(summary.sdPct!, 10);
    expect(ggt.semPct!).toBeCloseTo(summary.semPct!, 10);
  });

  it("edge cases: missing year, zero previous count, zero reference count", () => {
    const { rows, annual } = g1.handExamples.edgeCases;
    const ours = annualGgt(rows.map((row) => ({ year: row.year, count: row.unitCount, total: row.baselineCount })));
    ours.forEach((row, index) => {
      const expected = annual[index]!;
      expect(row.nullReason).toBe(expected.reason);
      if (expected.ggtPct === null) expect(row.ggtPct).toBeNull();
      else expect(row.ggtPct!).toBeCloseTo(expected.ggtPct, 10);
    });
  });
});

describe("GGT properties (P1.2 acceptance)", () => {
  it("GGT = r × (1 + g_O): r = relative change of the share, g_O = growth of the reference population", () => {
    // Deterministic pseudo-random series (no Math.random, reproducible).
    let seed = 7;
    const next = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 200; trial++) {
      const rows = Array.from({ length: 6 }, (_, i) => ({ year: 2015 + i, count: 1 + Math.floor(next() * 900), total: 1000 + Math.floor(next() * 90_000) }));
      for (const year of annualGgt(rows).slice(1)) {
        const row = rows.find((r) => r.year === year.year)!, prev = rows.find((r) => r.year === year.year - 1)!;
        const r = row.count / row.total / (prev.count / prev.total) - 1;
        const gO = row.total / prev.total - 1;
        expect(year.ggtPct!).toBeCloseTo(r * (1 + gO) * 100, 8);
      }
    }
  });

  it("the verdict depends on the share only: a different GGT never changes it", () => {
    // Same shares (1.0 … 1.4%), but B's literature doubles every year: GGT differs, verdict must not.
    const counts = (n: number[], total: number[]) => ({ topic: new Map(n.map((c, i) => [2016 + i, c])), population: new Map(total.map((c, i) => [2016 + i, c])) });
    const a = counts([10, 11, 12, 13, 14], [1000, 1000, 1000, 1000, 1000]);
    const b = counts([10, 22, 48, 104, 224], [1000, 2000, 4000, 8000, 16000]);
    const rowsA = buildShareRows(a.topic, a.population, 2016, 2020), rowsB = buildShareRows(b.topic, b.population, 2016, 2020);
    expect(rowsA.map((row) => row.sharePct)).toEqual(rowsB.map((row) => row.sharePct));
    const verdictA = classifyTrend({ ...shareTrendStatistics(rowsA), source: "openalex" });
    const verdictB = classifyTrend({ ...shareTrendStatistics(rowsB), source: "openalex" });
    expect(computeGgt(rowsB).meanPct!).toBeGreaterThan(computeGgt(rowsA).meanPct! + 1);
    expect({ ...verdictB, totalPapers: 0 }).toEqual({ ...verdictA, totalPapers: 0 });
  });

  it("has no '50 percentage points' stability constant", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../trend.ggt.ts", import.meta.url), "utf8");
    expect(source.split(/\r?\n/).filter((line) => /=\s*50\b/.test(line))).toEqual(["export const GGT_MIN_PAPERS_PER_YEAR = 50;"]);
    expect(source).toContain("GGT_MIN_PAPERS_PER_YEAR = 50");
  });
});

describe("Nelis classes and reliability conditions", () => {
  it("uses the printed strict bounds; −10…−5 and exact bounds are unclassified", () => {
    expect(ggtClass(-12)).toBe("consistent_decrease");
    expect(ggtClass(-7)).toBe("unclassified");
    expect(ggtClass(-5)).toBe("unclassified");
    expect(ggtClass(0)).toBe("no_consistent_growth");
    expect(ggtClass(5)).toBe("unclassified");
    expect(ggtClass(10)).toBe("consistent_growth");
    expect(ggtClass(20)).toBe("consistent_strong_growth");
    expect(ggtClass(51)).toBe("consistent_intense_growth");
    expect(ggtClass(90)).toBe("unsustainable_growth");
  });

  it("gives a class only when every annual GGT < 100% and every year has ≥ 50 papers", () => {
    const steady = [0, 1, 2, 3, 4].map((i) => ({ year: 2016 + i, count: 100 + i * 10, total: 10_000 + i * 100 }));
    expect(computeGgt(steady).nelisClass).toBe("consistent_growth");
    const small = steady.map((row, i) => (i === 0 ? { ...row, count: 40 } : row));
    const g = computeGgt(small);
    expect(g.conditions.atLeast50PapersEveryYear).toBe(false);
    expect(g.nelisClass).toBeNull();
    const explosive = steady.map((row, i) => (i === 4 ? { ...row, count: 400 } : row));
    expect(computeGgt(explosive).conditions.allAnnualBelow100Pct).toBe(false);
    expect(computeGgt(explosive).nelisClass).toBeNull();
  });

  it("never applies the undefined 50% stability rule; only shows year-to-year changes", () => {
    const g = computeGgt([2016, 2017, 2018, 2019].map((year, i) => ({ year, count: [100, 150, 160, 300][i]!, total: 1000 })));
    expect(g.stabilityChecked).toBe(false);
    expect(g.yearToYearChanges.map((row) => row.year)).toEqual([2018, 2019]);
    expect(g.yearToYearChanges[0]!.deltaPctPoints).toBeCloseTo(((160 - 150) / 150) * 100 - 50, 10);
  });
});
