import type { ScreeningPhase } from "./project-research.js";
import type { WorkspacePage, WorkspacePerson } from "./project-workspace.js";

export type ScreeningChoice = "INCLUDE" | "EXCLUDE" | "UNSURE";
export type ScreeningState = "NOT_REVIEWED" | "IN_REVIEW" | "NEEDS_RESOLUTION" | "AWAITING_FINALIZATION" | "INCLUDED" | "EXCLUDED" | "BACKGROUND";
export type ScreeningConsensusPolicy = "UNANIMOUS" | "STRICT_MAJORITY";
export interface ScreeningSettings {
  reviewMode: "COLLABORATIVE" | "SIMPLE" | "INDEPENDENT"; blindReview: boolean; resolutionPolicy: "CONSENSUS" | "ADJUDICATION";
  version: number; requiredReviewers: number; consensusPolicy: ScreeningConsensusPolicy;
  aiAssisted: boolean; inclusionCriteria: string[]; exclusionCriteria: string[]; researchQuestions: string[];
  stages?: ScreeningPhase[];
  questionOptions?: Array<{ id: string; text: string }>;
}
export interface ScreeningReview {
  id: string; assignmentId: string; reviewerId: string; revision: number; decision: ScreeningChoice;
  exclusionReason: string; comment: string; submittedAt: string;
  scope?: ScreeningPhase | null; fullTextReference?: string | null;
  researchQuestions?: Array<{ id: string; text: string }>;
}
export interface ScreeningAssignment {
  id: string; reviewerId: string; name: string; revision: number; completed: boolean; active: boolean;
  dueAt: string | null; overdue: boolean;
}
export interface ScreeningRoundView {
  extractionReady?: boolean;
  finalizer: WorkspacePerson; canFinalize: boolean; canDefer?: boolean;
  id: string; paperId: string; number: number; phase: ScreeningPhase; version: number; status: ScreeningState;
  active: boolean; settings: ScreeningSettings; unblindedAt: string | null; independenceCompromised: boolean;
  assignments: ScreeningAssignment[]; reviews: ScreeningReview[]; myReview: ScreeningReview | null;
  myAssignmentId: string | null; hiddenReviews: boolean; completed: number; assigned: number;
  finalDecision: { id: string; version: number; decision: "INCLUDED" | "EXCLUDED" | "BACKGROUND"; source: "CONSENSUS" | "MANUAL"; reason: string; resolverId: string | null; createdAt: string } | null;
  canReview: boolean; canManage: boolean; aiVisible: boolean;
}
export interface ScreeningPaperRow {
  tags?: string[]; notes?: string | null; importSource?: string | null;
  proposer: WorkspacePerson | null; proposedAt: string; proposalReason: string; updatedAt: string; canEditProposal: boolean;
  paperId: string; title: string; abstractText: string | null; doi: string | null; publicationYear: number;
  journalName?: string | null; paperKind?: string;
  authors?: string[]; paperLink?: string | null; fullTextAvailable?: boolean;
  legacyStatus: string; legacyProvenance: boolean; round: ScreeningRoundView | null;
}
export interface ScreeningBoard extends WorkspacePage<ScreeningPaperRow> { librarySummary?: { selected: number; attention: number; discussion: number }; tags?: string[]; filters: { proposers: WorkspacePerson[]; reviewers: WorkspacePerson[] }; progress: { total: number; reviewed: number; finalized: number; legacy: number }; canManage: boolean; people: WorkspacePerson[]; settings: ScreeningSettings; myProgress: { assigned: number; completed: number; pending: number; overdue: number } }
export interface ScreeningMetrics {
  reviewedPapers: number; finalizedPapers: number; legacyPapers: number;
  totalPapers: number; evaluatedPapers: number; fullyParticipated: number; fullyReviewed: number; agreements: number; disagreements: number; pendingReviews: number;
  submittedReviews: number; assignedReviews: number; completionRate: number | null; agreementRate: number | null; conflictRate: number | null;
  unresolved: number; resolved: number; excludedFromAgreement: number;
  distribution: Record<ScreeningState, number>; exclusionReasons: { reason: string; count: number }[];
  workload: { reviewerId: string; name: string; assigned: number; completed: number; overdue: number }[];
  kappa: { value: number | null; reason: "OK" | "NO_PAIRS" | "INCONSISTENT_PAIRS" | "MULTI_RATER" | "DEGENERATE"; papers: number; reviewerIds: string[] };
}
export interface ScreeningAiResult {
  decision: ScreeningChoice; explanation: string; inclusionCriteria: string[]; exclusionCriteria: string[];
  evidence: { field: "title" | "abstract"; quote: string }[]; missingInformation: string[];
}
export interface ScreeningAiView { id: string; status: "QUEUED" | "COMPLETED" | "FAILED"; createdAt: string; generatedAt: string | null; result: ScreeningAiResult | null }
export interface ScreeningAuditView { id: string; type: string; actorId: string; actorName?: string; createdAt: string; details: Record<string, unknown> | null }
