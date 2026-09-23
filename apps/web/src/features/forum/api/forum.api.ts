import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export type ForumPostView = {
  id: string; type: "discussion" | "question"; title: string; content: string; tags: string[];
  status: string; voteScore: number; commentCount: number; acceptedCommentId?: string;
  linkedPaperId?: string; linkedResearchGapId?: string; linkedProjectId?: string;
  references: Array<{ paperId?: string; doi?: string; url?: string; title?: string; verified?: boolean }>;
  author: { id: string; fullName: string; institution?: string; academicProfileType?: string; academicVerificationStatus?: string; academicTitle?: string };
  community?: { id: string; name: string; slug: string }; createdAt: string;
};
export type ForumCommentView = { id: string; postId: string; content: string; voteScore: number; author: ForumPostView["author"]; createdAt: string; status: string };
export type CommunityView = { id: string; name: string; slug: string; description: string; researchTopics: string[]; visibility: "public" | "private"; memberCount: number };

function id(value: unknown): string { return String((value as { _id?: unknown })?._id ?? value ?? ""); }
function normalizeAuthor(value: any): ForumPostView["author"] {
  const declaredType = value?.academicProfileType ?? (["student", "researcher", "lecturer"].includes(value?.role) ? value.role : undefined);
  const isVerifiedLecturer = declaredType === "lecturer" && value?.academicVerificationStatus === "VERIFIED";
  const safeType = declaredType === "lecturer" ? undefined : declaredType;
  return {
    id: id(value),
    fullName: `${value?.fullName ?? "Unknown researcher"}${isVerifiedLecturer ? " · Verified Lecturer" : ""}`,
    institution: value?.institution,
    academicProfileType: safeType,
    academicVerificationStatus: value?.academicVerificationStatus,
    academicTitle: value?.academicTitle,
  };
}
function normalizePost(value: any): ForumPostView {
  return { id: id(value), type: value.type ?? "discussion", title: value.title, content: value.content ?? value.body ?? "", tags: value.tags ?? [], status: value.status, voteScore: value.voteScore ?? value.score ?? 0, commentCount: value.commentCount ?? 0, acceptedCommentId: value.acceptedCommentId ? id(value.acceptedCommentId) : undefined, linkedPaperId: value.linkedPaperId ? id(value.linkedPaperId) : undefined, linkedResearchGapId: value.linkedResearchGapId ? id(value.linkedResearchGapId) : undefined, linkedProjectId: value.linkedProjectId ? id(value.linkedProjectId) : undefined, references: value.references ?? [], author: normalizeAuthor(value.authorId), community: value.communityId ? { id: id(value.communityId), name: value.communityId.name ?? "Community", slug: value.communityId.slug ?? id(value.communityId) } : undefined, createdAt: value.createdAt };
}
function normalizeComment(value: any): ForumCommentView { return { id: id(value), postId: id(value.postId), content: value.content ?? value.body ?? "", voteScore: value.voteScore ?? value.score ?? 0, author: normalizeAuthor(value.authorId), createdAt: value.createdAt, status: value.status }; }
function normalizeCommunity(value: any): CommunityView { return { id: id(value), name: value.name, slug: value.slug, description: value.description ?? "", researchTopics: value.researchTopics ?? [], visibility: value.visibility, memberCount: value.memberCount ?? 0 }; }

export const forumApi = {
  async posts(params: Record<string, string | number | undefined>): Promise<{ data: ForumPostView[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> { const response = await api.get(API_ROUTES.forum.posts, { params }); return { data: response.data.data.map(normalizePost), meta: response.data.meta }; },
  async post(postId: string): Promise<ForumPostView> { const response = await api.get(API_ROUTES.forum.post(postId)); return normalizePost(response.data.data); },
  async createPost(input: { type: "discussion" | "question"; title: string; content: string; communityId?: string; tags: string[] }): Promise<ForumPostView> { const response = await api.post(API_ROUTES.forum.posts, input); return normalizePost(response.data.data); },
  async comments(postId: string): Promise<ForumCommentView[]> { const response = await api.get(API_ROUTES.forum.comments(postId), { params: { page: 1, pageSize: 100 } }); return response.data.data.map(normalizeComment); },
  async addComment(postId: string, content: string): Promise<ForumCommentView> { const response = await api.post(API_ROUTES.forum.comments(postId), { content }); return normalizeComment(response.data.data); },
  async votePost(id: string, value: -1 | 0 | 1) { const response = await api.post(API_ROUTES.forum.postVote(id), { value }); return response.data.data; },
  async voteComment(id: string, value: -1 | 0 | 1) { const response = await api.post(API_ROUTES.forum.commentVote(id), { value }); return response.data.data; },
  async accept(postId: string, commentId: string) { const response = await api.post(API_ROUTES.forum.acceptAnswer(postId, commentId)); return normalizePost(response.data.data); },
  async report(targetType: "post" | "comment", targetId: string, reason: string, description?: string) { await api.post(API_ROUTES.forum.reports, { targetType, targetId, reason, description }); },
  async communities(): Promise<CommunityView[]> { const response = await api.get(API_ROUTES.communities.list, { params: { page: 1, pageSize: 100 } }); return response.data.data.map(normalizeCommunity); },
  async community(idOrSlug: string): Promise<CommunityView> { const response = await api.get(API_ROUTES.communities.detail(idOrSlug)); return normalizeCommunity(response.data.data); },
  async joinCommunity(id: string) { await api.post(API_ROUTES.communities.join(id)); },
  async leaveCommunity(id: string) { await api.delete(API_ROUTES.communities.leave(id)); },
};
