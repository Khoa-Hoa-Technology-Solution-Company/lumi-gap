import type { Community, CommunityFacet, CommunityInput, CommunityPublicMember, CommunityRecommendation, CommunityRelatedGap, CommunityRelatedPaper, CommunitySort, CommunityMember, CommunityReviewInput, CommunityStatus, CommunitySummary, CommunitySuggestion, ForumNotificationLevel, ForumPostType, ForumReportReason, ForumReportStatus, ForumResearchContext, ForumSort } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export type { ForumReportReason } from "@trend/shared-types";

export type ForumReferenceView = { id?: string; paperId?: string; doi?: string; url?: string; title?: string; authors?: string[]; year?: number; venue?: string; verified?: boolean };
export type ForumReactionName = "LIKE" | "INSIGHTFUL" | "CELEBRATE" | "CURIOUS" | "LOVE" | "LAUGH" | "SURPRISED" | "SAD" | "AGREE" | "DISAGREE";
export type ForumReactionUser = { id: string; fullName: string; avatarUrl?: string };
export type ForumReactionTarget = { scope: "topic" | "post" | "comment"; id: string };
export type ForumRecentViews = { daily: Array<{ date: string; count: number }>; trackingStartedAt: string; cooldownHours: number; timeZone: string };
export type ForumReactionPeople = { data: Array<{ id: string; reaction: ForumReactionName; user: ForumAuthorView }>; counts: Record<ForumReactionName, number>; meta: { page: number; pageSize: number; total: number; totalPages: number } };
export type ForumReactionSummary = {
  reactionCounts: Record<ForumReactionName, number>;
  viewerReactions: ForumReactionName[];
  reactionUsers: Partial<Record<ForumReactionName, ForumReactionUser[]>>;
};
export type ForumAuthorView = { id: string; fullName: string; publicHandle?: string; avatarUrl?: string; institution?: string; academicProfileType?: string; academicTitle?: string; affiliationVerified?: boolean; positionTitle?: string; primaryPosition?: string; positionVerified?: boolean };
export type ForumPostView = {
  id: string; publicSlug?: string; type: ForumPostType; title: string; content: string; tags: string[]; status: string;
  voteScore: number; commentCount: number; replyCount: number; helpfulCount: number; viewCount: number; lastActivityAt?: string;
  participants: ForumAuthorView[]; acceptedCommentId?: string; viewerVote: -1 | 0 | 1;
  isFollowing: boolean; isPinned: boolean; editedAt?: string;
  notificationLevel?: ForumNotificationLevel; likeCount?: number; readingTimeMinutes?: number;
  reactionCount?: number; participantCount?: number; linkCount?: number;
  canModerate: boolean;
  canReply: boolean;
  linkedPaperId?: string; linkedResearchGapId?: string; linkedProjectId?: string;
  linkedPaper?: { id: string; title: string; publicationYear?: number; doi?: string };
  linkedResearchGap?: { id: string; title: string; topic?: string; validationStatus?: string; status?: string };
  linkedProject?: { id: string; title: string };
  references: ForumReferenceView[]; author: ForumAuthorView;
  reactionCounts?: Record<ForumReactionName, number>; viewerReactions?: ForumReactionName[]; reactionUsers?: Partial<Record<ForumReactionName, ForumReactionUser[]>>;
  community?: { id: string; name: string; slug: string }; createdAt: string; updatedAt?: string;
};
export type ForumCommentView = {
  id: string; postId: string; postNumber?: number; content: string; voteScore: number; viewerVote: -1 | 0 | 1;
  author: ForumAuthorView; createdAt: string; editedAt?: string; status: string; isAccepted: boolean;
  parentCommentId?: string; parentComment?: { id: string; postNumber?: number; author: ForumAuthorView; status: string }; helpfulCount: number; references: ForumReferenceView[];
  reactionCounts?: Record<ForumReactionName, number>; viewerReactions?: ForumReactionName[]; reactionUsers?: Partial<Record<ForumReactionName, ForumReactionUser[]>>;
};
export type ForumRevisionAuthor = { id: string; fullName: string; avatarUrl?: string };
export type ForumPostRevisionView = { id: string; revision: number; title: string; content: string; tags: string[]; editedBy: ForumRevisionAuthor; createdAt: string };
export type ForumCommentRevisionView = { id: string; revision: number; content: string; editedBy: ForumRevisionAuthor; createdAt: string };
export type ForumCommentsPage = { data: ForumCommentView[]; meta: { page: number; pageSize: number; total: number; totalPages: number } };
export type ForumDiscoveryReason = "SAME_PAPER" | "SAME_GAP" | "SHARED_TAGS" | "SIMILAR_TOPIC" | "SAME_COMMUNITY" | "RECENT_DISCUSSION";
export type ForumDiscoveryTopic = Pick<ForumPostView, "id" | "publicSlug" | "title" | "type" | "community" | "replyCount" | "viewCount" | "lastActivityAt" | "createdAt"> & { reason: ForumDiscoveryReason };
export type ForumDiscovery = { related: ForumDiscoveryTopic[]; suggested: ForumDiscoveryTopic[] };
export type CommunityMembershipView = NonNullable<Community["viewerMembership"]>;
export type { CommunityStatus, CommunityInput };
export type CommunitySummaryView = CommunitySummary;
export type CommunityView = Community;
export type ForumCategoryView = import("@trend/shared-types").ForumCategory;
export type ForumCategoryInput = Pick<ForumCategoryView, "name" | "slug" | "description" | "sortOrder">;
export type CommunityMemberView = CommunityMember;
export type CommunityListParams = { status?: CommunityStatus; q?: string; field?: string; sort?: CommunitySort; scope?: "all" | "mine"; page?: number; pageSize?: number };
export type CommunityPage = { items: CommunityView[]; page: number; totalPages: number; total: number };
export type ForumPostInput = {
  type: ForumPostType; title: string; content: string; communityId: string; tags: string[];
  linkedPaperId?: string; linkedResearchGapId?: string; linkedProjectId?: string; references?: ForumReferenceView[];
};
export type ForumPostFilters = {
  page?: number; pageSize?: number; query?: string; category?: string; communityId?: string; type?: ForumPostType;
  tag?: string; sort?: ForumSort; linkedPaperId?: string; linkedResearchGapId?: string; includeModerated?: boolean;
};
export type ForumReportView = {
  requiresAdminReview?: boolean;
  id: string; targetType: "post" | "comment"; targetId: string; postId: string; reason: string; description?: string;
  status: ForumReportStatus; reporter: { id: string; fullName: string };
  community?: { id: string; name: string; slug: string }; target: { title?: string; excerpt: string; status: string };
  moderationNote?: string; createdAt: string; reviewedAt?: string; version: number;
};
export type ForumModerationActionView = {
  id: string; action: string; reason?: string; actor: { id: string; fullName: string };
  community?: { id: string; name: string; slug: string }; targetType: "post" | "comment" | "report";
  targetId: string; createdAt: string;
};

export type ForumQueueReport = {
  id: string; status: ForumReportStatus; reason: string; description?: string | null;
  targetType: "THREAD" | "RESPONSE"; targetId: string; postId: string; commentId?: string | null;
  communityId?: string | null; version: number; createdAt: string; assignedToId?: string | null;
  claimExpiresAt?: string | null; contentSnapshot?: { title?: string; body?: string } | null;
};
export type ForumQueueAction = "DISMISS_REPORT" | "ESCALATE_REPORT" | "HIDE_CONTENT" | "RESTORE_CONTENT" | "REMOVE_CONTENT" | "LOCK_THREAD" | "UNLOCK_THREAD" | "PIN_THREAD" | "UNPIN_THREAD" | "MOVE_THREAD" | "RESTRICT_USER" | "LIFT_RESTRICTION";
export type ForumRestrictionView = { id: string; userId: string; user?: { id: string; fullName: string }; scope: string; communityId?: string | null; restrictionType: string; reason: string; expiresAt?: string | null; revokedAt?: string | null; createdAt: string };
export type ForumAppealView = { id: string; reason: string; status: "SUBMITTED" | "UPHELD" | "OVERTURNED"; submittedAt: string; decisionReason?: string | null; appellant?: { id: string; fullName: string }; action?: { action: string; reason?: string | null; postId?: string | null; commentId?: string | null; actorId: string } };
export type ForumMyAction = { id: string; action: string; reason?: string | null; createdAt: string; postId?: string | null; commentId?: string | null; canAppeal: boolean; deadline: string; appeal?: Pick<ForumAppealView, "id" | "status" | "reason" | "decisionReason" | "submittedAt"> | null };
export type ForumCopyrightInput = { claimantName: string; claimantEmail: string; claimantOrganization?: string; targetType: "THREAD" | "RESPONSE"; targetId: string; copyrightedWorkDescription: string; ownershipBasis: string; originalSourceUrl?: string; details: string; honeypot?: string };
export type ForumCopyrightClaim = ForumCopyrightInput & { id: string; status: string; submittedAt: string; postId?: string; resolutionNote?: string | null };

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" ? value as UnknownRecord : {};
const id = (value: unknown): string => { const row = record(value); const result = row._id ?? row.id ?? value; return typeof result === "string" || typeof result === "number" ? String(result) : ""; };
const text = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
const stringList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function normalizeAuthor(value: unknown): ForumAuthorView {
  const row = record(value);
  return { id: id(row), fullName: text(row.fullName) ?? "Unknown researcher", publicHandle: text(row.publicHandle), avatarUrl: text(row.avatarUrl), institution: text(row.institution), academicProfileType: text(row.academicProfileType), academicTitle: text(row.academicTitle), affiliationVerified: row.affiliationVerified === true, positionTitle: text(row.positionTitle), primaryPosition: text(row.primaryPosition), positionVerified: row.positionVerified === true };
}
function normalizeReference(value: unknown): ForumReferenceView {
  const row = record(value);
  return { id: row.id ? id(row.id) : undefined, paperId: row.paperId ? id(row.paperId) : undefined, doi: text(row.doi), venue: text(row.venue), url: text(row.url), title: text(row.title), authors: stringList(row.authors), year: typeof row.year === "number" ? row.year : undefined, verified: row.verified === true };
}
function normalizeResearchContext(value: unknown): { id: string; title: string; topic?: string; doi?: string; publicationYear?: number; validationStatus?: string; status?: string } | undefined {
  const row = record(value); const contextId = id(row); if (!contextId) return undefined;
  return { id: contextId, title: text(row.title) ?? "", topic: text(row.topic), doi: text(row.doi), publicationYear: typeof row.publicationYear === "number" ? row.publicationYear : undefined, validationStatus: text(row.validationStatus), status: text(row.status) };
}
function normalizePost(value: unknown): ForumPostView {
  const row = record(value); const community = record(row.community ?? row.communityId); const author = row.author ?? row.authorId;
  const rawType = String(row.type ?? "DISCUSSION").toUpperCase();
  const type: ForumPostType = rawType === "QUESTION" || rawType === "PAPER_DISCUSSION" || rawType === "RESEARCH_GAP_DISCUSSION" ? rawType : "DISCUSSION";
  return {
    id: id(row), publicSlug: text(row.publicSlug ?? row.slug), type, title: text(row.title) ?? "", content: text(row.content ?? row.body) ?? "", tags: stringList(row.tags),
    status: text(row.status) ?? "active", voteScore: Number(row.voteScore ?? row.score ?? 0), commentCount: Number(row.replyCount ?? row.commentCount ?? 0), replyCount: Number(row.replyCount ?? row.commentCount ?? 0), helpfulCount: Number(row.helpfulCount ?? 0), viewCount: Number(row.viewCount ?? 0), lastActivityAt: text(row.lastActivityAt),
    participants: Array.isArray(row.participants) ? row.participants.map(normalizeAuthor) : [normalizeAuthor(author)],
    acceptedCommentId: row.acceptedCommentId ? id(row.acceptedCommentId) : undefined, viewerVote: Number(row.viewerVote ?? 0) as -1 | 0 | 1,
    isFollowing: row.isFollowing === true, isPinned: row.isPinned === true, canModerate: row.canModerate === true, canReply: row.canReply === true, editedAt: text(row.editedAt),
    linkedPaperId: row.linkedPaperId ? id(row.linkedPaperId) : undefined, linkedResearchGapId: row.linkedResearchGapId ? id(row.linkedResearchGapId) : undefined,
    linkedProjectId: row.linkedProjectId ? id(row.linkedProjectId) : undefined,
    linkedPaper: normalizeResearchContext(row.linkedPaper), linkedResearchGap: normalizeResearchContext(row.linkedResearchGap), linkedProject: normalizeResearchContext(row.linkedProject),
    references: Array.isArray(row.references) ? row.references.map(normalizeReference) : [], author: normalizeAuthor(author),
    reactionCounts: normalizeReactionCounts(row.reactionCounts), viewerReactions: normalizeReactionList(row.viewerReactions), reactionUsers: normalizeReactionUsers(row.reactionUsers),
    community: row.communityId || row.community ? { id: id(community), name: text(community.name) ?? "Community", slug: text(community.slug) ?? id(community) } : undefined,
    notificationLevel: ["WATCHING", "TRACKING", "NORMAL", "MUTED"].includes(String(row.notificationLevel)) ? row.notificationLevel as ForumNotificationLevel : row.isFollowing === true ? "WATCHING" : "NORMAL",
    likeCount: typeof row.likeCount === "number" ? row.likeCount : undefined,
    readingTimeMinutes: typeof row.readingTimeMinutes === "number" ? row.readingTimeMinutes : undefined,
    reactionCount: typeof row.reactionCount === "number" ? row.reactionCount : undefined,
    participantCount: typeof row.participantCount === "number" ? row.participantCount : undefined,
    linkCount: typeof row.linkCount === "number" ? row.linkCount : undefined,
    createdAt: text(row.createdAt) ?? new Date(0).toISOString(), updatedAt: text(row.updatedAt),
  };
}
function normalizeComment(value: unknown): ForumCommentView {
  const row = record(value);
  const parent = record(row.parentComment);
  return {
    id: id(row), postId: id(row.postId),
    postNumber: typeof row.postNumber === "number" && Number.isSafeInteger(row.postNumber) && row.postNumber >= 2 ? row.postNumber : undefined,
    content: text(row.content ?? row.body) ?? "", voteScore: Number(row.voteScore ?? row.score ?? 0), helpfulCount: Number(row.helpfulCount ?? 0), viewerVote: Number(row.viewerVote ?? 0) as -1 | 0 | 1,
    author: normalizeAuthor(row.author ?? row.authorId), createdAt: text(row.createdAt) ?? new Date(0).toISOString(), editedAt: text(row.editedAt), status: text(row.status) ?? "active", isAccepted: row.isAccepted === true,
    parentCommentId: row.parentCommentId ? id(row.parentCommentId) : undefined,
    parentComment: parent.id ? { id: id(parent), postNumber: typeof parent.postNumber === "number" ? parent.postNumber : undefined, author: normalizeAuthor(parent.author), status: text(parent.status) ?? "active" } : undefined,
    references: Array.isArray(row.references) ? row.references.map(normalizeReference) : [], reactionCounts: normalizeReactionCounts(row.reactionCounts), viewerReactions: normalizeReactionList(row.viewerReactions), reactionUsers: normalizeReactionUsers(row.reactionUsers),
  };
}
function normalizeRevisionAuthor(value: unknown): ForumRevisionAuthor {
  const row = record(value);
  return { id: id(row), fullName: text(row.fullName) ?? "Unknown researcher", avatarUrl: text(row.avatarUrl) };
}
function normalizePostRevision(value: unknown): ForumPostRevisionView {
  const row = record(value);
  return { id: id(row), revision: Number(row.revision ?? 0), title: text(row.title) ?? "", content: text(row.content ?? row.body) ?? "", tags: stringList(row.tags), editedBy: normalizeRevisionAuthor(row.editedBy), createdAt: text(row.createdAt) ?? new Date(0).toISOString() };
}
function normalizeCommentRevision(value: unknown): ForumCommentRevisionView {
  const row = record(value);
  return { id: id(row), revision: Number(row.revision ?? 0), content: text(row.content ?? row.body) ?? "", editedBy: normalizeRevisionAuthor(row.editedBy), createdAt: text(row.createdAt) ?? new Date(0).toISOString() };
}

const REACTION_NAMES: ForumReactionName[] = ["LIKE", "INSIGHTFUL", "CELEBRATE", "CURIOUS", "LOVE", "LAUGH", "SURPRISED", "SAD", "AGREE", "DISAGREE"];
function normalizeReactionCounts(value: unknown): Record<ForumReactionName, number> {
  const row = record(value);
  return Object.fromEntries(REACTION_NAMES.map((reaction) => [reaction, Number(row[reaction] ?? 0)])) as Record<ForumReactionName, number>;
}
function normalizeReactionList(value: unknown): ForumReactionName[] { return Array.isArray(value) ? value.filter((item): item is ForumReactionName => typeof item === "string" && REACTION_NAMES.includes(item as ForumReactionName)) : []; }
function normalizeReactionUsers(value: unknown): Partial<Record<ForumReactionName, ForumReactionUser[]>> {
  const row = record(value); const result: Partial<Record<ForumReactionName, ForumReactionUser[]>> = {};
  for (const reaction of REACTION_NAMES) { const users = row[reaction]; if (Array.isArray(users)) result[reaction] = users.map((item) => { const user = record(item); return { id: id(user), fullName: text(user.fullName) ?? "Researcher", avatarUrl: text(user.avatarUrl) }; }); }
  return result;
}
function normalizeCommunity(value: unknown): CommunityView {
  const row = record(value);
  const moderators = Array.isArray(row.moderators) ? row.moderators.map((value) => { const moderator = record(value); return { id: id(moderator), fullName: text(moderator.fullName) ?? "", avatarUrl: text(moderator.avatarUrl) }; }) : undefined;
  const rawStatus = String(row.status ?? "ACTIVE");
  const status = (["ACTIVE", "ARCHIVED", "PENDING_APPROVAL", "REJECTED"] as CommunityStatus[]).includes(rawStatus as CommunityStatus) ? rawStatus as CommunityStatus : "ACTIVE";
  return {
    id: id(row), name: text(row.name) ?? "", slug: text(row.slug) ?? "", description: text(row.description) ?? "",
    researchTopics: stringList(row.researchTopics), researchField: text(row.researchField), icon: text(row.icon),
    visibility: row.visibility === "private" ? "private" : "public", status, reviewNote: text(row.reviewNote),
    reviewedAt: text(row.reviewedAt), rules: stringList(row.rules), memberCount: Number(row.memberCount ?? 0),
    threadCount: Number(row.threadCount ?? 0), moderators, viewerMembership: row.viewerMembership as CommunityMembershipView | undefined,
    canManage: row.canManage === true, canEditCommunity: row.canEditCommunity === true, isOwner: row.isOwner === true,
    isAdmin: row.isAdmin === true, pendingRequestCount: typeof row.pendingRequestCount === "number" ? row.pendingRequestCount : undefined,
    contentRestricted: row.contentRestricted === true, createdAt: text(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: text(row.updatedAt) ?? new Date(0).toISOString(),
  };
}
function normalizeCommunityMember(value: unknown): CommunityMemberView {
  const row = record(value); const user = record(row.user ?? row.userId);
  return { id: id(row), user: { id: id(user), fullName: text(user.fullName) ?? "Unknown member", email: text(user.email) ?? "", avatarUrl: text(user.avatarUrl), role: text(user.role) ?? "user", institution: text(user.institution) }, role: row.role as CommunityMemberView["role"], status: row.status as CommunityMemberView["status"], joinedAt: text(row.joinedAt ?? row.createdAt) ?? new Date(0).toISOString() };
}

function writableForumInput<T extends { references?: ForumReferenceView[] }>(input: T) {
  return { ...input, ...(input.references !== undefined ? { references: input.references.map(({ paperId, doi, url, title, authors, year }) => ({ paperId, doi, url, title, authors, year })) } : {}) };
}

export const forumApi = {
  async posts(params: ForumPostFilters, signal?: AbortSignal): Promise<{ data: ForumPostView[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> { const response = await api.get(API_ROUTES.forum.posts, { params, signal }); return { data: response.data.data.map(normalizePost), meta: response.data.meta }; },
  async post(postId: string, signal?: AbortSignal): Promise<ForumPostView> { const response = await api.get(API_ROUTES.forum.post(postId), { withCredentials: true, signal }); return normalizePost(response.data.data); },
  async recentViews(postId: string): Promise<ForumRecentViews> { const response = await api.get(`${API_ROUTES.forum.post(postId)}/views`); return response.data.data; },
  async reactionPeople(target: ForumReactionTarget, reaction?: ForumReactionName, page = 1): Promise<ForumReactionPeople> {
    const base = target.scope === "comment" ? API_ROUTES.forum.comment(target.id) : API_ROUTES.forum.post(target.id);
    const response = await api.get(`${base}/reactions`, { params: { scope: target.scope === "topic" ? "topic" : "post", reaction, page, pageSize: 20 } });
    return { data: response.data.data.map((item: unknown) => { const row = record(item); return { id: id(row), reaction: row.reaction as ForumReactionName, user: normalizeAuthor(row.user) }; }), counts: normalizeReactionCounts(response.data.counts), meta: response.data.meta };
  },
  async discovery(postId: string): Promise<ForumDiscovery> {
    const response = await api.get(`${API_ROUTES.forum.post(postId)}/discovery`);
    const normalizeTopics = (value: unknown): ForumDiscoveryTopic[] => Array.isArray(value) ? value.map((value) => {
      const row = record(value); const post = normalizePost(row);
      return { id: post.id, publicSlug: post.publicSlug, title: post.title, type: post.type, community: post.community, replyCount: post.replyCount, viewCount: post.viewCount, lastActivityAt: post.lastActivityAt, createdAt: post.createdAt, reason: row.reason as ForumDiscoveryReason };
    }) : [];
    return { related: normalizeTopics(response.data.data.related), suggested: normalizeTopics(response.data.data.suggested) };
  },
  async createPost(input: ForumPostInput): Promise<ForumPostView> { const { communityId, ...fields } = input; const response = await api.post(API_ROUTES.forum.posts, writableForumInput({ ...fields, categoryId: communityId })); return normalizePost(response.data.data); },
  async updatePost(postId: string, input: Partial<ForumPostInput>): Promise<ForumPostView> { const response = await api.patch(API_ROUTES.forum.post(postId), writableForumInput(input)); return normalizePost(response.data.data); },
  async postRevisions(postId: string): Promise<ForumPostRevisionView[]> { const response = await api.get(API_ROUTES.forum.postRevisions(postId), { withCredentials: true }); return Array.isArray(response.data.data) ? response.data.data.map(normalizePostRevision) : []; },
  async deletePost(postId: string): Promise<void> { await api.delete(API_ROUTES.forum.post(postId)); },
  async comments(postId: string): Promise<ForumCommentView[]> { const response = await api.get(API_ROUTES.forum.comments(postId), { params: { page: 1, pageSize: 25 } }); return response.data.data.map(normalizeComment); },
  async commentsPage(postId: string, page = 1, signal?: AbortSignal): Promise<ForumCommentsPage> { const response = await api.get(API_ROUTES.forum.comments(postId), { params: { page, pageSize: 25 }, signal }); return { data: response.data.data.map(normalizeComment), meta: response.data.meta }; },
  async addComment(postId: string, input: { content: string; parentCommentId?: string; references?: ForumReferenceView[] }): Promise<ForumCommentView> { const response = await api.post(API_ROUTES.forum.comments(postId), writableForumInput(input)); return normalizeComment(response.data.data); },
  async updateComment(commentId: string, input: { content: string; references?: ForumReferenceView[] }): Promise<ForumCommentView> { const response = await api.patch(API_ROUTES.forum.comment(commentId), writableForumInput(input)); return normalizeComment(response.data.data); },
  async commentRevisions(commentId: string): Promise<ForumCommentRevisionView[]> { const response = await api.get(API_ROUTES.forum.commentRevisions(commentId), { withCredentials: true }); return Array.isArray(response.data.data) ? response.data.data.map(normalizeCommentRevision) : []; },
  async deleteComment(commentId: string): Promise<void> { await api.delete(API_ROUTES.forum.comment(commentId)); },
  async votePost(postId: string, value: -1 | 0 | 1) { const response = await api.post(API_ROUTES.forum.postVote(postId), { value }); return response.data.data; },
  async voteComment(commentId: string, value: -1 | 0 | 1) { const response = await api.post(API_ROUTES.forum.commentVote(commentId), { value }); return response.data.data; },
  async react(kind: "post" | "comment", id: string, reaction: ForumReactionName, active: boolean): Promise<ForumReactionSummary & { subjectKind: "post" | "comment"; subjectId: string; reaction: ForumReactionName; active: boolean }> {
    const response = await api.post(kind === "post" ? API_ROUTES.forum.postReactions(id) : API_ROUTES.forum.commentReactions(id), { reaction, active });
    const row = record(response.data.data);
    return {
      subjectKind: kind, subjectId: text(row.subjectId) ?? id, reaction, active: row.active === true,
      reactionCounts: normalizeReactionCounts(row.counts ?? row.reactionCounts),
      viewerReactions: normalizeReactionList(row.viewerReactions),
      reactionUsers: normalizeReactionUsers(row.reactors ?? row.reactionUsers),
    };
  },
  async accept(postId: string, commentId: string) { const response = await api.post(API_ROUTES.forum.acceptAnswer(postId, commentId)); return normalizePost(response.data.data); },
  async unaccept(postId: string) { const response = await api.delete(API_ROUTES.forum.acceptedAnswer(postId)); return normalizePost(response.data.data); },
  async follow(postId: string, following: boolean) { if (following) await api.put(API_ROUTES.forum.follow(postId)); else await api.delete(API_ROUTES.forum.follow(postId)); },
  async notificationLevel(postId: string, level: ForumNotificationLevel): Promise<void> { await api.patch(`${API_ROUTES.forum.post(postId)}/notifications`, { level }); },
  async context(q?: string): Promise<ForumResearchContext> { const response = await api.get(API_ROUTES.forum.context, { params: { q } }); return response.data.data; },
  async shareGap(gapId: string): Promise<void> { await api.post(API_ROUTES.forum.shareGap(gapId)); },
  async report(targetType: "post" | "comment", targetId: string, reason: ForumReportReason, description?: string) { await api.post(API_ROUTES.forum.reports, { targetType, targetId, reason, description }); },
  async reports(params: { communityId?: string; status?: ForumReportStatus | "all" } = {}): Promise<ForumReportView[]> { const response = await api.get(API_ROUTES.forum.reports, { params }); return response.data.data; },
  async reviewReport(reportId: string, input: { status: "reviewed" | "resolved" | "dismissed"; moderationNote?: string }): Promise<ForumReportView> { const response = await api.patch(API_ROUTES.forum.reviewReport(reportId), input); return response.data.data; },
  async moderationActions(communityId?: string): Promise<ForumModerationActionView[]> { const response = await api.get(API_ROUTES.forum.moderationActions, { params: { communityId } }); return response.data.data; },
  async moderationQueue(status: ForumReportStatus | "all" = "open"): Promise<ForumQueueReport[]> { return (await api.get("/forum/moderation/queue", { params: { status } })).data.data; },
  async claimReport(id: string, expectedVersion: number): Promise<ForumQueueReport> { return (await api.post(`/forum/reports/${id}/claim`, { expectedVersion })).data.data; },
  async reassignReport(id: string, assigneeId: string, expectedVersion: number): Promise<ForumQueueReport> { return (await api.post(`/forum/reports/${id}/reassign`, { assigneeId, expectedVersion })).data.data; },
  async reportAction(id: string, action: ForumQueueAction, input: { reason: string; expectedVersion: number; destinationCommunityId?: string }): Promise<void> { await api.post(`/forum/reports/${id}/action`, { action, ...input }); },
  async restrictions(): Promise<ForumRestrictionView[]> { return (await api.get("/forum/moderation/restrictions")).data.data; },
  async revokeRestriction(id: string): Promise<void> { await api.post(`/forum/moderation/restrictions/${id}/revoke`); },
  async appeals(status: "SUBMITTED" | "all" = "SUBMITTED"): Promise<ForumAppealView[]> { return (await api.get("/forum/appeals", { params: { status } })).data.data; },
  async reviewAppeal(id: string, decision: "UPHELD" | "OVERTURNED", decisionReason: string): Promise<void> { await api.post(`/forum/appeals/${id}/review`, { decision, decisionReason }); },
  async myModerationActions(): Promise<ForumMyAction[]> { return (await api.get("/forum/moderation/my-actions")).data.data; },
  async submitAppeal(id: string, reason: string): Promise<void> { await api.post(`/forum/moderation-actions/${id}/appeal`, { reason }); },
  async submitCopyrightClaim(input: ForumCopyrightInput): Promise<void> { await api.post("/forum/copyright-claims", input); },
  async copyrightClaims(): Promise<ForumCopyrightClaim[]> { return (await api.get("/forum/copyright-claims")).data.data; },
  async reviewCopyrightClaim(id: string, status: "IN_REVIEW" | "RESOLVED" | "DISMISSED", reason: string): Promise<void> { await api.post(`/forum/copyright-claims/${id}/review`, { status, reason }); },
  async moderatePost(postId: string, action: "THREAD_PINNED" | "THREAD_UNPINNED" | "THREAD_LOCKED" | "THREAD_UNLOCKED" | "THREAD_HIDDEN" | "THREAD_RESTORED", reason?: string): Promise<ForumPostView> { const response = await api.patch(API_ROUTES.forum.postModeration(postId), { action, reason }); return normalizePost(response.data.data); },
  async moderateComment(commentId: string, action: "RESPONSE_HIDDEN" | "RESPONSE_RESTORED", reason?: string): Promise<ForumCommentView> { const response = await api.patch(API_ROUTES.forum.commentModeration(commentId), { action, reason }); return normalizeComment(response.data.data); },
  async communities(options: { all?: boolean } = {}): Promise<CommunityView[]> {
    // The same DB-backed endpoint serves discovery and the sidebar, including installations
    // with more than one page of communities. Topics remain server-paginated separately.
    const communities: CommunityView[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await api.get(API_ROUTES.communities.list, { params: { page, pageSize: 100, ...(options.all ? {} : { activeOnly: true }) } });
      communities.push(...response.data.data.map(normalizeCommunity));
      totalPages = response.data.meta.totalPages;
      page += 1;
    } while (page <= totalPages);
    return communities;
  },
  async communityPage(params: CommunityListParams = {}): Promise<CommunityPage> {
    const response = await api.get(API_ROUTES.communities.list, { params: { page: 1, pageSize: 12, ...params } });
    const meta = response.data.meta ?? {};
    return { items: response.data.data.map(normalizeCommunity), page: Number(meta.page ?? params.page ?? 1), totalPages: Number(meta.totalPages ?? 1), total: Number(meta.total ?? 0) };
  },
  async communityFacets(): Promise<CommunityFacet[]> { const response = await api.get(API_ROUTES.communities.facets); return response.data.data; },
  async communityRecommendations(): Promise<CommunityRecommendation[]> { const response = await api.get(API_ROUTES.communities.recommendations); return response.data.data.map((row: Record<string, unknown>) => ({ ...normalizeCommunity(row), matchedInterests: stringList(row.matchedInterests), matchReason: row.matchReason === "semantic" ? "semantic" as const : "topic" as const, similarity: typeof row.similarity === "number" ? row.similarity : undefined })); },
  async communitySuggestions(q: string): Promise<CommunitySuggestion[]> { const response = await api.get(API_ROUTES.communities.suggestions, { params: { q } }); return response.data.data.map((row: Record<string, unknown>) => ({ ...normalizeCommunity(row), similarity: Number(row.similarity ?? 0) })); },
  async community(idOrSlug: string): Promise<CommunityView> { const response = await api.get(API_ROUTES.communities.detail(idOrSlug)); return normalizeCommunity(response.data.data); },
  async createCommunity(input: CommunityInput): Promise<CommunityView> { const response = await api.post(API_ROUTES.communities.list, input); return normalizeCommunity(response.data.data); },
  async updateCommunity(communityId: string, input: Partial<CommunityInput>): Promise<CommunityView> { const response = await api.patch(API_ROUTES.communities.detail(communityId), input); return normalizeCommunity(response.data.data); },
  async reviewCommunity(communityId: string, input: CommunityReviewInput): Promise<CommunityView> { const response = await api.post(API_ROUTES.communities.review(communityId), input); return normalizeCommunity(response.data.data); },
  async communitySummary(communityId: string): Promise<CommunitySummaryView> { const response = await api.get(API_ROUTES.communities.summary(communityId)); return response.data.data; },
  async requestCommunitySummary(communityId: string): Promise<CommunitySummaryView> { const response = await api.post(API_ROUTES.communities.summary(communityId)); return response.data.data; },
  async setCommunityStatus(communityId: string, status: "ACTIVE" | "ARCHIVED"): Promise<CommunityView> { const response = await api.patch(API_ROUTES.communities.status(communityId), { status }); return normalizeCommunity(response.data.data); },
  async resubmitCommunity(communityId: string): Promise<CommunityView> { const response = await api.post(API_ROUTES.communities.resubmit(communityId)); return normalizeCommunity(response.data.data); },
  async transferCommunityOwnership(communityId: string, userId: string): Promise<CommunityView> { const response = await api.post(API_ROUTES.communities.transferOwnership(communityId), { userId }); return normalizeCommunity(response.data.data); },
  async publicCommunityMembers(communityId: string): Promise<CommunityPublicMember[]> { const response = await api.get(API_ROUTES.communities.publicMembers(communityId)); return response.data.data; },
  async relatedPapers(communityId: string): Promise<CommunityRelatedPaper[]> { const response = await api.get(API_ROUTES.communities.relatedPapers(communityId)); return response.data.data; },
  async relatedGaps(communityId: string): Promise<CommunityRelatedGap[]> { const response = await api.get(API_ROUTES.communities.relatedGaps(communityId)); return response.data.data; },
  async joinCommunity(communityId: string): Promise<CommunityMembershipView> { const response = await api.post(API_ROUTES.communities.join(communityId)); return response.data.data; },
  async leaveCommunity(communityId: string) { await api.delete(API_ROUTES.communities.leave(communityId)); },
  async communityMembers(communityId: string): Promise<CommunityMemberView[]> { const response = await api.get(API_ROUTES.communities.members(communityId)); return response.data.data.map(normalizeCommunityMember); },
  async updateCommunityMember(communityId: string, userId: string, input: { role?: "moderator" | "member"; status?: "pending" | "active" | "declined" | "banned" }): Promise<void> { await api.patch(API_ROUTES.communities.member(communityId, userId), input); },
};
