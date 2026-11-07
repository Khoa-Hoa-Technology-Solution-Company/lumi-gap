import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { TopicBackfillTargetKind, TopicWatch } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import {
  useRemoveTopicWatch,
  useTopicWatchForTarget,
  useUpdateTopicWatch,
  useUpsertTopicWatch,
} from "../hooks/use-topic-watches";
import { WatchPhaseBadge } from "./catalog-badges";
import { apiErr, ErrorState, formatDateTime } from "./catalog-ui";

const count = (value: number) => value.toLocaleString("en");

/** Parses an optional daily cap: empty means no own limit (null), otherwise an integer of at least 1. Undefined means invalid. */
export function parseDailyMax(raw: string): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

/** Parses the backlog target: an integer of at least 0. Undefined means invalid. */
export function parseBacklogTarget(raw: string): number | undefined {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** Accessible on/off switch built on a native checkbox, since there is no Switch primitive. */
export function WatchSwitch({ checked, onChange, disabled, label }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className="relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 rounded-full border bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-checked:[&>span]:translate-x-5"
      >
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform" />
      </span>
    </label>
  );
}

/** Follow / unfollow one catalogue entry: the daily job reads its older works first, then keeps following new ones. */
export function TopicWatchControl({ targetKind, targetId }: { targetKind: TopicBackfillTargetKind; targetId: string }) {
  const { t } = useI18n();
  const { watch, isError, refetch } = useTopicWatchForTarget(targetKind, targetId);
  const upsert = useUpsertTopicWatch();
  const headingId = `topic-watch-heading-${targetId}`;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby={headingId} data-testid="topic-watch-control">
      <div>
        <h2 id={headingId} className="text-lg font-semibold">{t("Daily follow")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("The daily job reads this entry’s older works first, then keeps following new ones.")}
        </p>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : watch === undefined ? (
        <Skeleton className="h-10 w-full" />
      ) : watch === null ? (
        <Button
          size="sm"
          disabled={upsert.isPending}
          onClick={() => upsert.mutate({ targetKind, targetId }, {
            onSuccess: () => toast.success(t("Now following this entry.")),
            onError: (error) => toast.error(t(apiErr(error))),
          })}
        >
          {t("Follow")}
        </Button>
      ) : (
        <WatchDetails key={watch.id} watch={watch} />
      )}
    </section>
  );
}

function WatchDetails({ watch }: { watch: TopicWatch }) {
  const { t } = useI18n();
  const update = useUpdateTopicWatch();
  const remove = useRemoveTopicWatch();
  const [dailyMax, setDailyMax] = useState(watch.dailyMaxNewPapers === null ? "" : String(watch.dailyMaxNewPapers));
  const [backlog, setBacklog] = useState(String(watch.backlogTargetPapers));

  // Take over server values after a save or a refetch.
  useEffect(() => {
    setDailyMax(watch.dailyMaxNewPapers === null ? "" : String(watch.dailyMaxNewPapers));
    setBacklog(String(watch.backlogTargetPapers));
  }, [watch.dailyMaxNewPapers, watch.backlogTargetPapers]);

  const parsedDaily = parseDailyMax(dailyMax);
  const parsedBacklog = parseBacklogTarget(backlog);
  const dailyInvalid = parsedDaily === undefined;
  const backlogInvalid = parsedBacklog === undefined;
  const dirty = !dailyInvalid && !backlogInvalid && (parsedDaily !== watch.dailyMaxNewPapers || parsedBacklog !== watch.backlogTargetPapers);
  const busy = update.isPending || remove.isPending;

  const onError = (error: unknown) => toast.error(t(apiErr(error)));
  const save = () => {
    if (!dirty) return;
    update.mutate(
      { id: watch.id, patch: { dailyMaxNewPapers: parsedDaily, backlogTargetPapers: parsedBacklog } },
      { onSuccess: () => toast.success(t("Follow settings saved.")), onError },
    );
  };

  const stats: Array<[string, string]> = [
    [t("Inserted in total"), count(watch.totalInserted)],
    [t("Inserted today"), count(watch.insertedToday)],
    [t("Last run"), formatDateTime(watch.lastRunAt)],
  ];
  const inputId = `topic-watch-${watch.id}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <WatchSwitch
          checked={watch.enabled}
          disabled={busy}
          label={t("Follow {{name}} daily", { name: watch.targetName })}
          onChange={(enabled) => update.mutate({ id: watch.id, patch: { enabled } }, { onError })}
        />
        <span className="text-sm font-medium">{watch.enabled ? t("Following") : t("Paused")}</span>
        <WatchPhaseBadge phase={watch.phase} />
        {watch.phase === "backlog" ? (
          <span className="text-sm tabular-nums text-muted-foreground" data-testid="topic-watch-progress">
            {count(watch.backlogInserted)} / {count(watch.backlogTargetPapers)}
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {watch.lastError ? <p role="alert" className="break-words text-sm text-destructive">{watch.lastError}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${inputId}-daily`}>{t("Daily limit of new papers")}</Label>
          <Input
            id={`${inputId}-daily`}
            inputMode="numeric"
            value={dailyMax}
            placeholder={t("No own limit")}
            aria-invalid={dailyInvalid}
            onChange={(event) => setDailyMax(event.target.value)}
          />
          <p className={dailyInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {dailyInvalid ? t("Enter a whole number of at least 1, or leave empty.") : t("Leave empty to use only the shared daily budget.")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${inputId}-backlog`}>{t("Older works to import first")}</Label>
          <Input
            id={`${inputId}-backlog`}
            inputMode="numeric"
            value={backlog}
            aria-invalid={backlogInvalid}
            onChange={(event) => setBacklog(event.target.value)}
          />
          {backlogInvalid ? <p className="text-xs text-destructive">{t("Enter a whole number of at least 0.")}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => remove.mutate(watch.id, {
            onSuccess: () => toast.success(t("Stopped following this entry.")),
            onError,
          })}
        >
          {t("Remove")}
        </Button>
        <Button size="sm" disabled={!dirty || busy} onClick={save}>{t("Save")}</Button>
      </div>
    </div>
  );
}
