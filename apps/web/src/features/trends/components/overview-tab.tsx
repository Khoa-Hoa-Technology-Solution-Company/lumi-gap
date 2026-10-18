import React from "react";
import { FileText, BookOpen, Sparkles, Calendar } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Button } from "@/components/ui/button";
import type { TrendsOverview } from "@trend/shared-types";
import { KPICard, InsightCard } from "./trends-shared.components";
import { DEFAULT_TREND_YEAR_FROM, DEFAULT_TREND_YEAR_TO, formatSigned } from "../../../pages/trends.insights";
import type { RisingKeywordLike, TrendTopicLike } from "../../../pages/trends.insights";
import { formatCompactNumber, formatNumber } from "@/utils";
import { useI18n } from "@/i18n";
import { formatPercent, hasCitationTotals, hasPpTop10, WORLD_AVERAGE_PP_TOP10, type TimelinePoint, type TrendMetricMode } from "../trend-impact";
import { formatShiftCounts, isShiftSignificant } from "../trend-source";
import { DataSourceBadge } from "./trend-data-source";
import { TrendFigures, TrendHowLink, TrendIntro, TrendVerdictBadge, formatRelativeChange, verdictLabel } from "./trend-verdict-badge";
import { DOCS_SECTIONS } from "@/features/docs";

interface OverviewTabProps {
  data: TrendsOverview;
  metricMode: TrendMetricMode;
  setMetricMode: (mode: TrendMetricMode) => void;
  datasetMode: "corpus" | "displayed";
  setDatasetMode: (mode: "corpus" | "displayed") => void;
  peakYear: { year: string; value: number } | null;
  timelineChartData: TimelinePoint[];
  /** The first rising topic of the verdict ranking, if any. */
  topRisingTopic: TrendTopicLike | null;
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

type Translate = ReturnType<typeof useI18n>["t"];

/** One-sentence reading of the emerging keyword. With the shift test the
 *  verdict comes from q; without it (local fallback) the small-base rule applies. */
function describeKeywordInsight(keyword: RisingKeywordLike, t: Translate): string {
  const shift = keyword.shift;
  if (shift) {
    const values = { keyword: keyword.keyword, counts: formatShiftCounts(shift) };
    return isShiftSignificant(shift)
      ? t("{{keyword}} is a clearly rising keyword ({{counts}} papers).", values)
      : t("{{keyword}} is rising, but not clearly enough ({{counts}} papers), so treat it as exploratory.", values);
  }
  const values = { keyword: keyword.keyword, growth: formatSigned(keyword.growthRatePct, 1), count: keyword.totalPapers };
  return keyword.totalPapers < 15
    ? t("{{keyword}} is an early keyword signal ({{growth}}% growth), but it has only {{count}} papers, so treat it as exploratory.", values)
    : t("{{keyword}} is an early keyword signal ({{growth}}% growth).", values);
}

function describeKeywordDetail(keyword: RisingKeywordLike): string {
  const shift = keyword.shift;
  if (shift) return `${formatShiftCounts(shift)} papers`;
  return `${formatSigned(keyword.growthRatePct, 1)}% growth · ${formatNumber(keyword.totalPapers)} papers`;
}

/** Data-driven reading of the chart: the highest complete year of the series. */
function describeTimelineTakeaway(
  mode: TrendMetricMode,
  points: TimelinePoint[],
  lastCompleteYear: number | undefined,
  t: Translate,
): string | null {
  const complete = points.filter((point) => !lastCompleteYear || Number(point.year) <= lastCompleteYear);
  const pool = complete.length > 0 ? complete : points;
  const top = [...pool].sort((a, b) => b.value - a.value)[0];
  if (!top) return null;
  if (mode === "pp_top10") {
    return t("PP(top 10%) is highest in {{year}} ({{value}}) among complete years; 10% is the world average.", {
      year: top.year,
      value: formatPercent(top.value),
    });
  }
  if (mode === "papers") {
    return t("Publication activity is highest in {{year}} ({{value}} papers) among complete years.", {
      year: top.year,
      value: formatNumber(top.value),
    });
  }
  return t("Citation values are highest in {{year}}; older papers have had more time to collect citations.", { year: top.year });
}

export function OverviewTab({
  data,
  metricMode,
  setMetricMode,
  datasetMode,
  setDatasetMode,
  peakYear,
  timelineChartData,
  topRisingTopic,
  fastestKeyword,
  navigate,
  setActiveTab,
  getTopicTrendTarget,
  getRisingKeywordTarget,
  setYearFrom,
  setYearTo,
  scopeParams,
}: OverviewTabProps) {
  const { t } = useI18n();
  const hasPp = hasPpTop10(data.citationTrend);
  const hasTotals = hasCitationTotals(data.citationTrend);
  const [yearFromInput, setYearFromInput] = React.useState(() => String(scopeParams?.yearFrom ?? DEFAULT_TREND_YEAR_FROM));
  const [yearToInput, setYearToInput] = React.useState(() => String(scopeParams?.yearTo ?? DEFAULT_TREND_YEAR_TO));

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
      ? buildScopedUrl("/home", { q: query })
      : `/home?q=${encodeURIComponent(query)}`;
  };

  // Deterministic Dataset Insight (no AI call)
  const insightText = React.useMemo(() => {
    if (!topRisingTopic && !fastestKeyword) {
      return t("No strong trend signals detected in the current scope.");
    }
    let topicInsight = "";
    if (topRisingTopic?.classification) {
      topicInsight = t("{{topic}} has the largest significant rise in its field share in this dataset ({{change}}).", {
        topic: topRisingTopic.topic,
        change: formatRelativeChange(topRisingTopic.classification, t) ?? "",
      });
    } else {
      topicInsight = t("No topic shows a statistically significant rise in its field share in this scope.");
    }
    let keywordInsight = "";
    if (fastestKeyword) {
      keywordInsight = ` ${describeKeywordInsight(fastestKeyword, t)}`;
    }
    return `${topicInsight}${keywordInsight}`.trim();
  }, [topRisingTopic, fastestKeyword, t]);

  // Custom Tooltip for Timeline Chart (Guided UX)
  interface CustomTimelineTooltipProps {
    active?: boolean;
    payload?: Array<{ value: number; payload: TimelinePoint }>;
    label?: string;
  }

  const CustomTimelineTooltip = ({ active, payload, label }: CustomTimelineTooltipProps) => {
    if (active && payload && payload.length && label) {
      const firstPayload = payload[0];
      if (!firstPayload) return null;
      const value = firstPayload.value;
      const point = firstPayload.payload;
      const yearNum = parseInt(label, 10);
      let explanation = "";
      let labelText = "";
      if (metricMode === "pp_top10") {
        explanation = t("Share of the year's papers among the 10% most cited works of the same year, type and subfield. 10% is the world average.");
        labelText = "PP(top 10%)";
      } else if (metricMode === "papers") {
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
            {labelText}: {metricMode === "pp_top10" ? formatPercent(value) : formatNumber(value)}
          </p>
          {metricMode === "pp_top10" && point.topCount !== undefined && point.papers !== undefined && (
            <p className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold">
              {t("{{value}}% ({{top}} of {{n}} papers)", { value: value.toFixed(1), top: formatNumber(point.topCount), n: formatNumber(point.papers) })}
            </p>
          )}
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

  const takeaway = describeTimelineTakeaway(metricMode, timelineChartData, data.lastCompleteYear, t);

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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TrendVerdictSummaryCard
          topics={data.topics}
          topRisingTopic={topRisingTopic}
          source={data.dataSource}
          onOpenTrend={(topic) => navigate(getTopicTrendTarget(topic))}
          onCompare={() => setActiveTab("compare")}
        />
        <InsightCard
          label="Supplementary: emerging keyword"
          variant="success"
          value={fastestKeyword?.keyword ?? "No keyword"}
          detail={fastestKeyword ? describeKeywordDetail(fastestKeyword) : "No data"}
          meaning={fastestKeyword?.shift
            ? "Keyword whose share of the topic's papers changed between two periods (log odds ratio test, Benjamini–Hochberg corrected)."
            : "Fast-growing keyword from indexed paper keywords. Good for early research directions."}
          badge={fastestKeyword?.shift ? (
            isShiftSignificant(fastestKeyword.shift) ? (
              <span className="text-[8px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-extrabold px-1.5 py-0.5 rounded border border-emerald-200/30 shrink-0">
                Significant rising
              </span>
            ) : (
              <span
                className="text-[8px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold px-1.5 py-0.5 rounded border border-slate-200/60 cursor-help shrink-0"
                title="The change is not statistically significant after the Benjamini–Hochberg correction (q ≥ 0.05)."
              >
                Not significant
              </span>
            )
          ) : fastestKeyword && fastestKeyword.totalPapers < 15 ? (
            <span
              className="text-[8px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-extrabold px-1.5 py-0.5 rounded border border-amber-200/30 cursor-help shrink-0"
              title="High growth from a small number of papers, treat as exploratory."
            >
              Small base
            </span>
          ) : undefined}
          sourceHint={fastestKeyword?.shift ? "Keyword shift test" : "Keyword growth"}
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
          <TrendIntro />
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
                {metricMode === "pp_top10"
                  ? "Share of highly cited papers, PP(top 10%)"
                  : metricMode === "papers"
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
              <DataSourceBadge source={data.dataSource} />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {metricMode === "pp_top10"
                ? "Shows the share of each year's papers that are among the 10% most cited works of the same year, type and subfield. 10% is the world average, so values above the dashed line mean more highly cited papers than expected."
                : metricMode === "papers"
                ? datasetMode === "corpus"
                  ? "Shows how many active papers in the selected dataset were published each year. Use this to judge research activity."
                  : "This chart sums yearly paper counts for the topics currently shown below, not necessarily every paper in the corpus."
                : metricMode === "citations_total"
                ? "Sums current cited-by counts for papers published in each year. Older papers usually have more time to collect citations."
                : "Shows average current citations per paper for each publication year. Useful for normalized impact, but newer years are citation-young."}
            </p>

            {/* Chart Takeaway Insight Alert */}
            {takeaway && (
              <div className="mt-3 bg-blue-50/40 dark:bg-blue-950/15 border-l-2 border-blue-600 dark:border-blue-500 rounded-r-lg p-2.5 text-[11px] text-slate-650 dark:text-slate-300 select-none font-medium leading-relaxed">
                <span className="font-extrabold text-blue-700 dark:text-blue-400 mr-1.5 uppercase text-[9px] tracking-wider">Takeaway:</span>
                {takeaway}
              </div>
            )}

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
                  onBlur={() => commitYearInput(yearFromInput, DEFAULT_TREND_YEAR_FROM, setYearFrom, setYearFromInput)}
                  onKeyDown={(e) => handleYearInputKeyDown(e, () => commitYearInput(yearFromInput, DEFAULT_TREND_YEAR_FROM, setYearFrom, setYearFromInput))}
                  placeholder="From"
                  className="w-14 h-7 bg-white dark:bg-slate-800 rounded-full text-center text-[11px] font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 border-none shadow-sm"
                />
                <span className="text-slate-400 text-xs font-bold">-</span>
                <input
                  type="number"
                  value={yearToInput}
                  onChange={(e) => setYearToInput(e.target.value)}
                  onBlur={() => commitYearInput(yearToInput, DEFAULT_TREND_YEAR_TO, setYearTo, setYearToInput)}
                  onKeyDown={(e) => handleYearInputKeyDown(e, () => commitYearInput(yearToInput, DEFAULT_TREND_YEAR_TO, setYearTo, setYearToInput))}
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
              {hasPp ? (
                <Button
                  variant={metricMode === "pp_top10" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setMetricMode("pp_top10");
                    setDatasetMode("corpus");
                  }}
                  className="h-7 px-3 text-[11px] font-bold rounded-full"
                >
                  PP(top 10%)
                </Button>
              ) : hasTotals ? (
                <>
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
                </>
              ) : null}
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
                Peak: {peakYear.year} · {metricMode === "pp_top10" ? formatPercent(peakYear.value) : formatCompactNumber(peakYear.value)}{" "}
                {metricMode === "pp_top10"
                  ? "PP(top 10%)"
                  : metricMode === "papers"
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
                  tickFormatter={metricMode === "pp_top10" ? (value: number) => `${value}%` : formatCompactNumber}
                  domain={metricMode === "pp_top10" ? [0, (dataMax: number) => Math.max(dataMax, WORLD_AVERAGE_PP_TOP10 * 1.2)] : undefined}
                />
                <Tooltip content={<CustomTimelineTooltip />} />

                {/* World-average line: 10% of works are in the top 10% by definition */}
                {metricMode === "pp_top10" && (
                  <ReferenceLine
                    y={WORLD_AVERAGE_PP_TOP10}
                    stroke="#64748b"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: t("10% = world average"),
                      position: "insideBottomRight",
                      fill: "#64748b",
                      fontSize: 10,
                      fontWeight: "bold",
                    }}
                  />
                )}

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
                {hasPp ? (
                  <>This chart shows how the current dataset changes over time. Use <strong>Papers</strong> for activity and <strong>PP(top 10%)</strong> for the share of highly cited papers; 10% is the world average.</>
                ) : (
                  <>This chart shows how the current dataset changes over time. Use <strong>Papers</strong> for activity, <strong>Total Citations</strong> for accumulated impact, and <strong>Avg Citations</strong> for normalized impact.</>
                )}
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

const VERDICT_ORDER = ["rising", "stable", "declining", "insufficient"] as const;

/** Counts of each verdict in the listed topics and the first rising topic, with the numbers behind it. */
function TrendVerdictSummaryCard({
  topics,
  topRisingTopic,
  source,
  onOpenTrend,
  onCompare,
}: {
  topics: TrendsOverview["topics"];
  topRisingTopic: TrendTopicLike | null;
  source: TrendsOverview["dataSource"];
  onOpenTrend: (topic: string) => void;
  onCompare: () => void;
}) {
  const { t } = useI18n();
  const counts = VERDICT_ORDER.map((verdict) => ({
    verdict,
    count: topics.filter((topic) => topic.classification.verdict === verdict).length,
  }));
  return (
    <div className="lg:col-span-2 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400">{t("Trend verdicts in this scope")}</p>
        <TrendHowLink section={DOCS_SECTIONS.trendVerdict} anchor="rules" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map(({ verdict, count }) => (
          <div key={verdict} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/30">
            <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{verdictLabel(verdict, t)}</dt>
            <dd className="text-xl font-black text-slate-900 dark:text-white">{formatNumber(count)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800/60">
        {topRisingTopic?.classification ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t("Top rising topic")}</p>
              <p className="truncate text-base font-extrabold text-slate-900 dark:text-white" title={topRisingTopic.topic}>{topRisingTopic.topic}</p>
              {topRisingTopic.taxonomy && (
                <p className="truncate text-[11px] font-semibold capitalize text-slate-400">{topRisingTopic.taxonomy.domainName} / {topRisingTopic.taxonomy.fieldName}</p>
              )}
              <TrendVerdictBadge classification={topRisingTopic.classification} />
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <TrendFigures classification={topRisingTopic.classification} source={source} className="sm:text-right" />
              <button
                type="button"
                onClick={() => onOpenTrend(topRisingTopic.topic)}
                className="w-fit text-xs font-extrabold text-blue-700 hover:underline dark:text-blue-400"
              >
                {t("Open trend")} ➔
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <p>{t("No topic shows a statistically significant rise in its field share in this scope.")}</p>
            <button type="button" onClick={onCompare} className="font-extrabold text-blue-700 hover:underline dark:text-blue-400">
              {t("Compare topics")} ➔
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
