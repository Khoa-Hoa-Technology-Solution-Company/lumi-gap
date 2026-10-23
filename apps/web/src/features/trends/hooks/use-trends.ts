import { useInfiniteQuery, useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  trendsApi,
  type TrendExplainInput,
  type TrendExplainHistoryParams,
  type TrendPeriodsParams,
  type TrendCompareParams,
  type TrendRelationshipParams,
  type TrendTopicCandidatesParams,
  type TrendsOverviewParams,
} from "../api/trends.api";

export function useTrendsOverview(params?: TrendsOverviewParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["trendsOverview", params],
    queryFn: () => trendsApi.overview(params),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** Offset of the next page, or undefined when every matched topic is loaded. */
function nextTopicOffset<T extends { matchedTopicCount?: number; topics: unknown[] }>(last: T, pages: T[]): number | undefined {
  const loaded = pages.reduce((sum, page) => sum + page.topics.length, 0);
  return last.matchedTopicCount !== undefined && loaded < last.matchedTopicCount ? loaded : undefined;
}

/** Tested topics of the overview, one verdict (or all), loaded page by page. */
export function useTrendsOverviewPages(params: TrendsOverviewParams, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ["trendsOverviewPages", params],
    queryFn: ({ pageParam }) => trendsApi.overview({ ...params, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextTopicOffset,
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** Same as useTrendsOverviewPages for GET /trends/periods. */
export function useTrendPeriodsPages(params: TrendPeriodsParams, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ["trendPeriodsPages", params],
    queryFn: ({ pageParam }) => trendsApi.periods({ ...params, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextTopicOffset,
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useTrendPeriods(params?: TrendPeriodsParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["trendPeriods", params],
    queryFn: () => trendsApi.periods(params),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useTopicTrend(topic: string, params?: Parameters<typeof trendsApi.topic>[1]) {
  return useQuery({
    queryKey: ["topicTrend", topic, params],
    queryFn: () => trendsApi.topic(topic, params),
    enabled: !!topic,
  });
}

export function useTrendCompare(params: TrendCompareParams, enabled = true) {
  return useQuery({
    queryKey: ["trendCompare", params],
    queryFn: () => trendsApi.compare(params),
    enabled: enabled && params.topics.length >= 2,
    placeholderData: keepPreviousData,
  });
}

export function useTrendTopicCandidates(params: TrendTopicCandidatesParams, enabled = true) {
  return useQuery({
    queryKey: ["trendTopicCandidates", params],
    queryFn: () => trendsApi.topicCandidates(params),
    enabled: enabled && params.q.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useTrendRelationships(params: TrendRelationshipParams, enabled = true) {
  return useQuery({
    queryKey: ["trendRelationships", params],
    queryFn: () => trendsApi.relationships(params),
    enabled: enabled && params.topic.trim().length > 0,
  });
}

export function useExplainTrend() {
  return useMutation({
    mutationFn: (input: TrendExplainInput) => trendsApi.explain(input),
  });
}

export function useTrendExplainHistory(params?: TrendExplainHistoryParams, enabled = true) {
  return useQuery({
    queryKey: ["trendExplainHistory", params],
    queryFn: () => trendsApi.explainHistory(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}
