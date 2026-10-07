import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { forumCategoryApi } from "../api/forum-category.api";

export function useForumCategories(all = false) {
  const viewer = useAuthStore((state) => state.tokens?.accessToken ? state.user?.id ?? "authenticated" : "anonymous");
  return useQuery({ queryKey: ["forum", "categories", all, viewer], queryFn: () => forumCategoryApi.list(all), staleTime: 5 * 60_000 });
}
export function useForumTags(enabled = true) {
  return useQuery({ queryKey: ["forum", "tags"], queryFn: forumCategoryApi.tags, staleTime: 5 * 60_000, enabled });
}
