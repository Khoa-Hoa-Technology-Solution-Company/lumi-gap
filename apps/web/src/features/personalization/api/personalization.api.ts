import type { CommunityRelatedPaper, ForYouPapersBasis, ForYouPostsBasis, ForYouReasonKind, InterestSource, InterestsResponse, VocabularyTerm } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";
import { normalizeForumCommunity, normalizeForumPost, type CommunityView, type ForumPostView } from "@/features/forum/api/forum.api";

export type ForYouPostView = {
  post: ForumPostView;
  reasonKind: ForYouReasonKind;
  reasonTopic: { key: string; label: string };
  reasonSource?: InterestSource;
  reasonCommunity?: { id: string; name: string };
  reasonStats?: { readers: number; replies: number };
};

export type ForYouCommunityView = CommunityView & { matchedTopics: Array<{ key: string; label: string }>; matchReason: "topic" | "semantic" };

export type ForYouView = {
  postsBasis: ForYouPostsBasis;
  papersBasis: ForYouPapersBasis;
  posts: ForYouPostView[];
  papers: CommunityRelatedPaper[];
};

function toForYou(raw: Record<string, unknown>): ForYouView {
  const posts = Array.isArray(raw.posts) ? raw.posts as Array<Record<string, unknown>> : [];
  return {
    postsBasis: raw.postsBasis as ForYouPostsBasis,
    papersBasis: raw.papersBasis as ForYouPapersBasis,
    papers: (raw.papers as CommunityRelatedPaper[] | undefined) ?? [],
    posts: posts.map((row) => ({
      post: normalizeForumPost(row),
      reasonKind: row.reasonKind as ForYouReasonKind,
      reasonTopic: row.reasonTopic as { key: string; label: string },
      reasonSource: row.reasonSource as InterestSource | undefined,
      reasonCommunity: row.reasonCommunity as { id: string; name: string } | undefined,
      reasonStats: row.reasonStats as { readers: number; replies: number } | undefined,
    })),
  };
}

export const personalizationApi = {
  async forYou(limit: number, signal?: AbortSignal): Promise<ForYouView> {
    const response = await api.get(API_ROUTES.personalization.forYou, { params: { limit }, signal });
    return toForYou(response.data.data);
  },
  async communities(signal?: AbortSignal): Promise<ForYouCommunityView[]> {
    const response = await api.get(API_ROUTES.personalization.communities, { signal });
    return (response.data.data as Array<Record<string, unknown>>).map((row) => ({
      ...normalizeForumCommunity(row),
      matchedTopics: (row.matchedTopics as Array<{ key: string; label: string }> | undefined) ?? [],
      matchReason: row.matchReason === "semantic" ? "semantic" as const : "topic" as const,
    }));
  },
  async interests(signal?: AbortSignal): Promise<InterestsResponse> {
    const response = await api.get(API_ROUTES.personalization.interests, { signal });
    return response.data.data;
  },
  async vocabulary(q: string, signal?: AbortSignal): Promise<VocabularyTerm[]> {
    const response = await api.get(API_ROUTES.personalization.vocabulary, { params: { q }, signal });
    return response.data.data;
  },
  async follow(topic: string): Promise<void> { await api.post(API_ROUTES.personalization.follow, { topic }); },
  async unfollow(key: string): Promise<void> { await api.delete(API_ROUTES.personalization.unfollow(key)); },
  async mute(topic: string): Promise<void> { await api.post(API_ROUTES.personalization.mute, { topic }); },
  async unmute(key: string): Promise<void> { await api.delete(API_ROUTES.personalization.unmute(key)); },
};
