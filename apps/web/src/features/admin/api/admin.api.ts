import type { CorpusValidationRun, CorpusValidationRunState } from "@trend/shared-types";
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

export type OpenAlexCampaignState =
  | "draft"
  | "preflight"
  | "planned"
  | "running"
  | "paused"
  | "completed"
  | "completed_with_shortfall"
  | "failed"
  | "cancelling"
  | "cancelled";

export interface OpenAlexCampaignProgress {
  plannedPartitions: number;
  completedPartitions: number;
  committedPages: number;
  acceptedWorks: number;
  uniqueWorks: number;
  rejectedWorks: number;
  conflictWorks: number;
}

export interface OpenAlexIngestCampaign {
  _id: string;
  campaignKey: string;
  campaignKind: "backfill" | "refresh" | "repair";
  state: OpenAlexCampaignState;
  targetUniqueWorks: number;
  progress: OpenAlexCampaignProgress;
  startedAt?: string;
  completedAt?: string;
  failureReason?: string;
  completionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpenAlexCampaignDetail {
  campaign: OpenAlexIngestCampaign;
  partitions: Array<{
    state: string;
    count: number;
    targetCount: number;
    acceptedCount: number;
  }>;
  attempts: Array<{ state: string; count: number }>;
}

export interface OpenAlexIngestPreflight {
  provider: "openalex";
  planningAsOf: string;
  eligibilityFilter: string;
  providerContract: {
    perPage: number;
    hasApiKey: boolean;
    hasMailto: boolean;
  };
  population: {
    total: number;
    domains: Array<{ openAlexId: string; name: string; count: number }>;
  };
  snapshotFingerprint: string;
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
  async getEmbedStatus() {
    const res = await api.get(API_ROUTES.admin.embedStatus);
    return res.data.data as {
      totalPapers: number;
      embeddedPapers: number;
      pendingPapers: number;
      isEmbeddingActive?: boolean;
    };
  },
  async triggerEmbedding() {
    const res = await api.post(API_ROUTES.admin.triggerEmbed);
    return res.data.data as { jobId: string; status: string };
  },
  async listOpenAlexCampaigns() {
    const res = await api.get(API_ROUTES.admin.openAlexIngestCampaigns);
    return res.data.data as OpenAlexIngestCampaign[];
  },
  async getOpenAlexCampaign(id: string) {
    const res = await api.get(API_ROUTES.admin.openAlexIngestCampaign(id));
    return res.data.data as OpenAlexCampaignDetail;
  },
  async preflightOpenAlexIngest() {
    const res = await api.post(API_ROUTES.admin.openAlexIngestPreflight);
    return res.data.data as OpenAlexIngestPreflight;
  },
  async startOpenAlexCampaign(id: string) {
    const res = await api.post(API_ROUTES.admin.startOpenAlexIngestCampaign(id));
    return res.data.data as { campaignId: string; state: OpenAlexCampaignState; jobId: string; status: string };
  },
  async pauseOpenAlexCampaign(id: string) {
    const res = await api.post(API_ROUTES.admin.pauseOpenAlexIngestCampaign(id));
    return res.data.data as { campaignId: string; state: OpenAlexCampaignState };
  },
  async cancelOpenAlexCampaign(id: string) {
    const res = await api.post(API_ROUTES.admin.cancelOpenAlexIngestCampaign(id));
    return res.data.data as { campaignId: string; state: OpenAlexCampaignState };
  },
  async triggerCorpusValidation(campaignId: string, force?: boolean) {
    const res = await api.post(API_ROUTES.admin.triggerCorpusValidation(campaignId), { force: Boolean(force) });
    return res.data.data as {
      validationRunId: string;
      state: CorpusValidationRunState;
      reused: boolean;
      validatorVersion: string;
    };
  },
  async getLatestCorpusValidation(campaignId: string) {
    const res = await api.get(API_ROUTES.admin.latestCorpusValidation(campaignId));
    return (res.data.data ?? null) as CorpusValidationRun | null;
  },
  async getCorpusValidation(validationRunId: string) {
    const res = await api.get(API_ROUTES.admin.corpusValidationRun(validationRunId));
    return res.data.data as CorpusValidationRun;
  },
};
