import type { ISODateString, ResponseMeta } from "./common.js";
import type { PublicAcademicProfile } from "./academic-profile.js";

export type CommunityVisibility = "public" | "private";
export type CommunityMembershipRole = "owner" | "moderator" | "member";
export type ForumPostType = "discussion" | "question";
export type ForumContentStatus = "active" | "hidden" | "locked" | "deleted";
export type ForumReportStatus = "open" | "reviewed" | "resolved" | "dismissed";

export interface ForumReference {
  paperId?: string;
  doi?: string;
  url?: string;
  title?: string;
  verified: boolean;
  paper?: { id: string; title: string; publicationYear?: number; doi?: string };
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  researchTopics: string[];
  visibility: CommunityVisibility;
  memberCount: number;
  membershipRole?: CommunityMembershipRole;
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
  author: ForumAuthorSummary;
  community?: Pick<Community, "id" | "name" | "slug">;
  type: ForumPostType;
  title: string;
  content: string;
  tags: string[];
  linkedPaperId?: string;
  linkedResearchGapId?: string;
  linkedProjectId?: string;
  references: ForumReference[];
  status: ForumContentStatus;
  acceptedCommentId?: string;
  voteScore: number;
  commentCount: number;
  viewerVote?: -1 | 0 | 1;
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
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ForumPostListResponse { data: ForumPost[]; meta: ResponseMeta }
export interface ForumCommentListResponse { data: ForumComment[]; meta: ResponseMeta }
