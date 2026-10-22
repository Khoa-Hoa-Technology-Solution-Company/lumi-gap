import type {
  RecommendedTrendComparison,
  TrendClassification,
  TrendConfidence,
  TrendDataSource,
  TrendReasonCode,
  TrendVerdict,
  TrendingTopic,
} from "@trend/shared-types";
import { KEYWORD_SHIFT_MIN_PAPERS } from "@trend/shared-types";
import { SIGNIFICANCE_LEVEL, mannKendall, senSlope, senSlopeCi95 } from "./trend.statistics.js";

/**
 * The trend verdict of a topic. Pure functions, no DB or I/O.
 *
 * Spec: docs/superpowers/specs/2026-10-16-trend-methodology-design.md §3–§5.
 * The verdict is decided only by the Mann–Kendall test on the yearly share
 * s_t = n_t / N_t · 100 (Helsel et al. 2020, USGS TM 4-A3); Sen's slope and its
 * 95% CI give the magnitude. Every threshold lives here; the web methodology
 * page shows these exact values, so change both together.
 */

/** α: conventional significance level (USGS and statistics in general). */
export { SIGNIFICANCE_LEVEL };
/** With n = 4 Mann–Kendall cannot reach p < 0.05 (max S = 6, Z = 1.70,
 *  p ≈ 0.089); with n = 5 it can (Z = 2.20, p ≈ 0.027). Derived, not chosen. */
export const MIN_YEARS = 5;
/** Project convention: a share built on a handful of papers is not a trend. */
export const MIN_PAPERS = 30;
/** Project convention: "high" confidence needs p* < 0.01 ... */
export const HIGH_CONFIDENCE_P = 0.01;
/** ... and a series of at least 8 years (project convention). */
export const HIGH_CONFIDENCE_MIN_YEARS = 8;

/** One complete year of a topic's share of its reference population. */
export interface ShareYear {
  year: number;
  /** Topic papers (n_t). */
  count: number;
  /** s_t = n_t / N_t · 100. */
  sharePct: number;
}

/** The numbers classifyTrend needs, computed from a share series. */
export interface ShareTrendStatistics {
  yearsUsed: number;
  totalPapers: number;
  mannKendall: TrendClassification["mannKendall"];
  senSlope: number | null;
  senSlopeCi95: [number, number] | null;
  relativeChangePct: number | null;
}

/**
 * Mann–Kendall, Sen's slope (percentage points per year), its 95% CI and the
 * relative change r = b / median(s_t) · 100 of a share series. The caller
 * passes only complete years with N_t > 0.
 */
export function shareTrendStatistics(series: ShareYear[]): ShareTrendStatistics {
  const sorted = [...series].sort((a, b) => a.year - b.year);
  const shares = sorted.map((row) => row.sharePct);
  const points = sorted.map((row) => ({ x: row.year, y: row.sharePct }));
  const mk = mannKendall(shares);
  const slope = senSlope(points);
  const typicalShare = median(shares);
  return {
    yearsUsed: sorted.length,
    totalPapers: sorted.reduce((sum, row) => sum + row.count, 0),
    mannKendall: mk ? { s: mk.s, z: mk.z, tau: mk.tau, pValue: mk.pValue, pValueMethod: mk.pValueMethod } : null,
    senSlope: slope,
    senSlopeCi95: senSlopeCi95(points),
    relativeChangePct: slope !== null && typicalShare !== null && typicalShare > 0 ? (slope / typicalShare) * 100 : null,
  };
}

/**
 * Verdict per spec §4.1, rows checked in order:
 *   1. source = "local"            → insufficient (LOCAL_CORPUS)
 *   2. n < MIN_YEARS               → insufficient (TOO_FEW_YEARS)
 *   3. totalPapers < MIN_PAPERS    → insufficient (TOO_FEW_PAPERS)
 *   4. p* < α and S > 0            → rising (SIGNIFICANT_INCREASE)
 *   5. p* < α and S < 0            → declining (SIGNIFICANT_DECREASE)
 *   6. otherwise                   → stable (NO_SIGNIFICANT_TREND)
 * p* is the BH q-value when given (overview), else the Mann–Kendall p-value.
 * Confidence (rising/declining only): high when p* < 0.01 and n ≥ 8, else medium.
 *
 * An insufficient verdict lists every failed data gate (1–3), not only the
 * first, so the UI can say all of them; the verdict itself is the same.
 * The numbers are always filled, even when the verdict is insufficient.
 */
export function classifyTrend(input: ShareTrendStatistics & { source: TrendDataSource; qValue?: number | null; qFamilySize?: number | null }): TrendClassification {
  const qValue = input.qValue ?? null;
  const base = {
    yearsUsed: input.yearsUsed,
    totalPapers: input.totalPapers,
    mannKendall: input.mannKendall,
    qValue,
    qFamilySize: qValue === null ? null : input.qFamilySize ?? null,
    senSlope: input.senSlope,
    senSlopeCi95: input.senSlopeCi95,
    relativeChangePct: input.relativeChangePct,
  };

  const gates: TrendReasonCode[] = [];
  if (input.source === "local") gates.push("LOCAL_CORPUS");
  if (input.yearsUsed < MIN_YEARS) gates.push("TOO_FEW_YEARS");
  if (input.totalPapers < MIN_PAPERS) gates.push("TOO_FEW_PAPERS");
  if (gates.length > 0) return { ...base, verdict: "insufficient", confidence: null, reasons: gates };

  const mk = input.mannKendall;
  const pStar = qValue ?? mk?.pValue ?? null;
  if (mk && pStar !== null && pStar < SIGNIFICANCE_LEVEL && mk.s !== 0) {
    const verdict: TrendVerdict = mk.s > 0 ? "rising" : "declining";
    const confidence: TrendConfidence = pStar < HIGH_CONFIDENCE_P && input.yearsUsed >= HIGH_CONFIDENCE_MIN_YEARS ? "high" : "medium";
    return { ...base, verdict, confidence, reasons: [mk.s > 0 ? "SIGNIFICANT_INCREASE" : "SIGNIFICANT_DECREASE"] };
  }
  return { ...base, verdict: "stable", confidence: null, reasons: ["NO_SIGNIFICANT_TREND"] };
}

const VERDICT_ORDER: Record<TrendVerdict, number> = { rising: 0, stable: 1, declining: 2, insufficient: 3 };

/**
 * Overview order for sortBy = "trend" (spec §5): rising → stable → declining →
 * insufficient; rising by relativeChangePct descending, declining by
 * relativeChangePct ascending (steepest fall first), stable and insufficient by
 * totalPapers descending. Ties fall back to totalPapers, then the topic name.
 */
export function compareByTrend(
  a: { topic: string; totalPapers: number; classification: TrendClassification },
  b: { topic: string; totalPapers: number; classification: TrendClassification },
): number {
  const verdictA = a.classification.verdict;
  const verdictB = b.classification.verdict;
  if (verdictA !== verdictB) return VERDICT_ORDER[verdictA] - VERDICT_ORDER[verdictB];
  if (verdictA === "rising") {
    const diff = byValue(a.classification.relativeChangePct, b.classification.relativeChangePct, "desc");
    if (diff !== 0) return diff;
  } else if (verdictA === "declining") {
    const diff = byValue(a.classification.relativeChangePct, b.classification.relativeChangePct, "asc");
    if (diff !== 0) return diff;
  }
  return b.totalPapers - a.totalPapers || a.topic.localeCompare(b.topic);
}

/** Overview order for sortBy = "total". */
export function compareByTotal(a: { topic: string; totalPapers: number }, b: { topic: string; totalPapers: number }): number {
  return b.totalPapers - a.totalPapers || a.topic.localeCompare(b.topic);
}

/** The first (at most 3) rising topics in trend order; none when fewer than 2. */
export function buildRecommendedComparisons(topics: TrendingTopic[]): RecommendedTrendComparison[] {
  const top = [...topics].sort(compareByTrend).filter((topic) => topic.classification.verdict === "rising").slice(0, 3);
  if (top.length < 2) return [];
  return [
    {
      topics: top.map((topic) => topic.topic),
      reason: "Topics whose share of their field is rising significantly (Mann–Kendall, BH-adjusted).",
      metrics: top.map(({ topic, totalPapers, growthRatePct, momentum, classification }) => ({
        topic,
        totalPapers,
        relativeChangePct: classification.relativeChangePct,
        growthRatePct,
        momentum,
      })),
    },
  ];
}

type RankableShift = { papersA: number; papersB: number; logOddsRatio: number; z: number; qValue: number };

/**
 * Orders keyword shifts by effect size (log odds ratio), not by z. z grows with
 * √N, so with OpenAlex-sized periods ranking by z put the most frequent
 * keywords first whatever their change. Supported shifts (q < α and at least
 * KEYWORD_SHIFT_MIN_PAPERS papers in the period the keyword grew into) come
 * first; the others follow, also by effect size. "rising" keeps z > 0 and sorts
 * log OR descending; "falling" keeps z < 0 and sorts it ascending.
 */
export function rankKeywordShifts<T extends RankableShift>(shifts: T[], direction: "rising" | "falling"): T[] {
  const rising = direction === "rising";
  const supported = (shift: T) =>
    shift.qValue < SIGNIFICANCE_LEVEL && (rising ? shift.papersB : shift.papersA) >= KEYWORD_SHIFT_MIN_PAPERS;
  return shifts
    .filter((shift) => (rising ? shift.z > 0 : shift.z < 0))
    .sort((a, b) => Number(supported(b)) - Number(supported(a)) || (rising ? b.logOddsRatio - a.logOddsRatio : a.logOddsRatio - b.logOddsRatio));
}

/** Comparator on a nullable number; nulls go after every number either way. */
function byValue(a: number | null, b: number | null, direction: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
