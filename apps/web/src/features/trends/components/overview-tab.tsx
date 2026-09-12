import React from "react";
import { FileText, BookOpen, Sparkles, Calendar } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Button } from "@/components/ui/button";
import type { TrendsOverview } from "@trend/shared-types";
import { KPICard, InsightCard } from "./trends-shared.components";
import { formatSigned } from "../../../pages/trends.insights";
import type { RisingKeywordLike, TrendSortKey, TrendTopicLike } from "../../../pages/trends.insights";
import { formatCompactNumber, formatNumber } from "@/utils";

interface OverviewTabProps {
  data: TrendsOverview;
  metricMode: "papers" | "citations_total" | "citations_avg";
  setMetricMode: (mode: "papers" | "citations_total" | "citations_avg") => void;
  datasetMode: "corpus" | "displayed";
  setDatasetMode: (mode: "corpus" | "displayed") => void;
  peakYear: { year: string; value: number } | null;
  timelineChartData: Array<{ year: string; value: number }>;
  fastestTopic: TrendTopicLike | null;
  highestGrowthTopic: TrendTopicLike | null;
  establishedTopic: TrendTopicLike | null;
  fastestKeyword: RisingKeywordLike | null;
  navigate: (path: string) => void;
  setActiveTab: (tab: "overview" | "topics" | "dataset" | "compare" | "ai") => void;
  getTopicTrendTarget: (topic: string) => string;
  getRisingKeywordTarget: (keyword: string) => string;
  setYearFrom?: (year: number) => void;
  setYearTo?: (year: number) => void;
  scopeParams?: {
    yearFrom: number;
    yearTo: number;
    domainIds: string[];
    domains: string[];
    fieldIds: string[];
    fields: string[];
    subfieldIds: string[];
    subfields: string[];
    topicIds: string[];
    topicsFilter: string[];
    paperKinds: string[];
    openAccessStatuses: string[];
    providers: string[];
    sources: string[];
    languages: string[];
    citationBands: string[];
  };
}

export function OverviewTab({
  data,
  metricMode,
  setMetricMode,
  datasetMode,
  setDatasetMode,
  peakYear,
  timelineChartData,
  fastestTopic,
  highestGrowthTopic,
  establishedTopic,
  fastestKeyword,
  navigate,
  setActiveTab,
  getTopicTrendTarget,
  getRisingKeywordTarget,
  setYearFrom,
  setYearTo,
  scopeParams,
}: OverviewTabProps) {
  const [yearFromInput, setYearFromInput] = React.useState(() => String(scopeParams?.yearFrom ?? 1900));
  const [yearToInput, setYearToInput] = React.useState(() => String(scopeParams?.yearTo ?? 2026));

  React.useEffect(() => {
    if (scopeParams) setYearFromInput(String(scopeParams.yearFrom));
  }, [scopeParams?.yearFrom]);

  React.useEffect(() => {
    if (scopeParams) setYearToInput(String(scopeParams.yearTo));
  }, [scopeParams?.yearTo]);

  const commitYearInput = (
    rawValue: string,
    fallback: number,
    setYear: (year: number) => void,
    setInputValue: (value: string) => void,
  ) => {
    const parsed = parseInt(rawValue, 10);
    const nextYear = Number.isFinite(parsed) ? Math.max(1900, parsed) : fallback;
    setYear(nextYear);
    setInputValue(String(nextYear));
  };

  const handleYearInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, commit: () => void) => {
    if (event.key === "Enter") {
      commit();
      event.currentTarget.blur();
    }
  };

  const buildScopedUrl = (path: string, baseParams: Record<string, string>) => {
    const params = new URLSearchParams(baseParams);

    if (scopeParams) {
      params.set("yearFrom", String(scopeParams.yearFrom));
      params.set("yearTo", String(scopeParams.yearTo));

      const addList = (key: string, values: string[]) => {
        const cleaned = values.map((value) => value.trim()).filter(Boolean);
        if (cleaned.length > 0) params.set(key, cleaned.join(","));
      };

      addList("domainIds", scopeParams.domainIds);
      addList("domains", scopeParams.domains);
      addList("fieldIds", scopeParams.fieldIds);
      addList("fields", scopeParams.fields);
      addList("subfieldIds", scopeParams.subfieldIds);
      addList("subfields", scopeParams.subfields);
      addList("topicIds", scopeParams.topicIds);
      addList("topics", scopeParams.topicsFilter);
      addList("topicsFilter", scopeParams.topicsFilter);
      addList("paperKinds", scopeParams.paperKinds);
      addList("openAccessStatuses", scopeParams.openAccessStatuses);
      addList("providers", scopeParams.providers);
      addList("sources", scopeParams.sources);
      addList("languages", scopeParams.languages);
      addList("citationBands", scopeParams.citationBands);
    }

    return `${path}?${params.toString()}`;
  };

  const getScopedSearchTarget = (query: string) => {
    return scopeParams
      ? buildScopedUrl("/search", { q: query })
      : `/search?q=${encodeURIComponent(query)}`;
  };

  const getScopedReportTarget = (topic: string) => {
    return scopeParams
      ? buildScopedUrl("/reports", { create: "true", topic })
      : `/reports?create=true&topic=${encodeURIComponent(topic)}`;
  };

  // Deterministic Dataset Insight (no AI call)
  const insightText = React.useMemo(() => {
    if (!fastestTopic && !fastestKeyword) {
      return "No strong trend signals detected in the current scope.";
    }
    let topicInsight = "";
    if (fastestTopic) {
      topicInsight = `${fastestTopic.topic} is the strongest rising topic in this dataset (${formatSigned(fastestTopic.momentum, 2)} papers/year).`;
    }
    let keywordInsight = "";
    if (fastestKeyword) {
      const thresholdWarning = fastestKeyword.totalPapers < 15
        ? `, but it has only ${fastestKeyword.totalPapers} papers, so treat it as exploratory.`
        : `.`;
      keywordInsight = ` ${fastestKeyword.keyword} is an early keyword signal (${formatSigned(fastestKeyword.growthRatePct, 1)}% growth)${thresholdWarning}`;
    }
    return `${topicInsight}${keywordInsight}`.trim();
  }, [fastestTopic, fastestKeyword]);

  // Custom Tooltip for Timeline Chart (Guided UX)
  interface CustomTimelineTooltipProps {
    active?: boolean;
    payload?: Array<{ value: number; payload: { year: string; value: number } }>;
    label?: string;
  }

  const CustomTimelineTooltip = ({ active, payload, label }: CustomTimelineTooltipProps) => {
    if (active && payload && payload.length && label) {
      const firstPayload = payload[0];
      if (!firstPayload) return null;
      const value = firstPayload.value;
      const yearNum = parseInt(label, 10);
      let explanation = "";
      let labelText = "";
      if (metricMode === "papers") {
        explanation = "Publication activity in the selected dataset.";
        labelText = "Papers";
      } else if (metricMode === "citations_total") {
        explanation = "These are current citations of papers published in this year, not citations received during this year.";
        labelText = "Total Citations";
      } else {
        explanation = "These are current average citations of papers published in this year, not citations received during this year.";
        labelText = "Avg Citations";
      }

      const isYtd = data.lastCompleteYear ? yearNum > data.lastCompleteYear : false;

      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-lg text-xs select-none space-y-1.5 max-w-[280px]">
          <p className="font-extrabold text-slate-900 dark:text-white">
            {label} {isYtd ? <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold ml-1.5 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-200/50">YTD</span> : ""}
          </p>
          <p className="text-blue-600 dark:text-blue-400 font-extrabold">
            {labelText}: {formatNumber(value)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal font-medium">
            {explanation}
          </p>
          {isYtd && (
            <p className="text-[9px] text-amber-650 dark:text-amber-400 font-bold italic leading-normal border-t border-slate-100 dark:border-slate-800/60 pt-1">
              Warning: This year is year-to-date. Data is incomplete.
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const isDuplicated = fastestTopic && establishedTopic && fastestTopic.topic === establishedTopic.topic;

  return (
    <div className="space-y-6">
      {/* Tab Purpose Header */}
      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium select-none">
        Analyze the main timeline activity and overall research volume within your currently filtered dataset.
      </div>

      {/* Dataset Insight Banner */}
      <div className="bg-blue-50/50 dark:bg-blue-950/10 border border-blue-200/50 dark:border-blue-800/40 rounded-xl p-4 text-xs text-slate-800 dark:text-slate-200 select-none">
        <div className="flex gap-2.5">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="font-semibold leading-normal">
            <span className="text-[10px] uppercase font-extrabold tracking-wider bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-400 mr-2">Dataset Insight</span>
            {insightText}
          </p>
        </div>
      </div>

      {/* Reworked Insight cards into decision cards (P1 Request) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard
          label="Fastest moving topic"
          variant="primary"
          value={fastestTopic?.topic ?? "No topic"}
          taxonomyPath={fastestTopic?.taxonomy ? `${fastestTopic.taxonomy.domainName} / ${fastestTopic.taxonomy.fieldName}` : undefined}
          detail={fastestTopic ? `${formatSigned(fastestTopic.momentum, 2)} papers/year` : "No data"}
          meaning={isDuplicated
            ? "Topic Modeling dominates both momentum and volume in this dataset."
            : "Highest momentum: the steepest paper/year slope in the selected dataset."
          }
          badge={isDuplicated ? (
            <span className="text-[8px] bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 font-extrabold px-1.5 py-0.5 rounded border border-blue-200/30 shrink-0">
              Also most established
            </span>
          ) : undefined}
          sourceHint="Trend slope"
          actionLabel="Open trend"
          onAction={() => fastestTopic && navigate(getTopicTrendTarget(fastestTopic.topic))}
        />
        <InsightCard
          label="Highest YoY growth"
          variant={highestGrowthTopic && highestGrowthTopic.growthRatePct > 0 ? "success" : "warning"}
          value={highestGrowthTopic && highestGrowthTopic.growthRatePct > 0 ? highestGrowthTopic.topic : "All top topics declined YoY"}
          taxonomyPath={highestGrowthTopic && highestGrowthTopic.growthRatePct > 0 && highestGrowthTopic.taxonomy ? `${highestGrowthTopic.taxonomy.domainName} / ${highestGrowthTopic.taxonomy.fieldName}` : undefined}
          detail={highestGrowthTopic && highestGrowthTopic.growthRatePct > 0 ? `${formatSigned(highestGrowthTopic.growthRatePct, 1)}% growth` : "Compare with previous window."}
          meaning={highestGrowthTopic && highestGrowthTopic.growthRatePct > 0
            ? "Largest year-over-year change using the last complete year."
            : "All tracked topics in the current scope experienced negative growth."
          }
          sourceHint="YoY % change"
          actionLabel={highestGrowthTopic && highestGrowthTopic.growthRatePct > 0 ? "Explore papers" : "Compare topics"}
          onAction={() => {
            if (highestGrowthTopic && highestGrowthTopic.growthRatePct > 0) {
              navigate(getScopedSearchTarget(highestGrowthTopic.topic));
            } else {
              setActiveTab("compare");
            }
          }}
        />
        <InsightCard
          label="Most established"
          variant="neutral"
          value={establishedTopic?.topic ?? "No topic"}
          taxonomyPath={establishedTopic?.taxonomy ? `${establishedTopic.taxonomy.domainName} / ${establishedTopic.taxonomy.fieldName}` : undefined}
          detail={establishedTopic ? `${formatNumber(establishedTopic.totalPapers)} papers` : "No data"}
          meaning="Largest paper volume in the selected dataset. Useful as a stable baseline."
          sourceHint="Total volume"
          actionLabel="Generate report"
          onAction={() => establishedTopic && navigate(getScopedReportTarget(establishedTopic.topic))}
        />
        <InsightCard
          label="Emerging keyword"
          variant="success"
          value={fastestKeyword?.keyword ?? "No keyword"}
          detail={fastestKeyword ? `${formatSigned(fastestKeyword.growthRatePct, 1)}% growth · ${formatNumber(fastestKeyword.totalPapers)} papers` : "No data"}
          meaning="Fast-growing keyword from indexed paper keywords. Good for early research directions."
          badge={fastestKeyword && fastestKeyword.totalPapers < 15 ? (
            <span
              className="text-[8px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-extrabold px-1.5 py-0.5 rounded border border-amber-200/30 cursor-help shrink-0"
              title="High growth from a small number of papers, treat as exploratory."
            >
              Small base
            </span>
          ) : undefined}
          sourceHint="YoY growth"
          actionLabel="Search keyword"
          onAction={() => fastestKeyword && navigate(getScopedSearchTarget(fastestKeyword.keyword))}
        />
      </div>

      {/* Dataset facts horizontal strip (Guided UX - compact version to reduce visual weight) */}
      <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs select-none shadow-sm">
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Dataset Facts</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-700 dark:text-slate-350 font-bold">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
            Papers: <span className="text-slate-900 dark:text-white font-extrabold">{formatNumber(data.totalPapersInWindow)}</span> <span className="text-[10px] text-slate-400 font-medium">(after filters)</span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
            Topics shown: <span className="text-slate-900 dark:text-white font-extrabold">{formatNumber(data.topics?.length || 0)}</span>
            <span className="text-[10px] text-slate-400 font-medium">
              of {formatNumber(data.uniqueTopicsInScope ?? data.topics?.length ?? 0)} unique topics
            </span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
            Rising Keywords: <span className="text-slate-900 dark:text-white font-extrabold">{data.risingKeywords?.length || "0"}</span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700"></span>
            Window: <span className="text-slate-900 dark:text-white font-extrabold">{data.yearFrom ?? "-"}-{data.lastCompleteYear ?? "-"}</span>
          </span>
        </div>
      </div>

      {/* Metrics Explanation Strip */}
      <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 rounded-xl px-4 py-3 text-xs text-slate-500 dark:text-slate-400 flex flex-col md:flex-row md:items-center justify-between gap-2 shadow-sm select-none">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          <span>
            <strong>Momentum</strong> = trend slope in papers/year. <strong>Growth</strong> = year-over-year change using the last complete year. Topic lists show the top ranked slice, not every unique topic in scope.
          </span>
        </div>
        <div className="text-slate-400 dark:text-slate-500 font-semibold md:text-right shrink-0">
          Metrics computed through {data.lastCompleteYear ?? "-"}. {data.yearTo && data.yearTo > (data.lastCompleteYear ?? 0) ? `${data.yearTo} is YTD.` : ""}
        </div>
      </div>

      {/* Main Area Chart Upgraded */}
      <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                {metricMode === "papers"
                  ? datasetMode === "corpus"
                    ? "Publication activity by year"
                    : "Displayed topic activity by year"
                  : metricMode === "citations_total"
                  ? "Citation impact of papers published each year"
                  : "Average citation impact by publication year"}
              </h3>
              <span className="text-[9px] bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-150 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                {metricMode === "papers" ? "publication activity" : "citation impact"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {metricMode === "papers"
                ? datasetMode === "corpus"
                  ? "Shows how many active papers in the selected dataset were published each year. Use this to judge research activity."
                  : "This chart sums yearly paper counts for the topics currently shown below, not necessarily every paper in the corpus."
                : metricMode === "citations_total"
                ? "Sums current cited-by counts for papers published in each year. Older papers usually have more time to collect citations."
                : "Shows average current citations per paper for each publication year. Useful for normalized impact, but newer years are citation-young."}
            </p>

            {/* Chart Takeaway Insight Alert */}
            <div className="mt-3 bg-blue-50/40 dark:bg-blue-950/15 border-l-2 border-blue-600 dark:border-blue-500 rounded-r-lg p-2.5 text-[11px] text-slate-650 dark:text-slate-300 select-none font-medium leading-relaxed">
              <span className="font-extrabold text-blue-700 dark:text-blue-400 mr-1.5 uppercase text-[9px] tracking-wider">Takeaway:</span>
              Publication activity peaked in 2024, then drops in 2025-2026 because 2026 is YTD and sync coverage may be incomplete.
            </div>

            {data.yearTo && data.yearTo > data.lastCompleteYear ? (
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                {data.yearTo} is year-to-date, so the final point may look lower until the year completes.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0 select-none">
            {/* Year Range Inputs */}
            {scopeParams && setYearFrom && setYearTo && (
              <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-full border border-slate-200/50 dark:border-slate-800/50">
                <input
                  type="number"
                  value={yearFromInput}
                  onChange={(e) => setYearFromInput(e.target.value)}
                  onBlur={() => commitYearInput(yearFromInput, 1900, setYearFrom, setYearFromInput)}
                  onKeyDown={(e) => handleYearInputKeyDown(e, () => commitYearInput(yearFromInput, 1900, setYearFrom, setYearFromInput))}
                  placeholder="From"
                  className="w-14 h-7 bg-white dark:bg-slate-800 rounded-full text-center text-[11px] font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 border-none shadow-sm"
                />
                <span className="text-slate-400 text-xs font-bold">-</span>
                <input
                  type="number"
                  value={yearToInput}
                  onChange={(e) => setYearToInput(e.target.value)}
                  onBlur={() => commitYearInput(yearToInput, 2026, setYearTo, setYearToInput)}
                  onKeyDown={(e) => handleYearInputKeyDown(e, () => commitYearInput(yearToInput, 2026, setYearTo, setYearToInput))}
                  placeholder="To"
                  className="w-14 h-7 bg-white dark:bg-slate-800 rounded-full text-center text-[11px] font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 border-none shadow-sm"
                />
              </div>
            )}

            {/* Metric Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-full border border-slate-200/50 dark:border-slate-800/50">
              <Button
                variant={metricMode === "papers" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMetricMode("papers")}
                className="h-7 px-3 text-[11px] font-bold rounded-full"
              >
                Papers
              </Button>
              <Button
                variant={metricMode === "citations_total" ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setMetricMode("citations_total");
                  setDatasetMode("corpus");
                }}
                className="h-7 px-3 text-[11px] font-bold rounded-full"
              >
                Total Citations
              </Button>
              <Button
                variant={metricMode === "citations_avg" ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setMetricMode("citations_avg");
                  setDatasetMode("corpus");
                }}
                className="h-7 px-3 text-[11px] font-bold rounded-full"
              >
                Avg Citations
              </Button>
            </div>

            {/* Dataset Mode Toggle */}
            {metricMode !== "papers" ? (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 italic font-semibold select-none pr-1">
                Citation modes use full current dataset only.
              </span>
            ) : (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-full border border-slate-200/50 dark:border-slate-800/50">
                <Button
                  variant={datasetMode === "corpus" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setDatasetMode("corpus")}
                  className="h-7 px-3 text-[11px] font-bold rounded-full"
                >
                  Corpus
                </Button>
                <Button
                  variant={datasetMode === "displayed" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setDatasetMode("displayed")}
                  className="h-7 px-3 text-[11px] font-bold rounded-full"
                >
                  Displayed
                </Button>
              </div>
            )}

            {peakYear && (
              <span className="text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/30 select-none">
                Peak: {peakYear.year} · {formatCompactNumber(peakYear.value)}{" "}
                {metricMode === "papers"
                  ? "papers"
                  : metricMode === "citations_total"
                  ? "citations"
                  : "citations/paper"}
              </span>
            )}
          </div>
        </div>

        {/* Flex layout with Sidebar instruction panel */}
        <div className="flex flex-col md:flex-row gap-6 items-stretch">
          {/* Chart area */}
          <div className="flex-1 min-h-[260px] md:min-h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPubs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                <XAxis
                  dataKey="year"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                  dy={10}
                  minTickGap={30}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={72}
                  tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                  tickFormatter={formatCompactNumber}
                />
                <Tooltip content={<CustomTimelineTooltip />} />

                {/* Reference line for peak year */}
                {peakYear && (
                  <ReferenceLine
                    x={peakYear.year}
                    stroke="#2563eb"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    strokeOpacity={0.65}
                    label={{
                      value: `Peak: ${peakYear.year}`,
                      position: 'top',
                      fill: '#2563eb',
                      fontSize: 10,
                      fontWeight: 'bold',
                      dy: -10
                    }}
                  />
                )}

                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#1e3a8a"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorPubs)"
                  activeDot={{ r: 6, fill: "#1e3a8a", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Guided Sidebar panel */}
          <div className="bg-slate-50/50 dark:bg-slate-900/10 border border-slate-150 dark:border-slate-800/60 rounded-xl p-4 text-xs space-y-5 md:max-w-xs md:shrink-0 w-full flex flex-col justify-start select-none">
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800 dark:text-white">What this chart shows</h4>
              <p className="text-slate-500 dark:text-slate-400 leading-normal font-medium">
                This chart shows how the current dataset changes over time. Use <strong>Papers</strong> for activity, <strong>Total Citations</strong> for accumulated impact, and <strong>Avg Citations</strong> for normalized impact.
              </p>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-850">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Affected by:</span>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] bg-slate-100/60 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/50 dark:border-slate-700/30">Year range</span>
                <span className="text-[10px] bg-slate-100/60 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/50 dark:border-slate-700/30">OpenAlex scope</span>
                <span className="text-[10px] bg-slate-100/60 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/50 dark:border-slate-700/30">Facets</span>
                <span className="text-[10px] bg-slate-100/60 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/50 dark:border-slate-700/30">Metric toggle</span>
                {metricMode === "papers" && (
                  <span className="text-[10px] bg-slate-100/60 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/50 dark:border-slate-700/30">Corpus/Displayed toggle</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
