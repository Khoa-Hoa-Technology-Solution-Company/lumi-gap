import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { StructuredSubmissionInput } from "@trend/shared-types";
import { submissionsApi } from "../api/submissions.api";

export function useSubmissions(projectId?: string) {
  return useQuery({ queryKey: ["submissions", "list", projectId ?? "mine"], queryFn: ({ signal }) => submissionsApi.list(projectId, signal) });
}

export function useSubmission(id: string, projectId?: string) {
  return useQuery({ queryKey: ["submissions", id, "detail", projectId ?? "standalone"], queryFn: ({ signal }) => submissionsApi.detail(id, projectId, signal), enabled: Boolean(id) });
}

export function useSubmissionRevisions(id: string) {
  return useQuery({ queryKey: ["submissions", id, "revisions"], queryFn: ({ signal }) => submissionsApi.revisions(id, signal), enabled: Boolean(id) });
}

export function useCreateSubmission() {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ input, file }: { input: StructuredSubmissionInput; file: File }) => submissionsApi.create(input, file), onSuccess: () => client.invalidateQueries({ queryKey: ["submissions"] }) });
}

export function useAddSubmissionRevision(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: ({ file, responseToReview }: { file: File; responseToReview?: string }) => submissionsApi.addRevision(id, file, responseToReview), onSuccess: () => {
    client.invalidateQueries({ queryKey: ["submissions", id] });
    client.invalidateQueries({ queryKey: ["submissions", "list"] });
    client.invalidateQueries({ queryKey: ["submissions", id, "revisions"] });
    client.invalidateQueries({ queryKey: ["review-opportunities"] });
  } });
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
  const client = useQueryClient();
  // Pre-reviews run in a worker; poll while the latest one is still queued or processing.
  const query = useQuery({ queryKey: ["submissions", id, "ai-pre-reviews"], queryFn: ({ signal }) => submissionsApi.aiPreReviews(id, signal), enabled: Boolean(id) && enabled, refetchInterval: (query) => ["QUEUED", "PROCESSING"].includes(query.state.data?.[0]?.status ?? "") ? 3000 : false });
  const latestId = query.data?.[0]?.id;
  const latestStatus = query.data?.[0]?.status;
  useEffect(() => {
    if (!enabled || latestStatus !== "COMPLETED") return;
    void client.invalidateQueries({ queryKey: ["submissions", id, "detail"] });
    void client.invalidateQueries({ queryKey: ["submissions", "list"] });
  }, [client, id, enabled, latestId, latestStatus]);
  return query;
}

export function useRunAiPreReview(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => submissionsApi.runAiPreReview(id), onSuccess: () => {
    client.invalidateQueries({ queryKey: ["submissions", id, "ai-pre-reviews"] });
  } });
}

export function useSubmissionHistory(id: string, enabled = true) { return useQuery({ queryKey: ["submissions", id, "history"], queryFn: ({ signal }) => submissionsApi.history(id, signal), enabled: Boolean(id) && enabled }); }
