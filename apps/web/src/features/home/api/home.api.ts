import type { HomeOverview, HomeResearchOverview } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export const homeApi = {
  async research(signal?: AbortSignal): Promise<HomeResearchOverview> {
    const res = await api.get(API_ROUTES.home.research, { signal });
    return res.data.data;
  },
  async overview(): Promise<HomeOverview> {
    const res = await api.get(API_ROUTES.home.overview);
    return res.data.data as HomeOverview;
  },
};
