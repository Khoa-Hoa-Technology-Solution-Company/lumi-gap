import { describe, expect, it } from "vitest";
import hand from "./fixtures/g0-hand-examples.json";
import recorded from "./fixtures/openalex-recorded-2026-10-21.json";
import exactNull from "./fixtures/g0-mann-kendall-exact-null.json";
import { benjaminiHochberg, logOddsRatio2x2, mannKendall, normalCdf, senSlope, senSlopeCi95 } from "../trend.statistics.js";
import { shareTrendStatistics } from "../trend.verdict.js";

/**
 * Golden dataset G0 (fixtures/README.md): reference values computed outside
 * this code base. These tests were written against the P0 starting code and
 * must keep passing; a change here is a methodology change.
 */
const { years, topicCounts, baselineCounts } = hand.series;

/** Two-sided P(|S| ≥ |s|) read from the enumerated null distribution (G0). */
function exactP(n: number, s: number): number {
  const entry = exactNull[String(n) as keyof typeof exactNull];
  let tail = 0;
  for (const [key, count] of Object.entries(entry.countsByS)) if (Math.abs(Number(key)) >= Math.abs(s)) tail += count;
  return tail / entry.total;
}
const shares = topicCounts.map((count, index) => (count / baselineCounts[index]!) * 100);
const points = years.map((year, index) => ({ x: year, y: shares[index]! }));

describe("G0 hand examples", () => {
  it("shares match the reference series", () => {
    shares.forEach((share, index) => expect(share).toBeCloseTo(hand.series.sharePct[index]!, 12));
  });

  it("Mann–Kendall statistics match", () => {
    const mk = mannKendall(shares)!;
    expect(mk.s).toBe(hand.mannKendall.s);
    expect(mk.variance).toBeCloseTo(hand.mannKendall.variance, 10);
    expect(mk.z).toBeCloseTo(hand.mannKendall.z, 10);
    expect(mk.tau).toBeCloseTo(hand.mannKendall.tau, 12);
    // normalCdf is Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7).
    expect(Math.abs(2 * (1 - normalCdf(Math.abs(mk.z))) - hand.mannKendall.pValueNormal)).toBeLessThan(1e-6);
    // P0.7: n = 7 without ties uses the exact p from the enumerated null
    // distribution, P(|S| ≥ 17 | n = 7) = 54/5040.
    expect(mk.pValueMethod).toBe("exact");
    expect(mk.pValue).toBeCloseTo(exactP(7, 17), 12);
    expect(mk.pValue).toBeCloseTo(54 / 5040, 12);
  });

  it("tied Mann–Kendall uses the tie-corrected variance", () => {
    const mk = mannKendall(hand.tiedMannKendall.values)!;
    expect(mk.s).toBe(hand.tiedMannKendall.s);
    expect(mk.variance).toBeCloseTo(hand.tiedMannKendall.variance, 10);
    expect(mk.z).toBeCloseTo(hand.tiedMannKendall.z, 10);
  });

  it("Sen's slope, its 95% CI and the relative change match", () => {
    expect(senSlope(points)).toBeCloseTo(hand.sen.slope, 12);
    const ci = senSlopeCi95(points)!;
    expect(ci[0]).toBeCloseTo(hand.sen.ci95![0]!, 6);
    expect(ci[1]).toBeCloseTo(hand.sen.ci95![1]!, 6);
    const stats = shareTrendStatistics(years.map((year, index) => ({ year, count: topicCounts[index]!, sharePct: shares[index]! })));
    expect(stats.relativeChangePct).toBeCloseTo(hand.sen.relativeChangePct, 10);
  });

  it("Benjamini–Hochberg q-values match", () => {
    const q = benjaminiHochberg(hand.bh.p);
    q.forEach((value, index) => {
      const expected = hand.bh.q[index];
      if (expected === null || expected === undefined) expect(value).toBeNull();
      else expect(value).toBeCloseTo(expected, 12);
    });
  });

  it("2×2 log odds ratio matches", () => {
    const result = logOddsRatio2x2(hand.logOdds.input)!;
    expect(result.logOddsRatio).toBeCloseTo(hand.logOdds.logOddsRatio, 12);
    expect(result.standardError).toBeCloseTo(hand.logOdds.standardError, 12);
    expect(result.z).toBeCloseTo(hand.logOdds.z, 12);
    expect(Math.abs(result.pValue - hand.logOdds.pValue)).toBeLessThan(1e-6);
  });
});

describe("G0 recorded OpenAlex facts", () => {
  it("works without a primary topic plus works with one equal the yearly total", () => {
    const split = recorded.classifiedSplitByYear;
    for (const [year, total] of Object.entries(split.total)) {
      const unknown = split.primaryTopicNull[year as keyof typeof split.primaryTopicNull];
      const known = split.primaryTopicNotNull[year as keyof typeof split.primaryTopicNotNull];
      expect(unknown + known).toBe(total);
    }
  });

  it("the first cursor page is ordered by key and starts with the unknown bucket", () => {
    const page = recorded.cursorFirstPage2024;
    expect(page.firstKeys).toEqual(["unknown", "T10001", "T10002"]);
    expect(page.unknownCount).toBe(recorded.classifiedSplitByYear.primaryTopicNull["2024"]);
  });
});
