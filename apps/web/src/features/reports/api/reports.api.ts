import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants/api";
import type {
  AnalyticalReport,
  CreateReportRequest,
  PreviewReportEvidenceRequest,
  PreviewReportEvidenceResponse,
  ReportListItem,
} from "@trend/shared-types";

export const reportsApi = {
  async list(params?: { projectId?: string; paperId?: string }): Promise<ReportListItem[]> {
    const res = await api.get(API_ROUTES.reports.list, { params });
    return res.data.data;
  },

  async detail(id: string): Promise<AnalyticalReport> {
    const res = await api.get(API_ROUTES.reports.detail(id));
    return res.data.data;
  },

  async create(payload: CreateReportRequest): Promise<void> {
    await api.post(API_ROUTES.reports.create, payload);
  },

  async previewEvidence(payload: PreviewReportEvidenceRequest): Promise<PreviewReportEvidenceResponse> {
    const res = await api.post(API_ROUTES.reports.evidencePreview, payload);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(API_ROUTES.reports.detail(id));
  },

  async deleteBatch(ids: string[]): Promise<void> {
    await api.delete(API_ROUTES.reports.list, { data: { ids } });
  },
};
