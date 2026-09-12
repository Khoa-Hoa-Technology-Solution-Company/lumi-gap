import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminStats, useQualityAgreement } from "@/features/admin";
import { useCurrentUser } from "@/features/auth";
import type { AgreementBucket } from "@trend/shared-types";
import {
  Users, FileText, Lightbulb, BookOpen, Scale,
  RefreshCw, Database, Activity, AlertTriangle, CheckCircle2, XCircle, ChevronRight
} from "lucide-react";
import { useSyncRuns, useEmbedStatus } from "@/features/admin/hooks/use-admin-sync";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api-client";
import { Link } from "react-router-dom";
import { formatNumber } from "@/utils";

export function AdminHomePage() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.user?.role === "admin";
  const { data, isLoading } = useAdminStats(isAdmin);
  const { data: agreement } = useQualityAgreement(isAdmin);

  // Hook 1: Fetch Sync Runs
  const { data: runs, isLoading: isRunsLoading } = useSyncRuns(isAdmin);

  // Hook 2: Fetch Embedding Status
  const { data: embedStatus, isLoading: isEmbedLoading } = useEmbedStatus(isAdmin);

  // Hook 3: Custom query for pending paper requests count
  const { data: pendingPapersCount, isLoading: isPendingPapersLoading } = useQuery({
    queryKey: ["admin", "pendingPapersCount"],
    queryFn: async () => {
      const res = await api.get("/papers", { params: { adminView: "1", status: "pending", pageSize: 1 } });
      return res.data.meta?.total as number;
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const agreementRows: { label: string; b: AgreementBucket }[] = agreement
    ? [
        { label: "Total", b: agreement },
        { label: "Report", b: agreement.byKind.report },
        { label: "Gap", b: agreement.byKind.gap },
        { label: "Paper", b: agreement.byKind.paper },
      ]
    : [];

  const cards = [
    { label: "Users", value: data?.users.total, icon: Users },
    { label: "Papers", value: data?.papers, icon: BookOpen },
    { label: "AI Reports", value: data?.reports, icon: FileText },
    { label: "Research Gaps", value: data?.gaps, icon: Lightbulb },
  ];

  // Operations stats calculations
  const totalSyncRuns = runs?.length ?? 0;
  const isPipelineRunning = runs?.some((r) => r.runStatus === "running") ?? false;
  const latestRun = runs?.[0] ?? null;
  const failedRunsCount = runs?.filter(r => r.runStatus === "failed").length ?? 0;

  const embeddingProgress = embedStatus?.totalPapers
    ? Math.round((embedStatus.embeddedPapers / embedStatus.totalPapers) * 1000) / 10
    : 0;

  return (
    <main className="space-y-8 select-none">
      <PageHeader title="Admin Overview" description="System statistics and analytics." />

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 text-3xl font-bold tabular-nums">
              {isLoading || value === undefined ? <Skeleton className="h-8 w-16" /> : formatNumber(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Users Role Breakdowns */}
      {data && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-white">Users by role</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {Object.entries(data.users.byRole).map(([role, count]) => (
              <span key={role} className="rounded-md bg-muted px-3 py-1 text-xs font-semibold">
                {role}: <strong className="tabular-nums font-bold text-blue-600 dark:text-blue-400">{count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* System Operations Section (New V2 Operations Dashboard) */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-800 dark:text-white">System Operations Dashboard</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Operations KPI side block (5 columns) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Pending Requests KPI */}
            <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Pending Requests</span>
                <div className="text-2xl font-bold tabular-nums flex items-baseline gap-1">
                  {isPendingPapersLoading ? <Skeleton className="h-7 w-12" /> : formatNumber(pendingPapersCount)}
                  <span className="text-[10px] font-semibold text-slate-500 lowercase">papers</span>
                </div>
              </div>
              <Link
                to="/admin/papers"
                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1.5 p-2 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl"
              >
                Manage <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Embedding Health KPI */}
            <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Embedding Index</span>
                <div className="text-2xl font-bold tabular-nums flex items-baseline gap-1">
                  {isEmbedLoading ? <Skeleton className="h-7 w-16" /> : `${embeddingProgress}%`}
                  <span className="text-[10px] font-semibold text-slate-500 lowercase">embedded</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 px-2.5 py-0.5 rounded-full border border-amber-200/30">
                  {formatNumber(embedStatus?.pendingPapers)} pending
                </span>
              </div>
            </div>

            {/* Pipeline Status KPI */}
            <div className="rounded-xl border bg-card p-4 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Sync Pipeline</span>
                <div className="text-sm font-bold flex items-center gap-2 mt-1">
                  {isRunsLoading ? (
                    <Skeleton className="h-5 w-24" />
                  ) : isPipelineRunning ? (
                    <span className="text-amber-500 flex items-center gap-1.5 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sync Running
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> System Idle
                    </span>
                  )}
                </div>
              </div>
              <Link
                to="/admin/sync"
                className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1.5 p-2 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl"
              >
                Sync Panel <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Operations detailed block (7 columns) */}
          <div className="lg:col-span-7 rounded-xl border bg-card p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              Sync & Embedding Health Detail
            </h3>

            {/* Sync status detail list */}
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50/50 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-800/40 rounded-xl p-4">
                <div>
                  <span className="text-slate-500 block">Total Live Sync Runs</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5 block">{formatNumber(totalSyncRuns)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Failed Sync Runs</span>
                  <span className={`text-lg font-bold font-mono mt-0.5 block ${failedRunsCount > 0 ? "text-red-500" : "text-slate-900 dark:text-white"}`}>{formatNumber(failedRunsCount)}</span>
                </div>
              </div>

              {latestRun && (
                <div className="bg-slate-50/50 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-800/40 rounded-xl p-4 space-y-2">
                  <h4 className="font-bold text-slate-700 dark:text-slate-350">Latest Live Sync Run</h4>
                  <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
                    <div>
                      <span>Topic:</span> <strong className="text-slate-900 dark:text-white truncate max-w-[150px] inline-block align-bottom">{latestRun.searchText}</strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Status:</span>
                      {latestRun.runStatus === "succeeded" ? (
                        <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Succeeded</span>
                      ) : latestRun.runStatus === "failed" ? (
                        <span className="text-red-500 font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> Failed</span>
                      ) : (
                        <span className="text-amber-500 font-bold flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> {latestRun.runStatus}</span>
                      )}
                    </div>
                    <div>
                      <span>Inserted:</span> <strong className="text-emerald-600">+{formatNumber(latestRun.totalInserted)} papers</strong>
                    </div>
                    <div>
                      <span>Date:</span> <strong className="text-slate-800 dark:text-white">{new Date(latestRun.startedAt).toLocaleDateString()}</strong>
                    </div>
                  </div>
                </div>
              )}

              {embedStatus && (
                <div className="bg-slate-50/50 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-800/40 rounded-xl p-4 space-y-2">
                  <h4 className="font-bold text-slate-700 dark:text-slate-350">Vector Index Embedding Stats</h4>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 mb-1">
                    <span>Embedding Health Score:</span>
                    <strong className="text-slate-800 dark:text-white font-mono">{embeddingProgress}%</strong>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${embeddingProgress}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>{formatNumber(embedStatus.embeddedPapers)} embedded</span>
                    <span>{formatNumber(embedStatus.totalPapers)} total papers</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* AI vs Human Agreement */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-1 flex items-center gap-2">
          <Scale className="h-4 w-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white">AI vs Human Agreement</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground select-text">
          Compares AI qualitative evaluation score with average human rating, on items evaluated by both.
          <b> MAE</b> low, <b> "within ±1"</b> high, and <b> correlation</b> close to 1 = AI matches humans.
        </p>
        {!agreement || agreement.sampleSize === 0 ? (
          <p className="text-sm text-muted-foreground select-text">
            Not enough data yet — requires items evaluated by both AI and user ratings.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground select-text">
                  <th className="py-2 pr-4 font-semibold">Type</th>
                  <th className="py-2 pr-4 font-semibold">Samples</th>
                  <th className="py-2 pr-4 font-semibold">MAE</th>
                  <th className="py-2 pr-4 font-semibold">Within ±1</th>
                  <th className="py-2 font-semibold">Correlation</th>
                </tr>
              </thead>
              <tbody>
                {agreementRows.map(({ label, b }) => (
                  <tr key={label} className="border-t select-text">
                    <td className="py-2 pr-4 font-medium">{label}</td>
                    <td className="py-2 pr-4 tabular-nums">{b.sampleSize}</td>
                    <td className="py-2 pr-4 tabular-nums">{b.mae.toFixed(2)}</td>
                    <td className="py-2 pr-4 tabular-nums">{b.withinOnePct}%</td>
                    <td className="py-2 tabular-nums">
                      {b.correlation === null ? "—" : b.correlation.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
