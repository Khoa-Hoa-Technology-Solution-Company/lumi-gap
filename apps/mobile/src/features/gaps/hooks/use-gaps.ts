import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gapsApi } from "../api/gaps.api";
import type { AnalyzeGapRequest } from "@trend/shared-types";

export function useGaps(params?: Parameters<typeof gapsApi.list>[0]) {
  return useQuery({
    queryKey: ["gaps", params],
    queryFn: () => gapsApi.list(params),
  });
}

export function useGapAnalysisStatus(analysisId: string | null) {
  return useQuery({
    queryKey: ["gapAnalysis", analysisId],
    queryFn: () => gapsApi.getAnalysisStatus(analysisId!),
    enabled: !!analysisId,
    refetchInterval: (query) => {
      const status = query.state?.data?.status;
      if (status === "queued" || status === "analyzing") return 3000;
      return false;
    },
  });
}

export function useAnalyzeGap() {
  return useMutation({
    mutationFn: (payload: AnalyzeGapRequest) => gapsApi.analyze(payload),
  });
}

export function usePatchGapStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "resolved" | "dismissed" }) =>
      gapsApi.patchStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gaps"] });
    },
  });
}
