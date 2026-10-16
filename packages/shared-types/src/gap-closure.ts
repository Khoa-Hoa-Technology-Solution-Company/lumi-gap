// packages/shared-types/src/gap-closure.ts
// Gap Closure Protocol (docs/gap-closure-protocol.md): a gap is called open only after a logged search,
// a rubric-based screening of every document found, and a false-novelty bound B = epsHat + pHat.

/** Result of the latest closure check of a gap. */
export type GapClosureStatus = "NOT_CHECKED" | "CLOSED" | "OPEN_CERTIFIED" | "ABSTAIN";
export type GapClosureDecision = Exclude<GapClosureStatus, "NOT_CHECKED">;
export type GapClosureCheckStatus = "QUEUED" | "SEARCHING" | "SCREENING" | "DECIDED" | "FAILED";
export type GapClosureTargetKind = "GAP" | "CALIBRATION_QUESTION";
/**
 * Screening rubric for one document against the question:
 * ANSWERS   a sentence reports a result on the question and every stated facet (population, intervention, outcome) matches;
 * PARTIAL   addresses the question but at least one facet differs, or only states it as a limitation / future work;
 * UNRELATED does not address the question.
 */
export type ClosureLabel = "ANSWERS" | "PARTIAL" | "UNRELATED";
/** AI: the labels that decide come from the AI screening; HUMAN: a person confirmed every document. */
export type ClosureJudgeKind = "AI" | "HUMAN";
export type ClosureDocumentSource = "LOCAL" | "OPENALEX";
export type CalibrationLabelSource = "EXPERT_VALIDATION" | "SURVEY";
export type CalibrationQuestionResult = "PENDING" | "FOUND" | "MISSED";
export type ClosureCalibrationStatus = "DRAFT" | "RUNNING" | "COMPUTED";

/** Why a check ended in ABSTAIN (several can apply). */
export type ClosureAbstainReason =
  | "SEARCH_ERRORS"
  | "PENDING_REVIEW"
  | "NO_COVERAGE"
  | "NO_CALIBRATION"
  | "CALIBRATION_JUDGE_MISMATCH"
  | "BOUND_EXCEEDS_MAX";

/** PICOC facets of a research question. Empty facets are not checked. */
export interface QuestionFacets {
  population?: string;
  intervention?: string;
  comparison?: string;
  outcome?: string;
  context?: string;
}

export interface ClosureQueryLog {
  source: ClosureDocumentSource;
  query: string;
  executedAt: string;
  resultCount: number;
  /** Set when the search failed; any error makes the check ABSTAIN. */
  error?: string;
}

/** Facets the quoted sentence matches (true), contradicts (false) or does not mention (absent). */
export type ClosureFacetMatch = Partial<Record<keyof QuestionFacets, boolean>>;

export interface GapClosureDocumentView {
  id: string;
  paperId?: string;
  openalexId?: string;
  doi?: string;
  title: string;
  abstractText?: string;
  publicationYear?: number;
  retrievedFrom: ClosureDocumentSource;
  queryIndex: number;
  rank: number;
  aiLabel?: ClosureLabel;
  aiQuote?: string;
  aiFacets?: ClosureFacetMatch;
  /** The AI quote was found verbatim in the document text. Unverified ANSWERS/PARTIAL labels need a person. */
  aiQuoteVerified: boolean;
  humanLabel?: ClosureLabel;
  humanQuote?: string;
  humanFacets?: ClosureFacetMatch;
  reviewerId?: string;
  reviewedAt?: string;
  secondLabel?: ClosureLabel;
  secondReviewerId?: string;
  limitationStatement: boolean;
  /** Label that counts in the decision, or undefined while the document still needs a person. */
  effectiveLabel?: ClosureLabel;
}

export interface GapClosureCheckView {
  id: string;
  targetKind: GapClosureTargetKind;
  targetId: string;
  protocolVersion: string;
  status: GapClosureCheckStatus;
  question: string;
  facets: QuestionFacets;
  queries: ClosureQueryLog[];
  yearFrom?: number;
  yearTo?: number;
  judgeKind?: ClosureJudgeKind;
  coverageCheckId?: string;
  calibrationId?: string;
  delta?: number;
  epsHat?: number;
  pHat?: number;
  /** False-novelty bound: epsHat + pHat, capped at 1. */
  bound?: number;
  maxFalseNovelty?: number;
  decision?: GapClosureDecision;
  decisionReasons: ClosureAbstainReason[];
  witnessDocumentId?: string;
  /** Another paper states this question as a limitation or future work (significance, not part of the bound). */
  corroborated: boolean;
  errorMessage?: string;
  createdById: string;
  decidedById?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;
  documents: GapClosureDocumentView[];
}

/** Short form embedded in ResearchGapItem. */
export interface GapClosureSummary {
  checkId: string;
  status: GapClosureCheckStatus;
  decision?: GapClosureDecision;
  bound?: number;
  judgeKind?: ClosureJudgeKind;
  decidedAt?: string;
}

export interface StartGapClosureCheckRequest {
  /** Defaults to the gap's suggestedResearchQuestion. */
  question?: string;
  facets?: QuestionFacets;
  /** Hand-written queries; when omitted the AI proposes up to GAP_CLOSURE_MAX_QUERIES. */
  queries?: string[];
  yearFrom?: number;
  yearTo?: number;
}

export interface ReviewClosureDocumentRequest {
  label: ClosureLabel;
  /** Required for ANSWERS and PARTIAL; must appear verbatim in the document text. */
  quote?: string;
  facets?: ClosureFacetMatch;
  limitationStatement?: boolean;
  /** Record as the independent second reviewer (used for Cohen's kappa) instead of the deciding label. */
  asSecondReviewer?: boolean;
}

export interface DecideGapClosureRequest {
  /** Defaults to the latest coverage check of the gap's topic. */
  coverageCheckId?: string;
  /** Defaults to the latest COMPUTED calibration with the check's judge kind. */
  calibrationId?: string;
}

export interface CoverageCheckItemView {
  doi: string;
  position: number;
  title?: string;
  foundLocal: boolean;
  foundOpenAlex: boolean;
  paperId?: string;
  openalexId?: string;
}

export interface CoverageCheckView {
  id: string;
  topic: string;
  projectId?: string;
  /** Where the reference DOIs come from, e.g. "Reference list of <survey DOI>". Must not be the LumiGap search itself. */
  referenceSource: string;
  m: number;
  /** Reference DOIs found neither in LumiGap nor in OpenAlex. */
  x: number;
  delta: number;
  /** One-sided Clopper-Pearson upper bound of x/m at confidence 1 - delta. */
  pHat: number;
  createdById: string;
  createdAt: string;
  items: CoverageCheckItemView[];
}

export interface CreateCoverageCheckRequest {
  topic: string;
  projectId?: string;
  referenceSource: string;
  /** 1..200 DOIs; duplicates are removed. */
  dois: string[];
}

export interface CalibrationQuestionView {
  id: string;
  calibrationId: string;
  question: string;
  facets: QuestionFacets;
  witnessDoi: string;
  witnessQuote?: string;
  labelSource: CalibrationLabelSource;
  labelSourceRef?: string;
  result: CalibrationQuestionResult;
  closureCheckId?: string;
  createdAt: string;
}

export interface ClosureCalibrationView {
  id: string;
  name: string;
  domain: string;
  judgeKind: ClosureJudgeKind;
  protocolVersion: string;
  status: ClosureCalibrationStatus;
  delta: number;
  n: number;
  misses: number;
  /** One-sided Clopper-Pearson upper bound of misses/n at confidence 1 - delta. */
  epsHat?: number;
  computedAt?: string;
  createdById: string;
  createdAt: string;
  questions?: CalibrationQuestionView[];
}

export interface CreateClosureCalibrationRequest {
  name: string;
  domain: string;
  judgeKind: ClosureJudgeKind;
}

export interface CreateCalibrationQuestionRequest {
  question: string;
  facets?: QuestionFacets;
  witnessDoi: string;
  witnessQuote?: string;
  labelSource: CalibrationLabelSource;
  labelSourceRef?: string;
}

/** GET /api/v1/gap-closure/checks/:checkId/dossier?format=json — everything needed to redo the check by hand. */
export interface GapClosureDossier {
  protocolVersion: string;
  generatedAt: string;
  gap?: { id: string; title: string; topic: string };
  check: GapClosureCheckView;
  coverage?: CoverageCheckView;
  calibration?: ClosureCalibrationView;
  /** Plain-language arithmetic, e.g. "B = 0.0951 + 0.0582 = 0.1533 <= 0.2". */
  arithmetic: string[];
  /** Cohen's kappa between the deciding and the second reviewer, when at least 2 documents have both. */
  interRaterKappa?: { kappa: number; documents: number };
}
