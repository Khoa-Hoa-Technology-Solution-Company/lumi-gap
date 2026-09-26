import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/features/admin";
import {
  CheckCircle2, Database, AlertCircle, RefreshCw, Layers,
  HardDrive, Cpu, ShieldCheck, Play, Activity
} from "lucide-react";
import { formatNumber } from "@/utils";

export function AdminCorpusValidationPage() {
  const queryClient = useQueryClient();
  const [triggering, setTriggering] = useState(false);

  const { data: embedStatus, isLoading } = useQuery({
    queryKey: ["admin", "embedStatus"],
    queryFn: () => adminApi.getEmbedStatus(),
  });

  const { data: campaigns } = useQuery({
    queryKey: ["admin", "campaigns"],
    queryFn: () => adminApi.listOpenAlexCampaigns(),
  });

  const embedMutation = useMutation({
    mutationFn: () => adminApi.triggerEmbedding(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "embedStatus"] });
    },
  });

  const progress = embedStatus?.totalPapers
    ? Math.round((embedStatus.embeddedPapers / embedStatus.totalPapers) * 1000) / 10
    : 0;

  return (
    <div className="space-y-6 select-none">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Corpus Validation & Vector Index</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Validate publication corpus integrity, cosine similarity embeddings, and OpenAlex dataset cohorts.
          </p>
        </div>
        <button
          onClick={() => embedMutation.mutate()}
          disabled={embedMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {embedMutation.isPending ? "Triggering..." : "Trigger Batch Embedding"}
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Embedded Ratio</span>
            <Database className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">{progress}%</div>
          <p className="text-[11px] text-slate-400">Vector representation ready for semantic search</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Pending Embedding</span>
            <Layers className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-amber-600 font-mono tabular-nums">
            {formatNumber(embedStatus?.pendingPapers ?? 0)}
          </div>
          <p className="text-[11px] text-slate-400">Papers queued for vector dimension generator</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Papers</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
            {formatNumber(embedStatus?.totalPapers ?? 0)}
          </div>
          <p className="text-[11px] text-slate-400">Validated research works in publication index</p>
        </div>
      </div>

      {/* Embedding Health Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-600" />
          Embedding Vector Health & Coverage
        </h2>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>{formatNumber(embedStatus?.embeddedPapers ?? 0)} embedded papers</span>
          <span>{formatNumber(embedStatus?.totalPapers ?? 0)} total corpus</span>
        </div>
      </div>

      {/* Ingestion Campaigns List */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-indigo-600" />
          Active Ingest Campaigns & Partitions
        </h2>
        {campaigns && campaigns.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {campaigns.map((c) => (
              <div key={c._id} className="py-3.5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{c.campaignKey}</p>
                  <p className="text-[11px] text-slate-400">{c.campaignKind} • Target: {formatNumber(c.targetUniqueWorks)} works</p>
                </div>
                <span className="rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2.5 py-0.5 text-[10px] font-bold uppercase">
                  {c.state}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-6">No large-scale ingestion campaigns configured.</p>
        )}
      </div>
    </div>
  );
}
