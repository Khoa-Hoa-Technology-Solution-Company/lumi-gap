import type { RisingKeyword, TrendClassification, TrendTopicTaxonomy, TrendVerdict } from "@trend/shared-types";
import { formatNumber } from "@/utils";
import { isShiftSignificant } from "@/features/trends/trend-source";

/** "trend" orders topics by verdict (see compareTopicsByTrend); "total" by paper count. */
export type TrendSortKey = "trend" | "total";

export const DEFAULT_TREND_SORT: TrendSortKey = "trend";

/** Reads a sort value from the URL; anything but "total" is the verdict order. */
export function parseTrendSortKey(value: string | null | undefined): TrendSortKey {
  return value === "total" ? "total" : DEFAULT_TREND_SORT;
}

/** What ranking needs from a topic. `classification` is absent on untested search candidates. */
export interface TrendSortable {
  totalPapers: number;
  classification?: TrendClassification;
}

export interface TrendTopicLike extends TrendSortable {
  topic: string;
  taxonomy?: TrendTopicTaxonomy;
  yearlyBreakdown: Array<{ year: number; count: number }>;
}

export interface RisingKeywordLike {
  keyword: string;
  totalPapers: number;
  yearlyBreakdown: Array<{ year: number; count: number }>;
  /** Log odds ratio test between the two halves of the window. */
  shift: RisingKeyword["shift"];
}

const VERDICT_ORDER: Record<TrendVerdict, number> = { rising: 0, saturated: 1, stable: 2, past_peak: 3, declining: 4, insufficient: 5 };

/** Same order as the backend (trend.verdict.ts compareByTrend): rising (largest relative change first),
 *  saturated, stable, past_peak, declining (most negative first), insufficient; ties by paper count. */
export function compareTopicsByTrend(a: TrendSortable, b: TrendSortable): number {
  const verdictA = a.classification?.verdict ?? "insufficient";
  const verdictB = b.classification?.verdict ?? "insufficient";
  if (verdictA !== verdictB) return VERDICT_ORDER[verdictA] - VERDICT_ORDER[verdictB];
  const changeA = a.classification?.relativeChangePct ?? 0;
  const changeB = b.classification?.relativeChangePct ?? 0;
  if (verdictA === "rising" && changeA !== changeB) return changeB - changeA;
  if (verdictA === "declining" && changeA !== changeB) return changeA - changeB;
  return b.totalPapers - a.totalPapers;
}

export function sortTopics<T extends TrendSortable>(topics: readonly T[], sortBy: TrendSortKey): T[] {
  const list = [...topics];
  return sortBy === "total" ? list.sort((a, b) => b.totalPapers - a.totalPapers) : list.sort(compareTopicsByTrend);
}

/** Number plotted in the top-topics chart: relative change in %/year (trend) or paper count (total). */
export function getTopicMetric(topic: TrendSortable, sortBy: TrendSortKey): number {
  if (sortBy === "total") return topic.totalPapers;
  return topic.classification?.relativeChangePct ?? 0;
}

export function formatSigned(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "-";
  if (value > 0) return `+${value.toFixed(digits)}`;
  return value.toFixed(digits);
}

/** Plain number text, the unit is added by the caller through i18n. */
export function formatMetricValue(value: number, sortBy: TrendSortKey): string {
  if (sortBy === "total") return formatNumber(Math.round(value));
  return `${formatSigned(value, 1)}%`;
}

/** The topic to focus when the user has not chosen one: the first topic in the
 *  verdict order, but only if it is actually rising. */
export function getTopRisingTopic<T extends TrendSortable>(topics: readonly T[]): T | null {
  return sortTopics(topics, "trend").find((topic) => topic.classification?.verdict === "rising") ?? null;
}

/** The keyword with the strongest significant shift (largest z, q < 0.05); when none is
 *  significant, the one with the largest z. */
export function getFastestKeyword(keywords: RisingKeywordLike[]): RisingKeywordLike | null {
  const significant = keywords.filter((keyword) => isShiftSignificant(keyword.shift));
  const pool = significant.length > 0 ? significant : keywords;
  return [...pool].sort((a, b) => b.shift.z - a.shift.z)[0] ?? null;
}

/** Default analysis window: 15 complete years plus the running one, the same as the backend
 *  (FULL_WINDOW_YEARS in trend.verdict.ts). Saturated and past-peak verdicts need at least 10 complete years. */
export const DEFAULT_TREND_YEAR_TO = new Date().getFullYear();
export const DEFAULT_TREND_YEAR_FROM = DEFAULT_TREND_YEAR_TO - 15;
