import { KEYWORD_SHIFT_MIN_PAPERS, type RisingKeyword, type TrendDataSource, type TrendScopeNotice } from "@trend/shared-types";
import { formatNumber } from "@/utils";

export type KeywordShift = NonNullable<RisingKeyword["shift"]>;
export type IgnoredFilter = TrendScopeNotice["ignoredFilters"][number];

/** Benjamini–Hochberg q threshold used to call a keyword shift significant. */
export const SHIFT_SIGNIFICANCE_LEVEL = 0.05;

/** A keyword is a significant riser when the shift is positive, q < 0.05 and
 *  the later period has at least KEYWORD_SHIFT_MIN_PAPERS papers carrying it
 *  (same rule as the backend's rankKeywordShifts). */
export function isShiftSignificant(shift: KeywordShift): boolean {
  return shift.z > 0 && shift.qValue < SHIFT_SIGNIFICANCE_LEVEL && shift.papersB >= KEYWORD_SHIFT_MIN_PAPERS;
}

export function formatQValue(q: number): string {
  return q < 0.001 ? "q < 0.001" : `q = ${q.toFixed(3)}`;
}

/** "A → B" paper counts of the two compared periods. */
export function formatShiftCounts(shift: KeywordShift): string {
  return `${formatNumber(shift.papersA)} → ${formatNumber(shift.papersB)}`;
}

export function formatShiftStats(shift: KeywordShift): string {
  return `log OR = ${shift.logOddsRatio.toFixed(2)}, ${formatQValue(shift.qValue)}`;
}

export function formatShiftPeriods(shift: KeywordShift): string {
  const { periodA, periodB } = shift;
  return `${periodA.yearFrom}–${periodA.yearTo} → ${periodB.yearFrom}–${periodB.yearTo}`;
}

const FILTER_LABELS: Record<string, string> = {
  providers: "Providers",
  sources: "Top Sources",
  languages: "Languages",
  paperKinds: "Paper Types",
  openAccessStatuses: "Open Access",
  citationBands: "Citation Bands",
};

/** English label of a Data Scope filter key reported in scopeNotice; unknown
 *  keys are shown as the backend sent them. */
export function ignoredFilterLabel(filter: string): string {
  return FILTER_LABELS[filter] ?? filter;
}

export function isOpenAlexSource(source: TrendDataSource | undefined): boolean {
  return source === "openalex";
}
