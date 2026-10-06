import type { ISODateString, ResponseMeta } from "./common.js";
import type { PublicAcademicProfile } from "./academic-profile.js";

export type CommunityVisibility = "public" | "private";
export type CommunityStatus = "ACTIVE" | "ARCHIVED" | "PENDING_APPROVAL" | "REJECTED";
export type CommunityMembershipRole = "owner" | "moderator" | "member";
export type CommunityMembershipStatus = "pending" | "active" | "declined" | "banned";
export type ForumPostType = "QUESTION" | "DISCUSSION" | "PAPER_DISCUSSION" | "RESEARCH_GAP_DISCUSSION";
export type ForumContentStatus = "active" | "hidden" | "locked" | "deleted";
export type ForumReportStatus = "open" | "claimed" | "under_review" | "escalated" | "reviewed" | "resolved" | "dismissed";
export type ForumSort = "latest" | "popular" | "unanswered" | "following";
export type ForumNotificationLevel = "WATCHING" | "TRACKING" | "NORMAL" | "MUTED";
export type ForumReportReason = "SPAM" | "OFF_TOPIC" | "HARASSMENT" | "PRIVACY" | "PLAGIARISM_CONCERN" | "COPYRIGHT_CONCERN" | "INAPPROPRIATE_CONTENT" | "OTHER";

export interface ForumReference {
  id?: string;
  paperId?: string;
  doi?: string;
  url?: string;
  title?: string;
  authors?: string[];
  year?: number;
  venue?: string;
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
  status: CommunityStatus;
  reviewNote?: string;
  reviewedAt?: ISODateString;
  memberCount: number;
  threadCount: number;
  moderators?: Array<{ id: string; fullName: string; avatarUrl?: string }>;
  viewerMembership?: { role: CommunityMembershipRole; status: CommunityMembershipStatus };
  canManage: boolean;
  canEditCommunity: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  /** Only present for managers: requests waiting for approval. */
  pendingRequestCount?: number;
  contentRestricted: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type CommunitySort = "recent" | "newest" | "members" | "discussions" | "name";

export interface CommunityFacet {
  name: string;
  count: number;
}

export interface CommunityRecommendation extends Community {
  matchedInterests: string[];
}

export interface CommunityInput {
  name: string;
  description?: string;
  visibility?: CommunityVisibility;
  researchField?: string;
  icon?: string;
  researchTopics?: string[];
  rules?: string[];
}

export interface CommunityMember {
  id: string;
  user: { id: string; fullName: string; email: string; avatarUrl?: string; role: string; institution?: string };
  role: CommunityMembershipRole;
  status: CommunityMembershipStatus;
  joinedAt: ISODateString;
}

export type CommunitySummary =
  | { status: "completed"; summary: string; postCount: number }
  | { status: "pending" | "none"; postCount: number }
  | { status: "failed"; message: string; postCount: number };

/** Member-facing roster entry. Deliberately has no email address. */
export interface CommunityPublicMember {
  id: string;
  fullName: string;
  avatarUrl?: string;
  institution?: string;
  role: CommunityMembershipRole;
  joinedAt: ISODateString;
}

export interface CommunityRelatedPaper {
  id: string;
  title: string;
  publicationYear: number;
  citationCount: number;
  doi?: string;
}

export interface CommunityRelatedGap {
  id: string;
  title: string;
  topic: string;
  description: string;
  gapType: string;
  validationStatus: string;
}

export interface CommunityReviewInput {
  decision: "approve" | "reject";
  note?: string;
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
  notificationLevel?: ForumNotificationLevel;
  likeCount?: number;
  reactionCount?: number;
  participantCount?: number;
  linkCount?: number;
  readingTimeMinutes?: number;
  viewerVote?: -1 | 0 | 1;
  editedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ForumComment {
  id: string;
  postId: string;
  postNumber: number;
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

export interface ForumRevisionAuthor {
  id: string;
  fullName: string;
  avatarUrl?: string;
}

export interface ForumPostRevision {
  id: string;
  revision: number;
  title: string;
  content: string;
  tags: string[];
  editedBy: ForumRevisionAuthor;
  createdAt: ISODateString;
}

export interface ForumCommentRevision {
  id: string;
  revision: number;
  content: string;
  editedBy: ForumRevisionAuthor;
  createdAt: ISODateString;
}

export interface ForumPostListResponse { data: ForumPost[]; meta: ResponseMeta }
export interface ForumCommentListResponse { data: ForumComment[]; meta: ResponseMeta }

export interface ForumResearchContext {
  papers: Array<{ id: string; title: string; doi?: string; publicationYear?: number; authors?: string[]; venue?: string }>;
  savedPapers?: Array<{ id: string; title: string; doi?: string; publicationYear?: number; authors?: string[]; venue?: string }>;
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
/** Public forum taxonomy. Membership is not required to read or participate. */
export interface ForumCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "ACTIVE" | "ARCHIVED";
  sortOrder: number;
  /** Visible topics only; populated by the category directory endpoint. */
  topicCount?: number;
  topicsThisWeek?: number;
}
