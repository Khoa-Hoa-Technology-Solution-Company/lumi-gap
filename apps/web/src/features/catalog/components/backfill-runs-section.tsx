import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { TopicBackfillRun, TopicBackfillTargetKind } from "@trend/shared-types";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { isLiveRun, useTopicBackfillRun, useTopicBackfillRuns } from "@/features/topic-backfill";
import { cn } from "@/utils/cn";
import { useRefreshCatalog } from "../hooks/use-catalog-refresh";
import { BackfillStateBadge } from "./catalog-badges";
import { ErrorState, formatDateTime } from "./catalog-ui";

export const BACKFILL_RUNS_SHOWN = 5;

/** The latest imports for one catalogue entry, newest first; refreshes the catalogue queries once a live run ends. */
export function BackfillRunsSection({ targetKind, targetId, embedded = false }: {
  targetKind: TopicBackfillTargetKind;
  targetId: string;
  /** Inside a sheet: no card chrome and a smaller heading. */
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const runs = useTopicBackfillRuns({ targetKind, targetId, page: 1, pageSize: BACKFILL_RUNS_SHOWN });
  const refreshCatalog = useRefreshCatalog();
  const list = runs.data?.data.slice(0, BACKFILL_RUNS_SHOWN);

  // Papers, counts and previews change when an import adds papers: refresh once a run seen live has ended.
  const live = useRef(new Set<string>());
  useEffect(() => {
    let finished = false;
    for (const run of runs.data?.data ?? []) {
      if (isLiveRun(run)) live.current.add(run.id);
      else if (live.current.delete(run.id)) finished = true;
    }
    if (finished) refreshCatalog();
  }, [runs.data, refreshCatalog]);

  const Heading = embedded ? "h3" : "h2";
  return (
    <section
      className={cn("space-y-3", !embedded && "rounded-xl border bg-card p-4 sm:p-6")}
      aria-labelledby={`backfill-runs-heading-${targetId}`}
    >
      <div>
        <Heading id={`backfill-runs-heading-${targetId}`} className={embedded ? "text-sm font-medium" : "text-lg font-semibold"}>
          {t("OpenAlex imports")}
        </Heading>
        <p className="text-sm text-muted-foreground">{t("The latest imports of new papers from OpenAlex.")}</p>
      </div>

      {runs.isError ? (
        <ErrorState onRetry={() => runs.refetch()} />
      ) : !list ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("No imports yet.")}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((run) => <BackfillRunItem key={run.id} run={run} />)}
        </ul>
      )}
    </section>
  );
}

function BackfillRunItem({ run }: { run: TopicBackfillRun }) {
  const { t } = useI18n();
  const stats: Array<[string, string]> = [
    [t("Started"), formatDateTime(run.startedAt)],
    [t("Finished"), formatDateTime(run.finishedAt)],
    [t("New papers"), run.insertedCount.toLocaleString("en")],
    [t("Skipped"), run.skippedCount.toLocaleString("en")],
    [t("Pages"), run.pagesFetched.toLocaleString("en")],
    [t("Budget"), run.maxNewPapers.toLocaleString("en")],
  ];
  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm" data-testid="backfill-run">
      <div className="flex flex-wrap items-center gap-2">
        <BackfillStateBadge state={run.state} />
        <span className="text-xs text-muted-foreground">
          {run.trigger === "search" ? t("Requested from search") : t("Started by an admin")}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {run.state === "failed" && run.errorMessage ? (
        <p role="alert" className="break-words rounded-md bg-rose-500/10 px-2 py-1.5 text-xs text-rose-700 dark:text-rose-400">
          {run.errorMessage}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Follows one run that was started where no run list is shown (the keywords table). When it ends, the catalogue queries
 * are refreshed and a toast reports the outcome.
 */
export function BackfillRunWatcher({ runId }: { runId?: string }) {
  const { t } = useI18n();
  const refreshCatalog = useRefreshCatalog();
  const run = useTopicBackfillRun(runId).data;
  const reported = useRef<string>();

  useEffect(() => {
    if (!run || isLiveRun(run) || reported.current === run.id) return;
    reported.current = run.id;
    refreshCatalog();
    if (run.state === "completed") {
      toast.success(t("Imported {{count}} new papers into “{{name}}”.", { count: run.insertedCount, name: run.targetName }));
    } else {
      toast.error(t("The import for “{{name}}” failed.", { name: run.targetName }));
    }
  }, [run, refreshCatalog, t]);

  return null;
}
