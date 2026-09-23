export interface ProjectMemberUserSummary {
  _id: string;
  fullName?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ProjectPaperSummary {
  _id: string;
  title: string;
  publicationYear?: number;
  authors?: Array<{ displayName?: string }>;
  abstractText?: string;
}

export interface IProjectMember {
  targetKind: "User";
  targetId: string | ProjectMemberUserSummary;
  role: "owner" | "member";
}

export interface IProjectPaper {
  targetKind: "Paper";
  targetId: string | ProjectPaperSummary;
}

export interface IProject {
  _id: string;
  title: string;
  description?: string;
  ownerId: string;
  members: IProjectMember[];
  papers: IProjectPaper[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  title: string;
  description?: string;
}

export interface UpdateProjectRequest {
  title?: string;
  description?: string;
}

export interface AddProjectMemberRequest {
  targetKind: "User";
  targetId: string;
  role: "owner" | "member";
}

export interface AddProjectPaperRequest {
  paperId: string;
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
