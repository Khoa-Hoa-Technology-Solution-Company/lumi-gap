import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  AcademicReviewInput,
  ChangeReviewTemplateInput,
  CreateReviewRequestInput,
  CreateReviewTemplateInput,
  ReviewAvailabilitySettings,
  ReviewTemplateVersionInput,
  ResubmitReviewRequestInput,
} from "@trend/shared-types";
import { reviewsApi } from "../api/reviews.api";
import { useAuthStore } from "@/stores/auth-store";

export function refreshMentorReviewQueries(client: QueryClient) {
  return Promise.all(["mentor-workspace", "review-center", "reviews", "review-requests", "submissions", "workspace-tasks", "mentor-access", "project-workspace", "project-research", "research-contributions"].map(key => client.invalidateQueries({ queryKey: [key] })));
}

export function useVerifyReviewRevision() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ requestId, itemId, status, expectedRevisionId }: { requestId: string; itemId: string; status: "ACCEPTED" | "REOPENED"; expectedRevisionId: string }) => reviewsApi.verifyRevision(requestId, itemId, status, expectedRevisionId), onSuccess: () => refreshMentorReviewQueries(client) });
}

export function useReviewAvailability() {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["review-availability", actor], queryFn: reviewsApi.availability, enabled: Boolean(actor), retry: false });
}
export function useUpdateReviewAvailability() {
  const client = useQueryClient();
  const actor = useAuthStore(state => state.user?.id);
  return useMutation({ mutationFn: (input: Omit<ReviewAvailabilitySettings, "activeReviewCount">) => reviewsApi.updateAvailability(input), onSuccess: (data) => { client.setQueryData(["review-availability", actor], data); client.invalidateQueries({ queryKey: ["review-opportunities"] }); } });
}
export function useReviewOpportunities(filters: Record<string, string | undefined>) {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["review-opportunities", actor, filters], queryFn: () => reviewsApi.opportunities(filters), enabled: Boolean(actor), retry: false });
}
export function useAcceptReviewOpportunity() {
  const client = useQueryClient();
  return useMutation({ mutationFn: reviewsApi.acceptOpportunity, onSuccess: () => { client.invalidateQueries({ queryKey: ["review-opportunities"] }); client.invalidateQueries({ queryKey: ["review-center"] }); client.invalidateQueries({ queryKey: ["review-availability"] }); } });
}
export function useDeclareReviewConflict() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ submissionId, reason }: { submissionId: string; reason: string }) => reviewsApi.declareConflict(submissionId, reason), onSuccess: () => client.invalidateQueries({ queryKey: ["review-opportunities"] }) });
}
export function useMyReviews() {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["reviews", "list", actor], queryFn: reviewsApi.listAssignments, enabled: Boolean(actor), retry: false });
}
export function useReviewWorkspace(assignmentId: string) {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["reviews", assignmentId, actor], queryFn: () => reviewsApi.detail(assignmentId), enabled: Boolean(assignmentId && actor), retry: false, refetchOnWindowFocus: "always" });
}
export function usePreviousReviewFeedback(assignmentId: string, enabled: boolean) {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ["reviews", assignmentId, actor, "previous-feedback"],
    queryFn: ({ signal }) => reviewsApi.previousFeedback(assignmentId, signal),
    enabled: Boolean(assignmentId && actor && enabled),
    retry: false,
    staleTime: 60_000,
    placeholderData: undefined,
  });
}
export function useSaveReview(assignmentId: string) {
  const client = useQueryClient();
  const actor = useAuthStore(state => state.user?.id);
  return useMutation({ mutationFn: (input: AcademicReviewInput) => reviewsApi.save(assignmentId, input), onSuccess: (data) => { client.setQueryData(["reviews", assignmentId, actor], (current: unknown) => ({ ...(current as object), ...data })); return Promise.all([client.invalidateQueries({ queryKey: ["mentor-workspace"] }), client.invalidateQueries({ queryKey: ["review-requests"] }), client.invalidateQueries({ queryKey: ["review-center"] })]); } });
}
export function useSubmitReview(assignmentId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: AcademicReviewInput) => reviewsApi.submit(assignmentId, input), onSuccess: () => refreshMentorReviewQueries(client) });
}

export function useReviewTemplates(includeArchived = false) {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ["review-templates", actor, includeArchived ? "all" : "active"],
    queryFn: () => reviewsApi.templates({ includeArchived }),
    enabled: Boolean(actor),
  });
}
export function useEligibleReviewTemplates(requestId?: string, enabled = true) {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ["review-requests", requestId, "eligible-templates", actor],
    queryFn: () => reviewsApi.eligibleTemplates(requestId!),
    enabled: Boolean(requestId && actor && enabled),
    retry: false,
  });
}
export function useChangeReviewTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, input }: { requestId: string; input: ChangeReviewTemplateInput }) =>
      reviewsApi.changeRequestTemplate(requestId, input),
    onSuccess: () => refreshMentorReviewQueries(client),
  });
}
export function useReviewTemplate(templateId?: string) {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["review-templates", actor, templateId], queryFn: () => reviewsApi.template(templateId!), enabled: Boolean(actor && templateId) });
}
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

export function useReviewCenter() {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["review-center", actor], queryFn: reviewsApi.center, enabled: Boolean(actor), retry: false });
}
export function useReviewRequest(requestId?: string) {
  const actor = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["review-requests", requestId, actor], queryFn: () => reviewsApi.requestDetail(requestId!), enabled: Boolean(requestId && actor), retry: false, refetchOnWindowFocus: "always", refetchInterval: 15000 });
}
export function useReviewerCandidates(query = "", scope: { reportId?: string; submissionId?: string } = {}) { return useQuery({ queryKey: ["review-reviewers", query, scope.reportId ?? null, scope.submissionId ?? null], queryFn: () => reviewsApi.reviewerCandidates(query || undefined, scope), staleTime: 30_000 }); }
export function useCreateReviewRequest() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CreateReviewRequestInput) => reviewsApi.createRequest(input), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["mentor-workspace"] }), client.invalidateQueries({ queryKey: ["workspace-tasks"] }), client.invalidateQueries({ queryKey: ["review-center"] }), client.invalidateQueries({ queryKey: ["reports"] }), client.invalidateQueries({ queryKey: ["submissions"] }), client.invalidateQueries({ queryKey: ["review-opportunities"] })]) });
}
export function useReviewRequestAction() {
  const client = useQueryClient();
  // Request status drives the detail page and the project artifact status, so refresh all three.
  const refresh = () => Promise.all([refreshMentorReviewQueries(client), client.invalidateQueries({ queryKey: ["reports"] }), client.invalidateQueries({ queryKey: ["review-opportunities"] })]);
  return {
    accept: useMutation({ mutationFn: reviewsApi.acceptRequest, onSuccess: refresh }),
    decline: useMutation({ mutationFn: ({ id, reason }: { id: string; reason?: string }) => reviewsApi.declineRequest(id, reason), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: reviewsApi.cancelRequest, onSuccess: refresh }),
    resubmit: useMutation({ mutationFn: ({ id, input }: { id: string; input: ResubmitReviewRequestInput }) => reviewsApi.resubmit(id, input), onSuccess: refresh }),
  };
}
