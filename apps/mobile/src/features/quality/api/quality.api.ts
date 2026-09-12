import type { EvaluateRequest, QualityTargetKind, QualityView, RateRequest, RatingSummary } from "@trend/shared-types";

import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export const qualityApi = {
  async view(targetKind: QualityTargetKind, targetId: string): Promise<QualityView> {
    const res = await api.get(API_ROUTES.quality.view(targetKind, targetId));
    return res.data.data;
  },

  async evaluate(input: EvaluateRequest): Promise<NonNullable<QualityView["evaluation"]>> {
    const res = await api.post(API_ROUTES.quality.evaluate, input);
    return res.data.data;
  },

  async rate(input: RateRequest): Promise<{ ratingSummary: RatingSummary; myRating: NonNullable<QualityView["myRating"]> }> {
    const res = await api.post(API_ROUTES.quality.rate, input);
    return res.data.data;
  },

  async deleteRate(ratingId: string): Promise<{ ratingSummary: RatingSummary }> {
    const res = await api.delete(API_ROUTES.quality.deleteRate(ratingId));
    return res.data.data;
  },
};
