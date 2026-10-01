import type { ForumPostType, ForumResearchContext, ForumSort } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export type ForumReferenceView = { id?: string; paperId?: string; doi?: string; url?: string; title?: string; authors?: string[]; year?: number; verified?: boolean };
export type ForumAuthorView = { id: string; fullName: string; avatarUrl?: string; institution?: string; academicProfileType?: string; academicTitle?: string; affiliationVerified?: boolean; positionTitle?: string; primaryPosition?: string; positionVerified?: boolean };
export type ForumPostView = {
  id: string; type: ForumPostType; title: string; content: string; tags: string[]; status: string;
  voteScore: number; commentCount: number; replyCount: number; helpfulCount: number; viewCount: number; lastActivityAt?: string;
  participants: ForumAuthorView[]; acceptedCommentId?: string; viewerVote: -1 | 0 | 1;
  isFollowing: boolean; isPinned: boolean; editedAt?: string;
  canModerate: boolean;
  canReply: boolean;
  linkedPaperId?: string; linkedResearchGapId?: string; linkedProjectId?: string;
  linkedPaper?: { id: string; title: string; publicationYear?: number; doi?: string };
  linkedResearchGap?: { id: string; title: string; topic?: string; validationStatus?: string; status?: string };
  linkedProject?: { id: string; title: string };
  references: ForumReferenceView[]; author: ForumAuthorView;
  community?: { id: string; name: string; slug: string }; createdAt: string; updatedAt?: string;
};
export type ForumCommentView = {
  id: string; postId: string; content: string; voteScore: number; viewerVote: -1 | 0 | 1;
  author: ForumAuthorView; createdAt: string; editedAt?: string; status: string; isAccepted: boolean;
  parentCommentId?: string; parentComment?: { id: string; author: ForumAuthorView; status: string }; helpfulCount: number; references: ForumReferenceView[];
};
export type ForumCommentsPage = { data: ForumCommentView[]; meta: { page: number; pageSize: number; total: number; totalPages: number } };
export type CommunityMembershipView = { role: "owner" | "moderator" | "member"; status: "pending" | "active" | "declined" | "banned" };
export type CommunityView = {
  id: string; name: string; slug: string; description: string; researchTopics: string[];
  researchField?: string; icon?: string; visibility: "public" | "private"; status: "ACTIVE" | "ARCHIVED";
  rules: string[]; memberCount: number; threadCount: number;
  moderators?: Array<{ id: string; fullName: string; avatarUrl?: string }>;
  viewerMembership?: CommunityMembershipView; canManage: boolean; contentRestricted: boolean;
  canEditCommunity: boolean;
  createdAt?: string; updatedAt?: string;
};
export type CommunityInput = {
  name: string; description?: string; visibility?: "public" | "private"; researchField?: string;
  icon?: string; status?: "ACTIVE" | "ARCHIVED"; researchTopics?: string[]; rules?: string[];
};
export type CommunityMemberView = {
  id: string; user: { id: string; fullName: string; email: string; avatarUrl?: string; role: string; institution?: string };
  role: "owner" | "moderator" | "member"; status: "pending" | "active" | "declined" | "banned"; joinedAt: string;
};
export type ForumPostInput = {
  type: ForumPostType; title: string; content: string; communityId: string; tags: string[];
  linkedPaperId?: string; linkedResearchGapId?: string; linkedProjectId?: string; references?: ForumReferenceView[];
};
export type ForumPostFilters = {
  page?: number; pageSize?: number; query?: string; communityId?: string; type?: ForumPostType;
  tag?: string; sort?: ForumSort; linkedPaperId?: string; linkedResearchGapId?: string; includeModerated?: boolean;
};
export type ForumReportView = {
  id: string; targetType: "post" | "comment"; targetId: string; postId: string; reason: string; description?: string;
  status: "open" | "reviewed" | "resolved" | "dismissed"; reporter: { id: string; fullName: string };
  community?: { id: string; name: string; slug: string }; target: { title?: string; excerpt: string; status: string };
  moderationNote?: string; createdAt: string; reviewedAt?: string;
};
export type ForumModerationActionView = {
  id: string; action: string; reason?: string; actor: { id: string; fullName: string };
  community?: { id: string; name: string; slug: string }; targetType: "post" | "comment" | "report";
  targetId: string; createdAt: string;
};

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" ? value as UnknownRecord : {};
const id = (value: unknown): string => { const row = record(value); const result = row._id ?? row.id ?? value; return typeof result === "string" || typeof result === "number" ? String(result) : ""; };
const text = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
const stringList = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function normalizeAuthor(value: unknown): ForumAuthorView {
  const row = record(value);
  return { id: id(row), fullName: text(row.fullName) ?? "Unknown researcher", avatarUrl: text(row.avatarUrl), institution: text(row.institution), academicProfileType: text(row.academicProfileType), academicTitle: text(row.academicTitle), affiliationVerified: row.affiliationVerified === true, positionTitle: text(row.positionTitle), primaryPosition: text(row.primaryPosition), positionVerified: row.positionVerified === true };
}
function normalizeReference(value: unknown): ForumReferenceView {
  const row = record(value);
  return { id: row.id ? id(row.id) : undefined, paperId: row.paperId ? id(row.paperId) : undefined, doi: text(row.doi), url: text(row.url), title: text(row.title), authors: stringList(row.authors), year: typeof row.year === "number" ? row.year : undefined, verified: row.verified === true };
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
    id: id(row), type, title: text(row.title) ?? "", content: text(row.content ?? row.body) ?? "", tags: stringList(row.tags),
    status: text(row.status) ?? "active", voteScore: Number(row.voteScore ?? row.score ?? 0), commentCount: Number(row.replyCount ?? row.commentCount ?? 0), replyCount: Number(row.replyCount ?? row.commentCount ?? 0), helpfulCount: Number(row.helpfulCount ?? 0), viewCount: Number(row.viewCount ?? 0), lastActivityAt: text(row.lastActivityAt),
    participants: Array.isArray(row.participants) ? row.participants.map(normalizeAuthor) : [normalizeAuthor(author)],
    acceptedCommentId: row.acceptedCommentId ? id(row.acceptedCommentId) : undefined, viewerVote: Number(row.viewerVote ?? 0) as -1 | 0 | 1,
    isFollowing: row.isFollowing === true, isPinned: row.isPinned === true, canModerate: row.canModerate === true, canReply: row.canReply === true, editedAt: text(row.editedAt),
    linkedPaperId: row.linkedPaperId ? id(row.linkedPaperId) : undefined, linkedResearchGapId: row.linkedResearchGapId ? id(row.linkedResearchGapId) : undefined,
    linkedProjectId: row.linkedProjectId ? id(row.linkedProjectId) : undefined,
    linkedPaper: normalizeResearchContext(row.linkedPaper), linkedResearchGap: normalizeResearchContext(row.linkedResearchGap), linkedProject: normalizeResearchContext(row.linkedProject),
    references: Array.isArray(row.references) ? row.references.map(normalizeReference) : [], author: normalizeAuthor(author),
    community: row.communityId || row.community ? { id: id(community), name: text(community.name) ?? "Community", slug: text(community.slug) ?? id(community) } : undefined,
    createdAt: text(row.createdAt) ?? new Date(0).toISOString(), updatedAt: text(row.updatedAt),
  };
}
function normalizeComment(value: unknown): ForumCommentView {
  const row = record(value);
  const parent = record(row.parentComment);
  return { id: id(row), postId: id(row.postId), content: text(row.content ?? row.body) ?? "", voteScore: Number(row.voteScore ?? row.score ?? 0), helpfulCount: Number(row.helpfulCount ?? 0), viewerVote: Number(row.viewerVote ?? 0) as -1 | 0 | 1, author: normalizeAuthor(row.author ?? row.authorId), createdAt: text(row.createdAt) ?? new Date(0).toISOString(), editedAt: text(row.editedAt), status: text(row.status) ?? "active", isAccepted: row.isAccepted === true, parentCommentId: row.parentCommentId ? id(row.parentCommentId) : undefined, parentComment: parent.id ? { id: id(parent), author: normalizeAuthor(parent.author), status: text(parent.status) ?? "active" } : undefined, references: Array.isArray(row.references) ? row.references.map(normalizeReference) : [] };
}
function normalizeCommunity(value: unknown): CommunityView {
  const row = record(value);
  const moderators = Array.isArray(row.moderators) ? row.moderators.map((value) => { const moderator = record(value); return { id: id(moderator), fullName: text(moderator.fullName) ?? "", avatarUrl: text(moderator.avatarUrl) }; }) : undefined;
  return { id: id(row), name: text(row.name) ?? "", slug: text(row.slug) ?? "", description: text(row.description) ?? "", researchTopics: stringList(row.researchTopics), researchField: text(row.researchField), icon: text(row.icon), visibility: row.visibility === "private" ? "private" : "public", status: row.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE", rules: stringList(row.rules), memberCount: Number(row.memberCount ?? 0), threadCount: Number(row.threadCount ?? 0), moderators, viewerMembership: row.viewerMembership as CommunityMembershipView | undefined, canManage: row.canManage === true, canEditCommunity: row.canEditCommunity === true, contentRestricted: row.contentRestricted === true, createdAt: text(row.createdAt), updatedAt: text(row.updatedAt) };
}
function normalizeCommunityMember(value: unknown): CommunityMemberView {
  const row = record(value); const user = record(row.user ?? row.userId);
  return { id: id(row), user: { id: id(user), fullName: text(user.fullName) ?? "Unknown member", email: text(user.email) ?? "", avatarUrl: text(user.avatarUrl), role: text(user.role) ?? "user", institution: text(user.institution) }, role: row.role as CommunityMemberView["role"], status: row.status as CommunityMemberView["status"], joinedAt: text(row.joinedAt ?? row.createdAt) ?? new Date(0).toISOString() };
}

export const forumApi = {
  async posts(params: ForumPostFilters): Promise<{ data: ForumPostView[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> { const response = await api.get(API_ROUTES.forum.posts, { params }); return { data: response.data.data.map(normalizePost), meta: response.data.meta }; },
  async post(postId: string): Promise<ForumPostView> { const response = await api.get(API_ROUTES.forum.post(postId), { withCredentials: true }); return normalizePost(response.data.data); },
  async createPost(input: ForumPostInput): Promise<ForumPostView> { const response = await api.post(API_ROUTES.forum.posts, input); return normalizePost(response.data.data); },
  async updatePost(postId: string, input: Partial<ForumPostInput>): Promise<ForumPostView> { const response = await api.patch(API_ROUTES.forum.post(postId), input); return normalizePost(response.data.data); },
  async deletePost(postId: string): Promise<void> { await api.delete(API_ROUTES.forum.post(postId)); },
  async comments(postId: string): Promise<ForumCommentView[]> { const response = await api.get(API_ROUTES.forum.comments(postId), { params: { page: 1, pageSize: 25 } }); return response.data.data.map(normalizeComment); },
  async commentsPage(postId: string, page = 1): Promise<ForumCommentsPage> { const response = await api.get(API_ROUTES.forum.comments(postId), { params: { page, pageSize: 25 } }); return { data: response.data.data.map(normalizeComment), meta: response.data.meta }; },
  async addComment(postId: string, input: { content: string; parentCommentId?: string; references?: ForumReferenceView[] }): Promise<ForumCommentView> { const response = await api.post(API_ROUTES.forum.comments(postId), input); return normalizeComment(response.data.data); },
  async updateComment(commentId: string, input: { content: string; references?: ForumReferenceView[] }): Promise<ForumCommentView> { const response = await api.patch(API_ROUTES.forum.comment(commentId), input); return normalizeComment(response.data.data); },
  async deleteComment(commentId: string): Promise<void> { await api.delete(API_ROUTES.forum.comment(commentId)); },
  async votePost(postId: string, value: -1 | 0 | 1) { const response = await api.post(API_ROUTES.forum.postVote(postId), { value }); return response.data.data; },
  async voteComment(commentId: string, value: -1 | 0 | 1) { const response = await api.post(API_ROUTES.forum.commentVote(commentId), { value }); return response.data.data; },
  async accept(postId: string, commentId: string) { const response = await api.post(API_ROUTES.forum.acceptAnswer(postId, commentId)); return normalizePost(response.data.data); },
  async unaccept(postId: string) { const response = await api.delete(API_ROUTES.forum.acceptedAnswer(postId)); return normalizePost(response.data.data); },
  async follow(postId: string, following: boolean) { if (following) await api.put(API_ROUTES.forum.follow(postId)); else await api.delete(API_ROUTES.forum.follow(postId)); },
  async context(q?: string): Promise<ForumResearchContext> { const response = await api.get(API_ROUTES.forum.context, { params: { q } }); return response.data.data; },
  async shareGap(gapId: string): Promise<void> { await api.post(API_ROUTES.forum.shareGap(gapId)); },
  async report(targetType: "post" | "comment", targetId: string, reason: string, description?: string) { await api.post(API_ROUTES.forum.reports, { targetType, targetId, reason, description }); },
  async reports(params: { communityId?: string; status?: "open" | "reviewed" | "resolved" | "dismissed" | "all" } = {}): Promise<ForumReportView[]> { const response = await api.get(API_ROUTES.forum.reports, { params }); return response.data.data; },
  async reviewReport(reportId: string, input: { status: "reviewed" | "resolved" | "dismissed"; moderationNote?: string }): Promise<ForumReportView> { const response = await api.patch(API_ROUTES.forum.reviewReport(reportId), input); return response.data.data; },
  async moderationActions(communityId?: string): Promise<ForumModerationActionView[]> { const response = await api.get(API_ROUTES.forum.moderationActions, { params: { communityId } }); return response.data.data; },
  async moderatePost(postId: string, action: "THREAD_PINNED" | "THREAD_UNPINNED" | "THREAD_LOCKED" | "THREAD_UNLOCKED" | "THREAD_HIDDEN" | "THREAD_RESTORED", reason?: string): Promise<ForumPostView> { const response = await api.patch(API_ROUTES.forum.postModeration(postId), { action, reason }); return normalizePost(response.data.data); },
  async moderateComment(commentId: string, action: "RESPONSE_HIDDEN" | "RESPONSE_RESTORED", reason?: string): Promise<ForumCommentView> { const response = await api.patch(API_ROUTES.forum.commentModeration(commentId), { action, reason }); return normalizeComment(response.data.data); },
  async communities(): Promise<CommunityView[]> {
    // The same DB-backed endpoint serves discovery and the sidebar, including installations
    // with more than one page of communities. Topics remain server-paginated separately.
    const communities: CommunityView[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await api.get(API_ROUTES.communities.list, { params: { page, pageSize: 100, activeOnly: true } });
      communities.push(...response.data.data.map(normalizeCommunity));
      totalPages = response.data.meta.totalPages;
      page += 1;
    } while (page <= totalPages);
    return communities;
  },
  async community(idOrSlug: string): Promise<CommunityView> { const response = await api.get(API_ROUTES.communities.detail(idOrSlug)); return normalizeCommunity(response.data.data); },
  async createCommunity(input: CommunityInput): Promise<CommunityView> { const response = await api.post(API_ROUTES.communities.list, input); return normalizeCommunity(response.data.data); },
  async updateCommunity(communityId: string, input: Partial<CommunityInput>): Promise<CommunityView> { const response = await api.patch(API_ROUTES.communities.detail(communityId), input); return normalizeCommunity(response.data.data); },
  async joinCommunity(communityId: string): Promise<CommunityMembershipView> { const response = await api.post(API_ROUTES.communities.join(communityId)); return response.data.data; },
  async leaveCommunity(communityId: string) { await api.delete(API_ROUTES.communities.leave(communityId)); },
  async communityMembers(communityId: string): Promise<CommunityMemberView[]> { const response = await api.get(API_ROUTES.communities.members(communityId)); return response.data.data.map(normalizeCommunityMember); },
  async updateCommunityMember(communityId: string, userId: string, input: { role?: "moderator" | "member"; status?: "pending" | "active" | "declined" | "banned" }): Promise<void> { await api.patch(API_ROUTES.communities.member(communityId, userId), input); },
};
