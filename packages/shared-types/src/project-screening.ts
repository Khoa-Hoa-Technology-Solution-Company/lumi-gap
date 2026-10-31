import type { ScreeningPhase } from "./project-research.js";
import type { WorkspacePage, WorkspacePerson } from "./project-workspace.js";

export type ScreeningChoice = "INCLUDE" | "EXCLUDE" | "UNSURE";
export type ScreeningState = "NOT_REVIEWED" | "IN_REVIEW" | "NEEDS_RESOLUTION" | "NEEDS_MORE_INFO" | "ADJUDICATING" | "AWAITING_FINALIZATION" | "INCLUDED" | "EXCLUDED" | "BACKGROUND";
export type ScreeningConsensusPolicy = "UNANIMOUS" | "STRICT_MAJORITY";
export interface ScreeningSettings {
  workflowVersion?: number;
  authorizedAdjudicatorIds?: string[]; allowConservativeFullText?: boolean;
  reviewMode: "COLLABORATIVE" | "SIMPLE" | "INDEPENDENT"; blindReview: boolean; resolutionPolicy: "CONSENSUS" | "ADJUDICATION";
  version: number; requiredReviewers: number; consensusPolicy: ScreeningConsensusPolicy;
  aiAssisted: boolean; inclusionCriteria: string[]; exclusionCriteria: string[]; researchQuestions: string[];
  stages?: ScreeningPhase[];
  questionOptions?: Array<{ id: string; text: string }>;
  discoveryGoalEnabled?: boolean;
  discoveryGoalTarget?: number;
  discoveryGoalPeriod?: "WEEK" | "MONTH";
  discoveryGoalPaused?: boolean;
}

export interface ScreeningWorkspaceSummary {
  myActiveClaims: Array<{
    paperId: string;
    roundId: string;
    assignmentId: string;
    title: string;
    authors?: string[];
    publicationYear: number;
    journalName?: string | null;
    phase: ScreeningPhase;
    dueAt: string | null;
    expiresInSeconds: number | null;
    canExtend: boolean;
    canRelease: boolean;
  }>;
  pendingConsensus: Array<{
    paperId: string;
    roundId: string;
    agreementId: string;
    title: string;
    decision: string;
    reason: string;
    proposedByName: string;
  }>;
  pendingAdjudications: Array<{
    paperId: string;
    roundId: string;
    title: string;
    status: ScreeningState;
  }>;
  myProposalsCount: number;
  recentProposals: Array<{
    paperId: string;
    title: string;
    publicationYear?: number;
    journalName?: string | null;
    proposedAt: string;
    screeningStatus: string;
    finalDecision?: string | null;
    reviewProgress: { completed: number; required: number; held: number };
  }>;
  eligibleQueueCount: number;
  nextEligiblePaperId: string | null;
  discoveryGoal: {
    enabled: boolean;
    target: number;
    period: string;
    paused: boolean;
    currentCount: number;
    remaining: number;
  };
  capacityAdvice: {
    queueStatus: "EMPTY_LIBRARY" | "EMPTY_QUEUE" | "NORMAL" | "HIGH_BACKLOG";
    message: string;
    suggestedAction?: "DISCOVER_MORE" | "REVIEW_QUEUE" | "FOCUS_RQ";
  };
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
  resolution?: { decision: "NEEDS_MORE_INFO"; reason: string; createdAt: string } | null;
  canRequestAdjudication?: boolean; canAdvanceConservatively?: boolean; provisionalAdvance?: boolean;
  reviewerIntakeClosed?: boolean;
  canProposeAgreement?: boolean;
  agreement?: ScreeningAgreement | null;
  adjudicators?: Array<WorkspacePerson & { mentor: boolean; proposer: boolean }>;
  discussionReady?: boolean; canReopenOwn?: boolean; finalizerAssigned?: boolean;
  extractionReady?: boolean;
  finalizer: WorkspacePerson; canFinalize: boolean; canDefer?: boolean;
  id: string; paperId: string; number: number; phase: ScreeningPhase; version: number; status: ScreeningState;
  active: boolean; settings: ScreeningSettings; unblindedAt: string | null; independenceCompromised: boolean;
  assignments: ScreeningAssignment[]; reviews: ScreeningReview[]; myReview: ScreeningReview | null;
  myAssignmentId: string | null; hiddenReviews: boolean; completed: number; assigned: number;
  finalDecision: { id: string; version: number; decision: "INCLUDED" | "EXCLUDED" | "BACKGROUND"; source: "CONSENSUS" | "MANUAL"; reason: string; resolverId: string | null; createdAt: string } | null;
  canReview: boolean; canManage: boolean; aiVisible: boolean;
}
export interface ScreeningAgreement {
  id: string; decision: "INCLUDED" | "EXCLUDED" | "NEEDS_MORE_INFO"; reason: string; proposedById: string;
  reviewIds: string[]; confirmedByIds: string[]; requiredReviewerIds: string[];
  canConfirm: boolean; canDecline?: boolean; confirmations?: Array<{ reviewerId: string; confirmedAt: string }>; createdAt: string;
}
export interface ScreeningSharedDiscussion { id: string; comment: string; createdAt: string }
export interface ScreeningAdjudicationPacket {
  discussion?: ScreeningSharedDiscussion[];
  roundId: string; paperId: string; phase: ScreeningPhase; roundVersion: number;
  paper: { title: string; abstractText: string | null; doi: string | null; publicationYear: number };
  inclusionCriteria: string[]; exclusionCriteria: string[]; researchQuestions: string[];
  reviews: Array<{ id: string; decision: ScreeningChoice; exclusionReason: string; comment: string; revision: number; scope: ScreeningPhase | null; fullTextReference: string | null }>;
}
export interface ScreeningAdjudicationView {
  resolution?: { decision: "NEEDS_MORE_INFO"; reason: string; createdAt: string } | null;
  availableDiscussion?: ScreeningSharedDiscussion[];
  packet: ScreeningAdjudicationPacket; version: number; status: ScreeningState; canResolve: boolean;
  finalDecision: { decision: "INCLUDED" | "EXCLUDED" | "BACKGROUND"; reason: string; createdAt: string } | null;
}
export interface ScreeningPaperRow {
  tags?: string[]; notes?: string | null; importSource?: string | null;
  proposer: WorkspacePerson | null; proposedAt: string; proposalReason: string; updatedAt: string; canEditProposal: boolean;
  paperId: string; title: string; abstractText: string | null; doi: string | null; publicationYear: number;
  journalName?: string | null; paperKind?: string;
  authors?: string[]; paperLink?: string | null; fullTextAvailable?: boolean;
  citationCount?: number; openAccessStatus?: string; keywords?: string[];
  legacyStatus: string; legacyProvenance: boolean; round: ScreeningRoundView | null;
}
export interface ScreeningBoard extends WorkspacePage<ScreeningPaperRow> { adjudicatorOptions?: Array<WorkspacePerson & { mentor: boolean }>; librarySummary?: { selected: number; attention: number; discussion: number }; tags?: string[]; filters: { proposers: WorkspacePerson[]; reviewers: WorkspacePerson[] }; progress: { total: number; reviewed: number; finalized: number; legacy: number }; canManage: boolean; people: WorkspacePerson[]; settings: ScreeningSettings; myProgress: { assigned: number; completed: number; pending: number; overdue: number } }
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
