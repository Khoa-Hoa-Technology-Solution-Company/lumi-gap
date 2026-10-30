import { Link } from "react-router-dom";
import type { TagCampaign } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { useTagCampaigns } from "../hooks/use-tag-campaigns";
import { CampaignStateBadge } from "./catalog-badges";
import { ErrorState, formatDateTime } from "./catalog-ui";

const count = (value: number) => value.toLocaleString("en");

/** The campaigns planned from one tag, newest first. Starting, pausing and cancelling happen on the pipeline page. */
export function TagCampaignsSection({ tagId }: { tagId: string }) {
  const { t } = useI18n();
  const campaigns = useTagCampaigns(tagId);
  const list = campaigns.data;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby={`tag-campaigns-heading-${tagId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`tag-campaigns-heading-${tagId}`} className="text-lg font-semibold">{t("OpenAlex campaigns")}</h2>
          <p className="text-sm text-muted-foreground">{t("Random samples of this tag’s works, planned here and run from the pipeline page.")}</p>
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
          {list.map((campaign) => <TagCampaignItem key={campaign.id} campaign={campaign} />)}
        </ul>
      )}
    </section>
  );
}

function TagCampaignItem({ campaign }: { campaign: TagCampaign }) {
  const { t } = useI18n();
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
    </li>
  );
}
