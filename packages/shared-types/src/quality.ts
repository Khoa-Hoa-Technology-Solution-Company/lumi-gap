// packages/shared-types/src/quality.ts
import type { ISODateString } from "./common.js";

export type QualityTargetKind = "report" | "gap" | "paper";

/** LLM-as-a-judge result for one AI artifact. */
export interface QualityEvaluation {
  targetKind: QualityTargetKind;
  targetId: string;
  relevance: number; // 1..5
  groundedness: number; // 1..5
  completeness: number; // 1..5
  overall: number; // avg of the three, 1 decimal
  rationale: string;
  model: string;
  createdAt: ISODateString;
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
  ratingSummary: RatingSummary;
  myRating?: MyRating;
  allRatings?: UserRatingDetail[];
}

/** POST /quality/evaluate */
export interface EvaluateRequest {
  targetKind: QualityTargetKind;
  targetId: string;
  force?: boolean;
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
