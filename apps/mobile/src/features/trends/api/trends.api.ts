import type { PublicationTrend, TrendsOverview } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export interface TrendsOverviewParams {
  yearFrom?: number;
  yearTo?: number;
  limit?: number;
  minPapers?: number;
  sortBy?: "momentum" | "growth" | "total";
}

export const trendsApi = {
  async overview(params?: TrendsOverviewParams): Promise<TrendsOverview> {
    const res = await api.get(API_ROUTES.trends.overview, { params });
    return res.data.data;
  },

  async topic(topic: string, params?: { yearFrom?: number; yearTo?: number }): Promise<PublicationTrend> {
    const res = await api.get(API_ROUTES.trends.topic(topic), { params });
    return res.data.data;
  },
};
