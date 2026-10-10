import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gapsApi } from "../api/gaps.api";
import type { AnalyzeGapRequest, CreateGapCandidateRequest, CreateGapValidationRequest, PreviewGapEvidenceRequest, ReviewForumCitationAsEvidenceRequest } from "@trend/shared-types";

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

/** Latest queued/analyzing run for one project, or the user's personal runs when projectId is omitted. */
export function useActiveGapAnalysis(projectId?: string) {
  return useQuery({
    queryKey: ["activeGapAnalysis", projectId ?? null],
    queryFn: () => gapsApi.getActiveAnalysis(projectId),
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

export function useRequestGapValidation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (gapId: string) => gapsApi.requestValidation(gapId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gaps"] }),
  });
}

export function useGapValidations(gapId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["gaps", gapId, "validations"],
    queryFn: () => gapsApi.validations(gapId!),
    enabled: Boolean(gapId) && enabled,
  });
}

export function useGapEvidenceRecords(gapId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["gaps", gapId, "evidence-records"],
    queryFn: () => gapsApi.evidence(gapId!),
    enabled: Boolean(gapId) && enabled,
  });
}

export function useAddGapValidation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gapId, payload }: { gapId: string; payload: CreateGapValidationRequest }) => gapsApi.addValidation(gapId, payload),
    onSuccess: (_, { gapId }) => {
      queryClient.invalidateQueries({ queryKey: ["gaps", gapId, "validations"] });
      queryClient.invalidateQueries({ queryKey: ["gapValidationQueue"] });
    },
  });
}

export function useGapValidationQueue(page: number, enabled = true) {
  return useQuery({
    queryKey: ["gapValidationQueue", page],
    queryFn: () => gapsApi.validationQueue({ page, pageSize: 10 }),
    enabled,
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
