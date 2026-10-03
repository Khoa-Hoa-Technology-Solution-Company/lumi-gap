import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forumApi, type CommunityListParams, type ForumPostFilters, type ForumPostInput, type ForumReferenceView } from "../api/forum.api";
import { useAuthStore } from "@/stores/auth-store";

// Private visibility and follow DTOs must never reuse another viewer's cache.
function useForumViewer() { return useAuthStore((state) => state.tokens?.accessToken ? state.user?.id ?? "authenticated" : "anonymous"); }
export function useForumPosts(params: ForumPostFilters, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "posts", params, viewer], queryFn: () => forumApi.posts(params), enabled }); }
export function useForumPost(id?: string) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "post", id, viewer], queryFn: () => forumApi.post(id!), enabled: Boolean(id) }); }
export function useForumComments(postId?: string) { const viewer = useForumViewer(); return useInfiniteQuery({ queryKey: ["forum", "comments", postId, viewer], queryFn: ({ pageParam }) => forumApi.commentsPage(postId!, pageParam), initialPageParam: 1, getNextPageParam: (page) => page.meta.page < page.meta.totalPages ? page.meta.page + 1 : undefined, enabled: Boolean(postId) }); }
export function useCommunities(options: { all?: boolean } = {}) { const viewer = useForumViewer(); return useQuery({ queryKey: ["communities", viewer, options.all ? "all" : "active"], queryFn: () => forumApi.communities(options) }); }
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
export function useCommunitySuggestions(q: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["communities", "suggestions", viewer, q], queryFn: () => forumApi.communitySuggestions(q), enabled: enabled && q.length >= 2, staleTime: 5 * 60_000 }); }
export function useCommunityRecommendations(enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["communities", "recommendations", viewer], queryFn: forumApi.communityRecommendations, enabled, staleTime: 5 * 60_000 }); }
export function useCommunity(slug?: string) { const viewer = useForumViewer(); return useQuery({ queryKey: ["community", slug, viewer], queryFn: () => forumApi.community(slug!), enabled: Boolean(slug) }); }
export function useCreateForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.createPost, onSuccess: () => client.invalidateQueries({ queryKey: ["forum", "posts"] }) }); }
export function useUpdateForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, input }: { postId: string; input: Partial<ForumPostInput> }) => forumApi.updatePost(postId, input), onSuccess: (_, input) => { client.invalidateQueries({ queryKey: ["forum", "post", input.postId] }); client.invalidateQueries({ queryKey: ["forum", "posts"] }); } }); }
export function useDeleteForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.deletePost, onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useAddForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, content, parentCommentId, references }: { postId: string; content: string; parentCommentId?: string; references?: ForumReferenceView[] }) => forumApi.addComment(postId, { content, parentCommentId, references }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["forum"] }); } }); }
export function useUpdateForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId: _postId, commentId, content }: { postId: string; commentId: string; content: string }) => forumApi.updateComment(commentId, { content }), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useDeleteForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId: _postId, commentId }: { postId: string; commentId: string }) => forumApi.deleteComment(commentId), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useForumVote() { const client = useQueryClient(); return useMutation({ mutationFn: ({ kind, id, value }: { kind: "post" | "comment"; id: string; value: -1 | 0 | 1 }) => kind === "post" ? forumApi.votePost(id, value) : forumApi.voteComment(id, value), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useAcceptAnswer() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) => forumApi.accept(postId, commentId), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useUnacceptAnswer() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.unaccept, onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useFollowThread() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, following }: { postId: string; following: boolean }) => forumApi.follow(postId, following), onSuccess: (_, input) => { client.invalidateQueries({ queryKey: ["forum", "post", input.postId] }); client.invalidateQueries({ queryKey: ["forum", "posts"] }); } }); }
export function useForumContext(query?: string, enabled = true) { return useQuery({ queryKey: ["forum", "context", query], queryFn: () => forumApi.context(query), enabled }); }
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
export function useCommunityMembers(id?: string, enabled = true) { return useQuery({ queryKey: ["community", id, "members"], queryFn: () => forumApi.communityMembers(id!), enabled: Boolean(id) && enabled }); }
export function useUpdateCommunityMember() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, userId, input }: { id: string; userId: string; input: Parameters<typeof forumApi.updateCommunityMember>[2] }) => forumApi.updateCommunityMember(id, userId, input), onSuccess: (_, variables) => { client.invalidateQueries({ queryKey: ["community", variables.id, "members"] }); invalidateCommunityQueries(client); } }); }
export function useForumReports(communityId?: string, status: "open" | "reviewed" | "resolved" | "dismissed" | "all" = "open", enabled = true) { return useQuery({ queryKey: ["forum", "reports", communityId, status], queryFn: () => forumApi.reports({ communityId, status }), enabled }); }
export function useForumModerationActions(communityId?: string, enabled = true) { return useQuery({ queryKey: ["forum", "moderation-actions", communityId], queryFn: () => forumApi.moderationActions(communityId), enabled }); }
export function useReviewForumReport() { const client = useQueryClient(); return useMutation({ mutationFn: ({ reportId, input }: { reportId: string; input: Parameters<typeof forumApi.reviewReport>[1] }) => forumApi.reviewReport(reportId, input), onSuccess: () => { client.invalidateQueries({ queryKey: ["forum", "reports"] }); client.invalidateQueries({ queryKey: ["forum", "moderation-actions"] }); } }); }
export function useModerateForumContent() { const client = useQueryClient(); return useMutation({ mutationFn: async ({ targetType, targetId, action, reason }: { targetType: "post" | "comment"; targetId: string; action: Parameters<typeof forumApi.moderatePost>[1] | Parameters<typeof forumApi.moderateComment>[1]; reason?: string }) => { if (targetType === "post") await forumApi.moderatePost(targetId, action as Parameters<typeof forumApi.moderatePost>[1], reason); else await forumApi.moderateComment(targetId, action as Parameters<typeof forumApi.moderateComment>[1], reason); }, onSuccess: () => { client.invalidateQueries({ queryKey: ["forum"] }); } }); }
