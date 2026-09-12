import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type TriggerSyncInput } from "../api/admin.api";

export function useSyncRuns(enabled = true) {
  return useQuery({
    queryKey: ["admin", "sync-runs"],
    queryFn: adminApi.listRuns,
    enabled,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.runStatus === "running") ? 5000 : false,
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerSyncInput) => adminApi.triggerSync(input),
    onSuccess: () => {
      // Đợi worker chạy nền 2 giây rồi mới làm mới query để lấy kết quả mới nhất
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["admin", "sync-runs"] });
        qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      }, 2000);
    },
  });
}

export function useEmbedStatus(enabled = true) {
  return useQuery({
    queryKey: ["admin", "embed-status"],
    queryFn: adminApi.getEmbedStatus,
    refetchInterval: 10000,
    enabled,
  });
}

export function useTriggerEmbedding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminApi.triggerEmbedding,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "embed-status"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

const OPENALEX_CAMPAIGNS_KEY = ["admin", "openalex-ingest-campaigns"] as const;

export function useOpenAlexCampaigns(enabled = true) {
  return useQuery({
    queryKey: OPENALEX_CAMPAIGNS_KEY,
    queryFn: adminApi.listOpenAlexCampaigns,
    enabled,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((campaign) => campaign.state === "running") ? 5000 : 30000,
  });
}

export function useOpenAlexCampaignDetail(campaignId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...OPENALEX_CAMPAIGNS_KEY, campaignId],
    queryFn: () => adminApi.getOpenAlexCampaign(campaignId as string),
    enabled: enabled && Boolean(campaignId),
    refetchInterval: (query) => query.state.data?.campaign.state === "running" ? 5000 : 30000,
  });
}

export function useOpenAlexCampaignAction(action: "start" | "pause" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => {
      if (action === "start") return adminApi.startOpenAlexCampaign(campaignId);
      if (action === "pause") return adminApi.pauseOpenAlexCampaign(campaignId);
      return adminApi.cancelOpenAlexCampaign(campaignId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: OPENALEX_CAMPAIGNS_KEY }),
  });
}

export function useOpenAlexIngestPreflight() {
  return useMutation({ mutationFn: adminApi.preflightOpenAlexIngest });
}

export function useLatestCorpusValidation(campaignId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...OPENALEX_CAMPAIGNS_KEY, campaignId, "validation", "latest"] as const,
    queryFn: () => adminApi.getLatestCorpusValidation(campaignId as string),
    enabled: enabled && Boolean(campaignId),
    refetchInterval: (query) => {
      const runState = query.state.data?.state;
      return runState === "queued" || runState === "running" ? 3000 : false;
    },
  });
}

export function useCorpusValidationRun(
  validationRunId: string | null,
  campaignId: string | null,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const terminalSyncRef = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ["admin", "openalex-corpus-validation", validationRunId] as const,
    queryFn: () => adminApi.getCorpusValidation(validationRunId as string),
    enabled: enabled && Boolean(validationRunId),
    refetchInterval: (query) => {
      const runState = query.state.data?.state;
      return runState === "queued" || runState === "running" ? 3000 : false;
    },
  });

  useEffect(() => {
    if (query.data?.state !== "completed" && query.data?.state !== "failed") return;
    if (terminalSyncRef.current === query.data.id) return;
    terminalSyncRef.current = query.data.id;
    void queryClient.invalidateQueries({ queryKey: OPENALEX_CAMPAIGNS_KEY });
  }, [campaignId, query.data?.id, query.data?.state, queryClient]);

  return query;
}

export function useTriggerCorpusValidation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, force }: { campaignId: string; force?: boolean }) =>
      adminApi.triggerCorpusValidation(campaignId, force),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...OPENALEX_CAMPAIGNS_KEY, variables.campaignId, "validation", "latest"],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin", "openalex-corpus-validation", data.validationRunId],
      });
    },
  });
}
