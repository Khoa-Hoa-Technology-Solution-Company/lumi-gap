import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants/api";
import { useCurrentUser } from "@/features/auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import {
  Search, Sparkles, Cpu, History, BarChart3, Settings,
  ArrowRight, Clock, Loader2, TrendingUp, Briefcase, Calendar
} from "lucide-react";
import {
  totalSearchVolume,
  averageSearchesPerDay,
  getTopQueryLabel,
  buildSearchTarget,
  fillMissingDays
} from "./dashboard.helpers";
import type { TopQuery, VolumeByDay } from "@trend/shared-types";
import { formatNumber } from "@/utils";
import { useI18n } from "@/i18n";

// Hook 1: Admin Dashboard Analytics
function useDashboard(days: number, enabled: boolean) {
  return useQuery({
    queryKey: ["analytics", "dashboard", days],
    queryFn: async () => {
      const res = await api.get(API_ROUTES.analytics.dashboard, { params: { days } });
      return res.data.data as { topQueries: TopQuery[]; volumeByDay: VolumeByDay[]; days: number };
    },
    staleTime: 60_000,
    enabled,
  });
}

// Hook 2: User Search History
function useMySearchHistory() {
  return useQuery({
    queryKey: ["analytics", "me"],
    queryFn: async () => {
      const res = await api.get(API_ROUTES.analytics.me);
      return res.data.data as Array<{ query: string; mode: string; resultCount: number; createdAt: string }>;
    },
    staleTime: 30_000,
  });
}

// Hook 3: Public Platform Summary Stats
function useSearchSummary() {
  return useQuery({
    queryKey: ["analytics", "summary"],
    queryFn: async () => {
      const res = await api.get(API_ROUTES.analytics.summary);
      return res.data.data as { totalSearches: number; totalPapers: number; uniqueUsers: number };
    },
    staleTime: 60_000,
  });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const isAdmin = user?.user?.role === "admin";
  const [days, setDays] = useState<7 | 14 | 30>(7);

  // APIs
  const { data: dash, isLoading: isDashLoading, isError: isDashError } = useDashboard(days, isAdmin);
  const { data: history, isLoading: isHistoryLoading, isError: isHistoryError } = useMySearchHistory();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useSearchSummary();

  // Admin KPI calculations
  const totalSearchesRange = useMemo(() => {
    return dash?.volumeByDay ? totalSearchVolume(dash.volumeByDay) : 0;
  }, [dash]);

  const avgSearchesDay = useMemo(() => {
    return dash?.volumeByDay ? averageSearchesPerDay(dash.volumeByDay, days) : 0;
  }, [dash, days]);

  const filledVolumeByDay = useMemo(() => {
    return dash?.volumeByDay ? fillMissingDays(dash.volumeByDay, days) : [];
  }, [dash, days]);

  const topQueryLabel = useMemo(() => {
    return dash?.topQueries ? getTopQueryLabel(dash.topQueries) : "No query yet";
  }, [dash]);

  return (
    <main className="container py-8 space-y-8 select-none">
      {isUserLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      ) : (
        <PageHeader
          title={isAdmin ? "Analytics Dashboard" : "My Research Dashboard"}
          description={
            isAdmin
              ? "Search usage stats, user trends, and platform action center."
              : `Welcome back, ${user?.user?.email ?? "researcher"}. Continue your research workflow.`
          }
        />
      )}

      {/* 1. Quick Actions Section (Available to everyone) */}
      <section>
        <h2 className="text-sm font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ActionCard
            title="Search Papers"
            description="Find papers using Boolean or AI Semantic search"
            icon={<Search className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
            onAction={() => navigate("/search")}
          />
          <ActionCard
            title="Explore Trends"
            description="Track topic popularity and emerging keywords"
            icon={<TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
            onAction={() => navigate("/trends")}
          />
          <ActionCard
            title="Create AI Report"
            description="Generate scholarly report for any research topic"
            icon={<Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
            onAction={() => navigate("/reports?create=true")}
          />
          <ActionCard
            title="My Projects"
            description="Organize your bibliography and search bookmarks"
            icon={<Briefcase className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
            onAction={() => navigate("/projects")}
          />
        </div>
      </section>

      {/* 2. Platform Summary Stats (Available to everyone) */}
      <section>
        <h2 className="text-sm font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Platform Overview</h2>
        {isSummaryLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : isSummaryError ? (
          <div className="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 rounded-2xl text-sm text-red-600">
            Failed to load platform stats summary.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPICard
              title="Papers in Corpus"
              value={formatNumber(summary?.totalPapers)}
              subtitle="Total scholarly works indexed"
              icon={<Briefcase className="w-5 h-5 text-blue-600" />}
            />
            <KPICard
              title="Platform Search Volume"
              value={formatNumber(summary?.totalSearches)}
              subtitle="All-time search requests served"
              icon={<Search className="w-5 h-5 text-emerald-600" />}
            />
            <KPICard
              title="Active Search Users"
              value={formatNumber(summary?.uniqueUsers)}
              subtitle="Unique researcher accounts"
              icon={<Calendar className="w-5 h-5 text-purple-600" />}
            />
          </div>
        )}
      </section>

      {/* 3. My Recent Searches Section (Available to everyone) */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">My Recent Searches</h2>
        </div>
        {isHistoryLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 rounded-xl w-full" />
            <Skeleton className="h-12 rounded-xl w-full" />
            <Skeleton className="h-12 rounded-xl w-full" />
          </div>
        ) : isHistoryError ? (
          <div className="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 rounded-2xl text-sm text-red-600">
            Failed to load your recent search logs.
          </div>
        ) : !history || history.length === 0 ? (
          <div className="py-10 text-center bg-white dark:bg-[#121212] border border-slate-200/80 dark:border-slate-800/80 border-dashed rounded-2xl p-6 select-none">
            <p className="text-sm text-slate-500 mb-4">No recent searches logged yet. Start exploring now!</p>
            <Button
              onClick={() => navigate("/search")}
              className="bg-blue-700 hover:bg-blue-800 text-white rounded-full font-bold shadow-md animate-pulse"
            >
              Start Searching
            </Button>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 dark:bg-slate-900/20">
                  <tr>
                    <th className="px-6 py-3 font-medium">Search Query</th>
                    <th className="px-6 py-3 font-medium text-center">Search Mode</th>
                    <th className="px-6 py-3 font-medium text-right">Result Count</th>
                    <th className="px-6 py-3 font-medium text-center">Searched On</th>
                    <th className="px-6 py-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.slice(0, 10).map((h, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200 capitalize truncate max-w-xs" title={h.query}>
                        {h.query}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          h.mode === 'semantic' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' :
                          'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300'
                        }`}>
                          {h.mode}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-600 dark:text-slate-400">
                        {formatNumber(h.resultCount)} papers
                      </td>
                      <td className="px-6 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                        {new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => navigate(buildSearchTarget(h.query))}
                            className="text-xs font-extrabold text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            Run
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/reports?create=true&query=${encodeURIComponent(h.query)}`)}
                            className="text-xs font-extrabold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                          >
                            Report
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 4. Admin Analytics Section (Available to Admins only) */}
      {isAdmin && (
        <section className="border-t border-slate-200 dark:border-slate-800 pt-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Admin Analytics</h2>
              <p className="text-xs text-slate-500 mt-1">Real-time system usage trends and user demand data.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
              <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-full border border-slate-200/60 dark:border-slate-700/60 w-full sm:w-auto">
                <Button variant={days === 7 ? "default" : "ghost"} size="sm" onClick={() => setDays(7)} className="h-7 px-3 text-[11px] font-bold rounded-full flex-1 sm:flex-none">7 Days</Button>
                <Button variant={days === 14 ? "default" : "ghost"} size="sm" onClick={() => setDays(14)} className="h-7 px-3 text-[11px] font-bold rounded-full flex-1 sm:flex-none">14 Days</Button>
                <Button variant={days === 30 ? "default" : "ghost"} size="sm" onClick={() => setDays(30)} className="h-7 px-3 text-[11px] font-bold rounded-full flex-1 sm:flex-none">30 Days</Button>
              </div>
              <Button
                onClick={() => navigate("/admin")}
                className="w-full sm:w-auto h-9 px-4 bg-slate-800 hover:bg-slate-900 text-white dark:bg-zinc-800 dark:hover:bg-zinc-700 font-extrabold rounded-full text-xs shadow gap-1.5 flex justify-center items-center"
              >
                Open Admin Overview <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {isDashLoading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Skeleton className="h-28 rounded-2xl" />
                <Skeleton className="h-28 rounded-2xl" />
                <Skeleton className="h-28 rounded-2xl" />
              </div>
              <Skeleton className="h-64 rounded-2xl w-full" />
              <Skeleton className="h-64 rounded-2xl w-full" />
            </div>
          ) : isDashError ? (
            <div className="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 rounded-2xl text-sm text-red-600">
              Failed to load admin dashboard analytics.
            </div>
          ) : dash?.volumeByDay?.length === 0 && dash?.topQueries?.length === 0 ? (
            <div className="py-12 text-center text-slate-500 border rounded-2xl border-dashed">
              No analytics data available for the selected {days}-day period.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Admin KPI stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPICard
                  title={`Searches (${days}d)`}
                  value={formatNumber(totalSearchesRange)}
                  subtitle="Total searches in selected range"
                  icon={<Search className="w-5 h-5 text-blue-600" />}
                />
                <KPICard
                  title="Avg Searches/Day"
                  value={avgSearchesDay.toString()}
                  subtitle="Daily search query frequency"
                  icon={<Calendar className="w-5 h-5 text-emerald-600" />}
                />
                <KPICard
                  title="Top Query"
                  value={topQueryLabel}
                  subtitle="Most frequently searched term"
                  icon={<Sparkles className="w-5 h-5 text-purple-600" />}
                />
              </div>

              {/* Volume By Day Line Chart */}
              <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="mb-6">
                  <h3 className="text-base font-extrabold text-slate-800 dark:text-white leading-tight">Search volume by day</h3>
                  <p className="text-xs text-slate-500 mt-1">Number of searches logged in the selected time range.</p>
                </div>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filledVolumeByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 550 }}
                        dy={8}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 550 }}
                        tickFormatter={(value) => value === 0 ? '' : value}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                        labelStyle={{ fontWeight: 'bold', color: '#0f172a' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#1d4ed8"
                        strokeWidth={3}
                        dot={{ r: 3, stroke: "#1d4ed8", strokeWidth: 1, fill: "#fff" }}
                        activeDot={{ r: 5, fill: "#1d4ed8", strokeWidth: 2, stroke: "#fff" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Queries Bar Chart */}
              <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="mb-6">
                  <h3 className="text-base font-extrabold text-slate-800 dark:text-white leading-tight">Top repeated queries</h3>
                  <p className="text-xs text-slate-500 mt-1">Most frequently searched text across users, useful for understanding research demand.</p>
                </div>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dash?.topQueries ?? []} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 5 }}>
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 550 }}
                      />
                      <YAxis
                        dataKey="query"
                        type="category"
                        width={160}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 550 }}
                        tickFormatter={(value) => typeof value === 'string' && value.length > 25 ? value.substring(0, 22) + '...' : value}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#3b82f6"
                        radius={[0, 6, 6, 0]}
                        barSize={16}
                      >
                        {(dash?.topQueries ?? []).map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={index === 0 ? '#1d4ed8' : '#60a5fa'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// Subcomponent 1: Action Card (Premium Glassmorphic Link Card)
function ActionCard({
  title,
  description,
  icon,
  onAction,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onAction: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onAction}
      className="relative overflow-hidden bg-white/70 dark:bg-[#121212]/70 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 text-left hover:shadow-lg hover:scale-[1.02] active:scale-95 transition-all duration-300 group flex flex-col justify-between h-36"
    >
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 dark:from-blue-500/10 dark:to-indigo-500/10 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform duration-500" />
      <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl w-fit group-hover:bg-blue-50 dark:group-hover:bg-blue-950/30 transition-colors duration-300">
        {icon}
      </div>
      <div className="mt-3">
        <p className="text-sm font-extrabold text-slate-800 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">{t(title)}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">{t(description)}</p>
      </div>
    </button>
  );
}

// Subcomponent 2: KPI Card
function KPICard({
  title,
  value,
  subtitle,
  icon
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between h-28 relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-slate-500/3 to-blue-500/3 rounded-bl-full pointer-events-none" />
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 tracking-widest uppercase">{title}</h4>
          <div className="text-2xl font-bold text-slate-900 dark:text-white leading-none mt-2 select-text">{value}</div>
        </div>
        <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl shrink-0">
          {icon}
        </div>
      </div>
      {subtitle && (
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate mt-1">
          {subtitle}
        </div>
      )}
    </div>
  );
}
