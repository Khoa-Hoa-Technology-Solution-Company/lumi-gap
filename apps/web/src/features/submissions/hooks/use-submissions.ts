import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StructuredSubmissionInput } from "@trend/shared-types";
import { submissionsApi } from "../api/submissions.api";

export function useSubmissions(projectId?: string) {
  return useQuery({ queryKey: ["submissions", "list", projectId ?? "mine"], queryFn: () => submissionsApi.list(projectId) });
}

export function useSubmission(id: string, projectId?: string) {
  return useQuery({ queryKey: ["submissions", id, "detail", projectId ?? "standalone"], queryFn: () => submissionsApi.detail(id, projectId), enabled: Boolean(id) });
}

export function useSubmissionRevisions(id: string) {
  return useQuery({ queryKey: ["submissions", id, "revisions"], queryFn: () => submissionsApi.revisions(id), enabled: Boolean(id) });
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
  } });
}

export function useAiPreReviews(id: string, enabled = true) {
  // Pre-reviews run in a worker; poll while the latest one is still queued or processing.
  return useQuery({ queryKey: ["submissions", id, "ai-pre-reviews"], queryFn: () => submissionsApi.aiPreReviews(id), enabled: Boolean(id) && enabled, refetchInterval: (query) => ["QUEUED", "PROCESSING"].includes(query.state.data?.[0]?.status ?? "") ? 3000 : false });
}

export function useRunAiPreReview(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => submissionsApi.runAiPreReview(id), onSuccess: () => {
    client.invalidateQueries({ queryKey: ["submissions", id, "ai-pre-reviews"] });
  } });
}

export function useSubmissionHistory(id: string, enabled = true) { return useQuery({ queryKey: ["submissions", id, "history"], queryFn: () => submissionsApi.history(id), enabled: Boolean(id) && enabled }); }
