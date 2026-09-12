import { useQuery } from "@tanstack/react-query";
import { rankingsApi } from "../api/rankings.api";

export function useRankings(params: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ["rankings", params],
    queryFn: () => rankingsApi.top(params),
  });
}

export function useMyRanking(enabled = true) {
  return useQuery({
    queryKey: ["rankings", "me"],
    queryFn: () => rankingsApi.me(),
    enabled,
  });
}
