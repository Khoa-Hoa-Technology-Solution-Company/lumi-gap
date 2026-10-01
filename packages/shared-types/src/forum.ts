import type { ISODateString, ResponseMeta } from "./common.js";
import type { PublicAcademicProfile } from "./academic-profile.js";

export type CommunityVisibility = "public" | "private";
export type CommunityMembershipRole = "owner" | "moderator" | "member";
export type CommunityMembershipStatus = "pending" | "active" | "declined" | "banned";
export type ForumPostType = "QUESTION" | "DISCUSSION" | "PAPER_DISCUSSION" | "RESEARCH_GAP_DISCUSSION";
export type ForumContentStatus = "active" | "hidden" | "locked" | "deleted";
export type ForumReportStatus = "open" | "reviewed" | "resolved" | "dismissed";
export type ForumSort = "latest" | "popular" | "unanswered" | "following";
export type ForumReportReason = "SPAM" | "OFF_TOPIC" | "HARASSMENT" | "PLAGIARISM_OR_COPYRIGHT" | "INAPPROPRIATE_CONTENT" | "OTHER";

export interface ForumReference {
  id?: string;
  paperId?: string;
  doi?: string;
  url?: string;
  title?: string;
  authors?: string[];
  year?: number;
  verified: boolean;
  paper?: { id: string; title: string; publicationYear?: number; doi?: string };
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  researchTopics: string[];
  researchField?: string;
  icon?: string;
  rules: string[];
  visibility: CommunityVisibility;
  status: "ACTIVE" | "ARCHIVED";
  memberCount: number;
  threadCount: number;
  moderators?: Array<{ id: string; fullName: string; avatarUrl?: string }>;
  viewerMembership?: { role: CommunityMembershipRole; status: CommunityMembershipStatus };
  canManage: boolean;
  canEditCommunity: boolean;
  contentRestricted: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ForumAuthorSummary {
  id: string;
  fullName: string;
  avatarUrl?: string;
  academicProfile?: Pick<
    PublicAcademicProfile,
    "academicType" | "institution" | "academicTitle" | "verificationStatus"
  >;
}

export interface ForumPost {
  id: string;
  publicSlug?: string;
  author: ForumAuthorSummary;
  community?: Pick<Community, "id" | "name" | "slug">;
  type: ForumPostType;
  title: string;
  content: string;
  tags: string[];
  linkedPaperId?: string;
  linkedResearchGapId?: string;
  linkedProjectId?: string;
  linkedPaper?: { id: string; title: string; publicationYear?: number; doi?: string };
  linkedResearchGap?: { id: string; title: string; topic?: string; validationStatus?: string; status?: string };
  linkedProject?: { id: string; title: string };
  references: ForumReference[];
  status: ForumContentStatus;
  acceptedCommentId?: string;
  voteScore: number;
  commentCount: number;
  replyCount?: number;
  helpfulCount?: number;
  viewCount?: number;
  lastActivityAt?: ISODateString;
  participants?: ForumAuthorSummary[];
  isPinned: boolean;
  canModerate: boolean;
  isFollowing: boolean;
  viewerVote?: -1 | 0 | 1;
  editedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ForumComment {
  id: string;
  postId: string;
  author: ForumAuthorSummary;
  content: string;
  references: ForumReference[];
  status: ForumContentStatus;
  voteScore: number;
  viewerVote?: -1 | 0 | 1;
  isAccepted: boolean;
  parentCommentId?: string;
  editedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ForumPostListResponse { data: ForumPost[]; meta: ResponseMeta }
export interface ForumCommentListResponse { data: ForumComment[]; meta: ResponseMeta }

export interface ForumResearchContext {
  papers: Array<{ id: string; title: string; doi?: string; publicationYear?: number }>;
  gaps: Array<{ id: string; title: string; topic: string; forumShareable: boolean }>;
  projects: Array<{ id: string; title: string; visibility: "PUBLIC_SUMMARY" }>;
}

export interface ForumReport {
  id: string;
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  reason: ForumReportReason;
  description?: string;
  status: ForumReportStatus;
  reporter: { id: string; fullName: string };
  community?: Pick<Community, "id" | "name" | "slug">;
  target: { title?: string; excerpt: string; status: ForumContentStatus };
  moderationNote?: string;
  createdAt: ISODateString;
  reviewedAt?: ISODateString;
}

export interface ForumModerationAction {
  id: string;
  action: string;
  reason?: string;
  actor: { id: string; fullName: string };
  community?: Pick<Community, "id" | "name" | "slug">;
  targetType: "post" | "comment" | "report";
  targetId: string;
  createdAt: ISODateString;
}
