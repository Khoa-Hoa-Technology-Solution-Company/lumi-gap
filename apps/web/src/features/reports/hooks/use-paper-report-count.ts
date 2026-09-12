import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

/** Fetch how many completed AI reports cite the given paper. Public — no auth. */
export function usePaperReportCount(paperId?: string) {
  return useQuery({
    queryKey: ["reports", "paper-count", paperId],
    queryFn: async () => {
      const res = await api.get(API_ROUTES.reports.paperCount(paperId!));
      return (res.data.data as { count: number }).count;
    },
    enabled: !!paperId,
    staleTime: 2 * 60 * 1000,
  });
}
