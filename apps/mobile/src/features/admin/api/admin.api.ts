import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export interface TriggerSyncInput {
  searchText: string;
  yearFrom?: number;
  maxPages?: number;
}

export interface ApiSyncRun {
  _id: string;
  runStatus: "running" | "succeeded" | "failed" | "cancelled";
  searchText?: string;
  startedAt: string;
  finishedAt?: string;
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  totalDuplicates: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export const adminApi = {
  async triggerSync(input: TriggerSyncInput) {
    const res = await api.post(API_ROUTES.admin.sync, input);
    return res.data.data as { jobId: string; status: string };
  },
  async listRuns() {
    const res = await api.get(API_ROUTES.admin.syncRuns);
    return res.data.data as ApiSyncRun[];
  },
};
