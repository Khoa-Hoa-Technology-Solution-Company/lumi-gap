import { describe, expect, it } from "vitest";
import exactNull from "./fixtures/g0-mann-kendall-exact-null.json";
import { MANN_KENDALL_EXACT_MAX_N, mannKendall, mannKendallExactPValue } from "../trend.statistics.js";
import { MIN_YEARS } from "../trend.verdict.js";

/** P(|S| ≥ |s|) from the full enumeration of all n! orderings (G0). */
function enumeratedP(n: number, s: number): number {
  const entry = exactNull[String(n) as keyof typeof exactNull];
  let tail = 0;
  for (const [key, count] of Object.entries(entry.countsByS)) if (Math.abs(Number(key)) >= Math.abs(s)) tail += count;
  return tail / entry.total;
}

/** A tie-free series of n values with Mann–Kendall statistic S = s. */
function seriesWithS(n: number, s: number): number[] {
  // Start increasing (S = max) and swap adjacent values; each swap lowers S by 2.
  const values = Array.from({ length: n }, (_, i) => i + 1);
  let current = (n * (n - 1)) / 2;
  for (let pass = 0; current > s && pass < n; pass++) {
    for (let i = 0; i < n - 1 && current > s; i++) {
      if (values[i]! < values[i + 1]!) {
        [values[i], values[i + 1]] = [values[i + 1]!, values[i]!];
        current -= 2;
      }
    }
  }
  return values;
}

describe("exact Mann–Kendall p-value (P0.7)", () => {
  it("equals the full enumeration for every n = 3…10 and every attainable S", () => {
    let checked = 0;
    for (let n = 3; n <= MANN_KENDALL_EXACT_MAX_N; n++) {
      const entry = exactNull[String(n) as keyof typeof exactNull];
      for (const key of Object.keys(entry.countsByS)) {
        const s = Number(key);
        expect(mannKendallExactPValue(n, s)).toBeCloseTo(enumeratedP(n, s), 14);
        checked++;
      }
    }
    expect(checked).toBe(Object.values(exactNull).reduce((sum, entry) => sum + Object.keys(entry.countsByS).length, 0));
  });

  it("is used by mannKendall for short tie-free series and gives way to the normal approximation otherwise", () => {
    const short = mannKendall(seriesWithS(8, 20))!;
    expect(short.s).toBe(20);
    expect(short.pValueMethod).toBe("exact");
    expect(short.pValue).toBeCloseTo(enumeratedP(8, 20), 14);

    const long = mannKendall(Array.from({ length: 12 }, (_, i) => i))!;
    expect(long.pValueMethod).toBe("normal");

    const tied = mannKendall([1, 2, 2, 3, 4, 5])!;
    expect(tied.pValueMethod).toBe("normal");
  });

  it("keeps MIN_YEARS = 5: with n = 4 even the strongest trend cannot reach p < 0.05", () => {
    expect(MIN_YEARS).toBe(5);
    expect(mannKendallExactPValue(4, 6)).toBeCloseTo(2 / 24, 14);
    expect(mannKendallExactPValue(4, 6)).toBeGreaterThan(0.05);
    expect(mannKendallExactPValue(5, 10)).toBeCloseTo(2 / 120, 14);
    expect(mannKendallExactPValue(5, 10)).toBeLessThan(0.05);
  });

  it("benchmark: 100 000 exact p-values (n = 10) stay far below the cost of enumeration", () => {
    const series = Array.from({ length: 1000 }, (_, k) => Array.from({ length: 10 }, (_, i) => Math.sin(k * 7.3 + i * 1.7) + i * 0.01 * (k % 5)));
    const start = performance.now();
    let sink = 0;
    for (let round = 0; round < 100; round++) for (const values of series) sink += mannKendall(values)!.pValue;
    const elapsed = performance.now() - start;
    expect(Number.isFinite(sink)).toBe(true);
    // One enumeration of 10! = 3 628 800 orderings per topic is what P0.7 must avoid.
    console.info(`[P0.7 benchmark] 100000 Mann–Kendall tests with exact p (n = 10): ${elapsed.toFixed(1)} ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
