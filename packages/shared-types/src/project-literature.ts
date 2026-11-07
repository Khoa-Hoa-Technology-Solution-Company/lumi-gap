import type { EvidenceReviewState, EvidenceSourceScope, EvidenceVerificationStatus } from "./project-research.js";

/* ------------------------------------------------------------------ */
/* Literature matrix                                                   */
/* ------------------------------------------------------------------ */

/** Built-in matrix columns. They map to fields of every extraction. */
export const MATRIX_BUILT_IN_COLUMNS = ["methodology", "population", "claim", "results", "limitations"] as const;
export type MatrixBuiltInColumn = (typeof MATRIX_BUILT_IN_COLUMNS)[number];
export const MAX_MATRIX_CRITERIA = 12;

export interface MatrixCriterion {
  id: string; label: string; description: string; position: number; version: number;
  createdById: string; createdAt: string; updatedAt: string;
}
export interface SaveMatrixCriterion { label: string; description?: string }
export interface UpdateMatrixCriterion extends SaveMatrixCriterion { expectedVersion: number }

/** One matrix row: one extraction of one included paper. */
export interface LiteratureMatrixRow {
  evidenceId: string; evidenceVersion: number; paperId: string;
  paperTitle: string; doi: string | null; publicationYear: number | null;
  methodology: string; population: string; claim: string; results: string; limitations: string;
  themes: string[]; criteriaValues: Record<string, string>;
  reviewState: EvidenceReviewState; verificationStatus: EvidenceVerificationStatus; sourceScope: EvidenceSourceScope;
  origin: "HUMAN" | "AI_SUGGESTED";
  /** Limitations (by id) this extraction is already a source of. */
  limitationIds: string[];
}
export interface LiteratureMatrix {
  criteria: MatrixCriterion[];
  rows: LiteratureMatrixRow[];
  /** Rows matching the filter before the row cap. */
  total: number;
  truncated: boolean;
  questions: Array<{ id: string; text: string }>;
  themes: string[];
  canEdit: boolean;
}
export interface LiteratureMatrixQuery {
  status?: "VERIFIED" | "ALL"; questionId?: string; theme?: string; q?: string;
}

/* ------------------------------------------------------------------ */
/* Limitation identification                                           */
/* ------------------------------------------------------------------ */

export const LIMITATION_CATEGORIES = ["DATA", "METHOD", "CONTEXT", "OUTCOME", "TEMPORAL", "OTHER"] as const;
export type LimitationCategory = (typeof LIMITATION_CATEGORIES)[number];
export type LimitationStatus = "OPEN" | "PROMOTED" | "DISMISSED";

export interface LimitationSource {
  evidenceId: string; evidenceVersion: number; paperId: string; paperTitle: string;
  publicationYear: number | null; limitations: string; claim: string;
  reviewState: EvidenceReviewState; addedAt: string;
}
export interface ProjectLimitation {
  id: string; statement: string; category: LimitationCategory; status: LimitationStatus;
  statusRationale: string; gapId: string | null; gapTitle: string | null;
  version: number; createdById: string; createdByName: string; createdAt: string; updatedAt: string;
  sources: LimitationSource[];
  /** Distinct papers among the sources: how widely the limitation is reported. */
  paperCount: number;
  feasibility: FeasibilitySummary;
}
export interface ProjectLimitationList {
  items: ProjectLimitation[];
  /** Reviewed extractions that report a limitation but are not grouped yet. */
  ungrouped: Array<Pick<LimitationSource, "evidenceId" | "evidenceVersion" | "paperId" | "paperTitle" | "publicationYear" | "limitations" | "claim">>;
  canEdit: boolean;
}
export interface CreateLimitation {
  statement: string; category: LimitationCategory; evidenceIds: string[]; clientKey: string;
}
export interface UpdateLimitation {
  statement: string; category: LimitationCategory; evidenceIds: string[]; expectedVersion: number;
}
export interface SetLimitationStatus { status: "OPEN" | "DISMISSED"; rationale: string; expectedVersion: number }
export interface PromoteLimitation {
  expectedVersion: number; title: string; topic: string; significance: string; researchQuestion?: string;
}

/* ------------------------------------------------------------------ */
/* Feasibility                                                         */
/* ------------------------------------------------------------------ */

export type FeasibilityTargetKind = "LIMITATION" | "GAP";
export const FEASIBILITY_DIMENSIONS = ["dataAvailability", "expertise", "resources", "timeline", "risk"] as const;
export type FeasibilityDimension = (typeof FEASIBILITY_DIMENSIONS)[number];
/** FEASIBLE: no blocker and mean >= 3.5. CONDITIONAL: no blocker and mean >= 2.5. Otherwise NOT_FEASIBLE. */
export type FeasibilityVerdict = "FEASIBLE" | "CONDITIONAL" | "NOT_FEASIBLE";
export type FeasibilityScores = Record<FeasibilityDimension, number>;

export interface FeasibilityAssessment extends FeasibilityScores {
  id: string; targetKind: FeasibilityTargetKind; targetId: string; targetVersion: number;
  assessorId: string; assessorName: string; notes: string; version: number; updatedAt: string;
  mean: number; verdict: FeasibilityVerdict;
}
export interface FeasibilitySummary {
  count: number;
  /** Mean of each dimension over all assessors; null when nobody assessed. */
  means: FeasibilityScores | null;
  mean: number | null;
  verdict: FeasibilityVerdict | null;
  /** Dimensions that at least one assessor scored 1. */
  blockers: FeasibilityDimension[];
}
export interface FeasibilityView {
  summary: FeasibilitySummary;
  assessments: FeasibilityAssessment[];
  targetVersion: number;
  canAssess: boolean;
}
export interface SaveFeasibility extends FeasibilityScores { notes: string; expectedVersion?: number }
