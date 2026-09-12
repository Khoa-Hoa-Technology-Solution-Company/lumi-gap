import type { AnalyticalReport, CreateReportRequest, ReportListItem } from "@trend/shared-types";
import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export const reportsApi = {
  async list(params?: { page?: number; pageSize?: number }): Promise<{ reports: ReportListItem[]; meta?: { total?: number } }> {
    const res = await api.get(API_ROUTES.reports.list, { params });
    return { reports: res.data.data, meta: res.data.meta };
  },

  async detail(id: string): Promise<AnalyticalReport> {
    const res = await api.get(API_ROUTES.reports.detail(id));
    return res.data.data;
  },

  async create(payload: CreateReportRequest): Promise<{ id: string; status: string }> {
    const res = await api.post(API_ROUTES.reports.create, payload);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(API_ROUTES.reports.delete(id));
  },
};
