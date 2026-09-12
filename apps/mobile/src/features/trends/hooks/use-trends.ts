import { useQuery } from "@tanstack/react-query";
import { trendsApi, type TrendsOverviewParams } from "../api/trends.api";

export function useTrendsOverview(params?: TrendsOverviewParams) {
  return useQuery({
    queryKey: ["trends", "overview", params],
    queryFn: () => trendsApi.overview(params),
  });
}

export function useTopicTrend(topic?: string, params?: { yearFrom?: number; yearTo?: number }) {
  return useQuery({
    queryKey: ["trends", "topic", topic, params],
    queryFn: () => trendsApi.topic(topic!, params),
    enabled: !!topic,
  });
}
