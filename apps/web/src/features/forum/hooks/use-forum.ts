import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forumApi, type CommunityListParams, type ForumPostFilters, type ForumPostInput, type ForumPostView, type ForumReferenceView, type ForumReactionName, type ForumReactionTarget } from "../api/forum.api";
import { useAuthStore } from "@/stores/auth-store";
import { invalidateForumThreadQueries } from "../utils/forum-query-cache";
import type { ForumNotificationLevel, ForumReportStatus } from "@trend/shared-types";
import { useRef } from "react";
import { forumPaperApi } from "../api/forum-paper.api";
import { applyForumReactionCache, captureForumReactionCache, optimisticForumReaction, restoreForumReactionCache, type ForumReactionChange } from "../utils/forum-reaction-cache";

// Private visibility and follow DTOs must never reuse another viewer's cache.
function useForumViewer() { return useAuthStore((state) => state.tokens?.accessToken ? state.user?.id ?? "authenticated" : "anonymous"); }
export function useForumPaperSearch(query: string, enabled = true) {
  const viewer = useForumViewer();
  return useQuery({ queryKey: ["forum", "paper-search", "openalex", query, viewer], queryFn: ({ signal }) => forumPaperApi.search(query, signal), enabled: enabled && query.length >= 3 && viewer !== "anonymous", staleTime: 60_000, retry: false });
}
export function useForumPosts(params: ForumPostFilters, enabled = true) {
  const viewer = useForumViewer();
  return useQuery({
    queryKey: ["forum", "posts", params, viewer],
    queryFn: ({ signal }) => forumApi.posts(params, signal),
    // Keep rows steady during filtering, without carrying private rows across accounts.
    placeholderData: (previous, query) => query?.queryKey.at(-1) === viewer ? previous : undefined,
    enabled,
  });
}
export function useForumPost(id?: string) {
  const viewer = useForumViewer();
  const client = useQueryClient();
  return useQuery({ queryKey: ["forum", "post", id, viewer], queryFn: async ({ signal }) => {
    const post = await forumApi.post(id!, signal);
    // Prime the other locator before canonical navigation, keeping replies/drafts stable.
    for (const alias of [post.id, post.publicSlug]) if (alias && alias !== id) client.setQueryData(["forum", "post", alias, viewer], post);
    return post;
  }, enabled: Boolean(id) });
}
export function useForumPostRevisions(postId?: string, enabled = true) {
  const viewer = useForumViewer();
  return useQuery({ queryKey: ["forum", "post-revisions", postId, viewer], queryFn: () => forumApi.postRevisions(postId!), enabled: Boolean(postId) && enabled });
}
export function useForumCommentRevisions(commentId?: string, enabled = true) {
  const viewer = useForumViewer();
  return useQuery({ queryKey: ["forum", "comment-revisions", commentId, viewer], queryFn: () => forumApi.commentRevisions(commentId!), enabled: Boolean(commentId) && enabled });
}
export function useForumComments(postId?: string) { const viewer = useForumViewer(); return useInfiniteQuery({ queryKey: ["forum", "comments", postId, viewer], queryFn: ({ pageParam, signal }) => forumApi.commentsPage(postId!, pageParam, signal), initialPageParam: 1, getNextPageParam: (page) => page.meta.page < page.meta.totalPages ? page.meta.page + 1 : undefined, enabled: Boolean(postId) }); }
export function useForumRecentViews(postId: string) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "recent-views", postId, viewer], queryFn: () => forumApi.recentViews(postId), staleTime: 60_000 }); }
export function useForumReactionPeople(target: ForumReactionTarget, reaction?: ForumReactionName) { const viewer = useForumViewer(); return useInfiniteQuery({ queryKey: ["forum", "reaction-people", target.scope, target.id, reaction, viewer], queryFn: ({ pageParam }) => forumApi.reactionPeople(target, reaction, pageParam), initialPageParam: 1, getNextPageParam: (page) => page.meta.page < page.meta.totalPages ? page.meta.page + 1 : undefined, staleTime: 60_000 }); }
export function useForumDiscovery(postId?: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "discovery", postId, viewer], queryFn: () => forumApi.discovery(postId!), enabled: Boolean(postId) && enabled, staleTime: 60_000 }); }
export function useCommunities(options: { all?: boolean } = {}) { const viewer = useForumViewer(); return useQuery({ queryKey: ["communities", viewer, options.all ? "all" : "active"], queryFn: () => forumApi.communities(options), staleTime: 5 * 60_000 }); }
export function useCommunityList(params: Omit<CommunityListParams, "page">, enabled = true) {
  const viewer = useForumViewer();
  return useInfiniteQuery({
    queryKey: ["communities", "list", params, viewer],
    queryFn: ({ pageParam }) => forumApi.communityPage({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled,
  });
}
export function useCommunityFacets() { const viewer = useForumViewer(); return useQuery({ queryKey: ["communities", "facets", viewer], queryFn: forumApi.communityFacets, staleTime: 5 * 60_000 }); }
export function useCommunitySuggestions(q: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["communities", "suggestions", viewer, q], queryFn: () => forumApi.communitySuggestions(q), enabled: enabled && q.length >= 2, staleTime: 5 * 60_000, retry: false }); }
export function useCommunityRecommendations(enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["communities", "recommendations", viewer], queryFn: forumApi.communityRecommendations, enabled, staleTime: 5 * 60_000 }); }
export function useCommunity(slug?: string) { const viewer = useForumViewer(); return useQuery({ queryKey: ["community", slug, viewer], queryFn: () => forumApi.community(slug!), enabled: Boolean(slug) }); }
export function useCreateForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.createPost, onSuccess: () => invalidateForumThreadQueries(client) }); }
export function useUpdateForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, input }: { postId: string; input: Partial<ForumPostInput> }) => forumApi.updatePost(postId, input), onSuccess: () => invalidateForumThreadQueries(client) }); }
export function useDeleteForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.deletePost, onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useAddForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, content, parentCommentId, references }: { postId: string; content: string; parentCommentId?: string; references?: ForumReferenceView[] }) => forumApi.addComment(postId, { content, parentCommentId, references }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["forum"] }); } }); }
export function useUpdateForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId: _postId, commentId, content, references }: { postId: string; commentId: string; content: string; references?: ForumReferenceView[] }) => forumApi.updateComment(commentId, { content, references }), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useDeleteForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId: _postId, commentId }: { postId: string; commentId: string }) => forumApi.deleteComment(commentId), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useForumVote() { const client = useQueryClient(); return useMutation({ mutationFn: ({ kind, id, value }: { kind: "post" | "comment"; id: string; value: -1 | 0 | 1 }) => kind === "post" ? forumApi.votePost(id, value) : forumApi.voteComment(id, value), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useForumReaction() {
  const client = useQueryClient();
  const viewer = useForumViewer();
  const currentUser = useAuthStore((state) => state.user);
  const latestViewer = useRef(viewer);
  latestViewer.current = viewer;
  return useMutation({
    mutationFn: ({ kind, id, reaction, active }: ForumReactionChange) => forumApi.react(kind, id, reaction, active),
    onMutate: async (change) => {
      const pending = captureForumReactionCache(client, viewer, change);
      await Promise.all(pending.entries.map(({ key }) => client.cancelQueries({ queryKey: key, exact: true })));
      const snapshot = captureForumReactionCache(client, viewer, change);
      if (snapshot.subject && latestViewer.current === viewer) applyForumReactionCache(client, viewer, change, optimisticForumReaction(snapshot.subject, change, currentUser ? { id: currentUser.id, fullName: currentUser.fullName } : undefined));
      return { ...snapshot, viewer };
    },
    onError: (_error, _change, context) => { if (context) restoreForumReactionCache(client, context.entries); },
    onSuccess: (summary, change, context) => {
      if (!context) return;
      if (context.viewer !== latestViewer.current) { restoreForumReactionCache(client, context.entries); return; }
      applyForumReactionCache(client, context.viewer, change, summary);
    },
    onSettled: (_data, _error, change, context) => {
      if (!context) return;
      if (_error || context.viewer !== latestViewer.current) for (const { kind, key } of context.entries) {
        if (kind !== "posts") void client.invalidateQueries({ queryKey: key, exact: true, refetchType: context.viewer === latestViewer.current ? "active" : "none" });
      }
      // Lists refresh on the next visit so popularity ordering remains correct.
      void client.invalidateQueries({ queryKey: ["forum", "posts"], predicate: (query) => query.queryKey.at(-1) === context.viewer, refetchType: "none" });
      void client.invalidateQueries({ queryKey: ["forum", "reaction-people"], predicate: (query) => query.queryKey.at(-1) === context.viewer && (query.queryKey[3] === change.id || (query.queryKey[2] === "topic" && query.queryKey[3] === context.postId)) });
    },
  });
}
export function useAcceptAnswer() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) => forumApi.accept(postId, commentId), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useUnacceptAnswer() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.unaccept, onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useFollowThread() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, following }: { postId: string; following: boolean }) => forumApi.follow(postId, following), onSuccess: () => invalidateForumThreadQueries(client) }); }
type ForumNotificationCacheSnapshot = Array<[readonly unknown[], unknown]>;

function updateForumNotificationCache(client: ReturnType<typeof useQueryClient>, viewer: string, postId: string, level: ForumNotificationLevel) {
  const snapshots = client.getQueriesData<unknown>({ queryKey: ["forum"] }).filter(([key]) => key.at(-1) === viewer && (key[1] === "post" || key[1] === "posts")) as ForumNotificationCacheSnapshot;
  for (const [key, value] of snapshots) {
    if (key[1] === "post") {
      const post = value as ForumPostView | undefined;
      if (post?.id === postId) client.setQueryData(key, { ...post, notificationLevel: level, isFollowing: level === "WATCHING" || level === "TRACKING" });
    } else if (key[1] === "posts" && value && typeof value === "object" && "data" in value && Array.isArray((value as { data?: unknown }).data)) {
      const page = value as { data: ForumPostView[] };
      if (page.data.some((post) => post.id === postId)) client.setQueryData(key, { ...page, data: page.data.map((post) => post.id === postId ? { ...post, notificationLevel: level, isFollowing: level === "WATCHING" || level === "TRACKING" } : post) });
    }
  }
  return snapshots;
}

function restoreForumNotificationCache(client: ReturnType<typeof useQueryClient>, snapshots?: ForumNotificationCacheSnapshot) {
  for (const [key, value] of snapshots ?? []) client.setQueryData(key, value);
}

export function useForumNotificationLevel() {
  const client = useQueryClient();
  const viewer = useForumViewer();
  return useMutation({
    mutationFn: ({ postId, level }: { postId: string; level: ForumNotificationLevel }) => forumApi.notificationLevel(postId, level),
    onMutate: ({ postId, level }) => updateForumNotificationCache(client, viewer, postId, level),
    onError: (_error, _variables, snapshots) => restoreForumNotificationCache(client, snapshots),
    onSuccess: () => invalidateForumThreadQueries(client),
  });
}
export function useForumContext(query?: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "context", query, viewer], queryFn: () => forumApi.context(query), enabled: enabled && viewer !== "anonymous" }); }
export function useShareForumGap() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.shareGap, onSuccess: () => client.invalidateQueries({ queryKey: ["forum", "context"] }) }); }
function invalidateCommunityQueries(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ["communities"] });
  client.invalidateQueries({ queryKey: ["community"] });
  client.invalidateQueries({ queryKey: ["forum"] });
}
export function useCreateCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.createCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useUpdateCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, input }: { id: string; input: Parameters<typeof forumApi.updateCommunity>[1] }) => forumApi.updateCommunity(id, input), onSuccess: () => invalidateCommunityQueries(client) }); }
export function useReviewCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, input }: { id: string; input: Parameters<typeof forumApi.reviewCommunity>[1] }) => forumApi.reviewCommunity(id, input), onSuccess: () => invalidateCommunityQueries(client) }); }
export function useCommunitySummary(id?: string, enabled = true) { return useQuery({ queryKey: ["community", id, "summary"], queryFn: () => forumApi.communitySummary(id!), enabled: Boolean(id) && enabled, refetchInterval: (query) => query.state.data?.status === "pending" ? 3000 : false }); }
export function useRequestCommunitySummary() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.requestCommunitySummary, onSuccess: (data, id) => client.setQueryData(["community", id, "summary"], data) }); }
export function useSetCommunityStatus() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "ARCHIVED" }) => forumApi.setCommunityStatus(id, status), onSuccess: () => invalidateCommunityQueries(client) }); }
export function useResubmitCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.resubmitCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useTransferCommunityOwnership() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, userId }: { id: string; userId: string }) => forumApi.transferCommunityOwnership(id, userId), onSuccess: () => invalidateCommunityQueries(client) }); }
export function useCommunityPublicMembers(id?: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["community", id, "public-members", viewer], queryFn: () => forumApi.publicCommunityMembers(id!), enabled: Boolean(id) && enabled }); }
export function useCommunityRelatedPapers(id?: string, enabled = true) { return useQuery({ queryKey: ["community", id, "related-papers"], queryFn: () => forumApi.relatedPapers(id!), enabled: Boolean(id) && enabled, staleTime: 10 * 60_000 }); }
export function useCommunityRelatedGaps(id?: string, enabled = true) { return useQuery({ queryKey: ["community", id, "related-gaps"], queryFn: () => forumApi.relatedGaps(id!), enabled: Boolean(id) && enabled, staleTime: 10 * 60_000 }); }
export function useJoinCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.joinCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useLeaveCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.leaveCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useCommunityMembers(id?: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["community", id, "members", viewer], queryFn: () => forumApi.communityMembers(id!), enabled: Boolean(id) && enabled && viewer !== "anonymous" }); }
export function useUpdateCommunityMember() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, userId, input }: { id: string; userId: string; input: Parameters<typeof forumApi.updateCommunityMember>[2] }) => forumApi.updateCommunityMember(id, userId, input), onSuccess: (_, variables) => { client.invalidateQueries({ queryKey: ["community", variables.id, "members"] }); invalidateCommunityQueries(client); } }); }
export function useForumReports(communityId?: string, status: ForumReportStatus | "all" = "open", enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "reports", communityId, status, viewer], queryFn: () => forumApi.reports({ communityId, status }), enabled: enabled && viewer !== "anonymous" }); }
export function useForumModerationActions(communityId?: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "moderation-actions", communityId, viewer], queryFn: () => forumApi.moderationActions(communityId), enabled: enabled && viewer !== "anonymous" }); }
export function useReviewForumReport() { const client = useQueryClient(); return useMutation({ mutationFn: ({ reportId, input }: { reportId: string; input: Parameters<typeof forumApi.reviewReport>[1] }) => forumApi.reviewReport(reportId, input), onSuccess: () => { client.invalidateQueries({ queryKey: ["forum", "reports"] }); client.invalidateQueries({ queryKey: ["forum", "moderation-actions"] }); } }); }
export function useModerateForumContent() { const client = useQueryClient(); return useMutation({ mutationFn: async ({ targetType, targetId, action, reason }: { targetType: "post" | "comment"; targetId: string; action: Parameters<typeof forumApi.moderatePost>[1] | Parameters<typeof forumApi.moderateComment>[1]; reason?: string }) => { if (targetType === "post") await forumApi.moderatePost(targetId, action as Parameters<typeof forumApi.moderatePost>[1], reason); else await forumApi.moderateComment(targetId, action as Parameters<typeof forumApi.moderateComment>[1], reason); }, onSuccess: () => { client.invalidateQueries({ queryKey: ["forum"] }); } }); }
