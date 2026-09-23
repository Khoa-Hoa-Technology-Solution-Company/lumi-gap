import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forumApi } from "../api/forum.api";

export function useForumPosts(params: Record<string, string | number | undefined>, enabled = true) { return useQuery({ queryKey: ["forum", "posts", params], queryFn: () => forumApi.posts(params), enabled }); }
export function useForumPost(id?: string) { return useQuery({ queryKey: ["forum", "post", id], queryFn: () => forumApi.post(id!), enabled: Boolean(id) }); }
export function useForumComments(postId?: string) { return useQuery({ queryKey: ["forum", "comments", postId], queryFn: () => forumApi.comments(postId!), enabled: Boolean(postId) }); }
export function useCommunities() { return useQuery({ queryKey: ["communities"], queryFn: forumApi.communities }); }
export function useCommunity(slug?: string) { return useQuery({ queryKey: ["community", slug], queryFn: () => forumApi.community(slug!), enabled: Boolean(slug) }); }
export function useCreateForumPost() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.createPost, onSuccess: () => client.invalidateQueries({ queryKey: ["forum", "posts"] }) }); }
export function useAddForumComment() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, content }: { postId: string; content: string }) => forumApi.addComment(postId, content), onSuccess: (_, input) => { client.invalidateQueries({ queryKey: ["forum", "comments", input.postId] }); client.invalidateQueries({ queryKey: ["forum", "post", input.postId] }); } }); }
export function useForumVote() { const client = useQueryClient(); return useMutation({ mutationFn: ({ kind, id, value }: { kind: "post" | "comment"; id: string; value: -1 | 0 | 1 }) => kind === "post" ? forumApi.votePost(id, value) : forumApi.voteComment(id, value), onSuccess: () => client.invalidateQueries({ queryKey: ["forum"] }) }); }
export function useAcceptAnswer() { const client = useQueryClient(); return useMutation({ mutationFn: ({ postId, commentId }: { postId: string; commentId: string }) => forumApi.accept(postId, commentId), onSuccess: (_, input) => { client.invalidateQueries({ queryKey: ["forum", "post", input.postId] }); client.invalidateQueries({ queryKey: ["forum", "comments", input.postId] }); } }); }
function invalidateCommunityQueries(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ["communities"] });
  client.invalidateQueries({ queryKey: ["community"] });
}
export function useCreateCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.createCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useUpdateCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, input }: { id: string; input: Parameters<typeof forumApi.updateCommunity>[1] }) => forumApi.updateCommunity(id, input), onSuccess: () => invalidateCommunityQueries(client) }); }
export function useJoinCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.joinCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useLeaveCommunity() { const client = useQueryClient(); return useMutation({ mutationFn: forumApi.leaveCommunity, onSuccess: () => invalidateCommunityQueries(client) }); }
export function useCommunityMembers(id?: string, enabled = true) { return useQuery({ queryKey: ["community", id, "members"], queryFn: () => forumApi.communityMembers(id!), enabled: Boolean(id) && enabled }); }
export function useUpdateCommunityMember() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, userId, input }: { id: string; userId: string; input: Parameters<typeof forumApi.updateCommunityMember>[2] }) => forumApi.updateCommunityMember(id, userId, input), onSuccess: (_, variables) => { client.invalidateQueries({ queryKey: ["community", variables.id, "members"] }); invalidateCommunityQueries(client); } }); }
