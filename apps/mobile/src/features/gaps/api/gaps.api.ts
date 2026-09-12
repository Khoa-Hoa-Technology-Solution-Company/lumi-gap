import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";
import type {
  AnalyzeGapRequest,
  GapAnalysisResult,
  ListGapsResponse,
} from "@trend/shared-types";

export const gapsApi = {
  async analyze(payload: AnalyzeGapRequest): Promise<{ analysisId: string }> {
    const res = await api.post(API_ROUTES.gaps.analyze, payload);
    return res.data.data;
  },

  async getAnalysisStatus(id: string): Promise<GapAnalysisResult> {
    const res = await api.get(API_ROUTES.gaps.analyzeStatus(id));
    return res.data.data;
  },

  async list(params?: {
    topic?: string;
    minConfidence?: number;
    source?: "report" | "standalone";
    status?: "active" | "resolved" | "dismissed";
    page?: number;
    pageSize?: number;
  }): Promise<ListGapsResponse> {
    const res = await api.get(API_ROUTES.gaps.list, { params });
    return { data: res.data.data, meta: res.data.meta };
  },

  async patchStatus(id: string, status: "resolved" | "dismissed"): Promise<void> {
    await api.patch(API_ROUTES.gaps.patch(id), { status });
  },
};
