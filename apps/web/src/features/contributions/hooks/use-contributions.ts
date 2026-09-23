import { useQuery } from "@tanstack/react-query";
import { contributionsApi } from "../api/contributions.api";

export function useUserContributions(userId?: string) {
  return useQuery({ queryKey: ["contributions", userId], queryFn: () => contributionsApi.forUser(userId!), enabled: Boolean(userId) });
}
