import type { PaperComparison } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export const compareApi = {
  async compare(paperIds: string[]): Promise<PaperComparison> {
    const res = await api.post(API_ROUTES.papers.compare, { paperIds });
    return res.data.data;
  },
};
