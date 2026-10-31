import type { WorkspacePage, WorkspacePerson } from "./project-workspace.js";
import type { ProjectScreeningStatus } from "./project.js";
import type { PaperAiAnalysis } from "./paper.js";
import type { PaperKnowledge } from "./knowledge.js";
export interface ProjectPaperAnalysis { paperId: string; title: string; screeningStatus: ProjectScreeningStatus; analysis: PaperAiAnalysis | null; knowledge: PaperKnowledge }

export type ScreeningPhase = "TITLE_ABSTRACT" | "FULL_TEXT";
export type EvidenceReviewState = "PENDING" | "ACCEPTED" | "REJECTED";
export type GapAssessment = "PROPOSED" | "IN_REVIEW" | "NEEDS_MORE_EVIDENCE" | "TEAM_SUPPORTED" | "REJECTED";
export interface EvidenceContent {
  claim: string; quotation: string; locator: string; context: string; methodology: string;
  population: string; results: string; limitations: string; themes: string[];
}
export interface ProjectEvidence extends EvidenceContent {
  id: string; projectId: string; paperId: string; version: number; origin: "HUMAN" | "AI_SUGGESTED";
  reviewState: EvidenceReviewState; reviewRationale: string; extractedById: string;
  reviewedById: string | null; reviewedAt: string | null; createdAt: string; updatedAt: string;
  sourceSnapshot: Record<string, unknown>; sourceTitle: string; sourceNeedsReview?: boolean;
  relatedQuestions?: Array<{ id: string; text: string }>;
  relatedGaps?: Array<{ id: string; title: string }>;
}
export interface ProjectEvidencePage extends WorkspacePage<ProjectEvidence> { legacyGapId?: string }
export interface SaveProjectEvidence extends EvidenceContent { paperId: string; origin: "HUMAN" | "AI_SUGGESTED"; clientKey: string; sourceChunkId?: string; corpusPaperId?: string; analysisHash?: string }
export interface ExtractionSuggestion { corpusPaperId?: string; analysisHash?: string; paperId: string; content: EvidenceContent; provenance: "CORPUS_EXTRACTION_UNREVIEWED" | "PAPER_ANALYSIS_UNREVIEWED" }

export interface SynthesisContent { commonFindings: string; contradictions: string; openQuestions: string }
export interface SynthesisSource extends EvidenceContent {
  id: string; version: number; revisionId: string; paperId: string; projectPaperId: string;
  sourceTitle: string; sourceUpdatedAt: string; paperUpdatedAt: string;
}
export interface ProjectSynthesis extends SynthesisContent {
  id: string; revisionId: string; version: number; status: "DRAFT" | "ACCEPTED" | "QUEUED" | "FAILED";
  sources: SynthesisSource[]; rationale: string; origin: "HUMAN" | "AI_SUGGESTED";
  updatedAt: string; actorId: string; stale: boolean; errorMessage?: string;
}
export interface SaveSynthesis extends SynthesisContent {
  expectedVersion: number; evidence: Array<{ id: string; version: number }>;
}
export interface SynthesisRevision extends SynthesisContent { version: number; status: ProjectSynthesis["status"]; createdAt: string; sourceCount: number }
export interface ProjectResearchQuestion {
  id: string; text: string; sourceGapId?: string; sourceGapVersion?: number;
  sourceGapTitle?: string; evidenceCount: number; needsReview: boolean;
}
export interface ScreeningDecision {
  id: string; reviewerId: string; phase: ScreeningPhase; decision: ProjectScreeningStatus;
  reason: string; version: number; updatedAt: string;
}
export interface ProjectResearchPaper {
  dataStatus?: string;
  id: string; paperId: string; title: string; doi: string | null; publicationYear: number | null;
  journalName: string | null; abstractText: string | null; notes: string | null;
  authors: string[]; paperLink: string | null;
  tags: string[]; collectionName: string | null; importSource: string; sourceReference: string | null;
  screeningStatus: ProjectScreeningStatus; screenedById: string | null; screenedAt: string | null;
  inclusionReason: string | null; exclusionReason: string | null; exclusionNote: string | null;
  updatedAt: string; assignedPhases: ScreeningPhase[]; votes: ScreeningDecision[]; hiddenVotes: boolean; conflict: boolean;
  files: Array<{ id: string; sha256: string; byteSize: number; createdAt: string }>;
}
export interface ProjectResearchLibrary extends WorkspacePage<ProjectResearchPaper> {
  mode: "EXPLORATORY" | "INDEPENDENT"; blinded: boolean; projectVersion: number; canManage: boolean;
  people: WorkspacePerson[];
}
export interface GapResearchView {
  canContribute: boolean;
  canRequestExpertReview?: boolean;
  relatedLiterature?: Array<{ paperId: string; title: string; publicationYear: number | null; suggestedSupport: boolean }>;
  discussions: Array<{ id: string; title: string; body: string; status: string }>;
  guidance: Array<{ id: string; author: string; note: string; gapVersion: number; attribution: string; createdAt: string }>;
  gap: { id: string; analysisId?: string | null; title: string; description: string; rationale: string; scope: string | null; assumptions: string;
    origin: string; version: number; validationStatus: string; assessmentStatus: GapAssessment; assessmentRationale: string };
  evidence: Array<{ id: string; paperId: string; evidenceKind: string; explanation: string; excerpt: string | null;
    evidenceItemId: string | null; evidenceRevisionId: string | null; sourceTitle: string; reviewed: boolean; sourceChanged: boolean;
    evidenceVersion?: number; reviewState?: EvidenceReviewState; discovery?: boolean; claim?: string; methodology?: string; limitations?: string }>;
  questions: Array<{ id: string; text: string; sourceGapVersion?: number }>;
  history: Array<{ id: string; version: number; actorId: string | null; createdAt: string; snapshot: Record<string, unknown> }>;
}
