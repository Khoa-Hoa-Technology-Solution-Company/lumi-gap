import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StructuredSubmissionInput } from "@trend/shared-types";
import { submissionsApi } from "../api/submissions.api";

export function useSubmissions() {
  return useQuery({ queryKey: ["submissions"], queryFn: submissionsApi.list });
}

export function useSubmission(id: string) {
  return useQuery({ queryKey: ["submissions", id], queryFn: () => submissionsApi.detail(id), enabled: Boolean(id) });
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
    client.invalidateQueries({ queryKey: ["submissions", id, "revisions"] });
  } });
}

export function useAiPreReviews(id: string) {
  return useQuery({ queryKey: ["submissions", id, "ai-pre-reviews"], queryFn: () => submissionsApi.aiPreReviews(id), enabled: Boolean(id) });
}

export function useRunAiPreReview(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => submissionsApi.runAiPreReview(id), onSuccess: () => {
    client.invalidateQueries({ queryKey: ["submissions", id] });
    client.invalidateQueries({ queryKey: ["submissions", id, "ai-pre-reviews"] });
  } });
}
