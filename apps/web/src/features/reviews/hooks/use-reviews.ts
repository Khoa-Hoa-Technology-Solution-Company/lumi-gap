import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HumanReviewInput, ReviewAvailabilitySettings } from "@trend/shared-types";
import { reviewsApi } from "../api/reviews.api";

export function useReviewAvailability() {
  return useQuery({ queryKey: ["review-availability"], queryFn: reviewsApi.availability, retry: false });
}

export function useUpdateReviewAvailability() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ReviewAvailabilitySettings, "activeReviewCount">) => reviewsApi.updateAvailability(input),
    onSuccess: (data) => {
      client.setQueryData(["review-availability"], data);
      client.invalidateQueries({ queryKey: ["review-opportunities"] });
    },
  });
}

export function useReviewOpportunities(filters: Record<string, string | undefined>) {
  return useQuery({ queryKey: ["review-opportunities", filters], queryFn: () => reviewsApi.opportunities(filters), retry: false });
}

export function useAcceptReviewOpportunity() {
  const client = useQueryClient();
  return useMutation({ mutationFn: reviewsApi.accept, onSuccess: () => {
    client.invalidateQueries({ queryKey: ["review-opportunities"] });
    client.invalidateQueries({ queryKey: ["reviews"] });
    client.invalidateQueries({ queryKey: ["review-availability"] });
  } });
}

export function useDeclareReviewConflict() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ submissionId, reason }: { submissionId: string; reason: string }) => reviewsApi.declareConflict(submissionId, reason), onSuccess: () => client.invalidateQueries({ queryKey: ["review-opportunities"] }) });
}

export function useMyReviews() {
  return useQuery({ queryKey: ["reviews"], queryFn: reviewsApi.list, retry: false });
}

export function useReviewWorkspace(assignmentId: string) {
  return useQuery({ queryKey: ["reviews", assignmentId], queryFn: () => reviewsApi.detail(assignmentId), enabled: Boolean(assignmentId), retry: false });
}

export function useSaveReview(assignmentId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: HumanReviewInput) => reviewsApi.save(assignmentId, input), onSuccess: () => client.invalidateQueries({ queryKey: ["reviews", assignmentId] }) });
}

export function useSubmitReview(assignmentId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: HumanReviewInput) => reviewsApi.submit(assignmentId, input), onSuccess: () => {
    client.invalidateQueries({ queryKey: ["reviews"] });
    client.invalidateQueries({ queryKey: ["reviews", assignmentId] });
  } });
}
