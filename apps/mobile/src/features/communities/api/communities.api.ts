import type { Community, CommunityMembershipStatus, CommunitySort } from "@trend/shared-types";

import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export type CommunityListParams = { q?: string; sort?: CommunitySort; scope?: "all" | "mine"; page?: number; pageSize?: number };
export type CommunityPage = { items: Community[]; page: number; totalPages: number; total: number };
export type CommunityPostView = {
  id: string;
  title: string;
  content: string;
  type: string;
  commentCount: number;
  authorName?: string;
  createdAt: string;
};

const asRecord = (value: unknown): Record<string, any> => (value && typeof value === "object" ? (value as Record<string, any>) : {});

function normalizePost(value: unknown): CommunityPostView {
  const row = asRecord(value);
  const author = asRecord(row.author ?? row.authorId);
  return {
    id: String(row.id ?? row._id ?? ""),
    title: String(row.title ?? ""),
    content: String(row.content ?? row.body ?? ""),
    type: String(row.type ?? "DISCUSSION"),
    commentCount: Number(row.commentCount ?? 0),
    authorName: typeof author.fullName === "string" ? author.fullName : undefined,
    createdAt: String(row.createdAt ?? ""),
  };
}

export const communitiesApi = {
  async list(params: CommunityListParams = {}): Promise<CommunityPage> {
    const response = await api.get(API_ROUTES.communities.list, { params: { page: 1, pageSize: 12, ...params } });
    const meta = response.data.meta ?? {};
    return {
      items: response.data.data as Community[],
      page: Number(meta.page ?? params.page ?? 1),
      totalPages: Number(meta.totalPages ?? 1),
      total: Number(meta.total ?? 0),
    };
  },
  async detail(idOrSlug: string): Promise<Community> {
    const response = await api.get(API_ROUTES.communities.detail(idOrSlug));
    return response.data.data;
  },
  async join(id: string): Promise<{ role: string; status: CommunityMembershipStatus }> {
    const response = await api.post(API_ROUTES.communities.join(id));
    return response.data.data;
  },
  async leave(id: string): Promise<void> {
    await api.delete(API_ROUTES.communities.leave(id));
  },
  async posts(communityId: string): Promise<CommunityPostView[]> {
    const response = await api.get(API_ROUTES.forum.posts, { params: { communityId, page: 1, pageSize: 20, sort: "latest" } });
    return (response.data.data as unknown[]).map(normalizePost);
  },
};
