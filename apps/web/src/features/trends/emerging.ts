import type { TrendEmergingResponse, YearlyCount } from "@trend/shared-types";
import type { TrendEmergingParams } from "./api/trends.api";

/** Pure helpers of the emerging-signals tab (spec 2026-11-14 §7.3); kept out of the components so they can be tested. */

/** Signals requested; the backend allows up to 30 (26 matched in the first real run). */
export const EMERGING_LIMIT = 30;

/** What the tab shows for a response. */
export type EmergingView = "local" | "empty" | "signals";

/** "local": the local corpus has no OpenAlex keyword counts; "empty": the method ran and found nothing. */
export function emergingView(data: TrendEmergingResponse): EmergingView {
  if (data.dataSource === "local") return "local";
  return data.keywords.length === 0 ? "empty" : "signals";
}

/** Request parameters of the tab: only the topic scope applies to keyword counts. */
export function buildEmergingParams(scope: { subfieldIds?: string[]; topicIds?: string[] }, limit = EMERGING_LIMIT): TrendEmergingParams {
  const params: TrendEmergingParams = { limit };
  if (scope.subfieldIds && scope.subfieldIds.length > 0) params.subfieldIds = scope.subfieldIds;
  if (scope.topicIds && scope.topicIds.length > 0) params.topicIds = scope.topicIds;
  return params;
}

/** Years of the earlier and the recent period together. */
export function emergingWindowYears(data: Pick<TrendEmergingResponse, "earlierPeriod" | "recentPeriod">): number {
  return data.recentPeriod.yearTo - data.earlierPeriod.yearFrom + 1;
}

export function formatPeriodYears(period: { yearFrom: number; yearTo: number }): string {
  return period.yearFrom === period.yearTo ? String(period.yearFrom) : `${period.yearFrom}–${period.yearTo}`;
}

/** 0.923 -> "92%" */
export function formatNoveltyPercent(share: number): string {
  return Number.isFinite(share) ? `${Math.round(share * 100)}%` : "—";
}

/** Natural-log odds ratio with its sign, e.g. "+3.21". */
export function formatLogOddsRatio(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
}

export function formatZ(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}

/** Cell of the q column: "< 0.001" or "0.012" (the header says q). */
export function formatQCell(q: number): string {
  if (!Number.isFinite(q)) return "—";
  return q < 0.001 ? "< 0.001" : q.toFixed(3);
}

export interface SparkBar {
  year: number;
  count: number;
  /** 0..1 of the tallest bar of the row. */
  height: number;
  /** The year is still running (after the last complete year); drawn differently. */
  partial: boolean;
}

/** Bars of the yearly breakdown, scaled to the largest count of the row; a running year is flagged. */
export function buildSparkBars(yearly: readonly YearlyCount[], lastCompleteYear: number): SparkBar[] {
  const max = yearly.reduce((acc, item) => Math.max(acc, item.count), 0);
  return yearly.map((item) => ({
    year: item.year,
    count: item.count,
    height: max > 0 ? item.count / max : 0,
    partial: item.year > lastCompleteYear,
  }));
}
