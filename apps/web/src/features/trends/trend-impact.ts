import type { YearlyCitationMetric } from "@trend/shared-types";

/** Chart metric of the trends overview timeline. `pp_top10` replaces the two
 *  citation modes when the data source reports PP(top 10%), because OpenAlex
 *  aggregate queries cannot sum citations. */
export type TrendMetricMode = "papers" | "citations_total" | "citations_avg" | "pp_top10";

/** One point of the overview timeline chart. `topCount` and `papers` are only
 *  set in the PP(top 10%) mode, for the tooltip. */
export interface TimelinePoint {
  year: string;
  value: number;
  topCount?: number;
  papers?: number;
}

/** By definition 10% of all works are in the top 10% most cited of their year,
 *  type and subfield (Waltman & Schreiber 2013), so 10% is the world average. */
export const WORLD_AVERAGE_PP_TOP10 = 10;

type CitationSeries = readonly YearlyCitationMetric[] | undefined;

export function hasPpTop10(trend: CitationSeries): boolean {
  return (trend ?? []).some((entry) => typeof entry.ppTop10Pct === "number");
}

export function hasCitationTotals(trend: CitationSeries): boolean {
  return (trend ?? []).some((entry) => typeof entry.totalCitations === "number");
}

/** Keeps the selected chart mode valid for the data at hand: PP(top 10%) when
 *  the source reports it, citation sums only when they exist. */
export function resolveMetricMode(mode: TrendMetricMode, trend: CitationSeries): TrendMetricMode {
  if (mode === "papers") return "papers";
  if (hasPpTop10(trend)) return "pp_top10";
  if (mode === "pp_top10") return hasCitationTotals(trend) ? "citations_total" : "papers";
  return hasCitationTotals(trend) ? mode : "papers";
}

/** Sum of the yearly citation totals, or null when no year has a total. */
export function sumCitations(trend: CitationSeries): number | null {
  const totals = (trend ?? []).filter((entry) => typeof entry.totalCitations === "number");
  if (totals.length === 0) return null;
  return totals.reduce((sum, entry) => sum + (entry.totalCitations ?? 0), 0);
}

/** Citations per paper over the years that have a citation total, or null. */
export function averageCitations(trend: CitationSeries): number | null {
  const totals = (trend ?? []).filter((entry) => typeof entry.totalCitations === "number");
  if (totals.length === 0) return null;
  const papers = totals.reduce((sum, entry) => sum + entry.count, 0);
  if (papers <= 0) return null;
  return totals.reduce((sum, entry) => sum + (entry.totalCitations ?? 0), 0) / papers;
}

/** PP(top 10%) over the whole series: works in the top 10% / all works · 100. */
export function aggregatePpTop10(trend: CitationSeries): number | null {
  let top = 0;
  let papers = 0;
  for (const entry of trend ?? []) {
    const topCount = typeof entry.topCitedCount === "number"
      ? entry.topCitedCount
      : typeof entry.ppTop10Pct === "number"
        ? (entry.ppTop10Pct * entry.count) / 100
        : null;
    if (topCount === null || entry.count <= 0) continue;
    top += topCount;
    papers += entry.count;
  }
  return papers > 0 ? (top / papers) * 100 : null;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}
