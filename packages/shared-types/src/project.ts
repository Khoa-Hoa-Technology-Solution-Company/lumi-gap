export interface ProjectMemberUserSummary {
  _id: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
}

export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
// Legacy visibility values remain readable during the client migration.
export type ProjectVisibility = "PRIVATE" | "PUBLIC" | "INVITE_ONLY" | "PUBLIC_SUMMARY";
export type ProjectExportPolicy = "ALL_MEMBERS" | "OWNER_ONLY";
export type ProjectAiDataPolicy = "ALLOW_PERSONAL_AI" | "PLATFORM_AI_ONLY" | "DISABLED";
export type ProjectExternalLookupPolicy = "ALLOW_PUBLIC_INDEX" | "LOCAL_CORPUS_ONLY";
export type ResearchApproach = "EXPLORATORY" | "LITERATURE_REVIEW" | "EMPIRICAL" | "UNDECIDED";
export type ProjectRole = "OWNER" | "MEMBER";
export type ProjectMemberStatus = "ACTIVE" | "REMOVED" | "LEFT";
export type ProjectScreeningStatus = "UNDECIDED" | "INCLUDED" | "EXCLUDED" | "MAYBE";
export type ProjectReadingStatus = "NOT_STARTED" | "READING" | "REVIEWED";
export type ProjectExclusionReason =
  | "WRONG_RESEARCH_TOPIC"
  | "WRONG_POPULATION_CONTEXT"
  | "WRONG_METHODOLOGY"
  | "NOT_PEER_REVIEWED"
  | "INSUFFICIENT_RELEVANT_EVIDENCE"
  | "DUPLICATE"
  | "OTHER";
export type ProjectInvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
export type ProjectActivityType =
  | "PROJECT_CREATED"
  | "PROJECT_UPDATED"
  | "MEMBER_INVITED"
  | "MEMBER_JOINED"
  | "MEMBER_REMOVED"
  | "MEMBER_LEFT"
  | "OWNERSHIP_TRANSFERRED"
  | "PAPER_ADDED"
  | "PAPER_REMOVED"
  | "PAPER_SCREENED"
  | "PAPER_READING_STATUS_CHANGED"
  | "EVIDENCE_ADDED"
  | "GAP_CREATED"
  | "GAP_STATUS_CHANGED"
  | "REPORT_CREATED"
  | "REPORT_STATUS_CHANGED"
  | "REPORT_FINALIZED"
  | "PROJECT_ARCHIVED";

export interface ProjectPaperSummary {
  _id: string;
  title: string;
  publicationYear?: number;
  journalName?: string;
  doi?: string;
  hasAiAnalysis?: boolean;
  authors?: Array<{ displayName?: string }>;
  abstractText?: string;
}

export interface IProjectMember {
  targetKind: "User";
  targetId: string | ProjectMemberUserSummary;
  role: ProjectRole;
  status?: ProjectMemberStatus;
  joinedAt?: string;
}

export interface IProjectPaper {
  id: string;
  targetKind: "Paper";
  targetId: string | ProjectPaperSummary;
  screeningStatus: ProjectScreeningStatus;
  readingStatus: ProjectReadingStatus;
  inclusionReason?: string;
  exclusionReason?: string;
  exclusionNote?: string;
  screenedBy?: ProjectMemberUserSummary;
  screenedAt?: string;
  notes?: string;
  evidenceCount: number;
  addedBy?: ProjectMemberUserSummary;
  addedAt: string;
  updatedAt: string;
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  invitedUser?: ProjectMemberUserSummary;
  email: string;
  message?: string;
  status: ProjectInvitationStatus;
  expiresAt: string;
  createdAt: string;
  lastSentAt?: string;
  resendAvailableAt?: string;
}

export interface IncomingProjectInvitation {
  id: string;
  invitedEmail?: string;
  projectId: string;
  projectTitle: string;
  projectDescription?: string;
  inviterName?: string;
  role: ProjectRole;
  status: ProjectInvitationStatus;
  message?: string;
  expiresAt: string;
  createdAt: string;
}

export interface ProjectInvitationPreview {
  id: string;
  projectId: string;
  projectTitle: string;
  projectDescription?: string;
  invitedEmail: string;
  currentUserEmail?: string;
  inviterName: string;
  role: ProjectRole;
  message?: string;
  status: ProjectInvitationStatus;
  expiresAt: string;
  createdAt: string;
  authenticated: boolean;
  emailMatches: boolean;
  alreadyMember: boolean;
}

export type MentorshipRequestStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "CANCELED_BY_PROJECT" | "EXPIRED" | "CLOSED_CAPACITY_REACHED";
export type MentorRole = "PRIMARY" | "SECONDARY";
export type MentorPlanCommand = { expectedVersion: number } & (
  { action: "add"; mentorUserId: string; mentorRole: MentorRole } |
  { action: "remove"; candidateId: string } |
  { action: "move"; candidateId: string; offset: -1 | 1 } |
  { action: "configure"; parallelInvitations: boolean } |
  { action: "restart" }
);
export interface MentorPlanCandidate {
  id: string; mentorUserId: string; fullName: string; mentorRole: MentorRole; priority: number;
  status: string; requestId?: string; canSend: boolean; unavailableReason?: string;
}
export interface MentorRecruitmentPlan {
  id?: string; version: number; parallelInvitations: boolean; autoSend: false;
  closedRoles: MentorRole[]; candidates: MentorPlanCandidate[]; positions: MentorPositions; canManage: boolean;
  currentMentors: { mentorRole: MentorRole; fullName: string }[];
  currentInvitations: { mentorRole: MentorRole; fullName: string; expiresAt?: string }[];
}
export interface MentorPosition {
  role: MentorRole; status: "LOCKED" | "VACANT" | "INVITING" | "ASSIGNED";
  pendingRequests: number; relationshipId?: string;
}
export type MentorPositions = Record<MentorRole, MentorPosition>;
export interface MentorshipAttachment { id: string; fileName: string; mimeType: string; byteSize: number }
export interface MentorshipDraft {
  message: string; mentorRole: MentorRole; attachments: MentorshipAttachment[]; version: number; updatedAt?: string;
}
export type MentorRelationshipStatus = "ACTIVE" | "ENDED";
export interface MentorshipPerson extends ProjectMemberUserSummary {
  academicRole?: string;
  institutionName?: string;
  positionTitle?: string;
  verifiedLecturer?: boolean;
}
export interface MentorProjectPreview {
  id: string; title: string; summary: string; researchField?: string;
  /** Active team size, including the owner once. No member identities are shared. */
  teamMemberCount?: number;
  stage: ProjectStatus; expertise: string[]; discovery: "CLOSED" | "SEEKING_MENTOR";
  researchAreas: string[]; mentoringNeeds: string;
  availableRoles?: MentorRole[];
}
export interface MentorDiscoverySettings extends MentorProjectPreview {
  /** Opaque revision of the approved invitation brief, not an access credential. */
  previewToken?: string;
  /** Optimistic version for owner-only discovery edits; excluded from public opportunity DTOs. */
  version: number;
  /** Sender identity as it will appear to the lecturer, respecting profile visibility. */
  invitationSender?: MentorshipPerson;
}
export interface MentorshipActions {
  accept: boolean; decline: boolean; cancel: boolean; end: boolean; openProject: boolean;
}
export interface MentorshipRequest {
  /** Older invitations have no recoverable original snapshot. */
  legacyPreview?: boolean;
  reviewRequired?: boolean;
  kind: "REQUEST";
  /** Approved brief revision to recheck when accepting from the web UI. */
  previewToken?: string;
  accessPolicy?: import("./mentor-access.js").MentorAccessPolicy;
  mentorRole?: MentorRole;
  attachments?: MentorshipAttachment[];
  direction: "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT";
  expiresAt?: string;
  respondedAt?: string;
  id: string;
  projectId: string;
  project?: MentorProjectPreview;
  mentorUser: MentorshipPerson;
  requestedBy: MentorshipPerson;
  status: MentorshipRequestStatus;
  message?: string;
  responseNote?: string;
  closeReason?: string;
  relationshipId?: string;
  actions: MentorshipActions;
  createdAt: string;
  updatedAt: string;
}
export interface MentorRelationship {
  kind: "RELATIONSHIP";
  accessPolicy?: import("./mentor-access.js").MentorAccessPolicy;
  mentorRole?: MentorRole;
  id: string; projectId: string; sourceRequestId: string;
  project?: MentorProjectPreview; mentorUser: MentorshipPerson;
  status: MentorRelationshipStatus; startedAt: string;
  endedAt?: string; endedById?: string; endReason?: string;
  actions: MentorshipActions; createdAt: string; updatedAt: string;
}
export interface AcademicPageMeta { page: number; pageSize: number; total: number; totalPages: number }
export interface AcademicSupportSearch {
  q?: string; page?: number; pageSize?: number; institution?: string;
  area?: string; interest?: string; position?: string;
  view?: "all" | "incoming" | "outgoing" | "active" | "history";
}
export interface MentorSuggestion {
  id: string; projectId: string; mentorUser: MentorshipPerson; suggestedBy: MentorshipPerson;
  message: string; status: "PENDING" | "INVITED" | "DISMISSED"; createdAt: string;
}
export interface MentorshipCollection {
  requests: MentorshipRequest[]; relationships: MentorRelationship[];
  counts: { pending: number; incoming: number; active: number };
  policy: { maxActiveMentors: number; maxPendingRequests: number; maxPendingPerRole?: number; expiryDays?: number };
  positions?: MentorPositions;
  requestMeta: AcademicPageMeta; relationshipMeta: AcademicPageMeta;
}
export interface AvailableMentor extends MentorshipPerson {
  expertiseAreas: string[]; researchInterests: string[]; matchedTerms: string[];
  sameInstitution: boolean; acceptingMentorships: true;
}
export interface MentoringPreferences {
  acceptingMentorships: boolean; canEnable: boolean; emailEnabled: boolean; locale: "en" | "vi";
}
export interface RequestMentorRelationshipRequest {
  mentorUserId: string;
  message: string;
  idempotencyKey?: string;
  mentorRole?: MentorRole;
  attachmentIds?: string[];
}

export interface RespondMentorRelationshipRequest {
  note?: string;
}

export interface ProjectActivity {
  id: string;
  projectId: string;
  type: ProjectActivityType;
  actor?: ProjectMemberUserSummary;
  entityKind?: string;
  entityId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface IProject {
  _id: string;
  title: string;
  description?: string;
  researchField?: string;
  researchAreas?: string[];
  researchApproach?: ResearchApproach;
  publicSummary?: string;
  mentorshipDiscovery?: "CLOSED" | "SEEKING_MENTOR";
  version?: number;
  screeningMode?: "EXPLORATORY" | "INDEPENDENT";
  screeningBlinded?: boolean;
  screeningCriteria?: {
    inclusion: string[];
    exclusion: string[];
  };
  status: ProjectStatus;
  visibility: ProjectVisibility;
  exportPolicy?: ProjectExportPolicy;
  aiDataPolicy?: ProjectAiDataPolicy;
  externalLookupPolicy?: ProjectExternalLookupPolicy;
  ownerId: string;
  owner?: ProjectMemberUserSummary;
  accessRole?: ProjectRole;
  isPublicSummary?: boolean;
  members: IProjectMember[];
  papers: IProjectPaper[];
  pendingInvitations?: ProjectInvitation[];
  recentActivity?: ProjectActivity[];
  memberCount: number;
  paperCount: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  title: string;
  description?: string;
  researchField?: string;
  status?: Exclude<ProjectStatus, "ARCHIVED">;
  visibility?: ProjectVisibility;
  researchAreas?: string[];
  researchApproach?: ResearchApproach;
  idempotencyKey?: string;
}

export interface UpdateProjectRequest {
  title?: string;
  description?: string;
  researchField?: string | null;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  exportPolicy?: ProjectExportPolicy;
  aiDataPolicy?: ProjectAiDataPolicy;
  externalLookupPolicy?: ProjectExternalLookupPolicy;
  publicSummary?: string;
  researchAreas?: string[];
  researchApproach?: ResearchApproach;
  expectedVersion?: number;
  inclusionCriteria?: string[];
  exclusionCriteria?: string[];
}

export interface ProjectTeamPage {
  members: IProjectMember[];
  invitations: ProjectInvitation[];
  memberMeta: AcademicPageMeta;
  invitationMeta: AcademicPageMeta;
}

export interface AddProjectMemberRequest {
  targetKind: "User";
  targetId: string;
  role: ProjectRole;
}

export interface AddProjectPaperRequest {
  paperId: string;
  proposalReason?: string;
}

export interface UpdateProjectPaperRequest {
  expectedUpdatedAt?: string;
  screeningStatus?: ProjectScreeningStatus;
  readingStatus?: ProjectReadingStatus;
  inclusionReason?: string | null;
  exclusionReason?: string | null;
  exclusionNote?: string | null;
  notes?: string | null;
}

export interface InviteProjectMemberRequest {
  userId?: string;
  email?: string;
  message?: string;
}

export type ProjectContributionRole =
  | "SUPERVISION"
  | "METHODOLOGY"
  | "VALIDATION"
  | "SOFTWARE"
  | "CONCEPTUALIZATION"
  | "WRITING_ORIGINAL_DRAFT"
  | "WRITING_REVIEW_EDITING"
  | "PROJECT_ADMINISTRATION"
  | "OTHER";

export type ProjectContributionProposalStatus =
  | "PENDING_CONFIRMATION"
  | "CONFIRMING"
  | "CONFIRMED"
  | "REJECTED"
  | "WITHDRAWN";

export interface ProjectContributionActor {
  _id: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ProjectContributionHistoryEntry {
  action: "PROPOSED" | "CONFIRMED" | "REJECTED" | "WITHDRAWN";
  actorId: string | ProjectContributionActor;
  note?: string;
  createdAt: string;
}

export interface ProjectContributionProposal {
  _id: string;
  projectId: string;
  contributorId: string | ProjectContributionActor;
  roles: ProjectContributionRole[];
  description: string;
  evidence?: string;
  visibility: "PUBLIC" | "PRIVATE";
  status: ProjectContributionProposalStatus;
  confirmationRequiredFrom: "OWNER" | "CONTRIBUTOR";
  proposedBy: string | ProjectContributionActor;
  confirmedBy?: string | ProjectContributionActor;
  confirmedAt?: string;
  rejectedBy?: string | ProjectContributionActor;
  rejectedAt?: string;
  rejectionReason?: string;
  history: ProjectContributionHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface ProposeProjectContributionRequest {
  contributorId: string;
  roles: ProjectContributionRole[];
  description: string;
  evidence?: string;
  visibility?: "PUBLIC" | "PRIVATE";
}

export interface ResolveProjectContributionRequest {
  note?: string;
}

export type ProjectChatRole = "user" | "assistant";
export type ProjectChatScope = "private" | "team";

export interface ProjectChatMessage {
  id: string;
  projectId: string;
  userId: string;
  scope: ProjectChatScope;
  role: ProjectChatRole;
  content: string;
  citedPaperIds: string[];
  requester?: ProjectTeamChatSender;
  creditCost?: number;
  isPinned?: boolean;
  pinnedAt?: string;
  pinnedBy?: ProjectTeamChatSender;
  createdAt: string;
}

export interface SendProjectChatMessageRequest {
  message: string;
  scope?: ProjectChatScope;
}

export interface SendProjectChatMessageResponse {
  scope: ProjectChatScope;
  answer: string;
  citedPaperIds: string[];
  creditCost: number;
}

export interface ProjectChatHistoryResponse {
  messages: ProjectChatMessage[];
}

export interface PinProjectChatMessageResponse {
  message: ProjectChatMessage;
}

export type ProjectChatEventType = "ready" | "message.created" | "message.updated";

export interface ProjectChatEvent {
  type: ProjectChatEventType;
  projectId: string;
  scope: ProjectChatScope;
  message?: ProjectChatMessage;
  occurredAt: string;
}

export interface ProjectTeamChatSender {
  id: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ProjectTeamChatMessage {
  id: string;
  projectId: string;
  sender: ProjectTeamChatSender;
  content: string;
  readBy: ProjectTeamChatSender[];
  readCount: number;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: ProjectTeamChatSender;
  deleteReason?: string;
  createdAt: string;
}

export interface SendProjectTeamChatMessageRequest {
  content: string;
}

export interface SendProjectTeamChatMessageResponse {
  message: ProjectTeamChatMessage;
}

export interface ProjectTeamChatHistoryResponse {
  messages: ProjectTeamChatMessage[];
}

export type ProjectTeamChatEventType = "ready" | "message.created" | "message.updated" | "message.deleted";

export interface ProjectTeamChatEvent {
  type: ProjectTeamChatEventType;
  projectId: string;
  message?: ProjectTeamChatMessage;
  occurredAt: string;
}
