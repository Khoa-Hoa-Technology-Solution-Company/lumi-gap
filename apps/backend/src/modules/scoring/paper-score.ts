import type { PaperAiScore } from "@trend/shared-types";

/** Bump when the formula/weights change (mirrors prompt_version convention). */
export const PAPER_SCORE_VERSION = "paper-score-v3";

const RECENCY_WINDOW = 10; // years; older than this → 0
// Fallback impact is citations PER YEAR (age-fair), so the cap is per-year, not total.
const CITATION_PER_YEAR_CAP = 100; // citations/year at/above this → impact 1
// v3 — external normalized citation impact is the strongest signal. Recency still
// matters, but no longer overpowers weak field-normalized OpenAlex impact.
const W_IMPACT = 0.75;
const W_RECENCY = 0.2;
const W_METADATA = 0.05;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ScoreInput {
  publicationYear: number;
  citationCount: number;
  dataQualityScore: number;
  fwci?: number | null;
  citationNormalizedPercentile?: {
    value?: number | null;
    isInTop1Percent?: boolean | null;
    isInTop10Percent?: boolean | null;
  } | null;
}

/**
 * Deterministic, paper-intrinsic score. Pure: caller supplies `currentYear`
 * and `computedAt` (no Date inside). Query-relevance is NOT here — it is the
 * cosine score in search.
 */
export function computePaperScore(
  input: ScoreInput,
  currentYear: number,
  computedAt: string,
): PaperAiScore {
  const year = input.publicationYear || 0;
  // `Math.max(0, …)` clamps the age floor at 0 so a future-dated paper (OpenAlex
  // often tags next year for in-press works) scores recency 1, not >1.
  const recencyScore = year > 0 ? clamp01(1 - Math.max(0, currentYear - year) / RECENCY_WINDOW) : 0;
  // Age-fair impact: citations PER YEAR on a log scale, so a 2024 paper isn't
  // punished for not having had a decade to accumulate citations.
  const age = Math.max(1, currentYear - year);
  const perYear = (input.citationCount ?? 0) / age;
  const citationImpactScore = clamp01(
    Math.log10(perYear + 1) / Math.log10(CITATION_PER_YEAR_CAP + 1),
  );
  const citationPercentileScore = normalizeCitationPercentile(input.citationNormalizedPercentile);
  const fwciScore = normalizeFwci(input.fwci);
  const { impactScore, scoreBasis } = chooseImpactScore(citationImpactScore, citationPercentileScore, fwciScore);
  // Kept mostly for display. v3 blends it at only 5% so "academic value" is
  // still driven by citation impact, while badly incomplete records lose a small
  // amount of trust.
  const metadataQualityScore = clamp01(input.dataQualityScore ?? 0);
  const finalScore = round2(W_IMPACT * impactScore + W_RECENCY * recencyScore + W_METADATA * metadataQualityScore);
  return {
    recencyScore: round2(recencyScore),
    citationImpactScore: round2(impactScore),
    citationPercentileScore: citationPercentileScore === undefined ? undefined : round2(citationPercentileScore),
    fwciScore: fwciScore === undefined ? undefined : round2(fwciScore),
    metadataQualityScore: round2(metadataQualityScore),
    finalScore,
    scoreBasis,
    modelVersion: PAPER_SCORE_VERSION,
    computedAt,
  };
}

function normalizeCitationPercentile(
  value: ScoreInput["citationNormalizedPercentile"],
): number | undefined {
  if (typeof value?.value !== "number" || !Number.isFinite(value.value)) return undefined;
  return clamp01(value.value);
}

function normalizeFwci(fwci: ScoreInput["fwci"]): number | undefined {
  if (typeof fwci !== "number" || !Number.isFinite(fwci) || fwci < 0) return undefined;
  // FWCI=1 is world-average citation impact, mapped to 0.5. Very high FWCI
  // approaches 1 without letting extreme outliers dominate the score.
  return clamp01(fwci / (fwci + 1));
}

function chooseImpactScore(
  fallbackCitationImpactScore: number,
  citationPercentileScore: number | undefined,
  fwciScore: number | undefined,
): { impactScore: number; scoreBasis: NonNullable<PaperAiScore["scoreBasis"]> } {
  if (citationPercentileScore !== undefined && fwciScore !== undefined) {
    return {
      impactScore: 0.7 * citationPercentileScore + 0.3 * fwciScore,
      scoreBasis: "openalex-percentile-fwci",
    };
  }
  if (citationPercentileScore !== undefined) {
    return { impactScore: citationPercentileScore, scoreBasis: "openalex-percentile-fwci" };
  }
  if (fwciScore !== undefined) {
    return { impactScore: fwciScore, scoreBasis: "openalex-fwci" };
  }
  return { impactScore: fallbackCitationImpactScore, scoreBasis: "citations-per-year-fallback" };
}
