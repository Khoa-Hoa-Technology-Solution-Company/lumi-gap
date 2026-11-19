import type { TrendTermShift } from "@trend/shared-types";
import { benjaminiHochberg, logOddsRatio2x2 } from "./trend.statistics.js";

/**
 * Keyword shift between two periods, shared by the OpenAlex and the local
 * overview. Pure functions, no DB or I/O.
 *
 * A keyword "rises" when the share of papers carrying it is larger in the
 * later period B than in the earlier period A: 2×2 log odds ratio (Woolf 1955;
 * Haldane 1956), p-values adjusted with Benjamini–Hochberg across every
 * keyword tested. Raw year-over-year growth of a keyword's paper count is not
 * used: it reads any jump from a tiny base as a strong signal.
 */

/** Earlier and later half of the usable years (the later half takes the middle year); null with fewer than 2 years. */
export function splitPeriods(years: number[]): { periodA: number[]; periodB: number[] } | null {
  if (years.length < 2) return null;
  const sorted = [...years].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return { periodA: sorted.slice(0, half), periodB: sorted.slice(half) };
}

/**
 * Tests every keyword (papers carrying it in A and in B against the totals of
 * each period) and returns one shift per testable keyword, in input order,
 * with its BH q-value. `totalA` / `totalB` are the papers of each period.
 */
export function keywordShifts(rows: Array<{ term: string; papersA: number; papersB: number }>, totalA: number, totalB: number): TrendTermShift[] {
  const tested = rows.flatMap((row) => {
    const result = logOddsRatio2x2({ withB: row.papersB, totalB, withA: row.papersA, totalA });
    return result ? [{ row, result }] : [];
  });
  const qValues = benjaminiHochberg(tested.map((item) => item.result.pValue));
  return tested.map(({ row, result }, index) => ({
    term: row.term,
    papersA: row.papersA,
    papersB: row.papersB,
    logOddsRatio: result.logOddsRatio,
    z: result.z,
    pValue: result.pValue,
    qValue: qValues[index] ?? 1,
  }));
}

/** The keywords that rose (z > 0), strongest first, at most `limit`. */
export function risingShifts(shifts: TrendTermShift[], limit: number): TrendTermShift[] {
  return shifts.filter((shift) => shift.z > 0).sort((a, b) => b.z - a.z || a.term.localeCompare(b.term)).slice(0, limit);
}
