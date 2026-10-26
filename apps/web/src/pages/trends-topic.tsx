import { useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { ArrowLeft, Sparkles, TrendingUp, BookOpen, Users, Hash, Loader2, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTopicTrend } from "@/features/trends/hooks/use-trends";
import { TrendEvidencePanel } from "@/features/trends/components/trend-evidence-panel";
import { DataSourceBadge } from "@/features/trends/components/trend-data-source";
import type { TrendFacetBucket } from "@trend/shared-types";
import { formatNumber } from "@/utils";
import { useI18n } from "@/i18n";
import { getTopicActionTargets } from "./trends.navigation";

function yearParam(params: URLSearchParams, key: string): number | undefined {
  const value = Number(params.get(key));
  return Number.isInteger(value) && value >= 1900 && value <= 2100 ? value : undefined;
}

export function TopicDetailPage() {
  const { t } = useI18n();
  const { topic } = useParams<{ topic: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const decodedTopic = decodeURIComponent(topic || "");
  const topicId = searchParams.get("topicId") ?? undefined;
  const yearFrom = yearParam(searchParams, "yearFrom");
  const yearTo = yearParam(searchParams, "yearTo");
  const targets = getTopicActionTargets(decodedTopic, { yearFrom, yearTo });

  const { data, isLoading, isError } = useTopicTrend(decodedTopic, topicId || yearFrom || yearTo ? { topicId, yearFrom, yearTo } : undefined);

  // Chart 1: Publication breakdown
  const pubChartData = useMemo(() => {
    if (!data?.yearlyBreakdown) return [];
    return data.yearlyBreakdown.map(y => ({
      year: String(y.year),
      publications: y.count,
      isYTD: y.year > (data.lastCompleteYear ?? 0),
    })).sort((a, b) => Number(a.year) - Number(b.year));
  }, [data]);


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
        <Button onClick={() => navigate(targets.trends)} variant="outline" className="rounded-full">Back to Trends</Button>
      </div>
    );
  }

  const dataSource = data.dataSource ?? data.statistics?.source;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Navigation & Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate(targets.trends)}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-4 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Trends Overview
        </button>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white capitalize tracking-tight">{decodedTopic}</h1>
              <DataSourceBadge source={dataSource} />
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm max-w-2xl leading-relaxed">
              {dataSource === "openalex"
                ? t("{{count}} papers of this topic in OpenAlex (whole database). The trend below is judged by statistical tests on the topic's share of its field, not by raw counts.", { count: formatNumber(data.totalPapers) })
                : t("{{count}} papers of this topic in the local corpus. The trend below is judged by statistical tests on the topic's share of its field, not by raw counts.", { count: formatNumber(data.totalPapers) })}
            </p>
          </div>

          {/* Quick Actions Panel (Premium Aligned Flexbox) */}
          <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0 select-none">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-lg font-bold gap-1.5 text-xs border-slate-200 dark:border-slate-800 shadow-sm"
              onClick={() => navigate(targets.search)}
            >
              <Search className="w-3.5 h-3.5 text-slate-500" /> Search Papers
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-lg font-bold gap-1.5 text-xs border-amber-250 dark:border-amber-900/30 hover:bg-amber-50/50 dark:hover:bg-amber-950/10 shadow-sm text-slate-700 dark:text-slate-350"
              onClick={() => navigate(targets.gaps)}
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-600" /> Find Gaps
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 rounded-lg font-bold gap-1.5 text-xs border-slate-200 dark:border-slate-800 shadow-sm"
              onClick={() => navigate(targets.compare)}
            >
              <Users className="w-3.5 h-3.5 text-blue-600" /> Compare Topic
            </Button>
            <Button
              className="h-9 px-3.5 bg-[#001b69] hover:bg-[#001040] text-white shadow-sm rounded-lg text-xs font-bold gap-1.5 border border-blue-900/10"
              onClick={() => navigate(targets.report)}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" fill="currentColor" /> Generate AI Report
            </Button>
          </div>
        </div>
      </div>

      {data.statistics && <TrendEvidencePanel statistics={data.statistics} />}

      {/* Year-to-Date / Completeness Warning */}
      {hasYTD && (
        <div className="mb-8 px-4 py-3 bg-amber-50/50 dark:bg-amber-950/15 border-l-2 border-amber-500 rounded-r-xl text-xs text-amber-700 dark:text-amber-300 select-none flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Note on Year-to-Date (YTD) Data:</strong> Charts display current year data, but every statistical test uses complete years only. The last complete year is <strong>{data.lastCompleteYear}</strong>.
          </span>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-8 mb-8">

        {/* Chart 1: Publications Volume */}
        <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">Publication Volume</h3>
            </div>
            <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-500 uppercase tracking-wider select-none">
              {t("Descriptive counts, not the trend verdict")}
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
            {/* OpenAlex data has no provider facet. */}
            {(data.facets.providers?.length ?? 0) > 0 && (
              <TopicFacetGroup title="Providers" buckets={data.facets.providers} total={data.totalPapers} />
            )}
            <TopicFacetGroup title="Citation Bands" buckets={data.facets.citationBands} total={data.totalPapers} />
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponents helper for topic facets page
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
