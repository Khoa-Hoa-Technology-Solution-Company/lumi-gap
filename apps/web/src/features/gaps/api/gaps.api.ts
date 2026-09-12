import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants/api";
import type {
  AnalyzeGapRequest,
  GapAnalysisResult,
  ListGapsResponse,
  GapDirections,
  PreviewGapEvidenceRequest,
  PreviewGapEvidenceResponse,
} from "@trend/shared-types";

export const gapsApi = {
  async previewEvidence(payload: PreviewGapEvidenceRequest): Promise<PreviewGapEvidenceResponse> {
    const res = await api.post(API_ROUTES.gaps.evidencePreview, payload);
    return res.data.data;
  },

  async analyze(payload: AnalyzeGapRequest): Promise<{ analysisId: string }> {
    const res = await api.post(API_ROUTES.gaps.analyze, payload);
    return res.data.data;
  },

  async getAnalysisStatus(id: string): Promise<GapAnalysisResult> {
    const res = await api.get(API_ROUTES.gaps.analyzeStatus(id));
    return res.data.data;
  },

  async getActiveAnalysis(): Promise<GapAnalysisResult | null> {
    const res = await api.get(API_ROUTES.gaps.activeAnalysis);
    return res.data.data ?? null;
  },

  async retryAnalysis(id: string): Promise<{ analysisId: string }> {
    const res = await api.post(API_ROUTES.gaps.retryAnalysis(id));
    return res.data.data;
  },

  async list(params?: {
    topic?: string;
    search?: string;
    minConfidence?: number;
    source?: "report" | "standalone";
    status?: "active" | "resolved" | "dismissed";
    sortBy?: "recommended" | "evidence" | "confidence" | "papers" | "newest" | "ai_only_last";
    page?: number;
    pageSize?: number;
    projectId?: string;
  }): Promise<ListGapsResponse> {
    const res = await api.get(API_ROUTES.gaps.list, { params });
    return { data: res.data.data, meta: res.data.meta };
  },

  async patchStatus(id: string, status: "active" | "resolved" | "dismissed"): Promise<void> {
    await api.patch(API_ROUTES.gaps.patch(id), { status });
  },

  async getDirections(gapId: string): Promise<GapDirections | null> {
    const res = await api.get(API_ROUTES.gaps.directions(gapId));
    return res.data.data ?? null;
  },

  async generateDirections(gapId: string, force: boolean): Promise<GapDirections> {
    const res = await api.post(API_ROUTES.gaps.directions(gapId), { force });
    return res.data.data;
  },
};
