import type { CreditRole, ContributionCategoryKey } from "./project-contributions.js";
import type {
  ProjectAiDataPolicy,
  ProjectExportPolicy,
  ProjectExternalLookupPolicy,
  ProjectVisibility,
} from "./project.js";
import type { WorkspacePerson } from "./project-workspace.js";

export interface ProjectSecurityEventView {
  id: string;
  type: string;
  actor: WorkspacePerson | null;
  entityKind: string | null;
  entityId: string | null;
  artifactVersion: number | null;
  checksumSha256: string | null;
  reason: string | null;
  visibility: string | null;
  createdAt: string;
  summary: string;
}

export interface ProjectSecurityOverview {
  projectId: string;
  visibility: ProjectVisibility;
  exportPolicy: ProjectExportPolicy;
  aiDataPolicy: ProjectAiDataPolicy;
  externalLookupPolicy: ProjectExternalLookupPolicy;
  canManage: boolean;
  canExportSource: boolean;
  activeMemberCount: number;
  formerMemberCount: number;
  activeMentorCount: number;
  recentEvents: ProjectSecurityEventView[];
}

export interface PersonalContributionHistoryItem {
  id: string;
  title: string;
  category: ContributionCategoryKey;
  source: "MANUAL" | "WORKSPACE" | "LEGACY";
  workDate: string;
  status: string;
  version: number;
  myRoles: CreditRole[];
  participantCount: number;
  acceptedReviewCount: number;
  disputedReviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalAllocationHistoryItem {
  revisionId: string;
  periodId: string;
  periodTitle: string;
  scope: string;
  revision: number;
  status: string;
  myBasisPoints: number;
  myPercentage: string;
  myDecision: "APPROVE" | "DISPUTE" | "PENDING";
  submittedAt: string | null;
  finalizedAt: string | null;
}

export interface PersonalAdvisorContributionItem {
  id: string;
  recordType: "FEEDBACK" | "AGREEMENT";
  kind: string;
  creditRoles: CreditRole[];
  status: string;
  acknowledgementOrSummary: string;
  resultingRevisionRef: string | null;
  createdAt: string;
}

export interface PersonalContributionHistoryExport {
  schemaVersion: "LUMIGAP_CONTRIBUTION_EVIDENCE_V1";
  projectId: string;
  projectTitle: string;
  userId: string;
  userName: string;
  membershipStatus: "OWNER" | "ACTIVE" | "REMOVED" | "LEFT" | "ADVISOR" | "HISTORICAL";
  membershipIntervals: Array<{ joinedAt: string; leftAt: string | null }>;
  workContributions: PersonalContributionHistoryItem[];
  allocations: PersonalAllocationHistoryItem[];
  advisorContributions: PersonalAdvisorContributionItem[];
  privacyRedacted: boolean;
  generatedAt: string;
  integrityDigestSha256: string;
}

export interface ProjectAdvisorContributionSummary {
  mentorId: string;
  mentorName: string;
  relationshipStatus: "ACTIVE" | "ENDED" | "INVITED";
  agreements: Array<{
    id: string;
    creditRoles: CreditRole[];
    acknowledgement: string;
    status: "PROPOSED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
    createdAt: string;
  }>;
  feedbackItems: Array<{
    id: string;
    kind: "MESSAGE" | "COMMENT" | "SUGGESTION" | "REVIEW";
    creditRoles: CreditRole[];
    status: "PENDING" | "ACCEPTED" | "REJECTED" | "RESOLVED";
    shareTitle: string | null;
    resultingRevisionRef: string | null;
    createdAt: string;
  }>;
}

export interface ProposedManuscriptAuthor {
  userId: string;
  name?: string;
  order: number;
  creditRoles: CreditRole[];
  rationale: string;
  confirmed?: boolean;
  decision?: "CONFIRM" | "CLARIFY" | "DISPUTE" | null;
  decisionNote?: string | null;
}

export interface ProposedManuscriptAcknowledgement {
  userId?: string | null;
  name: string;
  affiliation?: string;
  contributionSummary: string;
  creditRoles: CreditRole[];
}

export interface ReviewedNonAuthorJustification {
  userId: string;
  name?: string;
  justification: string;
}

export interface DetectedScopeContributor {
  userId: string;
  name: string;
  membershipStatus: "OWNER" | "ACTIVE" | "FORMER" | "ADVISOR";
  sources: string[];
  creditRoles: CreditRole[];
  retainedWords: number;
  allocationPercentage: string | null;
  attributionState: "AUTHOR" | "ACKNOWLEDGED" | "JUSTIFIED_NON_AUTHOR" | "UNREVIEWED";
}

export type ManuscriptAttributionStatus =
  | "UNINITIALIZED"
  | "PENDING_CONFIRMATION"
  | "DISPUTED"
  | "VERIFIED"
  | "SUPERSEDED";

export interface ManuscriptAttributionDecisionView {
  id: string;
  userId: string;
  userName: string;
  participantKind: "AUTHOR" | "ACKNOWLEDGED" | "CONTRIBUTOR" | "ADVISOR";
  decision: "CONFIRM" | "CLARIFY" | "DISPUTE";
  note: string;
  createdAt: string;
}

export interface ManuscriptAttributionCheckView {
  checkId: string | null;
  projectId: string;
  manuscriptId: string;
  snapshotId: string;
  snapshotLabel: string;
  sourceVersion: number;
  snapshotChecksum: string;
  hasSucceededCompilation: boolean;
  version: number;
  status: ManuscriptAttributionStatus;
  proposedAuthors: ProposedManuscriptAuthor[];
  acknowledgements: ProposedManuscriptAcknowledgement[];
  acknowledgementText: string;
  omittedContributors: ReviewedNonAuthorJustification[];
  detectedContributors: DetectedScopeContributor[];
  decisions: ManuscriptAttributionDecisionView[];
  unreviewedContributorIds: string[];
  pendingAuthorIds: string[];
  unresolvedDisputes: Array<{ source: string; userId?: string; summary: string }>;
  readyForInternalSubmission: boolean;
  blockingReasons: string[];
  snapshotDigestSha256: string | null;
  verifiedAt: string | null;
  createdAt: string | null;
  viewerCanManage: boolean;
  viewerCanDecide: boolean;
  externalSubmissionNotice: string;
}

export interface SaveManuscriptAttributionInput {
  proposedAuthors: Array<{
    userId: string;
    order: number;
    creditRoles: CreditRole[];
    rationale?: string;
  }>;
  acknowledgements: Array<{
    userId?: string | null;
    name: string;
    affiliation?: string;
    contributionSummary: string;
    creditRoles?: CreditRole[];
  }>;
  acknowledgementText?: string;
  omittedContributors: Array<{
    userId: string;
    justification: string;
  }>;
}

export type IntegrityCaseKind =
  | "CONTRIBUTION_DISPUTE"
  | "ATTRIBUTION_DISPUTE"
  | "DATA_LEAK_INCIDENT";

export type IntegrityCaseStatus =
  | "REPORTED"
  | "CONTAINED"
  | "UNDER_REVIEW"
  | "ESCALATED"
  | "RESOLVED"
  | "CLOSED";

export type IntegrityTargetKind =
  | "WORK_CONTRIBUTION"
  | "ALLOCATION_REVISION"
  | "MANUSCRIPT_ATTRIBUTION"
  | "MANUSCRIPT"
  | "PAPER_FILE"
  | "MENTOR_SHARE"
  | "PROJECT";

export type IntegrityContainmentAction =
  | "RESTRICT_EXPORT_OWNER_ONLY"
  | "SET_PROJECT_PRIVATE"
  | "REVOKE_ACTIVE_MENTOR_SHARES"
  | "RESTRICT_AI_PLATFORM_ONLY";

export interface ResearchIntegrityEventView {
  id: string;
  actor: WorkspacePerson;
  action:
    | "REPORTED"
    | "RESPONSE_ADDED"
    | "EVIDENCE_PRESERVED"
    | "CONTAINMENT_APPLIED"
    | "ESCALATED"
    | "STATUS_CHANGED"
    | "RESOLVED";
  note: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ResearchIntegrityCaseView {
  id: string;
  projectId: string;
  kind: IntegrityCaseKind;
  status: IntegrityCaseStatus;
  reporter: WorkspacePerson;
  respondent: WorkspacePerson | null;
  targetKind: IntegrityTargetKind;
  targetId: string | null;
  title: string;
  description: string;
  evidenceRefs: Array<{ kind: string; id: string; label?: string }>;
  preservedSnapshot: Record<string, unknown> | null;
  containmentActions: IntegrityContainmentAction[];
  escalatedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: WorkspacePerson | null;
  resolutionSummary: string | null;
  events: ResearchIntegrityEventView[];
  viewerCanRespond: boolean;
  viewerCanContain: boolean;
  viewerCanEscalate: boolean;
  viewerCanResolve: boolean;
  ownerAdjudicationBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntegrityCaseInput {
  kind: IntegrityCaseKind;
  targetKind: IntegrityTargetKind;
  targetId?: string | null;
  respondentUserId?: string | null;
  title: string;
  description: string;
  evidenceRefs?: Array<{ kind: string; id: string; label?: string }>;
}

