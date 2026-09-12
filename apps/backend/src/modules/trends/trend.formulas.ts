import type { YearlyCount } from "@trend/shared-types";

/**
 * Pure trend-math functions. No DB, no I/O — fully unit-testable.
 *
 * The service feeds these a yearly series (already filtered to the analysis
 * window); each function documents its edge-case conventions explicitly so the
 * numbers shown to users are reproducible by hand.
 */

/**
 * Fill gap years with count 0 and return the series sorted by year ascending.
 * `[2019:5, 2022:9]` → `[2019:5, 2020:0, 2021:0, 2022:9]`.
 * Optional bounds extend the series to cover [yearFrom..yearTo].
 */
export function fillMissingYears(
  series: YearlyCount[],
  yearFrom?: number,
  yearTo?: number,
): YearlyCount[] {
  if (series.length === 0 && (yearFrom === undefined || yearTo === undefined)) return [];

  const byYear = new Map(series.map((p) => [p.year, p.count]));
  const years = series.map((p) => p.year);
  const start = yearFrom ?? Math.min(...years);
  const end = yearTo ?? Math.max(...years);

  const filled: YearlyCount[] = [];
  for (let y = start; y <= end; y++) {
    filled.push({ year: y, count: byYear.get(y) ?? 0 });
  }
  return filled;
}

/** Drop trailing years after `lastCompleteYear` (the current, still-running
 *  calendar year must not poison growth metrics). */
export function truncateToCompleteYears(
  series: YearlyCount[],
  lastCompleteYear: number,
): YearlyCount[] {
  return series.filter((p) => p.year <= lastCompleteYear);
}

/**
 * Year-over-year growth %: last point vs the point before it.
 * Convention: denominator clamped to >= 1, so 0→5 reads as +500% instead of
 * dividing by zero. Fewer than 2 points → 0.
 */
export function yoyGrowthPct(series: YearlyCount[]): number {
  if (series.length < 2) return 0;
  const prev = series[series.length - 2]!.count;
  const curr = series[series.length - 1]!.count;
  return round1(((curr - prev) / Math.max(prev, 1)) * 100);
}

/**
 * Compound annual growth rate, %, over up to `maxYears` most recent year-steps:
 * (end/start)^(1/span) − 1. Returns null when the usable span is 0 or the
 * starting value is 0 (CAGR undefined from a zero base).
 */
export function cagrPct(series: YearlyCount[], maxYears = 3): number | null {
  if (series.length < 2) return null;
  const window = series.slice(-(maxYears + 1));
  const first = window[0]!;
  const last = window[window.length - 1]!;
  const span = last.year - first.year;
  if (span <= 0 || first.count <= 0) return null;
  return round1((Math.pow(last.count / first.count, 1 / span) - 1) * 100);
}

/**
 * Least-squares slope of count over year (papers/year). The classic
 * "is this line going up?" formula: β = Σ((x−x̄)(y−ȳ)) / Σ((x−x̄)²).
 * Fewer than 2 points → 0.
 */
export function linearSlope(series: YearlyCount[]): number {
  const n = series.length;
  if (n < 2) return 0;

  const meanX = series.reduce((s, p) => s + p.year, 0) / n;
  const meanY = series.reduce((s, p) => s + p.count, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of series) {
    num += (p.year - meanX) * (p.count - meanY);
    den += (p.year - meanX) ** 2;
  }
  return den === 0 ? 0 : round2(num / den);
}

/** Compute the full metric set for a (filled) series, excluding the current
 *  incomplete year from the math while leaving the input series untouched. */
export function computeMetrics(series: YearlyCount[], lastCompleteYear: number) {
  const complete = truncateToCompleteYears(series, lastCompleteYear);
  return {
    growthRatePct: yoyGrowthPct(complete),
    cagr3yPct: cagrPct(complete),
    momentum: linearSlope(complete),
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
