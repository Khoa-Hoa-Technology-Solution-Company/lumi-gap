import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TopicBackfillTargetKind } from "@trend/shared-types";
import {
  topicWatchesApi,
  type TopicWatchListParams,
  type TopicWatchUpsertInput,
  type TopicWatchPatch,
} from "../api/catalog.api";

export const topicWatchKeys = {
  all: ["topic-watches"] as const,
  list: (params: TopicWatchListParams = {}) => [...topicWatchKeys.all, "list", params.targetKind, params.targetId] as const,
};

/** Followed entries with the shared daily budget. Both filters are optional. */
export function useTopicWatches(params: TopicWatchListParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: topicWatchKeys.list(params),
    queryFn: () => topicWatchesApi.list(params),
    enabled: options.enabled ?? true,
  });
}

/** The watch of one catalogue entry, or null when it is not followed; undefined while loading. */
export function useTopicWatchForTarget(targetKind: TopicBackfillTargetKind, targetId: string) {
  const query = useTopicWatches({ targetKind, targetId }, { enabled: Boolean(targetId) });
  const watch = query.data
    ? (query.data.watches.find((item) => item.targetKind === targetKind && item.targetId === targetId) ?? null)
    : undefined;
  return { ...query, watch };
}

function useInvalidateWatches() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: topicWatchKeys.all });
}

export function useUpsertTopicWatch() {
  const invalidate = useInvalidateWatches();
  return useMutation({
    mutationFn: (input: TopicWatchUpsertInput) => topicWatchesApi.upsert(input),
    onSuccess: invalidate,
  });
}

export function useUpdateTopicWatch() {
  const invalidate = useInvalidateWatches();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TopicWatchPatch }) => topicWatchesApi.update(id, patch),
    onSuccess: invalidate,
  });
}

export function useRemoveTopicWatch() {
  const invalidate = useInvalidateWatches();
  return useMutation({
    mutationFn: (id: string) => topicWatchesApi.remove(id),
    onSuccess: invalidate,
  });
}

export function useRunTopicWatches() {
  const invalidate = useInvalidateWatches();
  return useMutation({
    mutationFn: () => topicWatchesApi.run(),
    onSuccess: invalidate,
  });
}
