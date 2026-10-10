/** Pure gap-evidence scoring. No I/O — the service supplies the counts/trend. */

export interface GapEvidenceInput {
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  /** YoY growth % of the more-active parent topic (0 if neither rises / unknown). */
  parentRisingGrowthPct: number;
}

export interface GapThresholds {
  scarceAbs: number;
  scarcePct: number;
  parentRisingMin: number;
  /** Each parent topic needs at least this many papers before the gap can be confirmed. */
  minParentPapers: number;
}

export interface GapEvidence {
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  scarcityScore: number; // 0..1 — higher = scarcer
  confirmed: boolean; // scarce AND a parent rising AND enough papers per parent
  lowSample: boolean; // a parent topic has fewer than minParentPapers papers
  evidenceConfidence: number; // 0..1
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeGapEvidence(input: GapEvidenceInput, t: GapThresholds): GapEvidence {
  const minParent = Math.min(input.parentCounts.a, input.parentCounts.b);
  // A parent topic with no papers means the corpus cannot speak to this gap at all;
  // an empty intersection then is missing data, not evidence of scarcity.
  if (minParent === 0) {
    return { intersectionCount: input.intersectionCount, parentCounts: input.parentCounts, scarcityScore: 0, confirmed: false, lowSample: true, evidenceConfidence: 0 };
  }
  // Scarcity ceiling: the larger of the absolute floor and a fraction of the smaller parent.
  const ceiling = Math.max(t.scarceAbs, Math.floor(t.scarcePct * minParent), 1);
  const scarcityScore = clamp01(1 - input.intersectionCount / ceiling);
  const scarce = input.intersectionCount <= ceiling;
  const rising = input.parentRisingGrowthPct > t.parentRisingMin;
  // With a handful of papers an empty intersection and "0 -> 1 paper" growth are noise, not evidence.
  const lowSample = minParent < t.minParentPapers;
  const confirmed = scarce && rising && !lowSample;
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
