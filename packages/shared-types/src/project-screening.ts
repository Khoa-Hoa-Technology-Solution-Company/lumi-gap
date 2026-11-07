import type { ScreeningPhase } from "./project-research.js";
import type { WorkspacePage, WorkspacePerson } from "./project-workspace.js";

export type ScreeningTaskAction = "REVIEW" | "DISCUSSION" | "CONSENSUS" | "STATEMENT" | "ADJUDICATION" | "COORDINATION" | "FULLTEXT" | "INFORMATION";
export type ScreeningTaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "EXPIRED" | "CANCELLED" | "REPLACED";
export interface ScreeningAutomaticTask {
  id: string; paperId: string; roundId: string; assigneeId: string; actionType: ScreeningTaskAction;
  status: ScreeningTaskStatus; title: string; reason: string; phase: ScreeningPhase; roundNumber: number;
  roundStatus: string; roundActive: boolean; dueAt: string | null; endedAt: string | null; updatedAt: string; actionLabel?: string;
}
export interface ScreeningTaskFeedback {
  roundId?: string; completedAction: string; nextStatus: string; nextActor: string;
}

export type ScreeningClassification = "AGREEMENT_INCLUDE" | "AGREEMENT_EXCLUDE" | "CONFLICT" | "NEEDS_CLARIFICATION" | "NEEDS_MORE_INFORMATION" | "EXCLUSION_REASON_MISMATCH";
export type ScreeningResolutionType = "AGREEMENT_FROM_REVIEWS" | "CONSENSUS_AFTER_DISCUSSION" | "ADJUDICATION";
export type ScreeningChoice = "INCLUDE" | "EXCLUDE" | "UNSURE";
export type ScreeningStageMode = "SINGLE_STAGE" | "TWO_STAGE";
export type ScreeningOutcome = "WAITING_REVIEWS" | "WAITING_SECOND_REVIEW" | "FINAL_INCLUDED" | "EXCLUDED" | "CONFLICT" | "NEEDS_RESOLUTION" | "NEEDS_CLARIFICATION" | "ADVANCE_TO_FULLTEXT" | "WAITING_FULLTEXT";
export type ScreeningState = "NOT_REVIEWED" | "IN_REVIEW" | "NEEDS_RESOLUTION" | "NEEDS_MORE_INFO" | "ADJUDICATING" | "AWAITING_FINALIZATION" | "INCLUDED" | "EXCLUDED" | "BACKGROUND" | "WAITING_FULLTEXT";
export type ScreeningConsensusPolicy = "UNANIMOUS" | "STRICT_MAJORITY";
export interface ScreeningSettings {
  preferredAdjudicatorId?: string | null; adjudicationCoordinatorIds?: string[]; statementWindowHours?: number; adjudicationReminderHours?: number; adjudicationReassignHours?: number;
  workflowVersion?: number;
  screeningMode?: ScreeningStageMode;
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

export type ScreeningEvaluationStatus = "WAITING_REVIEWER" | "CONFLICT" | "ADJUDICATING" | "INCLUDED" | "EXCLUDED" | "NEEDS_MORE_INFO" | "AWAITING_FINALIZATION" | "BACKGROUND" | "WAITING_FULLTEXT" | "ADVANCE_TO_FULLTEXT";
/** Read-only card projection; review choices are included only after protocol disclosure. */
export interface ScreeningWorkPaper {
  invalidated?: boolean;
  roundId: string; paperId: string; title: string; authors: string[];
  publicationYear: number | null; journalName: string | null;
  roundNumber: number; phase: ScreeningPhase; status: ScreeningState;
  completed: number; required: number; hiddenReviews: boolean;
  reviews: Array<{ reviewerId: string; name: string; decision: ScreeningChoice }>;
  acceptedForAnalysis: boolean; resolutionType: ScreeningResolutionType | null;
  groupReason: string | null;
}
export interface ScreeningPersonalEvaluation {
  invalidated?: boolean;
  paperId: string;
  roundId: string;
  title: string;
  publicationYear: number | null;
  journalName: string | null;
  phase: ScreeningPhase;
  myDecision: ScreeningChoice;
  submittedAt: string;
  groupStatus: ScreeningEvaluationStatus;
  finalDecision: string | null;
  isAdjudicated: boolean;
  resolverName: string | null;
  decidedAt: string | null;
  acceptedForAnalysis?: boolean;
  caseStatus?: string | null;
  groupReason?: string | null;
  groupSourceMaterial?: string | null;
  roundNumber?: number;
}

export interface ScreeningWorkspaceSummary {
  automaticTasks?: ScreeningAutomaticTask[];
  readOnly?: boolean;
  pendingInformation?: Array<{ paperId: string; roundId: string; title: string; reason: string; kind: "FULLTEXT" | "INFORMATION" }>;
  workPapers?: ScreeningWorkPaper[];
  acceptedPapers?: Array<{
    paperId: string; roundId: string; title: string;
    publicationYear: number | null; journalName: string | null; phase: ScreeningPhase;
    acceptedAt: string; isAdjudicated: boolean; resolverName: string | null;
  }>;
  myEvaluations?: ScreeningPersonalEvaluation[];
  pendingDiscussions?: Array<{ paperId: string; roundId: string; title: string; status: ScreeningState; classification?: ScreeningClassification | null; phase?: ScreeningPhase }>;
  expiredClaims?: Array<{ paperId: string; roundId: string; title: string }>;
  completedPersonalReviews?: number;
  myTrackedDisputes?: Array<{
    paperId: string;
    roundId: string;
    title: string;
    publicationYear?: number | null;
    journalName?: string | null;
    phase: ScreeningPhase;
    status: ScreeningState;
    caseStatus?: string;
    needsMyStatement?: boolean;
    myDecision: ScreeningChoice;
    deadline?: string | null;
    adjudicatorName?: string | null;
  }>;
  myCompletedEvaluations?: Array<{
    paperId: string;
    roundId: string;
    title: string;
    publicationYear?: number | null;
    journalName?: string | null;
    phase: ScreeningPhase;
    finalDecision: string;
    myDecision: ScreeningChoice;
    decidedAt?: string | null;
    resolverName?: string | null;
    isAdjudicated?: boolean;
  }>;
  myActiveClaims: Array<{
    paperId: string;
    roundId: string;
    assignmentId: string;
    title: string;
    authors?: string[];
    publicationYear: number | null;
    journalName?: string | null;
    phase: ScreeningPhase;
    dueAt: string | null;
    expiresInSeconds: number | null;
    canExtend: boolean;
    canRelease: boolean;
    partner?: { name: string; completed: boolean } | null;
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
    caseStatus?: string;
  }>;
  myProposalsCount: number;
  recentProposals: Array<{
    paperId: string;
    title: string;
    publicationYear?: number;
    journalName?: string | null;
    proposedAt: string;
    screeningStatus: string;
    classification?: ScreeningClassification | null; roundStatus?: ScreeningState; caseStatus?: string;
    finalDecision?: string | null;
    legacyProgress?: boolean;
    legacyNeedsAudit?: boolean;
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
  phaseMarker?: "INDEPENDENT_INITIAL" | "POST_DISCUSSION_REVISION";
  reassessmentReason?: string;
  scope?: ScreeningPhase | null; fullTextReference?: string | null;
  researchQuestions?: Array<{ id: string; text: string }>;
}
export interface ScreeningAssignment {
  id: string; reviewerId: string; name: string; revision: number; completed: boolean; active: boolean;
  dueAt: string | null; overdue: boolean;
}
export interface ScreeningRoundView {
  invalidated?: boolean;
  outcome?: ScreeningOutcome;
  canResumeFullText?: boolean;
  classification?: ScreeningClassification | null; resolutionType?: ScreeningResolutionType | null;
  legacyNeedsAudit?: boolean;
  legacyOutcome?: boolean;
  canClaim?: boolean;
  isProposer?: boolean;
  proposerExcluded?: boolean;
  proposerExceptionGranted?: boolean;
  resolution?: { decision: "NEEDS_MORE_INFO"; reason: string; createdAt: string; resolverName?: string; resolverRole?: string; sourceMaterial?: string | null } | null;
  canRequestAdjudication?: boolean; canReassess?: boolean; canAdvanceConservatively?: boolean; provisionalAdvance?: boolean;
  reviewerIntakeClosed?: boolean;
  canProposeAgreement?: boolean;
  agreement?: ScreeningAgreement | null;
  adjudicators?: Array<WorkspacePerson & { mentor: boolean; proposer: boolean }>;
  adjudicationCase?: {
    id: string;
    status: "COLLECTING" | "NEEDS_MORE_INFO" | "INVITED" | "ACCEPTED" | "COI_REVIEW" | "CANCELLED_REOPENED" | "REQUESTED" | "WAITING_ASSIGNMENT" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED_AS_RESOLVED";
    requestedByIds: string[];
    disputePoints: Array<{ reviewerId: string; reviewerName: string; text: string; createdAt: string }>;
    assignedAdjudicator?: { id: string; name: string; mentor: boolean; role?: string } | null;
    ready?: boolean;
    deadline?: string;
    createdAt: string;
  } | null;
  reviewHistory?: Array<{
    id: string;
    assignmentId: string;
    reviewerId: string;
    reviewerName: string;
    revision: number;
    phaseMarker: "INDEPENDENT_INITIAL" | "POST_DISCUSSION_REVISION";
    decision: ScreeningChoice;
    exclusionReason: string;
    comment: string;
    submittedAt: string;
  }>;
  escalationReady?: boolean; discussionReady?: boolean; canReopenOwn?: boolean; finalizerAssigned?: boolean;
  extractionReady?: boolean;
  finalizer: WorkspacePerson; canFinalize: boolean; canDefer?: boolean;
  id: string; paperId: string; number: number; phase: ScreeningPhase; version: number; status: ScreeningState;
  active: boolean; settings: ScreeningSettings; unblindedAt: string | null; independenceCompromised: boolean;
  assignments: ScreeningAssignment[]; reviews: ScreeningReview[]; myReview: ScreeningReview | null;
  myAssignmentId: string | null; hiddenReviews: boolean; completed: number; assigned: number;
  finalDecision: { id: string; version: number; decision: "INCLUDED" | "EXCLUDED" | "BACKGROUND"; source: "CONSENSUS" | "MANUAL"; reason: string; exclusionReason?: string | null; sourceMaterial?: string | null; resolverId: string | null; createdAt: string } | null;
  canReview: boolean; canManage: boolean; aiVisible: boolean;
}
export interface ScreeningAgreement {
  exclusionReason?: string; sourceMaterial?: string; retrieveFullText?: boolean;
  id: string; decision: "INCLUDED" | "EXCLUDED" | "NEEDS_MORE_INFO"; reason: string; proposedById: string;
  reviewIds: string[]; confirmedByIds: string[]; requiredReviewerIds: string[];
  canConfirm: boolean; canDecline?: boolean; confirmations?: Array<{ reviewerId: string; confirmedAt: string }>; createdAt: string;
}
export interface ScreeningSharedDiscussion { id: string; comment: string; createdAt: string; actorName?: string }
export interface ScreeningAdjudicationPacket {
  sourceUrl?: string | null;
  sources?: Array<{ id: string; sha256: string; byteSize: number }>;
  protocol?: { screeningMode?: ScreeningStageMode; version: number; workflowVersion: number | null; stages: ScreeningPhase[]; allowConservativeFullText: boolean };
  consensusAttempts?: Array<{ id: string; action: string; actorName: string; createdAt: string; decision?: string; reason?: string }>;
  discussion?: ScreeningSharedDiscussion[];
  roundId: string; paperId: string; phase: ScreeningPhase; roundVersion: number;
  paper: { title: string; abstractText: string | null; doi: string | null; publicationYear: number };
  inclusionCriteria: string[]; exclusionCriteria: string[]; researchQuestions: string[];
  reviews: Array<{ reviewerId?: string; reviewerName?: string; id: string; decision: ScreeningChoice; exclusionReason: string; comment: string; revision: number; scope: ScreeningPhase | null; fullTextReference: string | null }>;
  disputePoints?: Array<{ reviewerId: string; reviewerName: string; text: string; createdAt: string }>;
  requestReason?: string;
  caseMetadata?: { caseId: string; status: string; requestedByIds: string[]; assignedAdjudicator?: { id: string; name: string; mentor: boolean } | null; createdAt: string };
  allReviews?: Array<{ id: string; reviewerId: string; revision: number; decision: ScreeningChoice; exclusionReason: string; comment: string; phaseMarker: "INDEPENDENT_INITIAL" | "POST_DISCUSSION_REVISION"; submittedAt: string }>;
}
export interface ScreeningAdjudicationView {
  case?: ScreeningDisputeCase | null;
  caseHistory?: Array<{ id: string; status: string; createdAt: string }>;
  thread?: ScreeningSharedDiscussion[];
  resolution?: { decision: "NEEDS_MORE_INFO"; reason: string; createdAt: string; resolverName?: string; resolverRole?: string; sourceMaterial?: string | null } | null;
  availableDiscussion?: ScreeningSharedDiscussion[];
  packet: ScreeningAdjudicationPacket; version: number; status: ScreeningState; canResolve: boolean;
  finalDecision: { resolverName?: string; resolverRole?: string; decision: "INCLUDED" | "EXCLUDED" | "BACKGROUND"; reason: string; exclusionReason?: string | null; sourceMaterial?: string | null; createdAt: string } | null;
}
export interface ScreeningDisputeStatement {
  reviewerId: string; name: string; completed: boolean; hidden: boolean; revision: number;
  useExisting?: boolean; text?: string; submittedAt?: string;
  history?: Array<{ revision: number; packetVersion: number; text: string; useExisting: boolean; createdAt: string }>;
}
export interface ScreeningDisputeCase {
  /** Canonical reviewer identity for the current viewer; never supplied by the client. */
  myReviewerId?: string | null;
  id: string; status: string; version: number; packetVersion: number; active: boolean;
  lockedAt?: string | null; canStart?: boolean; canReassign?: boolean;
  deadline: string; ready: boolean; createdAt: string; requestedByIds: string[];
  invitation: { id: string; userId: string; name: string; role: string; status: string; responseReason?: string | null; createdAt: string; respondedAt: string | null } | null;
  invitations: Array<{ id: string; userId: string; name: string; role: string; status: string; responseReason?: string | null; createdAt: string; respondedAt: string | null }>;
  statements: ScreeningDisputeStatement[];
  candidates: Array<{ id: string; name: string; role: string }>;
  conflicts: Array<{ id: string; reason: string; resolvedAt: string | null; resolution: string | null; upheld: boolean | null }>;
  canRespond: boolean; canStatement: boolean; canCoordinate: boolean; canReport: boolean; canResolve: boolean;
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

/** Invalidation only: clients refetch content through authorized screening APIs. */
export interface ScreeningLiveEvent {
  type: "ready" | "comment" | "round_updated";
  projectId: string;
  roundId: string;
  occurredAt: string;
}
