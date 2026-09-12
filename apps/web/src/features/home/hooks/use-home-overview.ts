import { useQuery } from "@tanstack/react-query";
import { homeApi } from "../api/home.api";

export function useHomeOverview() {
  return useQuery({
    queryKey: ["home", "overview"],
    queryFn: homeApi.overview,
    staleTime: 60_000,
    retry: 2,
  });
}
