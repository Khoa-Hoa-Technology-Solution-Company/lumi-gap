import { useAuthStore } from "@/stores/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { StructuredSubmissionInput } from "@trend/shared-types";
import { refreshMentorReviewQueries } from "@/features/reviews/hooks/use-reviews";
import { submissionsApi, type MentorFeedbackPayload } from "../api/submissions.api";

export function useSubmissions(projectId?: string) {
  return useQuery({ queryKey: ["submissions", "list", projectId ?? "mine"], queryFn: ({ signal }) => submissionsApi.list(projectId, signal) });
}

export function useSubmission(id: string, projectId?: string) {
  const actorId = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["submissions", id, "detail", projectId ?? "standalone", actorId], queryFn: ({ signal }) => submissionsApi.detail(id, projectId, signal), enabled: Boolean(id) });
}

export function useSubmissionRevisions(id: string, reviewedRevisionId?: string) {
  const actorId = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["submissions", id, "revisions", actorId, reviewedRevisionId ?? null], queryFn: ({ signal }) => submissionsApi.revisions(id, signal), enabled: Boolean(id && actorId), retry: false, refetchOnWindowFocus: "always" });
}

export function useActiveMentors(projectId?: string) {
  return useQuery({
    queryKey: ["submissions", "active-mentors", projectId],
    queryFn: () => submissionsApi.activeMentors(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useCreateSubmission() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ input, file }: { input: StructuredSubmissionInput & { mentorId?: string; contentSnapshot?: string; message?: string }; file?: File }) =>
      submissionsApi.create(input, file),
    onSuccess: () => {
      void refreshMentorReviewQueries(client);
      void client.invalidateQueries({ queryKey: ["mentor-send-context"] });
    },
  });
}

export function useSubmitFeedback(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: MentorFeedbackPayload) => submissionsApi.submitFeedback(id, payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["submissions", id] });
      client.invalidateQueries({ queryKey: ["submissions", "list"] });
      client.invalidateQueries({ queryKey: ["workspace-tasks"] });
      client.invalidateQueries({ queryKey: ["mentor-access"] });
      client.invalidateQueries({ queryKey: ["mentor-workspace"] });
    },
  });
}

export function useAddSubmissionRevision(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ file, responseToReview }: { file: File; responseToReview?: string }) => submissionsApi.addRevision(id, file, responseToReview),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["submissions", id] });
      client.invalidateQueries({ queryKey: ["submissions", "list"] });
      client.invalidateQueries({ queryKey: ["submissions", id, "revisions"] });
      client.invalidateQueries({ queryKey: ["review-opportunities"] });
      client.invalidateQueries({ queryKey: ["workspace-tasks"] });
    },
  });
}

export function useCreateSubmissionVersion(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { content: string; summary: string; expectedRevisionNumber: number }) => submissionsApi.createVersion(id, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["submissions", id] });
      void client.invalidateQueries({ queryKey: ["submissions", "list"] });
      void client.invalidateQueries({ queryKey: ["review-opportunities"] });
      void client.invalidateQueries({ queryKey: ["workspace-tasks"] });
    },
  });
}

export function useAiPreReviews(id: string, enabled = true) {
  const actorId = useAuthStore(state => state.user?.id);
  const client = useQueryClient();
  // Pre-reviews run in a worker; poll while ANY job on this submission is still queued or processing, stop once terminal.
  const query = useQuery({
    queryKey: ["submissions", id, "ai-pre-reviews", actorId],
    queryFn: ({ signal }) => submissionsApi.aiPreReviews(id, signal),
    enabled: Boolean(id) && enabled,
    refetchInterval: (q) =>
      q.state.data?.some((item) => item.status === "QUEUED" || item.status === "PROCESSING") ? 3000 : false,
  });
  const latestCompletedId = query.data?.find((item) => item.status === "COMPLETED")?.id;
  useEffect(() => {
    if (!enabled || !latestCompletedId) return;
    void client.invalidateQueries({ queryKey: ["submissions", id, "detail"] });
    void client.invalidateQueries({ queryKey: ["submissions", "list"] });
  }, [client, id, enabled, latestCompletedId]);
  return query;
}

export function useRunAiPreReview(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (revisionId?: string) => submissionsApi.runAiPreReview(id, revisionId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["submissions", id, "ai-pre-reviews"] });
    },
  });
}

export function useSubmissionHistory(id: string, enabled = true) {
  const actorId = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["submissions", id, "history", actorId], queryFn: ({ signal }) => submissionsApi.history(id, signal), enabled: Boolean(id) && enabled,
    refetchInterval: query => query.state.data?.reviewRequests?.some(request => ["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(request.status)) ? 15000 : false,
  });
}
