import { describe, expect, it } from "vitest";
import {
  benjaminiHochberg,
  logOddsRatio2x2,
  mannKendall,
  normalCdf,
  normalQuantile,
  senSlope,
  senSlopeCi95,
} from "../trend.statistics.js";

// Reference values were produced with statsmodels 0.15, scipy 1.17 and
// pymannkendall on the same inputs.
const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
const counts = [3, 5, 4, 8, 9, 12, 15, 14, 21, 25];
const totals = [400, 420, 450, 470, 500, 540, 560, 600, 640, 700];

describe("mannKendall", () => {
  it("matches pymannkendall without ties", () => {
    const result = mannKendall(counts.map((c, i) => c / totals[i]!))!;
    expect(result.s).toBe(41);
    expect(result.variance).toBe(125);
    expect(result.z).toBeCloseTo(3.5777087639996634, 10);
    expect(result.pValue).toBeCloseTo(0.00034661935113455833, 6);
    expect(result.tau).toBeCloseTo(0.9111111111111111, 10);
  });

  it("applies the tie correction", () => {
    const result = mannKendall([0, 0, 1, 2, 2, 2, 3, 5, 4, 6])!;
    expect(result.s).toBe(39);
    expect(result.variance).toBeCloseTo(120.33333333333333, 10);
    expect(result.z).toBeCloseTo(3.464101615137755, 10);
    expect(result.pValue).toBeCloseTo(0.0005320055051392103, 6);
  });

  it("returns null for a constant or too-short series", () => {
    expect(mannKendall([1, 2])).toBeNull();
    expect(mannKendall([3, 3, 3, 3])).toBeNull();
  });
});

describe("senSlope", () => {
  it("matches pymannkendall", () => {
    const points = counts.map((c, i) => ({ x: years[i]!, y: c / totals[i]! }));
    expect(senSlope(points)).toBeCloseTo(0.0031155015197568384, 12);
  });

  it("ignores a single outlier", () => {
    expect(senSlope([0, 1, 2, 3, 4].map((x) => ({ x, y: x === 2 ? 100 : 2 * x })))).toBe(2);
  });
});

describe("senSlopeCi95 (Helsel et al. 2020; Gilbert 1987)", () => {
  // Worked by hand. y = 0, 1, 3, 2, 6, 7 at x = 1..6 (no ties).
  // The 15 pairwise slopes, ascending:
  //   -1, 0.5, 0.6667, 1, 1, 1.3333, 1.4, 1.5, 1.5, 1.5, 1.5, 1.6667, 2, 2.5, 4
  // Var(S) = 6·5·17/18 = 28.3333, C = 1.959964·√28.3333 = 10.432703
  // M1 = (15 − C)/2 = 2.283649 → between the 2nd (0.5) and 3rd (0.6667) slope:
  //   0.5 + 0.283649·(1/6) = 0.547275
  // M2 + 1 = (15 + C)/2 + 1 = 13.716351 → between the 13th (2) and 14th (2.5):
  //   2 + 0.716351·0.5 = 2.358176
  const points = [0, 1, 3, 2, 6, 7].map((y, i) => ({ x: i + 1, y }));

  it("matches the hand computation, with interpolation between ranks", () => {
    expect(senSlope(points)).toBe(1.5);
    const ci = senSlopeCi95(points)!;
    expect(ci[0]).toBeCloseTo(0.547275, 5);
    expect(ci[1]).toBeCloseTo(2.358176, 5);
  });

  it("does not depend on the input order", () => {
    expect(senSlopeCi95([...points].reverse())).toEqual(senSlopeCi95(points));
  });

  it("contains Sen's slope and widens with a larger confidence level", () => {
    const series = counts.map((c, i) => ({ x: years[i]!, y: (c / totals[i]!) * 100 }));
    const ci95 = senSlopeCi95(series)!;
    const ci99 = senSlopeCi95(series, 0.01)!;
    const slope = senSlope(series)!;
    expect(ci95[0]).toBeLessThanOrEqual(slope);
    expect(ci95[1]).toBeGreaterThanOrEqual(slope);
    expect(ci99[0]).toBeLessThanOrEqual(ci95[0]);
    expect(ci99[1]).toBeGreaterThanOrEqual(ci95[1]);
  });

  it("returns null when it cannot be computed", () => {
    // n = 4: C = 1.96·√8.667 = 5.77 > N' − 2 = 4, so M1 < 1.
    expect(senSlopeCi95([1, 2, 3, 4].map((y, i) => ({ x: i, y })))).toBeNull();
    expect(senSlopeCi95([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
    expect(senSlopeCi95([5, 5, 5, 5, 5, 5].map((y, i) => ({ x: i, y })))).toBeNull();
  });
});

describe("benjaminiHochberg", () => {
  it("matches statsmodels fdr_bh and keeps nulls", () => {
    const q = benjaminiHochberg([0.01, 0.04, null, 0.03, 0.005, 0.2]);
    expect(q[0]).toBeCloseTo(0.025, 12);
    expect(q[1]).toBeCloseTo(0.05, 12);
    expect(q[2]).toBeNull();
    expect(q[3]).toBeCloseTo(0.05, 12);
    expect(q[4]).toBeCloseTo(0.025, 12);
    expect(q[5]).toBeCloseTo(0.2, 12);
  });
});

describe("logOddsRatio2x2 (Woolf 1955, Haldane 1956)", () => {
  it("matches statsmodels Table2x2 with 0.5 added to every cell", () => {
    const r = logOddsRatio2x2({ withB: 119, totalB: 874, withA: 22, totalA: 163 })!;
    expect(r.logOddsRatio).toBeCloseTo(-0.005279002468310701, 10);
    expect(r.standardError).toBeCloseTo(0.24739322914686226, 10);
    expect(r.z).toBeCloseTo(-0.021338508278967, 8);
    expect(r.pValue).toBeCloseTo(0.9829756256603381, 6);
  });

  it("stays finite with a zero cell", () => {
    const r = logOddsRatio2x2({ withB: 0, totalB: 500, withA: 7, totalA: 300 })!;
    expect(r.logOddsRatio).toBeCloseTo(-3.241780160589334, 10);
    expect(r.standardError).toBeCloseTo(1.4624426451512171, 10);
    expect(r.pValue).toBeCloseTo(0.026644368009938062, 6);
  });

  it("rejects impossible tables", () => {
    expect(logOddsRatio2x2({ withB: 5, totalB: 4, withA: 1, totalA: 10 })).toBeNull();
    expect(logOddsRatio2x2({ withB: 0, totalB: 0, withA: 1, totalA: 10 })).toBeNull();
  });
});

describe("distribution helpers", () => {
  it("match scipy", () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 6);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 5);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 8);
  });
});
