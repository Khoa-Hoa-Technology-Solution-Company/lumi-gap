/**
 * Pure rules of the literature matrix, limitation identification and feasibility assessment. No I/O.
 */
import {
  FEASIBILITY_DIMENSIONS,
  type FeasibilityDimension,
  type FeasibilityScores,
  type FeasibilitySummary,
  type FeasibilityVerdict,
  type LimitationCategory,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";

export const MAX_CRITERION_VALUE_CHARS = 2000;
/** Rows returned by one matrix request; the UI says when the matrix was cut. */
export const MATRIX_ROW_CAP = 500;
export const FEASIBLE_MIN_MEAN = 3.5;
export const CONDITIONAL_MIN_MEAN = 2.5;

const round2 = (value: number) => Math.round(value * 100) / 100;

export function feasibilityMean(scores: FeasibilityScores): number {
  return round2(FEASIBILITY_DIMENSIONS.reduce((sum, key) => sum + scores[key], 0) / FEASIBILITY_DIMENSIONS.length);
}

/**
 * Verdict of one score set. A dimension scored 1 is a blocker: the work cannot go ahead as scoped,
 * whatever the other dimensions say.
 */
export function feasibilityVerdict(scores: FeasibilityScores, blockers: FeasibilityDimension[] = blockersOf([scores])): FeasibilityVerdict {
  if (blockers.length) return "NOT_FEASIBLE";
  const mean = feasibilityMean(scores);
  if (mean >= FEASIBLE_MIN_MEAN) return "FEASIBLE";
  if (mean >= CONDITIONAL_MIN_MEAN) return "CONDITIONAL";
  return "NOT_FEASIBLE";
}

export function blockersOf(assessments: FeasibilityScores[]): FeasibilityDimension[] {
  return FEASIBILITY_DIMENSIONS.filter((key) => assessments.some((row) => row[key] <= 1));
}

/** Team view: per-dimension means over assessors; a blocker from any single assessor stays a blocker. */
export function summarizeFeasibility(assessments: FeasibilityScores[]): FeasibilitySummary {
  if (!assessments.length) return { count: 0, means: null, mean: null, verdict: null, blockers: [] };
  const means = Object.fromEntries(FEASIBILITY_DIMENSIONS.map((key) => [key, round2(assessments.reduce((sum, row) => sum + row[key], 0) / assessments.length)])) as FeasibilityScores;
  const blockers = blockersOf(assessments);
  return { count: assessments.length, means, mean: feasibilityMean(means), verdict: feasibilityVerdict(means, blockers), blockers };
}

/** Throws unless the team may record support for a gap with this feasibility. */
export function assertFeasibleForSupport(summary: FeasibilitySummary): void {
  if (!summary.count) throw AppError.badRequest("Record a feasibility assessment before recording team support");
  if (summary.verdict === "NOT_FEASIBLE") throw AppError.badRequest("The team assessed this candidate as not feasible. Narrow its scope or revise the assessment before recording team support");
}

/** Scores of 1 or 2 must be explained (mirrors the database CHECK). */
export function assertFeasibilityNotes(scores: FeasibilityScores, notes: string): void {
  if (FEASIBILITY_DIMENSIONS.some((key) => scores[key] <= 2) && !notes.trim()) throw AppError.badRequest("Explain every score of 1 or 2 in the notes");
}

/**
 * Keeps only values of active criteria, trims them and drops empty ones.
 * An unknown criterion id is an error rather than silently dropped: it means the client used a stale column set.
 */
export function sanitizeCriteriaValues(values: Record<string, string> | undefined, activeIds: ReadonlySet<string>): Record<string, string> {
  if (!values) return {};
  const clean: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values)) {
    if (!activeIds.has(key)) throw AppError.conflict("A matrix column changed. Reload the matrix before saving");
    const value = String(raw ?? "").trim();
    if (value.length > MAX_CRITERION_VALUE_CHARS) throw AppError.badRequest(`A matrix value is longer than ${MAX_CRITERION_VALUE_CHARS} characters`);
    if (value) clean[key] = value;
  }
  return clean;
}

/** Reads a stored criteria_values column defensively (it is JSON). */
export function storedCriteriaValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

const GAP_TYPE_BY_CATEGORY: Record<LimitationCategory, string> = {
  DATA: "EMPIRICAL_VALIDATION_GAP",
  METHOD: "METHODOLOGICAL_GAP",
  CONTEXT: "CONTEXT_GAP",
  OUTCOME: "OUTCOME_GAP",
  TEMPORAL: "TEMPORAL_GAP",
  OTHER: "OTHER",
};
export function gapTypeForLimitation(category: LimitationCategory): string {
  return GAP_TYPE_BY_CATEGORY[category];
}

/** Number of distinct papers among a limitation's sources. */
export function distinctPaperCount(sources: Array<{ paperId: string }>): number {
  return new Set(sources.map((source) => source.paperId)).size;
}
