import type { SearchSummary } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export const analyticsApi = {
  /** GET /analytics/search/summary — public, no auth needed. */
  async getSummary(): Promise<SearchSummary> {
    const res = await api.get(API_ROUTES.analytics.summary);
    return res.data.data as SearchSummary;
  },
};
