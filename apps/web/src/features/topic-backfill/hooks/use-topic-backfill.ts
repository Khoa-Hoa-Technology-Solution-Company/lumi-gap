import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TopicBackfillRun } from "@trend/shared-types";
import {
  topicBackfillApi,
  type AdminRequestTopicBackfillInput,
  type RequestTopicBackfillInput,
  type TopicBackfillRunsParams,
} from "../api/topic-backfill.api";

export const RUN_POLL_MS = 3000;
export const RUNS_POLL_MS = 5000;

export const topicBackfillKeys = {
  run: (id?: string) => ["topic-backfill", "run", id] as const,
  adminAll: ["admin", "topic-backfill"] as const,
  adminRuns: (params: TopicBackfillRunsParams) => ["admin", "topic-backfill", "runs", params] as const,
};

/** A run that is still being worked on, so its counters keep changing. */
export function isLiveRun(run: Pick<TopicBackfillRun, "state"> | undefined): boolean {
  return run?.state === "queued" || run?.state === "running";
}

/** Signed-in user asking for more papers from a thin search result. */
export function useRequestTopicBackfill() {
  return useMutation({ mutationFn: (input: RequestTopicBackfillInput) => topicBackfillApi.request(input) });
}

/**
 * One run, refetched every 3 s while it is queued or running. `initialRun` (the POST response) seeds the cache so a run
 * that already finished does not trigger a request at all.
 */
export function useTopicBackfillRun(id: string | undefined, initialRun?: TopicBackfillRun) {
  return useQuery({
    queryKey: topicBackfillKeys.run(id),
    queryFn: ({ signal }) => topicBackfillApi.getRun(id!, signal),
    enabled: Boolean(id),
    ...(initialRun ? { initialData: initialRun, staleTime: Infinity } : {}),
    refetchInterval: (query) => (isLiveRun(query.state.data) ? RUN_POLL_MS : false),
    refetchOnWindowFocus: false,
  });
}

export function useAdminRequestTopicBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminRequestTopicBackfillInput) => topicBackfillApi.adminRequest(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: topicBackfillKeys.adminAll }),
  });
}

/** Admin run history, refetched every 5 s while any listed run is queued or running. */
export function useTopicBackfillRuns(params: TopicBackfillRunsParams, enabled = true) {
  return useQuery({
    queryKey: topicBackfillKeys.adminRuns(params),
    queryFn: ({ signal }) => topicBackfillApi.adminRuns(params, signal),
    enabled,
    refetchInterval: (query) => (query.state.data?.data.some(isLiveRun) ? RUNS_POLL_MS : false),
  });
}
