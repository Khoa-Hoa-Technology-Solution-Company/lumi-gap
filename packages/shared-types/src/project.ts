export interface ProjectMemberUserSummary {
  _id: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
}

export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
export type ProjectVisibility = "PRIVATE" | "INVITE_ONLY" | "PUBLIC_SUMMARY";
export type ProjectRole = "OWNER" | "MEMBER";
export type ProjectMemberStatus = "ACTIVE" | "REMOVED" | "LEFT";
export type ProjectScreeningStatus = "UNDECIDED" | "INCLUDED" | "EXCLUDED";
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
}

export interface IncomingProjectInvitation {
  id: string;
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

export type MentorRelationshipStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "ENDED";

export interface MentorRelationship {
  id: string;
  projectId: string;
  mentorUser: ProjectMemberUserSummary;
  requestedBy: ProjectMemberUserSummary;
  status: MentorRelationshipStatus;
  message?: string;
  responseNote?: string;
  acceptedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequestMentorRelationshipRequest {
  mentorUserId: string;
  message?: string;
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
  screeningCriteria?: {
    inclusion: string[];
    exclusion: string[];
  };
  status: ProjectStatus;
  visibility: ProjectVisibility;
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
}

export interface UpdateProjectRequest {
  title?: string;
  description?: string;
  researchField?: string | null;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  inclusionCriteria?: string[];
  exclusionCriteria?: string[];
}

export interface AddProjectMemberRequest {
  targetKind: "User";
  targetId: string;
  role: ProjectRole;
}

export interface AddProjectPaperRequest {
  paperId: string;
}

export interface UpdateProjectPaperRequest {
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
