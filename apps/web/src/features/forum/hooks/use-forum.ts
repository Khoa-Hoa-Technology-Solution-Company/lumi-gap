import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forumApi, type ForumPostFilters, type ForumPostInput, type ForumReferenceView } from "../api/forum.api";
import { useAuthStore } from "@/stores/auth-store";
import { invalidateForumThreadQueries } from "../utils/forum-query-cache";

// Private visibility and follow DTOs must never reuse another viewer's cache.
function useForumViewer() { return useAuthStore((state) => state.tokens?.accessToken ? state.user?.id ?? "authenticated" : "anonymous"); }
export function useForumPosts(params: ForumPostFilters, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "posts", params, viewer], queryFn: () => forumApi.posts(params), enabled }); }
export function useForumPost(id?: string) {
  const viewer = useForumViewer();
  const client = useQueryClient();
  return useQuery({ queryKey: ["forum", "post", id, viewer], queryFn: async () => {
    const post = await forumApi.post(id!);
    // Prime the other locator before canonical navigation, keeping replies/drafts stable.
    for (const alias of [post.id, post.publicSlug]) if (alias && alias !== id) client.setQueryData(["forum", "post", alias, viewer], post);
    return post;
  }, enabled: Boolean(id) });
}
export function useForumComments(postId?: string) { const viewer = useForumViewer(); return useInfiniteQuery({ queryKey: ["forum", "comments", postId, viewer], queryFn: ({ pageParam }) => forumApi.commentsPage(postId!, pageParam), initialPageParam: 1, getNextPageParam: (page) => page.meta.page < page.meta.totalPages ? page.meta.page + 1 : undefined, enabled: Boolean(postId) }); }
export function useCommunities() { const viewer = useForumViewer(); return useQuery({ queryKey: ["communities", viewer], queryFn: forumApi.communities }); }
export function useCommunity(slug?: string) { const viewer = useForumViewer(); return useQuery({ queryKey: ["community", slug, viewer], queryFn: () => forumApi.community(slug!), enabled: Boolean(slug) }); }
export function useCreateForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.createPost, onSuccess: () => client.invalidateQueries({ queryKey: ["forum", "posts"] }) }); }
export function useUpdateForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, input }: { postId: string; input: Partial<ForumPostInput> }) => forumApi.updatePost(postId, input), onSuccess: () => invalidateForumThreadQueries(client) }); }
export function useDeleteForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.deletePost, onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useAddForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, content, parentCommentId, references }: { postId: string; content: string; parentCommentId?: string; references?: ForumReferenceView[] }) => forumApi.addComment(postId, { content, parentCommentId, references }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["forum"] }); } }); }
export function useUpdateForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId: _postId, commentId, content }: { postId: string; commentId: string; content: string }) => forumApi.updateComment(commentId, { content }), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useDeleteForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId: _postId, commentId }: { postId: string; commentId: string }) => forumApi.deleteComment(commentId), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useForumVote() { const client = useQueryClient(); return useMutation({ mutationFn: ({ kind, id, value }: { kind: "post" | "comment"; id: string; value: -1 | 0 | 1 }) => kind === "post" ? forumApi.votePost(id, value) : forumApi.voteComment(id, value), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useAcceptAnswer() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) => forumApi.accept(postId, commentId), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useUnacceptAnswer() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.unaccept, onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useFollowThread() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, following }: { postId: string; following: boolean }) => forumApi.follow(postId, following), onSuccess: () => invalidateForumThreadQueries(client) }); }
export function useForumContext(query?: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "context", query, viewer], queryFn: () => forumApi.context(query), enabled: enabled && viewer !== "anonymous" }); }
export function useShareForumGap() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.shareGap, onSuccess: () => client.invalidateQueries({ queryKey: ["forum", "context"] }) }); }
function invalidateCommunityQueries(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ["communities"] });
  client.invalidateQueries({ queryKey: ["community"] });
  client.invalidateQueries({ queryKey: ["forum"] });
}
export function useCreateCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.createCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useUpdateCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, input }: { id: string; input: Parameters<typeof forumApi.updateCommunity>[1] }) => forumApi.updateCommunity(id, input), onSuccess: () => invalidateCommunityQueries(client) }); }
export function useJoinCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.joinCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useLeaveCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.leaveCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useCommunityMembers(id?: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["community", id, "members", viewer], queryFn: () => forumApi.communityMembers(id!), enabled: Boolean(id) && enabled && viewer !== "anonymous" }); }
export function useUpdateCommunityMember() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, userId, input }: { id: string; userId: string; input: Parameters<typeof forumApi.updateCommunityMember>[2] }) => forumApi.updateCommunityMember(id, userId, input), onSuccess: (_, variables) => { client.invalidateQueries({ queryKey: ["community", variables.id, "members"] }); invalidateCommunityQueries(client); } }); }
export function useForumReports(communityId?: string, status: "open" | "reviewed" | "resolved" | "dismissed" | "all" = "open", enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "reports", communityId, status, viewer], queryFn: () => forumApi.reports({ communityId, status }), enabled: enabled && viewer !== "anonymous" }); }
export function useForumModerationActions(communityId?: string, enabled = true) { const viewer = useForumViewer(); return useQuery({ queryKey: ["forum", "moderation-actions", communityId, viewer], queryFn: () => forumApi.moderationActions(communityId), enabled: enabled && viewer !== "anonymous" }); }
export function useReviewForumReport() { const client = useQueryClient(); return useMutation({ mutationFn: ({ reportId, input }: { reportId: string; input: Parameters<typeof forumApi.reviewReport>[1] }) => forumApi.reviewReport(reportId, input), onSuccess: () => { client.invalidateQueries({ queryKey: ["forum", "reports"] }); client.invalidateQueries({ queryKey: ["forum", "moderation-actions"] }); } }); }
export function useModerateForumContent() { const client = useQueryClient(); return useMutation({ mutationFn: async ({ targetType, targetId, action, reason }: { targetType: "post" | "comment"; targetId: string; action: Parameters<typeof forumApi.moderatePost>[1] | Parameters<typeof forumApi.moderateComment>[1]; reason?: string }) => { if (targetType === "post") await forumApi.moderatePost(targetId, action as Parameters<typeof forumApi.moderatePost>[1], reason); else await forumApi.moderateComment(targetId, action as Parameters<typeof forumApi.moderateComment>[1], reason); }, onSuccess: () => { client.invalidateQueries({ queryKey: ["forum"] }); } }); }
