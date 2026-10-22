import type { TrendGgt, TrendGgtClass, TrendGgtYear } from "@trend/shared-types";

/**
 * General Growth Tendency, Nelis et al. (2022), PLOS ONE 17(5): e0268433,
 * doi:10.1371/journal.pone.0268433. Pure functions, no I/O.
 *
 *   GGT_y = [ (n_y − n_{y−1}) / n_{y−1} − (N_y − N_{y−1}) / N_{y−1} ] × 100%
 *
 * n = papers of the topic, N = papers of the reference population
 * (trend.baseline.ts). [GỐC] Eq (i); the authors' template (supplement S3)
 * computes exactly `N = C − I`. Verified against the authors' cached GGT in
 * golden dataset G1 (fixtures/g1-ggt-nelis-2022.json).
 *
 * GGT is descriptive. The trend verdict stays Mann–Kendall on the share
 * (trend.verdict.ts); nothing here changes it.
 */

/** Smallest yearly output the paper requires for a reliable GGT. [GỐC] */
export const GGT_MIN_PAPERS_PER_YEAR = 50;
/** GGT values must stay below this for a reliable reading. [GỐC] */
export const GGT_MAX_RELIABLE_PCT = 100;

export interface GgtInputRow {
  year: number;
  /** n_y */
  count: number;
  /** N_y */
  total: number;
}

/**
 * Annual GGT for every year of the series. A year needs the previous calendar
 * year in the series [QUY ƯỚC: only years inside the analysis window are used,
 * so the first year has no GGT]; null with a reason when it is missing or a
 * denominator is 0. A current reference count of 0 is "no reference data", not
 * a −100% change of the literature [QUY ƯỚC], so it is null too.
 */
export function annualGgt(rows: GgtInputRow[]): TrendGgtYear[] {
  const sorted = [...rows].sort((a, b) => a.year - b.year);
  const byYear = new Map(sorted.map((row) => [row.year, row]));
  return sorted.map((row) => {
    const previous = byYear.get(row.year - 1);
    const empty = (nullReason: TrendGgtYear["nullReason"]): TrendGgtYear => ({ year: row.year, ggtPct: null, unitGrowthPct: null, baselineGrowthPct: null, nullReason });
    if (!previous) return empty("MISSING_PREVIOUS_YEAR");
    if (previous.count === 0) return empty("ZERO_PREVIOUS_UNIT");
    if (previous.total === 0) return empty("ZERO_PREVIOUS_BASELINE");
    if (row.total === 0) return empty("ZERO_BASELINE");
    const unit = (row.count - previous.count) / previous.count;
    const baseline = (row.total - previous.total) / previous.total;
    return { year: row.year, ggtPct: (unit - baseline) * 100, unitGrowthPct: unit * 100, baselineGrowthPct: baseline * 100, nullReason: null };
  });
}

/** Arithmetic mean, sample SD (n − 1) and SEM = SD/√n of defined values. [SUY LUẬN] */
export function summarizeGgt(values: number[]): { n: number; meanPct: number | null; sdPct: number | null; semPct: number | null } {
  const n = values.length;
  if (n === 0) return { n, meanPct: null, sdPct: null, semPct: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n < 2) return { n, meanPct: mean, sdPct: null, semPct: null };
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1));
  return { n, meanPct: mean, sdPct: sd, semPct: sd / Math.sqrt(n) };
}

/**
 * Nelis classes for a consistent GGT, strict inequalities exactly as printed:
 * < −10 decrease; (−5, 5) no growth; (5, 15) growth; (15, 40) strong;
 * (40, 80) intense; > 80 unsustainable. −10 … −5 has no class in the paper and
 * values exactly on a bound are not covered either: both are "unclassified".
 */
export function ggtClass(meanPct: number): TrendGgtClass {
  if (meanPct < -10) return "consistent_decrease";
  if (meanPct > -5 && meanPct < 5) return "no_consistent_growth";
  if (meanPct > 5 && meanPct < 15) return "consistent_growth";
  if (meanPct > 15 && meanPct < 40) return "consistent_strong_growth";
  if (meanPct > 40 && meanPct < 80) return "consistent_intense_growth";
  if (meanPct > 80) return "unsustainable_growth";
  return "unclassified";
}

/**
 * Full GGT summary of a share series (rows = the years the verdict uses).
 * The class is only given when the two unambiguous conditions of the paper
 * hold (every annual GGT < 100%, at least 50 papers in every year used); the
 * paper's "< 50% year-to-year variation" is not defined, so it is never applied
 * and `stabilityChecked` is false.
 */
export function computeGgt(rows: GgtInputRow[]): TrendGgt {
  const annual = annualGgt(rows);
  const defined = annual.filter((row): row is TrendGgtYear & { ggtPct: number } => row.ggtPct !== null);
  const summary = summarizeGgt(defined.map((row) => row.ggtPct));
  const counts = rows.map((row) => row.count);
  const minUnitPapersPerYear = counts.length ? Math.min(...counts) : null;
  const allAnnualBelow100Pct = defined.length ? defined.every((row) => row.ggtPct < GGT_MAX_RELIABLE_PCT) : null;
  const atLeast50PapersEveryYear = minUnitPapersPerYear === null ? null : minUnitPapersPerYear >= GGT_MIN_PAPERS_PER_YEAR;
  const yearToYearChanges = defined.slice(1).flatMap((row, index) =>
    row.year - defined[index]!.year === 1 ? [{ year: row.year, deltaPctPoints: row.ggtPct - defined[index]!.ggtPct }] : [],
  );
  const classable = summary.meanPct !== null && allAnnualBelow100Pct === true && atLeast50PapersEveryYear === true;
  return {
    annual,
    ...summary,
    conditions: { allAnnualBelow100Pct, minUnitPapersPerYear, atLeast50PapersEveryYear },
    yearToYearChanges,
    nelisClass: classable ? ggtClass(summary.meanPct!) : null,
    stabilityChecked: false,
  };
}
