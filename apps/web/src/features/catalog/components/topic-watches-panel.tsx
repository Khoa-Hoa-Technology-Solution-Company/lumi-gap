import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { TopicWatch } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { useRunTopicWatches, useTopicWatches, useUpdateTopicWatch } from "../hooks/use-topic-watches";
import { WatchPhaseBadge } from "./catalog-badges";
import { apiErr, ErrorState, formatDateTime } from "./catalog-ui";
import { WatchSwitch } from "./topic-watch-control";

const count = (value: number) => value.toLocaleString("en");

const KIND_LABELS: Record<TopicWatch["targetKind"], string> = {
  topic: "Topic",
  subfield: "Subfield",
  keyword: "Keyword",
  tag: "Tag",
};

/** Every followed catalogue entry, the shared daily budget and a button to run the daily job now. */
export function TopicWatchesPanel() {
  const { t } = useI18n();
  const watches = useTopicWatches();
  const run = useRunTopicWatches();
  const data = watches.data;

  const runNow = () => run.mutate(undefined, {
    onSuccess: (result) => toast.success(result.queued ? t("Daily follow job queued.") : t("A daily follow job is already waiting.")),
    onError: (error) => toast.error(t(apiErr(error))),
  });

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="topic-watches-heading" data-testid="topic-watches-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="topic-watches-heading" className="text-lg font-semibold">{t("Followed entries")}</h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? t("{{used}} / {{budget}} new papers today", { used: count(data.usedToday), budget: count(data.dailyBudget) })
              : t("Loading…")}
          </p>
        </div>
        <Button size="sm" className="w-full sm:w-auto" disabled={run.isPending} onClick={runNow}>
          {t("Run now")}
        </Button>
      </div>

      {watches.isError ? (
        <ErrorState onRetry={() => watches.refetch()} />
      ) : !data ? (
        <Skeleton className="h-14 w-full" />
      ) : data.watches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Nothing is followed yet. Follow an entry from its tag page or its taxonomy page.")}{" "}
          <Link className="font-medium underline" to="/admin/tags">{t("Tags")}</Link>
          {" · "}
          <Link className="font-medium underline" to="/admin/taxonomy">{t("Taxonomy")}</Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {data.watches.map((watch) => <WatchRow key={watch.id} watch={watch} />)}
        </ul>
      )}
    </section>
  );
}

function WatchRow({ watch }: { watch: TopicWatch }) {
  const { t } = useI18n();
  const update = useUpdateTopicWatch();
  const stats: Array<[string, string]> = [
    [t("Inserted today"), count(watch.insertedToday)],
    [t("Inserted in total"), count(watch.totalInserted)],
    [t("Last run"), formatDateTime(watch.lastRunAt)],
  ];
  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm" data-testid="topic-watch-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <WatchSwitch
          checked={watch.enabled}
          disabled={update.isPending}
          label={t("Follow {{name}} daily", { name: watch.targetName })}
          onChange={(enabled) => update.mutate({ id: watch.id, patch: { enabled } }, { onError: (error) => toast.error(t(apiErr(error))) })}
        />
        <span className="min-w-0 break-words font-medium">{watch.targetName}</span>
        <span className="text-xs text-muted-foreground">{t(KIND_LABELS[watch.targetKind])}</span>
        <WatchPhaseBadge phase={watch.phase} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {watch.lastError ? <p className="break-words text-xs text-destructive">{watch.lastError}</p> : null}
    </li>
  );
}
