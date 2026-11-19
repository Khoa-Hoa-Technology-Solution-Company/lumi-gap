import { describe, expect, it } from "vitest";
import { MAD_CUTOFF, MAD_SCALE, madOutliers } from "../trend.outliers.js";

describe("madOutliers", () => {
  it("flags a large positive outlier", () => {
    // [1, 2, 3, 4, 100]: median 3; |x - 3| = [2, 1, 0, 1, 97] -> median 1;
    // MAD = 1.4826; score of 100 = 97 / 1.4826 ≈ 65.4256.
    const result = madOutliers([1, 2, 3, 4, 100])!;
    expect(result.median).toBe(3);
    expect(result.mad).toBeCloseTo(1.4826, 10);
    expect(result.outliers).toHaveLength(1);
    expect(result.outliers[0]!.index).toBe(4);
    expect(result.outliers[0]!.value).toBe(100);
    expect(result.outliers[0]!.score).toBeCloseTo(65.4256, 3);
  });

  it("gives a negative outlier a negative score", () => {
    // [-50, 9, 10, 11, 12]: median 10; |x - 10| = [60, 1, 0, 1, 2] -> median 1;
    // MAD = 1.4826; score of -50 = -60 / 1.4826 ≈ -40.4694.
    const result = madOutliers([-50, 9, 10, 11, 12])!;
    expect(result.median).toBe(10);
    expect(result.outliers).toHaveLength(1);
    expect(result.outliers[0]!.index).toBe(0);
    expect(result.outliers[0]!.score).toBeCloseTo(-40.4694, 3);
  });

  it("flags nothing in a regular series", () => {
    // [1..5]: median 3, MAD = 1.4826, largest |score| = 2 / 1.4826 ≈ 1.349.
    const result = madOutliers([1, 2, 3, 4, 5])!;
    expect(result.median).toBe(3);
    expect(result.mad).toBeCloseTo(1.4826, 10);
    expect(result.outliers).toEqual([]);
  });

  it("does not flag a value exactly at the cutoff", () => {
    // [1..5]: |score| of 1 and 5 is 2 / 1.4826. A cutoff of exactly that value
    // must not flag them (strict >); a cutoff just below it must.
    const exact = 2 / MAD_SCALE;
    expect(madOutliers([1, 2, 3, 4, 5], exact)!.outliers).toEqual([]);
    expect(madOutliers([1, 2, 3, 4, 5], exact - 1e-9)!.outliers).toHaveLength(2);
  });

  it("returns mad 0 and no outliers when more than half the values are identical", () => {
    // [5, 5, 5, 5, 9]: median 5, all deviations except one are 0 -> MAD 0.
    const result = madOutliers([5, 5, 5, 5, 9])!;
    expect(result.median).toBe(5);
    expect(result.mad).toBe(0);
    expect(result.outliers).toEqual([]);
  });

  it("returns null for fewer than 3 values", () => {
    expect(madOutliers([])).toBeNull();
    expect(madOutliers([1])).toBeNull();
    expect(madOutliers([1, 100])).toBeNull();
  });

  it("lets a custom cutoff change the result", () => {
    // [1..5] scores are [-1.349, -0.674, 0, 0.674, 1.349].
    expect(madOutliers([1, 2, 3, 4, 5])!.outliers).toEqual([]);
    const strict = madOutliers([1, 2, 3, 4, 5], 1)!;
    expect(strict.outliers.map((o) => o.index)).toEqual([0, 4]);
    expect(strict.outliers[0]!.score).toBeCloseTo(-1.349, 3);
    expect(strict.outliers[1]!.score).toBeCloseTo(1.349, 3);
    expect(MAD_CUTOFF).toBe(2.5);
  });

  it("does not mutate the input and returns outliers in input order", () => {
    // median 10, MAD = 1.4826; 100 and -80 are far out, 11 and 9 are not.
    const input = [100, 9, 10, 11, 10, -80, 12];
    const copy = [...input];
    const result = madOutliers(input)!;
    expect(input).toEqual(copy);
    expect(result.outliers.map((o) => o.index)).toEqual([0, 5]);
    expect(result.outliers.map((o) => o.value)).toEqual([100, -80]);
  });
});
