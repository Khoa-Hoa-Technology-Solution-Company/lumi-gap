import type { HomeOverview } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export const homeApi = {
  async overview(): Promise<HomeOverview> {
    const res = await api.get(API_ROUTES.home.overview);
    return res.data.data as HomeOverview;
  },
};
