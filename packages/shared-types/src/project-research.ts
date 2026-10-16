import type { WorkspacePage, WorkspacePerson } from "./project-workspace.js";
import type { ProjectScreeningStatus } from "./project.js";

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
  sourceSnapshot: Record<string, unknown>; sourceTitle: string;
  relatedQuestions?: Array<{ id: string; text: string }>;
  relatedGaps?: Array<{ id: string; title: string }>;
}
export interface ProjectEvidencePage extends WorkspacePage<ProjectEvidence> { legacyGapId?: string }
export interface SaveProjectEvidence extends EvidenceContent { paperId: string; origin: "HUMAN" | "AI_SUGGESTED"; clientKey: string; sourceChunkId?: string; corpusPaperId?: string }
export interface ExtractionSuggestion { corpusPaperId: string; paperId: string; content: EvidenceContent; provenance: "CORPUS_EXTRACTION_UNREVIEWED" }
export interface ScreeningDecision {
  id: string; reviewerId: string; phase: ScreeningPhase; decision: ProjectScreeningStatus;
  reason: string; version: number; updatedAt: string;
}
export interface ProjectResearchPaper {
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
  gap: { id: string; title: string; description: string; rationale: string; scope: string | null; assumptions: string;
    origin: string; version: number; validationStatus: string; assessmentStatus: GapAssessment; assessmentRationale: string };
  evidence: Array<{ id: string; paperId: string; evidenceKind: string; explanation: string; excerpt: string | null;
    evidenceItemId: string | null; evidenceRevisionId: string | null; sourceTitle: string; reviewed: boolean; sourceChanged: boolean }>;
  questions: Array<{ id: string; text: string; sourceGapVersion?: number }>;
  history: Array<{ id: string; version: number; actorId: string | null; createdAt: string; snapshot: Record<string, unknown> }>;
}
