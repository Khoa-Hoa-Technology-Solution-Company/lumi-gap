import { describe as suite, expect, it } from "vitest";
import { describe, quantile, residuals, theilSenLine } from "../trend.descriptive.js";

suite("describe", () => {
  it("computes the hand-checked statistics of [2, 4, 4, 4, 5, 5, 7, 9]", () => {
    // mean 5; deviations -3,-1,-1,-1,0,0,2,4 → Σd² = 32, Σd³ = 42, Σd⁴ = 356
    // m2 = 4, m3 = 5.25, m4 = 44.5; sorted q1 = pos 1.75 → 4, median 4.5, q3 = pos 5.25 → 5.5
    // g1 = 5.25/8 = 0.65625, G1 = 0.65625·√56/6 ≈ 0.818488
    // g2 = 44.5/16 − 3 = −0.21875, G2 = 7/30·(9·(−0.21875) + 6) = 0.940625
    const stats = describe([2, 4, 4, 4, 5, 5, 7, 9])!;
    expect(stats.n).toBe(8);
    expect(stats.mean).toBe(5);
    expect(stats.median).toBe(4.5);
    expect(stats.q1).toBe(4);
    expect(stats.q3).toBe(5.5);
    expect(stats.variance).toBeCloseTo(32 / 7, 12);
    expect(stats.standardDeviation).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(9);
    expect(stats.range).toBe(7);
    expect(stats.coefficientOfVariation).toBeCloseTo(Math.sqrt(32 / 7) / 5, 12);
    expect(stats.skewness).toBeCloseTo((0.65625 * Math.sqrt(56)) / 6, 10);
    expect(stats.skewness).toBeCloseTo(0.818488, 5);
    expect(stats.kurtosis).toBeCloseTo(0.940625, 10);
  });

  it("returns null for an empty series", () => {
    expect(describe([])).toBeNull();
  });

  it("nulls the undefined measures for a single value", () => {
    const stats = describe([3])!;
    expect(stats.n).toBe(1);
    expect(stats.mean).toBe(3);
    expect(stats.median).toBe(3);
    expect(stats.range).toBe(0);
    expect(stats.variance).toBeNull();
    expect(stats.standardDeviation).toBeNull();
    expect(stats.coefficientOfVariation).toBeNull();
    expect(stats.skewness).toBeNull();
    expect(stats.kurtosis).toBeNull();
  });

  it("has zero variance and no shape measures for a constant series", () => {
    const stats = describe([5, 5, 5, 5])!;
    expect(stats.variance).toBe(0);
    expect(stats.standardDeviation).toBe(0);
    expect(stats.skewness).toBeNull();
    expect(stats.kurtosis).toBeNull();
  });

  it("gives skewness but not kurtosis for n = 3", () => {
    // [1, 2, 6]: mean 3, d = -2,-1,3, m2 = 14/3, m3 = 18/3 = 6 → G1 = 6/(14/3)^1.5·√6/1
    const stats = describe([1, 2, 6])!;
    const expected = (6 / Math.pow(14 / 3, 1.5)) * Math.sqrt(6);
    expect(stats.skewness).toBeCloseTo(expected, 10);
    expect(stats.kurtosis).toBeNull();
  });

  it("returns a null coefficient of variation when the mean is 0", () => {
    const stats = describe([-1, 0, 1])!;
    expect(stats.mean).toBe(0);
    expect(stats.variance).toBe(1);
    expect(stats.coefficientOfVariation).toBeNull();
  });

  it("does not mutate its input", () => {
    const input = [9, 1, 5, 3];
    describe(input);
    expect(input).toEqual([9, 1, 5, 3]);
  });
});

suite("quantile", () => {
  it("interpolates linearly between order statistics (type 7)", () => {
    // n = 4: positions 0, 0.75, 1.5, 3 → 1, 1.75, 2.5, 4
    const sorted = [1, 2, 3, 4];
    expect(quantile(sorted, 0)).toBe(1);
    expect(quantile(sorted, 0.25)).toBeCloseTo(1.75, 12);
    expect(quantile(sorted, 0.5)).toBeCloseTo(2.5, 12);
    expect(quantile(sorted, 1)).toBe(4);
  });
});

suite("theilSenLine", () => {
  const line = (xs: number[]) => xs.map((x) => ({ x, y: 2 * x + 1 }));

  it("recovers a perfect line with zero residuals", () => {
    const points = line([0, 1, 2, 3, 4, 5]);
    const fit = theilSenLine(points)!;
    expect(fit.slope).toBeCloseTo(2, 12);
    expect(fit.intercept).toBeCloseTo(1, 12);
    for (const row of residuals(points, fit)) expect(row.residual).toBeCloseTo(0, 12);
  });

  it("keeps the slope of the line despite one large outlier", () => {
    // 10 points on y = 2x + 1; 36 of 45 pairwise slopes avoid the outlier and equal 2, so the median is 2.
    const points = line([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    points[9] = { x: 9, y: 500 };
    const fit = theilSenLine(points)!;
    expect(fit.slope).toBeCloseTo(2, 12);
    expect(fit.intercept).toBeCloseTo(1, 12);
  });

  it("returns null with fewer than 2 distinct x", () => {
    expect(theilSenLine([])).toBeNull();
    expect(theilSenLine([{ x: 1, y: 1 }])).toBeNull();
    expect(theilSenLine([{ x: 1, y: 1 }, { x: 1, y: 3 }])).toBeNull();
  });
});

suite("residuals", () => {
  it("keeps input order and computes residual = y − fitted", () => {
    const points = [
      { x: 3, y: 10 },
      { x: 1, y: 2 },
      { x: 2, y: 4 },
    ];
    const rows = residuals(points, { slope: 2, intercept: 1 });
    // fitted: 7, 3, 5 → residuals 3, −1, −1
    expect(rows.map((r) => r.x)).toEqual([3, 1, 2]);
    expect(rows.map((r) => r.fitted)).toEqual([7, 3, 5]);
    expect(rows.map((r) => r.residual)).toEqual([3, -1, -1]);
  });
});
