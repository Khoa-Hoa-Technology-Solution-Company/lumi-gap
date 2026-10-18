import type { RisingKeyword, TrendClassification, TrendTopicTaxonomy, TrendVerdict } from "@trend/shared-types";
import { formatNumber } from "@/utils";
import { isShiftSignificant } from "@/features/trends/trend-source";

/** "trend" orders topics by verdict (see compareTopicsByTrend); "total" by paper count. */
export type TrendSortKey = "trend" | "total";

export const DEFAULT_TREND_SORT: TrendSortKey = "trend";

/** Reads a sort value from the URL. The legacy "momentum" and "growth" values
 *  (raw-count rankings that no longer exist) map to "trend". */
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
  growthRatePct: number;
  yearlyBreakdown: Array<{ year: number; count: number }>;
  /** Log odds ratio test between two periods; present for OpenAlex data. */
  shift?: RisingKeyword["shift"];
}

const VERDICT_ORDER: Record<TrendVerdict, number> = { rising: 0, stable: 1, declining: 2, insufficient: 3 };

/** Spec section 5 order: rising (largest relative change first), stable,
 *  declining (most negative first), insufficient; ties by paper count. */
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

/** The keyword with the strongest significant shift (largest z, q < 0.05) when
 *  the data carries the test; otherwise the fastest growing keyword. */
export function getFastestKeyword(keywords: RisingKeywordLike[]): RisingKeywordLike | null {
  const significant = keywords.filter((keyword) => keyword.shift && isShiftSignificant(keyword.shift));
  if (significant.length > 0) {
    return [...significant].sort((a, b) => (b.shift?.z ?? 0) - (a.shift?.z ?? 0))[0] ?? null;
  }
  return [...keywords].sort((a, b) => b.growthRatePct - a.growthRatePct)[0] ?? null;
}

/** Small-base heuristic for data without the shift test (local fallback). */
export function isSmallBaseKeyword(keyword: RisingKeywordLike): boolean {
  if (keyword.shift) return false;
  return keyword.totalPapers < 10 && keyword.growthRatePct >= 100;
}

/** Default analysis window: the last ten years, the same window the topic page
 *  uses, so share tests are not stretched over decades before a topic existed. */
export const DEFAULT_TREND_YEAR_TO = new Date().getFullYear();
export const DEFAULT_TREND_YEAR_FROM = DEFAULT_TREND_YEAR_TO - 10;
