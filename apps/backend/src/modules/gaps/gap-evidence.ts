/**
 * Pure "under-explored" ranking signal for a gap probe. No I/O: the service supplies the counts.
 *
 * This is a RANKING signal, not proof that a gap is open. A low count of papers that mention both topics can come
 * from vocabulary mismatch or an unindexed corpus; the Gap Closure Protocol (docs/gap-closure-protocol.md) decides
 * whether a gap is open.
 *
 * With N papers in scope, nA and nB mentioning each topic, and nAB mentioning both:
 *   E = nA * nB / N        expected intersection if the topics were independent
 *   R = nAB / E            observed / expected
 *   p = P(X <= nAB), X ~ Poisson(E)
 * under-explored = N > 0 AND min(nA, nB) >= minParentPapers AND R <= maxRatio AND p <= alpha / k (Bonferroni, k probes).
 *
 * OpenAlex veto: when the same counts from OpenAlex (the whole literature) come with their own N, the test is repeated
 * on them. If OpenAlex has enough papers per topic and does NOT find the intersection under-explored, the local signal
 * is overruled: a pair that looks rare in a small corpus is often well studied elsewhere. Without OpenAlex counts (or
 * without their N, as in rows saved before it was recorded) the local signal stands.
 */
import type { GapGlobalEvidence, YearlyCount } from "@trend/shared-types";
import { cagrPct, linearSlope, yoyGrowthPct } from "../trends/trend.formulas.js";

export interface GapEvidenceInput {
  /** N: active papers in the scope the counts were taken over. */
  evidenceScopeSize: number;
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  /** k: number of probes tested together (Bonferroni family size); values below 1 count as 1. */
  probeCount?: number;
  /** Legacy/context field accepted for callers that persist it; the O/E signal does not use parent growth. */
  parentRising?: boolean;
  /** OpenAlex counts of the same probe; with their scopeSize they can overrule the local signal (see above). */
  globalEvidence?: GapGlobalEvidence | null;
}

export interface GapThresholds {
  /** Each parent topic needs at least this many papers before the signal can be raised. */
  minParentPapers: number;
  /** R must be at most this (default 0.5). */
  maxRatio: number;
  /** Family-wise significance level, divided by k (default 0.05). */
  alpha: number;
}

export interface GapEvidence {
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  /** E = nA * nB / N. 0 when the corpus cannot speak to the probe. */
  expected: number;
  /** R = nAB / E. 1 (neutral) when the corpus cannot speak to the probe. */
  ratio: number;
  /** P(X <= nAB) for X ~ Poisson(E). 1 (neutral) when the corpus cannot speak to the probe. */
  pValue: number;
  /** The ranking signal: far fewer papers than independence predicts, beyond chance, with enough papers per topic. */
  underExplored: boolean;
  /** A parent topic has fewer than minParentPapers papers (or none), or the scope is empty. */
  lowSample: boolean;
  /** Ranking score 0..1 (stored in evidence_confidence). */
  evidenceConfidence: number;
  /** The same test on the OpenAlex counts; absent when they (or their N) are missing or cannot speak to the probe. */
  global?: { expected: number; ratio: number; pValue: number; underExplored: boolean };
  /** OpenAlex finds the intersection well covered, so the local signal was overruled. */
  vetoedByGlobal: boolean;
}

export const GAP_UNDEREXPLORED_DEFAULTS = { maxRatio: 0.5, alpha: 0.05 } as const;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** P(X <= n) for X ~ Poisson(lambda), summed in log space so a large lambda neither underflows nor overflows. */
export function poissonCdf(n: number, lambda: number): number {
  if (!(lambda > 0)) return 1;
  if (n < 0) return 0;
  const k = Math.floor(n), logLambda = Math.log(lambda);
  const terms = new Float64Array(k + 1);
  let logFactorial = 0, max = -Infinity;
  for (let j = 0; j <= k; j++) {
    if (j > 0) logFactorial += Math.log(j);
    terms[j] = -lambda + j * logLambda - logFactorial;
    if (terms[j]! > max) max = terms[j]!;
  }
  let sum = 0;
  for (let j = 0; j <= k; j++) sum += Math.exp(terms[j]! - max);
  return Math.min(1, Math.exp(max + Math.log(sum)));
}

/** O/E test on one set of counts. Null when the scope is empty or a topic has no papers (the counts cannot speak). */
function observedVsExpected(N: number, nAB: number, parentCounts: { a: number; b: number }, k: number, t: GapThresholds) {
  const minParent = Math.min(parentCounts.a, parentCounts.b);
  if (!(N > 0) || minParent <= 0) return null;
  const expected = (parentCounts.a * parentCounts.b) / N;
  const ratio = nAB / expected;
  const pValue = poissonCdf(nAB, expected);
  const lowSample = minParent < t.minParentPapers;
  return { expected, ratio, pValue, lowSample, underExplored: !lowSample && ratio <= t.maxRatio && pValue <= t.alpha / k };
}

export function computeGapEvidence(input: GapEvidenceInput, t: GapThresholds): GapEvidence {
  const { evidenceScopeSize: N, intersectionCount: nAB, parentCounts } = input;
  const k = Math.max(1, Math.floor(input.probeCount ?? 1));
  const local = observedVsExpected(N, nAB, parentCounts, k, t);
  // An empty scope or a parent topic with no papers: the corpus cannot speak to this gap at all, and an empty
  // intersection is missing data, not evidence.
  if (!local) {
    return { intersectionCount: nAB, parentCounts, expected: 0, ratio: 1, pValue: 1, underExplored: false, lowSample: true, evidenceConfidence: 0, vetoedByGlobal: false };
  }
  const g = input.globalEvidence;
  const globalTest = g && g.scopeSize !== undefined ? observedVsExpected(g.scopeSize, g.intersectionCount, g.parentCounts, k, t) : null;
  const global = globalTest ? { expected: globalTest.expected, ratio: globalTest.ratio, pValue: globalTest.pValue, underExplored: globalTest.underExplored } : undefined;
  // OpenAlex overrules only when it has enough papers per topic to judge.
  const vetoedByGlobal = local.underExplored && !!globalTest && !globalTest.lowSample && !globalTest.underExplored;
  const underExplored = local.underExplored && !vetoedByGlobal;
  const evidenceConfidence = underExplored ? 0.5 + 0.5 * clamp01(1 - local.ratio) : 0.25 * clamp01(1 - local.ratio);
  return { intersectionCount: nAB, parentCounts, expected: local.expected, ratio: local.ratio, pValue: local.pValue, underExplored, lowSample: local.lowSample, evidenceConfidence: round2(clamp01(evidenceConfidence)), ...(global ? { global } : {}), vetoedByGlobal };
}

/**
 * Raw growth of a parent topic over complete years (CAGR when defined, else year-over-year), with the slope.
 * Descriptive context only (P1.3): raw counts are not normalised by the literature, so nothing here says
 * whether the topic is rising; that is the trend verdict (trends module, Mann–Kendall on the share).
 */
export function parentGrowth(series: YearlyCount[]): { growthRatePct: number; cagrPct: number | null; slope: number } {
  const cagr = cagrPct(series), slope = linearSlope(series);
  return { growthRatePct: cagr ?? yoyGrowthPct(series), cagrPct: cagr, slope };
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
