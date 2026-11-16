import type {
  RecommendedTrendComparison,
  TrendClassification,
  TrendConfidence,
  TrendDataSource,
  TrendReasonCode,
  TrendVerdict,
  TrendingTopic,
} from "@trend/shared-types";
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

/** W: complete years the verdict is tested over by default (project convention). */
export const FULL_WINDOW_YEARS = 15;
/** R: last complete years of W in which a plateau is looked for (project convention). */
export const RECENT_WINDOW_YEARS = 5;
/** Years at the end of W whose median is compared with the peak. */
export const PEAK_TAIL_YEARS = 3;
/** Saturated needs |r_R| below this, % per year. Project convention, calibrated with `eval:trends` on 2026-11-14. */
export const FLAT_PCT = 2;
/** Saturated needs peakRatio at or above this. Project convention, calibrated with `eval:trends` on 2026-11-14. */
export const NEAR_PEAK = 0.85;
/** Past peak needs peakRatio below this: the share ends under half of its peak. Project convention (2026-11-14). */
export const PAST_PEAK = 0.5;
/** Saturated and past peak need a window long enough to hold a rise and what came after it (project convention). */
export const LIFECYCLE_MIN_YEARS = 10;

/** The thresholds that split a significant increase into rising, saturated and past peak. */
export interface LifecycleThresholds {
  flatPct: number;
  nearPeak: number;
  pastPeak: number;
}
export const LIFECYCLE_THRESHOLDS: LifecycleThresholds = { flatPct: FLAT_PCT, nearPeak: NEAR_PEAK, pastPeak: PAST_PEAK };

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
  recentRelativeChangePct: number | null;
  peakRatio: number | null;
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
    mannKendall: mk ? { s: mk.s, z: mk.z, tau: mk.tau, pValue: mk.pValue } : null,
    senSlope: slope,
    senSlopeCi95: senSlopeCi95(points),
    relativeChangePct: slope !== null && typicalShare !== null && typicalShare > 0 ? (slope / typicalShare) * 100 : null,
    ...plateauStatistics(sorted),
  };
}

/** The two numbers that tell a plateau from a rise (spec 2026-11-14 §5.2). */
export interface PlateauStatistics {
  /** r_R = Sen's slope over R / median(share over R) · 100, % per year. Null with fewer than 2 years or a zero median. */
  recentRelativeChangePct: number | null;
  /** median(share of the last PEAK_TAIL_YEARS years) / max(share over W). Null when the share is always 0. */
  peakRatio: number | null;
}

export function plateauStatistics(series: ShareYear[]): PlateauStatistics {
  const sorted = [...series].sort((a, b) => a.year - b.year);
  const recent = sorted.slice(-RECENT_WINDOW_YEARS);
  const recentSlope = senSlope(recent.map((row) => ({ x: row.year, y: row.sharePct })));
  const recentTypical = median(recent.map((row) => row.sharePct));
  const peak = sorted.length ? Math.max(...sorted.map((row) => row.sharePct)) : 0;
  const tail = median(sorted.slice(-PEAK_TAIL_YEARS).map((row) => row.sharePct));
  return {
    recentRelativeChangePct: recentSlope !== null && recentTypical !== null && recentTypical > 0 ? (recentSlope / recentTypical) * 100 : null,
    peakRatio: tail !== null && peak > 0 ? tail / peak : null,
  };
}

/**
 * Verdict per spec 2026-11-14 §5.3, rows checked in order:
 *   1. source = "local"                         → insufficient (LOCAL_CORPUS)
 *   2. n < MIN_YEARS                            → insufficient (TOO_FEW_YEARS)
 *   3. totalPapers < MIN_PAPERS                 → insufficient (TOO_FEW_PAPERS)
 *   4. p* < α, S > 0, n ≥ 10, peakRatio < PAST_PEAK
 *                                               → past_peak (DECLINE_AFTER_PEAK)
 *   5. p* < α, S > 0, n ≥ 10, |r_R| < FLAT_PCT, peakRatio ≥ NEAR_PEAK
 *                                               → saturated (PLATEAU_AFTER_INCREASE)
 *   6. p* < α and S > 0                         → rising (SIGNIFICANT_INCREASE)
 *   7. p* < α and S < 0                         → declining (SIGNIFICANT_DECREASE)
 *   8. otherwise                                → stable (NO_SIGNIFICANT_TREND)
 * p* is the BH q-value when given (overview), else the Mann–Kendall p-value.
 * Confidence (rows 4–7): high when p* < 0.01 and n ≥ 8, else medium.
 *
 * Rows 4 and 5 only relabel a significant increase: Mann–Kendall tests a
 * monotonic trend over the whole window, so a share that rose and then fell
 * back (row 4) or levelled off (row 5) still tests as an increase.
 *
 * An insufficient verdict lists every failed data gate (1–3), not only the
 * first, so the UI can say all of them; the verdict itself is the same.
 * The numbers are always filled, even when the verdict is insufficient.
 */
export function classifyTrend(
  input: ShareTrendStatistics & { source: TrendDataSource; qValue?: number | null },
  thresholds: LifecycleThresholds = LIFECYCLE_THRESHOLDS,
): TrendClassification {
  const qValue = input.qValue ?? null;
  const base = {
    yearsUsed: input.yearsUsed,
    totalPapers: input.totalPapers,
    mannKendall: input.mannKendall,
    qValue,
    senSlope: input.senSlope,
    senSlopeCi95: input.senSlopeCi95,
    relativeChangePct: input.relativeChangePct,
    recentRelativeChangePct: input.recentRelativeChangePct,
    peakRatio: input.peakRatio,
  };

  const gates: TrendReasonCode[] = [];
  if (input.source === "local") gates.push("LOCAL_CORPUS");
  if (input.yearsUsed < MIN_YEARS) gates.push("TOO_FEW_YEARS");
  if (input.totalPapers < MIN_PAPERS) gates.push("TOO_FEW_PAPERS");
  if (gates.length > 0) return { ...base, verdict: "insufficient", confidence: null, reasons: gates };

  const mk = input.mannKendall;
  const pStar = qValue ?? mk?.pValue ?? null;
  if (!mk || pStar === null || pStar >= SIGNIFICANCE_LEVEL || mk.s === 0) {
    return { ...base, verdict: "stable", confidence: null, reasons: ["NO_SIGNIFICANT_TREND"] };
  }
  const confidence: TrendConfidence = pStar < HIGH_CONFIDENCE_P && input.yearsUsed >= HIGH_CONFIDENCE_MIN_YEARS ? "high" : "medium";
  if (mk.s < 0) return { ...base, verdict: "declining", confidence, reasons: ["SIGNIFICANT_DECREASE"] };

  const { recentRelativeChangePct: recent, peakRatio } = input;
  if (input.yearsUsed >= LIFECYCLE_MIN_YEARS && peakRatio !== null) {
    if (peakRatio < thresholds.pastPeak) return { ...base, verdict: "past_peak", confidence, reasons: ["DECLINE_AFTER_PEAK"] };
    if (recent !== null && Math.abs(recent) < thresholds.flatPct && peakRatio >= thresholds.nearPeak) {
      return { ...base, verdict: "saturated", confidence, reasons: ["PLATEAU_AFTER_INCREASE"] };
    }
  }
  return { ...base, verdict: "rising", confidence, reasons: ["SIGNIFICANT_INCREASE"] };
}

const VERDICT_ORDER: Record<TrendVerdict, number> = { rising: 0, saturated: 1, stable: 2, past_peak: 3, declining: 4, insufficient: 5 };

/**
 * Overview order for sortBy = "trend" (spec 2026-11-14 §5.5): rising → saturated
 * → stable → past_peak → declining → insufficient; rising by relativeChangePct
 * descending, declining by relativeChangePct ascending (steepest fall first),
 * the others by totalPapers descending. relativeChangePct is relative to the
 * topic's own share, so a small topic rising fast ranks above a large one rising slowly. Ties fall back to totalPapers, then the topic name.
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

/**
 * The requested page of the sorted tested topics: only `verdict` when given,
 * `limit` topics from `offset`. `matchedTopicCount` counts the topics of that
 * verdict (all tested topics when none), so the page can say "x of N".
 */
export function pageTopics<T extends { classification: TrendClassification }>(
  topics: T[],
  query: { verdict?: TrendVerdict; offset: number; limit: number },
): { topics: T[]; matchedTopicCount: number } {
  const matched = query.verdict ? topics.filter((topic) => topic.classification.verdict === query.verdict) : topics;
  return { topics: matched.slice(query.offset, query.offset + query.limit), matchedTopicCount: matched.length };
}

/** Number of topics per verdict, every verdict present (0 when none). */
export function countVerdicts(topics: Array<{ classification: TrendClassification }>): Record<TrendVerdict, number> {
  const counts: Record<TrendVerdict, number> = { rising: 0, saturated: 0, past_peak: 0, declining: 0, stable: 0, insufficient: 0 };
  for (const topic of topics) counts[topic.classification.verdict]++;
  return counts;
}

/** The first (at most 3) rising topics in trend order; none when fewer than 2. */
export function buildRecommendedComparisons(topics: TrendingTopic[]): RecommendedTrendComparison[] {
  const top = [...topics].sort(compareByTrend).filter((topic) => topic.classification.verdict === "rising").slice(0, 3);
  if (top.length < 2) return [];
  return [
    {
      topics: top.map((topic) => topic.topic),
      reason: "Topics whose share of their field is rising significantly (Mann–Kendall, BH-adjusted).",
      metrics: top.map(({ topic, totalPapers, classification }) => ({ topic, totalPapers, relativeChangePct: classification.relativeChangePct })),
    },
  ];
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
