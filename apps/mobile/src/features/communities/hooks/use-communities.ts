import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { communitiesApi, type CommunityListParams } from "../api/communities.api";

export function useCommunityList(params: Omit<CommunityListParams, "page">) {
  return useInfiniteQuery({
    queryKey: ["communities", "list", params],
    queryFn: ({ pageParam }) => communitiesApi.list({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}

export function useCommunity(idOrSlug?: string) {
  return useQuery({
    queryKey: ["communities", "detail", idOrSlug],
    queryFn: () => communitiesApi.detail(idOrSlug!),
    enabled: !!idOrSlug,
  });
}

export function useCommunityPosts(communityId?: string, enabled = true) {
  return useQuery({
    queryKey: ["communities", "posts", communityId],
    queryFn: () => communitiesApi.posts(communityId!),
    enabled: !!communityId && enabled,
  });
}

function useInvalidateCommunities() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["communities"] });
}

export function useJoinCommunity() {
  const invalidate = useInvalidateCommunities();
  return useMutation({ mutationFn: communitiesApi.join, onSuccess: invalidate });
}

export function useLeaveCommunity() {
  const invalidate = useInvalidateCommunities();
  return useMutation({ mutationFn: communitiesApi.leave, onSuccess: invalidate });
}
