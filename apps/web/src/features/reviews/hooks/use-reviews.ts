import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcademicReviewInput,
  CreateReviewRequestInput,
  CreateReviewTemplateInput,
  ReviewAvailabilitySettings,
  ReviewTemplateVersionInput,
  ResubmitReviewRequestInput,
} from "@trend/shared-types";
import { reviewsApi } from "../api/reviews.api";

export function useReviewAvailability() { return useQuery({ queryKey: ["review-availability"], queryFn: reviewsApi.availability, retry: false }); }
export function useUpdateReviewAvailability() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: Omit<ReviewAvailabilitySettings, "activeReviewCount">) => reviewsApi.updateAvailability(input), onSuccess: (data) => { client.setQueryData(["review-availability"], data); client.invalidateQueries({ queryKey: ["review-opportunities"] }); } });
}
export function useReviewOpportunities(filters: Record<string, string | undefined>) { return useQuery({ queryKey: ["review-opportunities", filters], queryFn: () => reviewsApi.opportunities(filters), retry: false }); }
export function useAcceptReviewOpportunity() {
  const client = useQueryClient();
  return useMutation({ mutationFn: reviewsApi.acceptOpportunity, onSuccess: () => { client.invalidateQueries({ queryKey: ["review-opportunities"] }); client.invalidateQueries({ queryKey: ["review-center"] }); client.invalidateQueries({ queryKey: ["review-availability"] }); } });
}
export function useDeclareReviewConflict() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ submissionId, reason }: { submissionId: string; reason: string }) => reviewsApi.declareConflict(submissionId, reason), onSuccess: () => client.invalidateQueries({ queryKey: ["review-opportunities"] }) });
}
export function useMyReviews() { return useQuery({ queryKey: ["reviews"], queryFn: reviewsApi.listAssignments, retry: false }); }
export function useReviewWorkspace(assignmentId: string) { return useQuery({ queryKey: ["reviews", assignmentId], queryFn: () => reviewsApi.detail(assignmentId), enabled: Boolean(assignmentId), retry: false }); }
export function useSaveReview(assignmentId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: AcademicReviewInput) => reviewsApi.save(assignmentId, input), onSuccess: (data) => client.setQueryData(["reviews", assignmentId], (current: unknown) => ({ ...(current as object), ...data })) });
}
export function useSubmitReview(assignmentId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: AcademicReviewInput) => reviewsApi.submit(assignmentId, input), onSuccess: () => { client.invalidateQueries({ queryKey: ["review-center"] }); client.invalidateQueries({ queryKey: ["reviews", assignmentId] }); } });
}

export function useReviewTemplates() { return useQuery({ queryKey: ["review-templates"], queryFn: reviewsApi.templates }); }
export function useReviewTemplate(templateId?: string) { return useQuery({ queryKey: ["review-templates", templateId], queryFn: () => reviewsApi.template(templateId!), enabled: Boolean(templateId) }); }
export function useCreateReviewTemplate() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CreateReviewTemplateInput) => reviewsApi.createTemplate(input), onSuccess: () => client.invalidateQueries({ queryKey: ["review-templates"] }) });
}
export function useSaveReviewTemplateVersion(templateId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: ReviewTemplateVersionInput) => reviewsApi.saveTemplateVersion(templateId, input), onSuccess: () => { client.invalidateQueries({ queryKey: ["review-templates"] }); client.invalidateQueries({ queryKey: ["review-templates", templateId] }); } });
}
export function usePublishReviewTemplate() {
  const client = useQueryClient();
  return useMutation({ mutationFn: reviewsApi.publishTemplate, onSuccess: () => client.invalidateQueries({ queryKey: ["review-templates"] }) });
}
export function useDuplicateReviewTemplate() {
  const client = useQueryClient();
  return useMutation({ mutationFn: reviewsApi.duplicateTemplate, onSuccess: () => client.invalidateQueries({ queryKey: ["review-templates"] }) });
}
export function useArchiveReviewTemplate() {
  const client = useQueryClient();
  return useMutation({ mutationFn: reviewsApi.archiveTemplate, onSuccess: () => client.invalidateQueries({ queryKey: ["review-templates"] }) });
}

export function useReviewCenter() { return useQuery({ queryKey: ["review-center"], queryFn: reviewsApi.center, retry: false }); }
export function useReviewRequest(requestId?: string) { return useQuery({ queryKey: ["review-requests", requestId], queryFn: () => reviewsApi.requestDetail(requestId!), enabled: Boolean(requestId), retry: false }); }
export function useReviewerCandidates(query = "") { return useQuery({ queryKey: ["review-reviewers", query], queryFn: () => reviewsApi.reviewerCandidates(query || undefined), staleTime: 30_000 }); }
export function useCreateReviewRequest() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CreateReviewRequestInput) => reviewsApi.createRequest(input), onSuccess: () => client.invalidateQueries({ queryKey: ["review-center"] }) });
}
export function useReviewRequestAction() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["review-center"] });
  return {
    accept: useMutation({ mutationFn: reviewsApi.acceptRequest, onSuccess: refresh }),
    decline: useMutation({ mutationFn: ({ id, reason }: { id: string; reason?: string }) => reviewsApi.declineRequest(id, reason), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: reviewsApi.cancelRequest, onSuccess: refresh }),
    resubmit: useMutation({ mutationFn: ({ id, input }: { id: string; input: ResubmitReviewRequestInput }) => reviewsApi.resubmit(id, input), onSuccess: () => { refresh(); client.invalidateQueries({ queryKey: ["review-requests"] }); } }),
  };
}
