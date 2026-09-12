import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Ban, DatabaseZap, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";
import type { OpenAlexCampaignState } from "../api/admin.api";
import {
  useOpenAlexCampaignAction,
  useOpenAlexCampaignDetail,
  useOpenAlexCampaigns,
  useOpenAlexIngestPreflight,
} from "../hooks/use-admin-sync";
import { CorpusValidationPanel } from "./corpus-validation-panel";

interface OpenAlexCampaignMonitorProps {
  enabled: boolean;
  ingestWorkerStatus: "alive" | "stale" | "missing";
  corpusValidationWorkerStatus: "alive" | "stale" | "missing";
}

const TERMINAL_STATES = new Set<OpenAlexCampaignState>([
  "completed",
  "completed_with_shortfall",
  "failed",
  "cancelled",
]);

export function OpenAlexCampaignMonitor({
  enabled,
  ingestWorkerStatus,
  corpusValidationWorkerStatus,
}: OpenAlexCampaignMonitorProps) {
  const campaignsQuery = useOpenAlexCampaigns(enabled);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);
  const campaigns = campaignsQuery.data ?? [];

  useEffect(() => {
    if (selectedId && campaigns.some((campaign) => campaign._id === selectedId)) return;
    const preferred = campaigns.find((campaign) => campaign.state === "running") ?? campaigns[0];
    setSelectedId(preferred?._id ?? null);
  }, [campaigns, selectedId]);

  const detailQuery = useOpenAlexCampaignDetail(selectedId, enabled);
  const start = useOpenAlexCampaignAction("start");
  const pause = useOpenAlexCampaignAction("pause");
  const cancel = useOpenAlexCampaignAction("cancel");
  const preflight = useOpenAlexIngestPreflight();
  const campaign = detailQuery.data?.campaign ?? campaigns.find((item) => item._id === selectedId);
  const pendingAction = start.isPending || pause.isPending || cancel.isPending || preflight.isPending;
  const detailUnavailable = Boolean(selectedId && detailQuery.isError);

  useEffect(() => setConfirmingCancel(false), [selectedId]);

  const metrics = useMemo(() => {
    if (!campaign) return null;
    const target = Math.max(1, campaign.targetUniqueWorks);
    const plannedPartitions = Math.max(1, campaign.progress?.plannedPartitions ?? 0);
    return {
      uniquePct: Math.min(100, ((campaign.progress?.uniqueWorks ?? 0) / target) * 100),
      partitionPct: Math.min(100, ((campaign.progress?.completedPartitions ?? 0) / plannedPartitions) * 100),
    };
  }, [campaign]);

  const runAction = async (action: "start" | "pause" | "cancel") => {
    if (!selectedId) return;
    try {
      if (action === "start") {
        const result = await preflight.mutateAsync();
        if (!result.providerContract.hasApiKey || result.providerContract.perPage !== 100) {
          throw new Error("OpenAlex preflight returned an invalid provider contract.");
        }
        await start.mutateAsync(selectedId);
      }
      if (action === "pause") await pause.mutateAsync(selectedId);
      if (action === "cancel") await cancel.mutateAsync(selectedId);
      setConfirmingCancel(false);
      toast.success(`Campaign ${action} request completed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to ${action} campaign.`;
      toast.error(message);
    }
  };

  return (
    <section className="rounded-xl border border-[#EAEAEA] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,0.01)] dark:border-[#26334A] dark:bg-[#111B27] space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
            <DatabaseZap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">OpenAlex Ingest Campaign</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Durable metadata ingestion progress. Unique papers, not raw API rows, determine completion.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn(
            "rounded-full",
            ingestWorkerStatus === "alive" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            ingestWorkerStatus === "stale" && "border-amber-200 bg-amber-50 text-amber-700",
            ingestWorkerStatus === "missing" && "border-red-200 bg-red-50 text-red-700",
          )}>
            Ingest worker {ingestWorkerStatus}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => void Promise.all([campaignsQuery.refetch(), detailQuery.refetch()])}>
            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", (campaignsQuery.isFetching || detailQuery.isFetching) && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {campaignsQuery.isLoading ? (
        <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading campaigns
        </div>
      ) : campaignsQuery.isError ? (
        <QueryError
          message="Campaigns could not be loaded. Check admin access and backend connectivity."
          onRetry={() => void campaignsQuery.refetch()}
        />
      ) : campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No OpenAlex campaigns have been planned yet.
        </div>
      ) : campaign && metrics ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Campaign
              <select
                className="h-10 max-w-xl rounded-lg border bg-background px-3 text-sm font-medium normal-case tracking-normal text-foreground"
                value={selectedId ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {campaigns.map((item) => (
                  <option key={item._id} value={item._id}>{item.campaignKey} ({item.state})</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <CampaignStateBadge state={campaign.state} />
              {(campaign.state === "planned" || campaign.state === "paused") && (
                <Button size="sm" disabled={pendingAction || ingestWorkerStatus !== "alive" || detailUnavailable} onClick={() => void runAction("start")}>
                  {preflight.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-2 h-3.5 w-3.5" />}
                  {preflight.isPending ? "Checking" : "Start"}
                </Button>
              )}
              {campaign.state === "running" && (
                <Button
                  ref={pauseButtonRef}
                  variant="outline"
                  size="sm"
                  disabled={pendingAction || detailUnavailable}
                  onClick={() => void runAction("pause")}
                >
                  <Pause className="mr-2 h-3.5 w-3.5" /> Pause
                </Button>
              )}
              {!TERMINAL_STATES.has(campaign.state) && (
                <Button variant="outline" size="sm" disabled={pendingAction || detailUnavailable} className="text-red-600" onClick={() => setConfirmingCancel(true)}>
                  <Ban className="mr-2 h-3.5 w-3.5" /> Cancel
                </Button>
              )}
            </div>
          </div>

          {detailUnavailable && (
            <QueryError
              message="Campaign detail is unavailable. Controls are disabled to avoid acting on stale data."
              onRetry={() => void detailQuery.refetch()}
            />
          )}

          {confirmingCancel && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Cancel {campaign.campaignKey}?</p>
                <p className="mt-1 text-red-700">
                  This is terminal. The campaign cannot be resumed after {formatNumber(campaign.progress.uniqueWorks)} unique papers.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" disabled={pendingAction} onClick={() => setConfirmingCancel(false)}>Keep running</Button>
                <Button variant="destructive" size="sm" disabled={pendingAction} onClick={() => void runAction("cancel")}>Confirm cancel</Button>
              </div>
            </div>
          )}

          {campaign.state === "running" && ingestWorkerStatus !== "alive" && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The campaign is running but no healthy ingest worker is visible. Start the worker before expecting progress.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <ProgressMetric
              label="Unique papers"
              value={`${formatNumber(campaign.progress.uniqueWorks)} / ${formatNumber(campaign.targetUniqueWorks)}`}
              percent={metrics.uniquePct}
            />
            <ProgressMetric
              label="Completed partitions"
              value={`${formatNumber(campaign.progress.completedPartitions)} / ${formatNumber(campaign.progress.plannedPartitions)}`}
              percent={metrics.partitionPct}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Committed pages" value={campaign.progress.committedPages} />
            <Metric label="Accepted rows" value={campaign.progress.acceptedWorks} />
            <Metric label="Rejected rows" value={campaign.progress.rejectedWorks} warning={campaign.progress.rejectedWorks > 0} />
            <Metric label="Identity conflicts" value={campaign.progress.conflictWorks} warning={campaign.progress.conflictWorks > 0} />
          </div>
          <p className="text-xs text-muted-foreground">
            Campaign counters are reconciled in batches, so committed progress may update after several fetched pages.
          </p>

          {detailQuery.data && (
            <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
              <StateSummary title="Partition states" rows={detailQuery.data.partitions} />
              <StateSummary title="Attempt states" rows={detailQuery.data.attempts} />
            </div>
          )}
          <CorpusValidationPanel
            campaignId={campaign._id}
            campaignKey={campaign.campaignKey}
            workerStatus={corpusValidationWorkerStatus}
            onReviewPause={() => {
              pauseButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              pauseButtonRef.current?.focus({ preventScroll: true });
            }}
          />
          {(campaign.failureReason || campaign.completionNote) && (
            <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
              {campaign.failureReason ?? campaign.completionNote}
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}

function CampaignStateBadge({ state }: { state: OpenAlexCampaignState }) {
  const danger = state === "failed" || state === "completed_with_shortfall";
  const healthy = state === "running" || state === "completed";
  return (
    <Badge variant="outline" className={cn(
      "rounded-full capitalize",
      healthy && "border-emerald-200 bg-emerald-50 text-emerald-700",
      danger && "border-red-200 bg-red-50 text-red-700",
    )}>
      {state.replaceAll("_", " ")}
    </Badge>
  );
}

function ProgressMetric({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="font-mono text-sm font-semibold">{value}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number(percent.toFixed(2))}
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-right text-xs text-muted-foreground">{percent.toFixed(2)}%</p>
    </div>
  );
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-lg font-bold", warning && "text-amber-600")}>{formatNumber(value)}</p>
    </div>
  );
}

function StateSummary({ title, rows }: { title: string; rows: Array<{ state: string; count: number }> }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {rows.length === 0 ? <span className="text-xs text-muted-foreground">No records</span> : rows.map((row) => (
          <Badge key={row.state} variant="secondary" className="font-normal">
            {row.state.replaceAll("_", " ")}: {formatNumber(row.count)}
          </Badge>
        ))}
      </div>
    </div>
  );
}
