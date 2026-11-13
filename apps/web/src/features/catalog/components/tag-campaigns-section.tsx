import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TagCampaign } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpenAlexCampaignAction } from "@/features/admin/hooks/use-admin-sync";
import { useI18n } from "@/i18n";
import { tagCampaignKeys, useTagCampaigns } from "../hooks/use-tag-campaigns";
import { CampaignStateBadge } from "./catalog-badges";
import { apiErr, ErrorState, formatDateTime } from "./catalog-ui";

const count = (value: number) => value.toLocaleString("en");

type CampaignAction = "start" | "pause" | "cancel";

const ACTION_TOASTS: Record<CampaignAction, string> = {
  start: "Campaign started. It runs in the background.",
  pause: "Campaign paused.",
  cancel: "Campaign cancelled.",
};

/** The campaigns planned from one tag, newest first, with their start, pause and cancel controls. */
export function TagCampaignsSection({ tagId }: { tagId: string }) {
  const { t } = useI18n();
  const campaigns = useTagCampaigns(tagId);
  const list = campaigns.data;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby={`tag-campaigns-heading-${tagId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`tag-campaigns-heading-${tagId}`} className="text-lg font-semibold">{t("OpenAlex campaigns")}</h2>
          <p className="text-sm text-muted-foreground">{t("Random samples of this tag’s works. Plan one above, then start it here.")}</p>
        </div>
        {list && list.length > 0 ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/pipeline">{t("Open pipeline")}</Link>
          </Button>
        ) : null}
      </div>

      {campaigns.isError ? (
        <ErrorState onRetry={() => campaigns.refetch()} />
      ) : !list ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("No campaigns yet.")}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((campaign) => <TagCampaignItem key={campaign.id} campaign={campaign} tagId={tagId} />)}
        </ul>
      )}
    </section>
  );
}

function TagCampaignItem({ campaign, tagId }: { campaign: TagCampaign; tagId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const start = useOpenAlexCampaignAction("start");
  const pause = useOpenAlexCampaignAction("pause");
  const cancel = useOpenAlexCampaignAction("cancel");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const busy = start.isPending || pause.isPending || cancel.isPending;
  const canStart = campaign.state === "planned" || campaign.state === "paused";
  const canPause = campaign.state === "running";
  const canCancel = canStart || canPause;

  async function run(action: CampaignAction) {
    try {
      await { start, pause, cancel }[action].mutateAsync(campaign.id);
      toast.success(t(ACTION_TOASTS[action]));
    } catch (error) {
      toast.error(t(apiErr(error)));
    } finally {
      setConfirmingCancel(false);
      await queryClient.invalidateQueries({ queryKey: tagCampaignKeys.list(tagId) });
    }
  }

  const stats: Array<[string, string]> = [
    [t("Works"), `${count(campaign.uniqueWorks)} / ${count(campaign.targetUniqueWorks)}`],
    [t("Partitions"), `${count(campaign.completedPartitions)} / ${count(campaign.plannedPartitions)}`],
    [t("Planned on"), formatDateTime(campaign.createdAt)],
  ];
  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm" data-testid="tag-campaign">
      <div className="flex flex-wrap items-center gap-2">
        <CampaignStateBadge state={campaign.state} />
        <span className="break-all font-mono text-xs text-muted-foreground">{campaign.campaignKey}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {canCancel ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {confirmingCancel ? (
            <>
              <span className="text-xs text-muted-foreground">{t("Cancel this campaign? It cannot be started again.")}</span>
              <Button variant="destructive" className="h-11 sm:h-9" disabled={busy} onClick={() => void run("cancel")}>
                {cancel.isPending ? t("Cancelling…") : t("Yes, cancel it")}
              </Button>
              <Button variant="outline" className="h-11 sm:h-9" disabled={busy} onClick={() => setConfirmingCancel(false)}>
                {t("Keep it")}
              </Button>
            </>
          ) : (
            <>
              {canStart ? (
                <Button className="h-11 sm:h-9" disabled={busy} onClick={() => void run("start")}>
                  {start.isPending ? t("Starting…") : campaign.state === "paused" ? t("Resume") : t("Start")}
                </Button>
              ) : null}
              {canPause ? (
                <Button variant="outline" className="h-11 sm:h-9" disabled={busy} onClick={() => void run("pause")}>
                  {pause.isPending ? t("Pausing…") : t("Pause")}
                </Button>
              ) : null}
              <Button variant="ghost" className="h-11 sm:h-9" disabled={busy} onClick={() => setConfirmingCancel(true)}>
                {t("Cancel campaign")}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
