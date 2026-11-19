/**
 * Emerging keyword signals (spec 2026-11-14 §7.3). Pure functions, no I/O.
 *
 * A keyword is an emerging signal when, inside the scope, it is
 *   - large enough: at least EMERGING_MIN_PAPERS papers in the recent period R
 *     (the last EMERGING_RECENT_YEARS complete years; project convention);
 *   - new: at least NOVELTY_SHARE of its papers of the whole window
 *     (EMERGING_WINDOW_YEARS complete years) fall in R — the "radical novelty"
 *     attribute of Rotolo, Hicks & Martin (2015), Research Policy 44(10):1827–1843,
 *     doi:10.1016/j.respol.2015.06.006;
 *   - growing fast: the 2×2 log odds ratio of R against the earlier years E of
 *     the window has z > 0 and a Benjamini–Hochberg q-value below the
 *     significance level (Woolf 1955; Haldane 1956), the growth criterion of
 *     Small, Boyack & Klavans (2014), Research Policy 43(8):1450–1467,
 *     doi:10.1016/j.respol.2014.02.005.
 *
 * It is an early signal on keywords, not a verdict on topics, and not a
 * forecast: nothing says the keyword will keep growing.
 */
import type { TrendTermShift } from "@trend/shared-types";
import { keywordShifts } from "./trend.keywords.js";
import { SIGNIFICANCE_LEVEL } from "./trend.statistics.js";

/** Length of the recent period R, complete years. */
export const EMERGING_RECENT_YEARS = 3;
/** Length of the whole window E + R, complete years. */
export const EMERGING_WINDOW_YEARS = 10;
/** Minimum papers of the keyword in R (project convention, calibrated with eval:trends). */
export const EMERGING_MIN_PAPERS = 20;
/** Minimum share of the keyword's window papers that fall in R (project convention after Rotolo et al. 2015). */
export const NOVELTY_SHARE = 0.7;
/** Candidates: the most frequent keywords of R (one OpenAlex group_by page). A new keyword is by definition rare in E, so E's ranking adds none. */
export const EMERGING_CANDIDATES = 200;

export interface EmergingThresholds {
  minRecentPapers: number;
  noveltyShare: number;
  significanceLevel: number;
}

export const EMERGING_THRESHOLDS: EmergingThresholds = {
  minRecentPapers: EMERGING_MIN_PAPERS,
  noveltyShare: NOVELTY_SHARE,
  significanceLevel: SIGNIFICANCE_LEVEL,
};

/** Earlier years E and recent years R, ending at the last complete year. */
export function emergingPeriods(lastCompleteYear: number): { earlier: number[]; recent: number[] } {
  const first = lastCompleteYear - EMERGING_WINDOW_YEARS + 1;
  const years = Array.from({ length: EMERGING_WINDOW_YEARS }, (_, index) => first + index);
  return { earlier: years.slice(0, EMERGING_WINDOW_YEARS - EMERGING_RECENT_YEARS), recent: years.slice(-EMERGING_RECENT_YEARS) };
}

export interface EmergingCandidate extends TrendTermShift {
  /** papersB / (papersA + papersB): share of the keyword's window papers in R. */
  noveltyShare: number;
}

/**
 * Tests every candidate keyword (papersA = papers in E, papersB = papers in R)
 * against the totals of each period, with BH across all of them, and returns
 * the ones meeting the three criteria, largest log odds ratio first. `termsTested` is the
 * number of keywords the BH correction ran over.
 */
export function selectEmerging(
  rows: Array<{ term: string; papersA: number; papersB: number }>,
  totalEarlier: number,
  totalRecent: number,
  thresholds: EmergingThresholds = EMERGING_THRESHOLDS,
): { termsTested: number; keywords: EmergingCandidate[] } {
  const shifts = keywordShifts(rows, totalEarlier, totalRecent);
  const keywords = shifts
    .map((shift) => ({ ...shift, noveltyShare: shift.papersA + shift.papersB > 0 ? shift.papersB / (shift.papersA + shift.papersB) : 0 }))
    .filter(
      (shift) =>
        shift.papersB >= thresholds.minRecentPapers &&
        shift.noveltyShare >= thresholds.noveltyShare &&
        shift.z > 0 &&
        shift.qValue < thresholds.significanceLevel,
    )
    // Effect size first: z grows with the keyword's volume, so ordering by z would put the large keywords above the newest ones.
    .sort((a, b) => b.logOddsRatio - a.logOddsRatio || b.z - a.z || a.term.localeCompare(b.term));
  return { termsTested: shifts.length, keywords };
}
