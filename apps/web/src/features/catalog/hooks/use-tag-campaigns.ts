import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TagCampaign } from "@trend/shared-types";
import { tagCampaignsApi } from "../api/catalog.api";
import { tagKeys } from "./use-tags";

export const TAG_CAMPAIGN_POLL_MS = 5000;

export const tagCampaignKeys = {
  list: (tagId?: string) => [...tagKeys.all, "campaigns", tagId] as const,
  preflight: (tagId: string) => [...tagKeys.all, "campaign-preflight", tagId] as const,
};

/** Only a running campaign changes by itself: a planned or paused one waits for an admin on the pipeline page. */
export function isRunningTagCampaign(campaign: Pick<TagCampaign, "state">): boolean {
  return campaign.state === "running";
}

/** The latest campaigns of one tag, newest first. Refetches every few seconds while one is running. */
export function useTagCampaigns(tagId?: string) {
  return useQuery({
    queryKey: tagCampaignKeys.list(tagId),
    queryFn: () => tagCampaignsApi.list(tagId!),
    enabled: Boolean(tagId),
    refetchInterval: (query) => (query.state.data?.some(isRunningTagCampaign) ? TAG_CAMPAIGN_POLL_MS : false),
  });
}

/** Read-only check of what a campaign would draw on. Fresh each time the dialog opens, because it calls OpenAlex. */
export function useTagCampaignPreflight(tagId: string) {
  return useQuery({
    queryKey: tagCampaignKeys.preflight(tagId),
    queryFn: () => tagCampaignsApi.preflight(tagId),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function usePlanTagCampaign(tagId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetUniqueWorks: number) => tagCampaignsApi.plan(tagId, targetUniqueWorks),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagCampaignKeys.list(tagId) }),
  });
}
