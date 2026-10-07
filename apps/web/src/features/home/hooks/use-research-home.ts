import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { homeApi } from "../api/home.api";

export function useResearchHome() {
  const userId = useAuthStore((state) => state.user?.id);
  const authenticated = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  return useQuery({
    queryKey: ["home", "research", userId],
    queryFn: ({ signal }) => homeApi.research(signal),
    enabled: authenticated && Boolean(userId),
    staleTime: 30_000,
    retry: 1,
  });
}
