// packages/shared-types/src/quality.ts
import type { ISODateString } from "./common.js";

export type QualityTargetKind = "report" | "gap" | "paper";
export type QualityLanguage = "en" | "vi";
export type QualityCriterionId = "relevance" | "groundedness" | "completeness";

export interface QualityCriterion {
  id: QualityCriterionId;
  title: string;
  question: string;
  anchors: { score: number; description: string }[];
}

export interface QualityRubric {
  version: string;
  targetKind: QualityTargetKind;
  language: QualityLanguage;
  scope: string;
  criteria: QualityCriterion[];
  limitations: string[];
}

export interface QualitySource {
  id: string;
  title: string;
  kind: "title" | "abstract" | "report" | "gap" | "question" | "evidence_abstract";
  paperId?: string;
  charactersRead: number;
  truncated: boolean;
}

export interface QualityCriterionAssessment {
  id: QualityCriterionId;
  score: number | null;
  status: "assessed" | "insufficient_evidence";
  finding: string;
  evidence: { sourceId: string; quote: string }[];
  missingEvidence: string[];
  improvement: string;
}

export interface QualityAssessment {
  rubric: QualityRubric;
  summary: string;
  criteria: QualityCriterionAssessment[];
  actions: {
    criterionId: QualityCriterionId;
    priority: "high" | "medium" | "low";
    action: string;
    why: string;
    expectedOutcome: string;
  }[];
  researchQuestions: { criterionId: QualityCriterionId; question: string; why: string }[];
  limitations: string[];
  sources: QualitySource[];
}

/** The task is private to the requesting user; LLM work runs in a worker. */
export interface QualityEvaluationTask {
  jobId?: string;
  status: "queued" | "running" | "completed" | "failed";
  evaluation?: QualityEvaluation;
  error?: string;
}

/** LLM-as-a-judge result for one AI artifact. */
export interface QualityEvaluation {
  targetKind: QualityTargetKind;
  targetId: string;
  relevance: number | null; // 1..5, null when the material is insufficient
  groundedness: number | null;
  completeness: number | null;
  overall: number | null; // equal-weight mean only if all three are assessed
  rationale: string;
  model: string;
  createdAt: ISODateString;
  evaluatedAt?: ISODateString;
  details?: QualityAssessment;
  freshness?: "current" | "outdated" | "legacy";
}

export interface RatingSummary {
  avg: number; // 0 when no ratings
  count: number;
}

export interface MyRating {
  stars: number; // 1..5
  comment?: string;
}

export interface UserRatingDetail {
  id: string;
  user: {
    id: string;
    fullName: string;
    avatarUrl?: string;
  } | null;
  stars: number;
  comment?: string;
  updatedAt: ISODateString;
}

/** GET /quality/:kind/:id */
export interface QualityView {
  evaluation?: QualityEvaluation;
  evaluationTask?: QualityEvaluationTask;
  ratingSummary: RatingSummary;
  myRating?: MyRating;
  allRatings?: UserRatingDetail[];
}

/** POST /quality/evaluate */
export interface EvaluateRequest {
  targetKind: QualityTargetKind;
  targetId: string;
  force?: boolean;
  language?: QualityLanguage;
}

/** POST /quality/rate */
export interface RateRequest {
  targetKind: QualityTargetKind;
  targetId: string;
  stars: number;
  comment?: string;
}

export interface AgreementBucket {
  sampleSize: number;
  mae: number; // mean abs diff |llmOverall - userAvg|
  withinOnePct: number; // % of targets within ±1
  correlation: number | null; // Pearson, null if sampleSize < 3
}

/** GET /quality/agreement (admin) */
export interface AgreementStats {
  sampleSize: number;
  mae: number;
  withinOnePct: number;
  correlation: number | null;
  byKind: { report: AgreementBucket; gap: AgreementBucket; paper: AgreementBucket };
}
