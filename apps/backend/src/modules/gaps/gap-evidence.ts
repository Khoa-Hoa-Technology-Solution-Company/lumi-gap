/** Pure gap-evidence scoring. No I/O — the service supplies the counts/trend. */
import type { GapGlobalEvidence, YearlyCount } from "@trend/shared-types";
import { cagrPct, linearSlope, yoyGrowthPct } from "../trends/trend.formulas.js";

export interface GapEvidenceInput {
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  /** The more-active parent topic is growing (see parentGrowth). */
  parentRising: boolean;
  /** OpenAlex counts for the same probe. Absent/null = unavailable: the corpus alone decides, as before. */
  globalEvidence?: GapGlobalEvidence | null;
}

export interface GapThresholds {
  scarceAbs: number;
  scarcePct: number;
  /** Growth % above which a parent topic counts as rising; applied by parentGrowth, not by computeGapEvidence. */
  parentRisingMin: number;
  /** Each parent topic needs at least this many papers before the gap can be confirmed. */
  minParentPapers: number;
}

export interface GapEvidence {
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  scarcityScore: number; // 0..1 — higher = scarcer
  confirmed: boolean; // scarce AND a parent rising AND enough papers per parent AND not common in OpenAlex
  lowSample: boolean; // a parent topic has fewer than minParentPapers papers
  /** The intersection is also scarce in OpenAlex; null when OpenAlex counts are unavailable. */
  globalScarce: boolean | null;
  evidenceConfidence: number; // 0..1
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Largest intersection still called scarce: the larger of the absolute floor and a fraction of the smaller parent,
 * but never above a quarter of that parent. Without the cap a small corpus makes "scarce" cover most of the topic.
 */
export function scarcityCeiling(minParent: number, t: Pick<GapThresholds, "scarceAbs" | "scarcePct">): number {
  return Math.max(1, Math.min(Math.max(t.scarceAbs, Math.floor(t.scarcePct * minParent)), Math.floor(minParent / 4)));
}

/** Trend of a parent topic over complete years: CAGR when defined, otherwise the slope decides (growth from a zero base). */
export function parentGrowth(series: YearlyCount[], risingMin: number): { growthRatePct: number; cagrPct: number | null; slope: number; rising: boolean } {
  const cagr = cagrPct(series), slope = linearSlope(series);
  return { growthRatePct: cagr ?? yoyGrowthPct(series), cagrPct: cagr, slope, rising: cagr !== null ? cagr > risingMin : slope > 0 };
}

export function computeGapEvidence(input: GapEvidenceInput, t: GapThresholds): GapEvidence {
  const minParent = Math.min(input.parentCounts.a, input.parentCounts.b);
  // A parent topic with no papers means the corpus cannot speak to this gap at all;
  // an empty intersection then is missing data, not evidence of scarcity.
  if (minParent === 0) {
    return { intersectionCount: input.intersectionCount, parentCounts: input.parentCounts, scarcityScore: 0, confirmed: false, lowSample: true, globalScarce: null, evidenceConfidence: 0 };
  }
  const ceiling = scarcityCeiling(minParent, t);
  const scarcityScore = clamp01(1 - input.intersectionCount / ceiling);
  const scarce = input.intersectionCount <= ceiling;
  // With a handful of papers an empty intersection and "0 -> 1 paper" growth are noise, not evidence.
  const lowSample = minParent < t.minParentPapers;
  // The local corpus is a sample of the literature: a gap also has to be scarce in OpenAlex, when we could ask it.
  const global = input.globalEvidence ?? null;
  const globalMin = global ? Math.min(global.parentCounts.a, global.parentCounts.b) : 0;
  const globalScarce = global ? globalMin > 0 && global.intersectionCount <= scarcityCeiling(globalMin, t) : null;
  const confirmed = scarce && input.parentRising && !lowSample && globalScarce !== false;
  // Confirmed gaps anchor at 0.5 and scale with scarcity; unconfirmed stay low.
  const evidenceConfidence = confirmed
    ? clamp01(0.5 + 0.5 * scarcityScore)
    : clamp01(0.25 * scarcityScore);
  return {
    intersectionCount: input.intersectionCount,
    parentCounts: input.parentCounts,
    scarcityScore: round2(scarcityScore),
    confirmed,
    lowSample,
    globalScarce,
    evidenceConfidence: round2(evidenceConfidence),
  };
}

export interface YearRange { yearFrom?: number; yearTo?: number }

/**
 * Year window used to count a probe: the intersection of the window the user chose and the one the LLM put in the probe.
 * An empty intersection falls back to the user's window (what they asked for) and is flagged as a conflict.
 */
export function resolveProbeYears(user: YearRange, probe: YearRange): YearRange & { conflict: boolean } {
  const from = [user.yearFrom, probe.yearFrom].filter((v): v is number => v !== undefined);
  const to = [user.yearTo, probe.yearTo].filter((v): v is number => v !== undefined);
  const yearFrom = from.length ? Math.max(...from) : undefined, yearTo = to.length ? Math.min(...to) : undefined;
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) return { yearFrom: user.yearFrom, yearTo: user.yearTo, conflict: true };
  return { yearFrom, yearTo, conflict: false };
}
