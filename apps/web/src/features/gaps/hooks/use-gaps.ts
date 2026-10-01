import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gapsApi } from "../api/gaps.api";
import type { AnalyzeGapRequest, CreateGapCandidateRequest, PreviewGapEvidenceRequest, ReviewForumCitationAsEvidenceRequest } from "@trend/shared-types";

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

export function useActiveGapAnalysis() {
  return useQuery({
    queryKey: ["activeGapAnalysis"],
    queryFn: () => gapsApi.getActiveAnalysis(),
  });
}

export function useAnalyzeGap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AnalyzeGapRequest) => gapsApi.analyze(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gaps"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

export function useRetryGapAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (analysisId: string) => gapsApi.retryAnalysis(analysisId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activeGapAnalysis"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

export function useGapEvidencePreview() {
  return useMutation({
    mutationFn: (payload: PreviewGapEvidenceRequest) => gapsApi.previewEvidence(payload),
  });
}

export function usePatchGapStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "resolved" | "dismissed" }) =>
      gapsApi.patchStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gaps"] });
    },
  });
}

export function useCreateGapCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateGapCandidateRequest) => gapsApi.createCandidate(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gaps"] }),
  });
}

export function useGapCommunityDiscussions(gapId?: string) {
  return useQuery({
    queryKey: ["gaps", gapId, "community-discussions"],
    queryFn: () => gapsApi.communityDiscussions(gapId!),
    enabled: Boolean(gapId),
  });
}

export function useReviewForumCitationAsEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gapId, referenceId, payload }: { gapId: string; referenceId: string; payload: ReviewForumCitationAsEvidenceRequest }) =>
      gapsApi.reviewForumCitation(gapId, referenceId, payload),
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["gaps", input.gapId, "community-discussions"] });
      queryClient.invalidateQueries({ queryKey: ["gaps"] });
    },
  });
}

export function useForumCitationEvidenceOptions(gapId?: string, referenceId?: string, projectId?: string) {
  return useQuery({
    queryKey: ["gaps", gapId, "forum-citation-evidence-options", referenceId, projectId],
    queryFn: () => gapsApi.forumCitationEvidenceOptions(gapId!, referenceId!, projectId),
    enabled: Boolean(gapId && referenceId),
  });
}
