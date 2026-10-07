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

export interface ResearchGapItem {
  id: string;
  topic: string;
  normalizedTopic: string;
  title: string;
  description: string;
  rationale: string;
  supportingPaperIds: string[];
  supportingPapers: GapSupportingPaper[];
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
  probe?: { topicA: string; topicB: string; yearFrom?: number; yearTo?: number };
  intersectionCount?: number;
  parentCounts?: { a: number; b: number };
  parentTrend?: { topic: string; growthRatePct: number } | null;
  evidenceConfidence?: number;
  /** A probe topic has too few papers for the evidence score to be meaningful. */
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
