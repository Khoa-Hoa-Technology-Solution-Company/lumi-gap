import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchApi, type SearchParams } from "../api/search.api";

/** Semantic search hook. Only fires when there is a query (the backend
 *  requires a non-empty `q`). */
export function useSearch(params: SearchParams, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["search", params],
    queryFn: async () => {
      const res = await searchApi.semantic(params);
      // Invalidate analytics summary count so it updates immediately
      queryClient.invalidateQueries({ queryKey: ["analytics", "summary"] });
      if (params.rerank) {
        queryClient.invalidateQueries({ queryKey: ["credits"] });
      }
      return res;
    },
    enabled: params.q.trim().length > 0 && (options?.enabled ?? true),
  });
}
