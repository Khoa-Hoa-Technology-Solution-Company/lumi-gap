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

export interface QualityQuote {
  sourceId: string;
  quote: string;
}

export interface QualityAction {
  criterionId: QualityCriterionId;
  priority: "high" | "medium" | "low";
  action: string;
  why: string;
  expectedOutcome: string;
}

/**
 * One fact read from the paper. "reported" always carries a verified verbatim quote;
 * "unverified" keeps the model's value but its quote did not match the source text, so it must be
 * shown as "could not verify" (never as missing); "not_reported" means the supplied text does not
 * state it (it may exist in the full paper).
 */
export interface QualityFact {
  status: "reported" | "unverified" | "not_reported";
  value: string | null;
  evidence: QualityQuote | null;
}

/** Paper reference mode: a reading card that is useful without any project. */
export interface PaperReadingFacts {
  studyDesign: QualityFact;
  sampleOrData: QualityFact;
  setting: QualityFact;
  measures: QualityFact;
  keyResults: QualityFact[]; // 0..4, reported only
  authorStatedLimitations: QualityFact[]; // 0..4, reported only
}

export type PaperReadingPurpose = "overview" | "method" | "data" | "results" | "counterpoint" | "background";

export interface PaperReadingGuidance {
  /** Why someone exploring this topic would read the paper (1..3, most useful first). */
  purposes: { purpose: PaperReadingPurpose; explanation: string }[];
  audience: "newcomer" | "intermediate" | "specialist";
  audienceReason: string;
  /** The single most important reason to be careful when citing it, or null. */
  caution: string | null;
}

export interface QualityAssessment {
  rubric: QualityRubric;
  summary: string;
  criteria: QualityCriterionAssessment[];
  actions: QualityAction[];
  researchQuestions: { criterionId: QualityCriterionId; question: string; why: string }[];
  limitations: string[];
  sources: QualitySource[];
  /** Paper targets from rubric quality-v3 onward. Absent for reports, gaps and older results. */
  facts?: PaperReadingFacts;
  guidance?: PaperReadingGuidance;
}

/**
 * Project mode (paper targets only): how one paper serves one project's research plan.
 * Shared by the project's members; built on top of the paper's reference assessment.
 */
export interface QualityProjectAssessment {
  version: string;
  project: { id: string; title: string };
  verdict: "core" | "supporting" | "background" | "not_relevant";
  verdictReason: string;
  /** Plan questions/objectives this paper helps with. `planItem` is the plan text verbatim. */
  questionLinks: { planItem: string; contribution: string; evidence: QualityQuote[] }[]; // 0..5
  reusable: { kind: "method" | "dataset" | "measure" | "framework"; description: string; evidence: QualityQuote | null }[]; // 0..4
  /** Findings or assumptions that conflict with or complicate the plan. */
  tensions: { description: string; evidence: QualityQuote[] }[]; // 0..3
  screening: {
    suggestion: "include" | "exclude" | "undecided";
    reason: string;
    /** The project's own inclusion/exclusion criteria, quoted verbatim, that drove the suggestion. */
    criteria: string[];
  };
  actions: QualityAction[]; // 1..3, project-specific
  limitations: string[];
  sources: QualitySource[];
}

export interface QualityProjectEvaluation {
  targetKind: "paper";
  targetId: string;
  projectId: string;
  assessment: QualityProjectAssessment;
  model: string;
  evaluatedAt: ISODateString;
  /** Outdated when the paper, its reference assessment or the project's plan/criteria changed. */
  freshness: "current" | "outdated";
}

/**
 * Stable codes for evaluation failures; clients translate these instead of showing `error` text.
 * Also used as `error.code` in the HTTP error envelope for the same failures.
 */
export type QualityErrorCode =
  | "AI_EVALUATION_BUSY" // provider overloaded / rate limited after retries; try again later
  | "AI_EVALUATION_INVALID_OUTPUT" // model output unusable after normalization and one repair
  | "AI_EVALUATION_QUOTA" // the user's or platform's AI quota is exhausted
  | "AI_EVALUATION_UNAVAILABLE"; // any other failure

/** The task is private to the requesting user; LLM work runs in a worker. */
export interface QualityEvaluationTask {
  jobId?: string;
  status: "queued" | "running" | "completed" | "failed";
  evaluation?: QualityEvaluation;
  /** Set when the task was started with a projectId. */
  projectEvaluation?: QualityProjectEvaluation;
  error?: string;
  errorCode?: QualityErrorCode;
}

/**
 * GET /quality/paper/:paperId/reading-context?topic=&query=
 * Deterministic, no LLM: where the paper sits in a trend and what to read next.
 */
export interface PaperReadingContext {
  paperId: string;
  /** Echo of the topic/query the reader arrived with, if any. */
  requestedTopic: string | null;
  trend: {
    topic: string;
    source: "requested" | "paper_topic";
    totalPapers: number;
    growthRatePct: number | null;
    /** Null when the base year has too few papers for the rate to be meaningful. */
    cagr3yPct: number | null;
    momentum: number | null;
    yearlyBreakdown: { year: number; count: number }[];
    /** This paper's publication year, for placing it on the series. */
    paperYear: number | null;
    /** The current, incomplete year if it appears in yearlyBreakdown (its count is partial), else null. */
    partialYear: number | null;
  } | null;
  related: {
    id: string;
    title: string;
    publicationYear: number | null;
    citationCount: number | null;
    similarity: number; // 0..1
    sharedTopics: string[];
    reason: "same_topic_newer" | "same_topic_most_cited" | "semantic_neighbor";
  }[]; // 0..5
  computedAt: ISODateString;
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
  /** Only when requested with ?projectId= for a paper the caller can see in that project. */
  projectEvaluation?: QualityProjectEvaluation;
  projectEvaluationTask?: QualityEvaluationTask;
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
  /** Paper only. Evaluates the paper against this project's research plan (caller must be a member). */
  projectId?: string;
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
