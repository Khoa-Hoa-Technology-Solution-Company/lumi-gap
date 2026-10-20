/**
 * Thresholds shown on the trend documentation. They mirror the exported
 * constants of apps/backend/src/modules/trends/trend.verdict.ts and
 * trend.statistics.ts (SIGNIFICANCE_LEVEL, MIN_YEARS, MIN_PAPERS,
 * HIGH_CONFIDENCE_P, HIGH_CONFIDENCE_MIN_YEARS); change both together.
 * Spec: docs/superpowers/specs/2026-10-16-trend-methodology-design.md §4.
 */
export const TREND_DOC_CONSTANTS = {
  /** α, conventional significance level (published standard). */
  alpha: 0.05,
  /** Smallest n for which Mann–Kendall can reach p < 0.05 (derived). */
  minYears: 5,
  /** Project convention. */
  minPapers: 30,
  /** Project convention for "high" confidence. */
  highConfidenceP: 0.01,
  /** Project convention for "high" confidence. */
  highConfidenceMinYears: 8,
  /** Default analysis window in years. */
  defaultWindowYears: 10,
  /** Range of candidate topics on the overview (first OpenAlex group_by page). */
  overviewCandidatesMin: 30,
  overviewCandidatesMax: 200,
} as const;

/** Format a number with a decimal comma (vi) or point (en). */
export function formatDocNumber(value: number, language: "vi" | "en"): string {
  const text = String(value);
  return language === "vi" ? text.replace(".", ",") : text;
}
