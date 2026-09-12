import type { TrendTopicTaxonomy } from "@trend/shared-types";
import { formatNumber } from "@/utils";

export type TrendSortKey = "momentum" | "growth" | "total";

export interface TrendTopicLike {
  topic: string;
  taxonomy?: TrendTopicTaxonomy;
  totalPapers: number;
  growthRatePct: number;
  momentum: number;
  yearlyBreakdown: Array<{ year: number; count: number }>;
}

export interface RisingKeywordLike {
  keyword: string;
  totalPapers: number;
  growthRatePct: number;
  yearlyBreakdown: Array<{ year: number; count: number }>;
}

export function getTopicMetric(topic: TrendTopicLike | { totalPapers: number; growthRatePct: number; momentum: number }, sortBy: TrendSortKey): number {
  if (sortBy === "growth") return topic.growthRatePct;
  if (sortBy === "total") return topic.totalPapers;
  return topic.momentum;
}

export function formatSigned(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "-";
  if (value > 0) return `+${value.toFixed(digits)}`;
  return value.toFixed(digits);
}

export function formatMetricValue(value: number, sortBy: TrendSortKey): string {
  if (sortBy === "growth") return `${formatSigned(value, 1)}%`;
  if (sortBy === "total") return `${formatNumber(Math.round(value))} papers`;
  return `${formatSigned(value, 2)} papers/year`;
}

export function getFastestTopic(topics: TrendTopicLike[]): TrendTopicLike | null {
  return [...topics].sort((a, b) => b.momentum - a.momentum)[0] ?? null;
}

export function getHighestGrowthTopic(topics: TrendTopicLike[]): TrendTopicLike | null {
  return [...topics].sort((a, b) => b.growthRatePct - a.growthRatePct)[0] ?? null;
}

export function getMostEstablishedTopic(topics: TrendTopicLike[]): TrendTopicLike | null {
  return [...topics].sort((a, b) => b.totalPapers - a.totalPapers)[0] ?? null;
}

export function getFastestKeyword(keywords: RisingKeywordLike[]): RisingKeywordLike | null {
  return [...keywords].sort((a, b) => b.growthRatePct - a.growthRatePct)[0] ?? null;
}

export function isSmallBaseKeyword(keyword: RisingKeywordLike): boolean {
  return keyword.totalPapers < 10 && keyword.growthRatePct >= 100;
}
