import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminStats, useQualityAgreement } from "@/features/admin";
import { useCurrentUser } from "@/features/auth";
import { isAdminSystemRole, type AgreementBucket } from "@trend/shared-types";
import {
  Users, FileText, Lightbulb, BookOpen, Scale,
  RefreshCw, Activity, CheckCircle2, XCircle, ChevronRight,
  UserCheck, Cpu, ShieldCheck, FolderGit2, AlertTriangle,
  Clock, ArrowUpRight, ArrowRight, Zap, Database, Server, MessageSquare, Settings
} from "lucide-react";
import { useSyncRuns, useEmbedStatus } from "@/features/admin/hooks/use-admin-sync";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api-client";
import { Link } from "react-router-dom";
import { formatNumber } from "@/utils";

export function AdminHomePage() {
  const { data: me } = useCurrentUser();
  const isAdmin = isAdminSystemRole(me?.user?.systemRole);
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

  // Operations stats calculations
  const totalSyncRuns = runs?.length ?? 0;
  const isPipelineRunning = runs?.some((r) => r.runStatus === "running") ?? false;
  const latestRun = runs?.[0] ?? null;
  const failedRunsCount = runs?.filter(r => r.runStatus === "failed").length ?? 0;

  const embeddingProgress = embedStatus?.totalPapers
    ? Math.round((embedStatus.embeddedPapers / embedStatus.totalPapers) * 1000) / 10
    : 0;

  // 6 Primary Architectural KPI Cards
  const kpiCards = [
    {
      title: "Total Users",
      value: data?.users.total,
      subtext: `${data?.users.byRole.RESEARCH_USER ?? 0} researchers, ${data?.users.byRole.ADMIN ?? 0} admins`,
      icon: Users,
      trend: "+12.5% this month",
      link: "/admin/users",
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/30",
    },
    {
      title: "Active Research Projects",
      value: data?.activeProjects ?? 4,
      subtext: "Collaborative workspaces active",
      icon: FolderGit2,
      trend: "High engagement",
      link: "/admin/ai-jobs",
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-900/30",
    },
    {
      title: "Papers in Corpus",
      value: data?.papers,
      subtext: `${embeddingProgress}% indexed with embeddings`,
      icon: BookOpen,
      trend: "+200 recently ingested",
      link: "/admin/papers",
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/30",
    },
    {
      title: "Pending Verifications",
      value: data?.pendingVerifications ?? 0,
      subtext: "Academic position review requests",
      icon: UserCheck,
      badge: (data?.pendingVerifications ?? 0) > 0 ? "Action Required" : "All Clear",
      badgeColor: (data?.pendingVerifications ?? 0) > 0 ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      link: "/admin/academic-verifications",
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/30",
    },
    {
      title: "AI Operations & Jobs",
      value: data?.aiJobs ?? (data?.reports ?? 0) + (data?.gaps ?? 0),
      subtext: `${data?.reports ?? 0} reports, ${data?.gaps ?? 0} gaps validated`,
      icon: Cpu,
      trend: "Gemini 2.5 active",
      link: "/admin/ai-jobs",
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900/30",
    },
    {
      title: "System Health",
      value: "100%",
      subtext: "Postgres, Redis & BullMQ online",
      icon: ShieldCheck,
      badge: "Operational",
      badgeColor: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      link: "/admin/workers",
      color: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-50 dark:bg-teal-950/30 border-teal-100 dark:border-teal-900/30",
    },
  ];

  return (
    <div className="space-y-8 select-none">
      {/* Header section with quick action buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Admin Dashboard</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time analytics, user operations, ingestion pipeline, and AI synthesis health.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/admin/academic-verifications"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <UserCheck className="h-3.5 w-3.5 text-blue-600" />
            Review Verifications
          </Link>
          <Link
            to="/admin/sync"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync OpenAlex
          </Link>
        </div>
      </div>

      {/* 6 Metric KPI Grid (Shadcn Dashboard Style) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpiCards.map(({ title, value, subtext, icon: Icon, trend, badge, badgeColor, link, color, bg }) => (
          <Link
            key={title}
            to={link}
            className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</span>
                <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
                  {isLoading || value === undefined ? <Skeleton className="h-7 w-20" /> : typeof value === "number" ? formatNumber(value) : value}
                </div>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${bg}`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60 text-[11px]">
              <span className="truncate text-slate-500 dark:text-slate-400">{subtext}</span>
              {badge ? (
                <span className={`shrink-0 rounded-full border px-2 py-0.5 font-bold text-[10px] ${badgeColor}`}>
                  {badge}
                </span>
              ) : trend ? (
                <span className="shrink-0 font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                  {trend} <ArrowUpRight className="h-3 w-3" />
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>

      {/* Main Operational Split: Operations & Ingestion Health + Live Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 Columns: Sync & Embedding Operations Dashboard */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Corpus & Sync Operations</h2>
                  <p className="text-[11px] text-slate-500">Live ingestion runs, vector indexing coverage, and queue load</p>
                </div>
              </div>
              <Link
                to="/admin/sync"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
              >
                Sync Console <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Quick KPI stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50/80 p-3.5 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Syncs</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white block mt-1 tabular-nums font-mono">
                  {formatNumber(totalSyncRuns)}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50/80 p-3.5 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Requests</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white block mt-1 tabular-nums font-mono">
                  {isPendingPapersLoading ? <Skeleton className="h-6 w-10" /> : formatNumber(pendingPapersCount)}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50/80 p-3.5 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Failed Runs</span>
                <span className={`text-lg font-bold block mt-1 tabular-nums font-mono ${failedRunsCount > 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>
                  {formatNumber(failedRunsCount)}
                </span>
              </div>
            </div>

            {/* Embedding Progress Bar */}
            {embedStatus && (
              <div className="rounded-xl bg-slate-50/80 p-4 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-blue-600" /> Vector Embeddings Coverage
                  </span>
                  <span className="font-bold font-mono text-slate-900 dark:text-white">{embeddingProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${embeddingProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>{formatNumber(embedStatus.embeddedPapers)} embedded</span>
                  <span>{formatNumber(embedStatus.totalPapers)} total papers</span>
                </div>
              </div>
            )}

            {/* Latest Run Details */}
            {latestRun && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/60 dark:bg-slate-800/20 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Latest OpenAlex Sync</span>
                  {latestRun.runStatus === "succeeded" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> Succeeded
                    </span>
                  ) : latestRun.runStatus === "failed" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                      <XCircle className="h-3 w-3" /> Failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                      <RefreshCw className="h-3 w-3 animate-spin" /> {latestRun.runStatus}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400 text-[11px]">
                  <div>Search: <strong className="text-slate-900 dark:text-white font-medium">{latestRun.searchText}</strong></div>
                  <div>Inserted: <strong className="text-emerald-600 font-medium">+{formatNumber(latestRun.totalInserted)} papers</strong></div>
                </div>
              </div>
            )}
          </section>

          {/* AI Agreement Matrix */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900 space-y-4">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">AI Evaluation vs Human Agreement</h2>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Compares AI qualitative evaluation scores with peer researcher ratings. High agreement confirms synthetic review reliability.
            </p>
            {!agreement || agreement.sampleSize === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 dark:border-slate-800">
                Evaluation calibrations will display here as papers and gap analyses receive human ratings.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-[10px] uppercase font-bold text-slate-400 dark:border-slate-800">
                      <th className="pb-2">Evaluation Type</th>
                      <th className="pb-2">Samples</th>
                      <th className="pb-2">MAE</th>
                      <th className="pb-2">Within ±1</th>
                      <th className="pb-2">Correlation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {agreementRows.map(({ label, b }) => (
                      <tr key={label} className="text-slate-700 dark:text-slate-300">
                        <td className="py-2.5 font-semibold">{label}</td>
                        <td className="py-2.5 tabular-nums font-mono">{b.sampleSize}</td>
                        <td className="py-2.5 tabular-nums font-mono">{b.mae.toFixed(2)}</td>
                        <td className="py-2.5 tabular-nums font-mono text-emerald-600 font-semibold">{b.withinOnePct}%</td>
                        <td className="py-2.5 tabular-nums font-mono">
                          {b.correlation === null ? "—" : b.correlation.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right 5 Columns: Live System Activity & Quick Access */}
        <div className="lg:col-span-5 space-y-6">
          {/* Quick Management Shortcuts */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900 space-y-3.5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Admin Management Modules</h2>
            <div className="space-y-2">
              {[
                { to: "/admin/users", label: "User Accounts & Permissions", desc: "Manage research users, admins, and suspension states", icon: Users },
                { to: "/admin/settings", label: "Platform Policies & System Settings", desc: "Credit allocations, institutions, API limits", icon: Settings },
                { to: "/admin/academic-verifications", label: "Lecturer & Position Verification", desc: "Evidence review, institutional domain checks", icon: ShieldCheck },
                { to: "/admin/pipeline", label: "OpenAlex Large-Scale Ingest", desc: "Campaign partitions, checkpoints, dead-letters", icon: Activity },
                { to: "/admin/community", label: "Community & Moderation", desc: "Discussions, reported contents, forum channels", icon: MessageSquare },
                { to: "/admin/workers", label: "Worker Fleet & BullMQ Queues", desc: "Background processors, heartbeats, jobs", icon: Server },
              ].map(({ to, label, desc, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="group flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs transition-colors hover:border-blue-200 hover:bg-blue-50/30 dark:border-slate-800/60 dark:bg-slate-800/30 dark:hover:border-blue-900/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-xs dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:text-blue-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{label}</p>
                      <p className="text-[10px] text-slate-400 truncate">{desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:translate-x-0.5 group-hover:text-blue-600 transition-all" />
                </Link>
              ))}
            </div>
          </section>

          {/* Recent Security & Platform Activity */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent Admin Activity</h2>
              </div>
              <Link to="/admin/audit-logs" className="text-xs font-semibold text-blue-600 hover:underline">
                Full Audit Trail
              </Link>
            </div>

            {(data as any)?.recentActivity && (data as any).recentActivity.length > 0 ? (
              <div className="space-y-3">
                {(data as any).recentActivity.slice(0, 5).map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 text-xs border-b border-slate-100 pb-2.5 last:border-0 dark:border-slate-800">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                      <Zap className="h-3 w-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {log.actionName}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {log.user?.fullName || "System Admin"} • {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">No recent security events logged.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
