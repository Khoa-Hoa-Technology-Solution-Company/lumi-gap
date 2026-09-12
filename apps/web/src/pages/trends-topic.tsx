import React, { useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { ArrowLeft, Sparkles, TrendingUp, BookOpen, Users, Hash, Loader2, Search, HelpCircle, FileText, AlertCircle, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTopicTrend } from "@/features/trends/hooks/use-trends";
import type { TrendFacetBucket } from "@trend/shared-types";
import { formatNumber } from "@/utils";
import { useI18n } from "@/i18n";

export function TopicDetailPage() {
  const { t } = useI18n();
  const { topic } = useParams<{ topic: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const decodedTopic = decodeURIComponent(topic || "");
  const topicId = searchParams.get("topicId") ?? undefined;

  const { data, isLoading, isError } = useTopicTrend(decodedTopic, topicId ? { topicId } : undefined);
  const [citationMode, setCitationMode] = useState<"total" | "avg">("total");

  // Chart 1: Publication breakdown
  const pubChartData = useMemo(() => {
    if (!data?.yearlyBreakdown) return [];
    return data.yearlyBreakdown.map(y => ({
      year: String(y.year),
      publications: y.count,
      isYTD: y.year > (data.lastCompleteYear ?? 0),
    })).sort((a, b) => Number(a.year) - Number(b.year));
  }, [data]);

  // Chart 2: Citations breakdown
  const citationChartData = useMemo(() => {
    if (!data?.citationTrend) return [];
    return data.citationTrend.map(c => ({
      year: String(c.year),
      citations: citationMode === "total" ? c.totalCitations : parseFloat(c.avgCitations.toFixed(1)),
      isYTD: c.year > (data.lastCompleteYear ?? 0),
    })).sort((a, b) => Number(a.year) - Number(b.year));
  }, [data, citationMode]);

  const hasYTD = useMemo(() => {
    if (!data?.yearlyBreakdown || !data.lastCompleteYear) return false;
    return data.yearlyBreakdown.some(y => y.year > data.lastCompleteYear);
  }, [data]);

  if (isLoading) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className="text-slate-500 font-medium">Analyzing deep dive data for "{decodedTopic}"...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-red-500 font-bold mb-2">Failed to load topic data.</p>
        <p className="text-sm text-slate-500 mb-4">The topic "{decodedTopic}" might not have enough active papers or does not exist.</p>
        <Button onClick={() => navigate("/trends")} variant="outline" className="rounded-full">Back to Trends</Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Navigation & Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate("/trends")}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-4 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Trends Overview
        </button>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white capitalize tracking-tight">{decodedTopic}</h1>
              {data.growthRatePct > 100 ? (
                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400 animate-pulse border border-red-200/50 dark:border-red-900/30 shrink-0">
                  🔥 Hot Topic
                </span>
              ) : data.growthRatePct > 20 ? (
                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30 shrink-0">
                  📈 Rising
                </span>
              ) : null}
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm max-w-2xl leading-relaxed">
              Detailed metadata and performance analysis for this research area. Computed from publication volume, citation trends, and OpenAlex taxonomy tags.
            </p>
          </div>

          {/* Quick Actions Panel (Premium Aligned Flexbox) */}
          <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0 select-none">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-lg font-bold gap-1.5 text-xs border-slate-200 dark:border-slate-800 shadow-sm"
              onClick={() => navigate(`/search?q=${encodeURIComponent(decodedTopic)}`)}
            >
              <Search className="w-3.5 h-3.5 text-slate-500" /> Search Papers
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-lg font-bold gap-1.5 text-xs border-amber-250 dark:border-amber-900/30 hover:bg-amber-50/50 dark:hover:bg-amber-950/10 shadow-sm text-slate-700 dark:text-slate-350"
              onClick={() => navigate(`/research-gaps?topic=${encodeURIComponent(decodedTopic)}`)}
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-600" /> Find Gaps
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-lg font-bold gap-1.5 text-xs border-slate-200 dark:border-slate-800 shadow-sm"
              onClick={() =>
                navigate(
                  `/trends?compare=${encodeURIComponent(decodedTopic)}&focus=${encodeURIComponent(decodedTopic)}`,
                )
              }
            >
              <Users className="w-3.5 h-3.5 text-blue-600" /> Compare Topic
            </Button>
            <Button
              className="h-9 px-3.5 bg-[#001b69] hover:bg-[#001040] text-white shadow-sm rounded-lg text-xs font-bold gap-1.5 border border-blue-900/10"
              onClick={() => navigate(`/reports?topic=${encodeURIComponent(decodedTopic)}&create=true`)}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" fill="currentColor" /> Generate AI Report
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KPIMetricCard
          title={t("Total Papers")}
          value={formatNumber(data.totalPapers)}
          subtitle={t("Publications in window")}
          icon={<FileText className="w-5 h-5 text-blue-600" />}
        />
        <KPIMetricCard
          title={t("YoY Growth")}
          value={data.growthRatePct > 0 ? `+${data.growthRatePct.toFixed(1)}%` : `${data.growthRatePct.toFixed(1)}%`}
          subtitle={t("Last complete year ({{year}})", { year: data.lastCompleteYear })}
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          valueColor={data.growthRatePct > 0 ? "text-emerald-600" : "text-red-500"}
        />
        <KPIMetricCard
          title={t("CAGR (3Y)")}
          value={data.cagr3yPct !== null ? `+${data.cagr3yPct.toFixed(1)}%` : "N/A"}
          subtitle={t("Compounded growth rate")}
          icon={<Award className="w-5 h-5 text-blue-600" />}
          valueColor="text-blue-600"
        />
        <KPIMetricCard
          title={t("Momentum")}
          value={data.momentum > 0 ? `+${data.momentum.toFixed(2)}` : data.momentum.toFixed(2)}
          subtitle={t("Least-squares slope")}
          icon={<Sparkles className="w-5 h-5 text-purple-600" />}
          valueColor="text-purple-600"
        />
      </div>

      {/* Year-to-Date / Completeness Warning */}
      {hasYTD && (
        <div className="mb-8 px-4 py-3 bg-amber-50/50 dark:bg-amber-950/15 border-l-2 border-amber-500 rounded-r-xl text-xs text-amber-700 dark:text-amber-300 select-none flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Note on Year-to-Date (YTD) Data:</strong> Charts display current year data. However, growth rates and CAGR calculations exclude YTD periods to avoid incomplete-year bias. The last complete year is <strong>{data.lastCompleteYear}</strong>.
          </span>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

        {/* Chart 1: Publications Volume */}
        <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">Publication Volume</h3>
            </div>
            <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 uppercase tracking-wider select-none">
              Papers / Year
            </span>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pubChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis
                  dataKey="year"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                />
                <Tooltip
                  content={<CustomTooltip metricName="Publications" />}
                />
                <Area
                  type="monotone"
                  dataKey="publications"
                  stroke="#2563eb"
                  strokeWidth={3}
                  fillOpacity={0.06}
                  fill="#2563eb"
                  activeDot={{ r: 5, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Citation Trend */}
        <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2 select-none">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600" />
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">Citation Trend</h3>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-full border border-slate-200/50 dark:border-slate-800/50">
              <Button
                variant={citationMode === "total" ? "default" : "ghost"}
                size="sm"
                onClick={() => setCitationMode("total")}
                className="h-7 px-3 text-[10px] font-bold rounded-full"
              >
                Total
              </Button>
              <Button
                variant={citationMode === "avg" ? "default" : "ghost"}
                size="sm"
                onClick={() => setCitationMode("avg")}
                className="h-7 px-3 text-[10px] font-bold rounded-full"
              >
                Avg
              </Button>
            </div>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={citationChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis
                  dataKey="year"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                />
                <Tooltip
                  content={<CustomTooltip metricName={citationMode === "total" ? "Total Citations" : "Average Citations"} />}
                />
                <Area
                  type="monotone"
                  dataKey="citations"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={0.06}
                  fill="#10b981"
                  activeDot={{ r: 5, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Info Strip: Formulas Explanation */}
      <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800/70 rounded-2xl p-6 shadow-sm mb-8 select-none">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-600" />
          Understanding the Trend Metrics Formulas
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-600 dark:text-slate-400">
          <div className="space-y-1.5">
            <h4 className="font-bold text-slate-800 dark:text-white">1. Growth YoY (Year-over-Year)</h4>
            <p className="leading-relaxed">
              Computed as the percentage change in paper volume between the last complete year (<strong>{data.lastCompleteYear}</strong>) and the year preceding it. Formulated to handle initial zero bases smoothly without triggering division-by-zero errors.
            </p>
          </div>
          <div className="space-y-1.5">
            <h4 className="font-bold text-slate-800 dark:text-white">2. CAGR (3-Year Compound Growth)</h4>
            <p className="leading-relaxed">
              Measures the geometric compound annual growth rate over the last 3 complete years. It represents a smoothed representation of the growth trajectory. Returns N/A if the starting year count is zero or the history is too brief.
            </p>
          </div>
          <div className="space-y-1.5">
            <h4 className="font-bold text-slate-800 dark:text-white">3. Momentum Score</h4>
            <p className="leading-relaxed">
              Calculated using the least-squares linear regression slope of annual publication volume over the entire time window. Represents the change velocity in units of <em>papers/year</em>. A steeper positive slope signals a hotter research trend.
            </p>
          </div>
        </div>
      </div>

      {/* Deep-dive Lists: Authors, Journals, Keywords */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">

        {/* Top Journals */}
        <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-0 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800/50 flex items-center gap-2 select-none">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Journals & Sources</h3>
          </div>
          <div className="flex-1 overflow-auto max-h-[360px]">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.topJournals?.map((item) => (
                <li key={item.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 flex items-start justify-between gap-4">
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{item.name}</span>
                  <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">{item.count}</span>
                </li>
              ))}
              {(!data.topJournals || data.topJournals.length === 0) && (
                <p className="p-4 text-xs text-slate-500 italic">No source metadata found.</p>
              )}
            </ul>
          </div>
        </div>

        {/* Top Authors */}
        <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-0 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800/50 flex items-center gap-2 select-none">
            <Users className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Key Authors</h3>
          </div>
          <div className="flex-1 overflow-auto max-h-[360px]">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.topAuthors?.map((item) => (
                <li key={item.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 flex items-start justify-between gap-4">
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{item.name}</span>
                  <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">{item.count}</span>
                </li>
              ))}
              {(!data.topAuthors || data.topAuthors.length === 0) && (
                <p className="p-4 text-xs text-slate-500 italic">No author metadata found.</p>
              )}
            </ul>
          </div>
        </div>

        {/* Top Keywords */}
        <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-0 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800/50 flex items-center gap-2 select-none">
            <Hash className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Co-occurring Keywords</h3>
          </div>
          <div className="flex-1 overflow-auto max-h-[360px]">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.topKeywords?.map((item) => (
                <li key={item.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 flex items-start justify-between gap-4">
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-300 capitalize line-clamp-2">{item.name}</span>
                  <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">{item.count}</span>
                </li>
              ))}
              {(!data.topKeywords || data.topKeywords.length === 0) && (
                <p className="p-4 text-xs text-slate-500 italic">No keyword co-occurrences.</p>
              )}
            </ul>
          </div>
        </div>

      </div>

      {/* Topic-specific Context Facets Panel */}
      {data.facets && (
        <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm mb-8">
          <div className="mb-6 select-none">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Topic Facets Context</h3>
            <p className="text-xs text-slate-500 mt-1">Breakdown of active publications under this specific topic by scholarly facets.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <TopicFacetGroup title="Paper Types" buckets={data.facets.paperKinds} total={data.totalPapers} />
            <TopicFacetGroup title="Open Access" buckets={data.facets.openAccessStatuses} total={data.totalPapers} />
            <TopicFacetGroup title="Providers" buckets={data.facets.providers} total={data.totalPapers} />
            <TopicFacetGroup title="Citation Bands" buckets={data.facets.citationBands} total={data.totalPapers} />
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponents helper for topic facets page
function KPIMetricCard({
  title,
  value,
  subtitle,
  icon,
  valueColor = "text-slate-900 dark:text-white"
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between select-none">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider mb-2 uppercase">{title}</h4>
          <div className={`text-2xl font-black leading-none ${valueColor}`}>{value}</div>
        </div>
        <div className="p-2 bg-slate-50 rounded-lg shrink-0 dark:bg-zinc-800">
          {icon}
        </div>
      </div>
      <div className="text-xs font-medium text-slate-500">
        {subtitle}
      </div>
    </div>
  );
}

type TopicTooltipPayload = Array<{
  payload: {
    isYTD?: boolean;
  };
  value?: number;
}>;

function TopicFacetGroup({ title, buckets, total }: { title: string; buckets: TrendFacetBucket[]; total: number }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{title}</h4>
      <div className="space-y-2.5">
        {(buckets ?? []).slice(0, 4).map((b) => {
          const percentage = total > 0 ? Math.min(100, Math.round((b.count / total) * 100)) : 0;
          return (
            <div key={b.id || b.name} className="text-xs group select-none">
              <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300 mb-1">
                <span className="truncate max-w-[140px] capitalize" title={b.name}>{b.name}</span>
                <span className="text-slate-500 dark:text-slate-400 font-normal shrink-0">{formatNumber(b.count)}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
        {(!buckets || buckets.length === 0) && (
          <p className="text-xs text-slate-400 italic">No data available</p>
        )}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, metricName }: { active?: boolean; payload?: TopicTooltipPayload; label?: string; metricName: string }) {
  if (active && payload && payload.length) {
    const firstPayload = payload[0];
    if (!firstPayload) return null;
    const data = firstPayload.payload;
    const value = firstPayload.value ?? 0;
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-md text-xs select-none">
        <p className="font-extrabold text-slate-900 dark:text-white mb-1.5">Year: {label}</p>
        <p className="font-bold text-blue-600 dark:text-blue-400">
          {metricName}: <span className="font-black text-slate-900 dark:text-white">{formatNumber(value)}</span>
          {data.isYTD && <span className="text-[9px] text-amber-500 font-black ml-1.5 uppercase">YTD</span>}
        </p>
      </div>
    );
  }
  return null;
}
