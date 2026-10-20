// packages/shared-types/src/gaps.ts

export type GapStatus = "active" | "resolved" | "dismissed";
export type GapSource = "report" | "standalone";
export type GapAnalysisStatus = "queued" | "analyzing" | "ready" | "failed";
export type GapEvidenceStatus = "confirmed" | "weak" | "ai_only";
export type GapEvidenceMode = "auto" | "selected" | "hybrid";
export type ResearchGapType = "COVERAGE_GAP" | "EMPIRICAL_VALIDATION_GAP" | "CONTRADICTORY_EVIDENCE_GAP" | "CONTEXT_GAP" | "METHODOLOGICAL_GAP" | "OUTCOME_GAP" | "TEMPORAL_GAP" | "EMERGING_GAP" | "MISSING_CONNECTION_GAP" | "ASSUMPTION_GAP" | "OTHER";
export type GapAssessmentLevel = "LOW" | "MODERATE" | "HIGH";
export type GapValidationStatus = "DRAFT" | "CANDIDATE" | "UNDER_VALIDATION" | "REFINED" | "VALIDATED" | "REJECTED" | "ARCHIVED";

export interface GapSupportingPaper {
  id: string;
  title: string;
  publicationYear?: number;
  journalName?: string;
  citationCount?: number;
}

export interface GapProjectEvidence {
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  scopePaperCount: number;
  evidenceConfidence: number;
}

/** Probe counts taken from OpenAlex (the whole literature, not just the local corpus). Absent when OpenAlex was unavailable. */
export interface GapGlobalEvidence {
  source: "openalex";
  intersectionCount: number;
  parentCounts: { a: number; b: number };
  /** All OpenAlex works in the same year window: N of the observed/expected test. Absent on rows saved before it was recorded. */
  scopeSize?: number;
  yearFrom?: number;
  yearTo?: number;
  fetchedAt: string;
}

export interface ResearchGapItem {
  assessmentStatus?: import("./project-research.js").GapAssessment;
  version?: number;
  id: string;
  topic: string;
  normalizedTopic: string;
  title: string;
  description: string;
  rationale: string;
  supportingPaperIds: string[];
  supportingPapers: GapSupportingPaper[];
  /** Papers an expert linked as counter-evidence (kept apart from the pipeline's evidence and supporting papers). */
  counterPaperIds?: string[];
  counterPapers?: GapSupportingPaper[];
  /** Corpus papers close to the gap's own text, found automatically: they may already answer it. Review before trusting the gap. */
  possibleCounterPaperIds?: string[];
  possibleCounterPapers?: GapSupportingPaper[];
  /** Complete reviewed input set the AI read when producing this gap. */
  evidencePaperIds: string[];
  /** Resolved papers in the same order as evidencePaperIds. */
  evidencePapers: GapSupportingPaper[];
  confidence: number;
  evidenceStatus: GapEvidenceStatus;
  source: GapSource;
  sourceReportId?: string;
  analysisId?: string;
  projectId?: string;
  corpusId?: string;
  userId: string;
  status: GapStatus;
  createdAt: string;
  probe?: { topicA: string; topicB: string; yearFrom?: number; yearTo?: number; semanticMinSimilarity?: number };
  intersectionCount?: number;
  parentCounts?: { a: number; b: number };
  parentTrend?: { topic: string; growthRatePct: number; cagrPct?: number | null; slope?: number } | null;
  /** OpenAlex counts for the same probe; null/absent when OpenAlex was disabled or failed. */
  globalEvidence?: GapGlobalEvidence | null;
  /** Ranking score 0..1 of the under-explored signal (not a probability that the gap is open). */
  evidenceConfidence?: number;
  /**
   * Observed/expected numbers behind the under-explored ranking signal, when the counts and the scope size are recorded:
   * expected = nA * nB / N (intersection if the topics were independent), ratio = observed / expected, pValue = Poisson P(X <= observed).
   * evidenceStatus "confirmed" means this signal is met; it ranks gaps and does not prove one is open (see closureStatus).
   */
  /**
   * Observed vs expected papers at the intersection. `global` is the same test on OpenAlex counts; `vetoedByGlobal`
   * means OpenAlex finds the intersection well covered, so the corpus signal was overruled.
   */
  underExplored?: { expected: number; ratio: number; pValue: number; global?: { expected: number; ratio: number; pValue: number }; vetoedByGlobal?: boolean };
  /** Active corpus papers the probe counts above were taken over; absent on gaps created before it was recorded. */
  evidenceScopeSize?: number;
  /** Same probe scored inside the project's INCLUDED papers. Context only: it never decides the under-explored signal. */
  projectEvidence?: GapProjectEvidence;
  /** A probe topic has too few papers for the under-explored signal to be meaningful. */
  lowSample?: boolean;
  gapType?: ResearchGapType;
  scope?: string;
  establishedKnowledge?: string;
  observedLimitation?: string;
  missingEvidence?: string;
  significanceExplanation?: string;
  suggestedResearchQuestion?: string;
  validationStatus?: GapValidationStatus;
  gapConfidence?: GapAssessmentLevel;
  researchPriority?: GapAssessmentLevel;
  origin?: "HUMAN" | "AI_ASSISTED";
  /** Distinct experts that must agree before expert validation reaches VALIDATED or REJECTED. */
  validationQuorum?: number;
  /** The viewer may resolve or dismiss this gap (its creator, or the owner of its project). */
  canManage?: boolean;
  /** Gap Closure Protocol result. NOT_CHECKED until a closure check is decided. */
  closureStatus?: import("./gap-closure.js").GapClosureStatus;
  questionFacets?: import("./gap-closure.js").QuestionFacets;
  latestClosureCheck?: import("./gap-closure.js").GapClosureSummary;
}

export interface GapAnalysisResult {
  evidenceSnapshot?: import("./knowledge.js").PaperEvidenceSnapshot[];
  id: string;
  topic: string;
  status: GapAnalysisStatus;
  gapIds: string[];
  errorMessage?: string;
  yearFrom?: number;
  yearTo?: number;
  selectedPaperIds: string[];
  evidenceMode: GapEvidenceMode;
  createdAt: string;
  updatedAt: string;
}

export interface GapEvidencePaper {
  id: string;
  title: string;
  abstractText?: string;
  publicationYear?: number;
  journalName?: string;
  citationCount?: number;
  authorNames: string[];
  score: number;
  source: "selected" | "retrieved";
}

export interface PreviewGapEvidenceRequest {
  topic: string;
  projectId?: string;
  yearFrom?: number;
  yearTo?: number;
  selectedPaperIds?: string[];
  evidenceMode?: GapEvidenceMode;
}

export interface PreviewGapEvidenceResponse {
  papers: GapEvidencePaper[];
  selectedPaperIds: string[];
  retrievedPaperIds: string[];
  maxEvidencePapers: number;
  warnings: string[];
}

export interface AnalyzeGapRequest {
  topic: string;
  projectId?: string;
  yearFrom?: number;
  yearTo?: number;
  /** The reviewed evidence set. Required when evidenceMode is selected. */
  selectedPaperIds?: string[];
  /** auto retrieves, selected freezes user choice, hybrid pins user choice and fills remaining slots. */
  evidenceMode?: GapEvidenceMode;
}

export interface ListGapsResponse {
  data: ResearchGapItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface CreateGapCandidateRequest {
  topic: string;
  projectId?: string;
  corpusId?: string;
  title: string;
  gapType: ResearchGapType;
  scope?: string;
  establishedKnowledge: string;
  observedLimitation: string;
  missingEvidence: string;
  significanceExplanation: string;
  suggestedResearchQuestion?: string;
  /** PICOC facets of suggestedResearchQuestion; needed for a closure check. */
  questionFacets?: import("./gap-closure.js").QuestionFacets;
  gapConfidence: GapAssessmentLevel;
  researchPriority: GapAssessmentLevel;
}

/** One AI-suggested next research direction for a gap (advisory). */
export interface ResearchDirection {
  title: string;
  rationale: string;
  suggestedApproach: string;
  /** Subset of the gap's supportingPaperIds the LLM cited (hallucinated ids stripped server-side). */
  relatedPaperIds: string[];
}

/** Persisted set of AI research directions for a single gap (one doc per gap). */
export interface GapDirections {
  gapId: string;
  directions: ResearchDirection[];
  model: string;
  /** When the directions were last generated (moves on each force-regenerate). */
  updatedAt: string;
}

export interface GapCommunityDiscussionSummary {
  threadCount: number;
  responseCount: number;
  citationCount: number;
  participantCount: number;
  helpfulCount: number;
  followCount: number;
  lastActivityAt?: string;
}

export interface GapCommunityCitation {
  id: string;
  postId?: string;
  commentId?: string;
  source: "post" | "response";
  paperId?: string;
  title?: string;
  doi?: string;
  year?: number;
  verified: boolean;
}

export interface GapCommunityDiscussionContext {
  gap: { id: string; title: string; topic: string; validationStatus?: GapValidationStatus | string; status: GapStatus | string };
  summary: GapCommunityDiscussionSummary;
  discussions: Array<{
    id: string;
    title: string;
    content: string;
    type: string;
    voteScore: number;
    commentCount: number;
    createdAt: string;
    updatedAt?: string;
    community?: { id: string; name: string; slug: string };
    references?: Array<{ id?: string; paperId?: string; title?: string; doi?: string; year?: number; verified?: boolean }>;
  }>;
  citations: GapCommunityCitation[];
  boundary: string;
}

export interface ReviewForumCitationAsEvidenceRequest {
  projectId?: string;
  screeningStatus?: "UNDECIDED" | "INCLUDED" | "EXCLUDED";
  exclusionReason?: "WRONG_RESEARCH_TOPIC" | "WRONG_POPULATION_CONTEXT" | "WRONG_METHODOLOGY" | "NOT_PEER_REVIEWED" | "INSUFFICIENT_RELEVANT_EVIDENCE" | "DUPLICATE" | "OTHER";
  exclusionNote?: string;
  relation?: "SUPPORTING" | "COUNTER" | "RELATED";
  evidenceType?: string;
  excerpt?: string;
  evidenceSelections?: Array<{ evidenceType: string; excerpt: string }>;
  explanation?: string;
  confirmRelation?: boolean;
}

export interface GapStructuredEvidenceItem {
  evidenceType: string;
  excerpt: string;
  sourceLocation: string;
}

export type GapValidationAction = "VALIDATE" | "CHALLENGE" | "REQUEST_EVIDENCE" | "SUGGEST_EVIDENCE" | "REFINE_SCOPE" | "REJECT";

/** A gap waiting for an expert decision (GET /gaps/validation-queue). Project details are never included. */
export interface GapValidationQueueItem {
  version?: number;
  id: string;
  topic: string;
  title: string;
  description: string;
  gapType?: ResearchGapType;
  scope?: string;
  establishedKnowledge?: string;
  observedLimitation?: string;
  missingEvidence?: string;
  significanceExplanation?: string;
  suggestedResearchQuestion?: string;
  validationStatus: GapValidationStatus;
  gapConfidence?: GapAssessmentLevel;
  researchPriority?: GapAssessmentLevel;
  origin?: "HUMAN" | "AI_ASSISTED";
  evidenceCount: number;
  validationCount: number;
  /** The requesting expert already recorded a decision on this gap. */
  reviewedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GapValidationRecord {
  gapVersion?: number;
  id: string;
  action: GapValidationAction;
  comment: string;
  suggestedChanges?: string | null;
  createdAt: string;
  reviewerId?: { id: string; fullName?: string | null; institution?: string | null; academicProfileType?: string | null };
}

/** One structured evidence record linked to a gap (GET /gaps/:id/evidence). */
export interface GapEvidenceRecordView {
  id: string;
  evidenceKind: "SUPPORTING" | "COUNTER";
  evidenceType: string;
  excerpt: string;
  explanation: string;
  createdAt: string;
  paperId?: { id: string; title: string; publicationYear?: number | null; journalName?: string | null; doi?: string | null };
}

export interface CreateGapValidationRequest {
  expectedVersion: number;
  action: GapValidationAction;
  comment: string;
  suggestedChanges?: string;
}
