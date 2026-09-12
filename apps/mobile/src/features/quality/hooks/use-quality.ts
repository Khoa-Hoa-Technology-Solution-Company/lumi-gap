import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EvaluateRequest, QualityTargetKind, RateRequest } from "@trend/shared-types";

import { qualityApi } from "../api/quality.api";

export function useQualityView(targetKind: QualityTargetKind, targetId?: string) {
  return useQuery({
    queryKey: ["quality", targetKind, targetId],
    queryFn: () => qualityApi.view(targetKind, targetId!),
    enabled: !!targetId,
  });
}

export function useEvaluateQuality() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EvaluateRequest) => qualityApi.evaluate(input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["quality", input.targetKind, input.targetId] });
    },
  });
}

export function useRateQuality() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RateRequest) => qualityApi.rate(input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["quality", input.targetKind, input.targetId] });
    },
  });
}

export function useDeleteQualityRating(targetKind: QualityTargetKind, targetId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ratingId: string) => qualityApi.deleteRate(ratingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quality", targetKind, targetId] });
    },
  });
}
