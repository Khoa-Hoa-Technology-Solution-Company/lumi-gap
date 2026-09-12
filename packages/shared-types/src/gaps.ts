// packages/shared-types/src/gaps.ts

export type GapStatus = "active" | "resolved" | "dismissed";
export type GapSource = "report" | "standalone";
export type GapAnalysisStatus = "queued" | "analyzing" | "ready" | "failed";
export type GapEvidenceStatus = "confirmed" | "weak" | "ai_only";
export type GapEvidenceMode = "auto" | "selected" | "hybrid";

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
  userId: string;
  status: GapStatus;
  createdAt: string;
  probe?: { topicA: string; topicB: string; yearFrom?: number; yearTo?: number };
  intersectionCount?: number;
  parentCounts?: { a: number; b: number };
  parentTrend?: { topic: string; growthRatePct: number } | null;
  evidenceConfidence?: number;
}

export interface GapAnalysisResult {
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
