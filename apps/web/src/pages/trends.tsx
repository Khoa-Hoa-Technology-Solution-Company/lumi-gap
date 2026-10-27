import React, { useMemo, useState, useEffect } from "react";
import { Sparkles, Search, Loader2, ChevronDown, ChevronRight, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTrendsOverview, useTrendCompare, useTrendRelationships, useExplainTrend, useTrendExplainHistory } from "@/features/trends/hooks/use-trends";
import { getRisingKeywordTarget, getTopicTrendTarget } from "@/features/trends/trend-navigation";
import { FilterChip, type RisingKeywordRow, type TrendBarChartDatum } from "@/features/trends/components/trends-shared.components";
import { OverviewTab } from "@/features/trends/components/overview-tab";
import { TopicsTab } from "@/features/trends/components/topics-tab";
import { DatasetTab } from "@/features/trends/components/dataset-tab";
import { CompareTab } from "@/features/trends/components/compare-tab";
import { AITab } from "@/features/trends/components/ai-tab";
import { PeriodsTab } from "@/features/trends/components/periods-tab";
import { isVerdictFilter, type VerdictFilter } from "@/features/trends/components/verdict-filter";
import type { TrendsOverviewParams } from "@/features/trends/api/trends.api";
import { DataSourceBadge, ScopeNotice } from "@/features/trends/components/trend-data-source";
import { resolveMetricMode, type TimelinePoint, type TrendMetricMode } from "@/features/trends/trend-impact";
import {
  DEFAULT_TREND_SORT,
  formatMetricValue,
  getFastestKeyword,
  getTopRisingTopic,
  getTopicMetric,
  parseTrendSortKey,
  sortTopics,
  type TrendSortKey,
  DEFAULT_TREND_YEAR_FROM,
  DEFAULT_TREND_YEAR_TO,
} from "./trends.insights";
import { formatNumber } from "@/utils";
import { formatLanguageName } from "@/utils/language";
import { useI18n } from "@/i18n";

type CitationBand = "0-9" | "10-49" | "50-99" | "100-499" | "500-999" | "1000+";
const CITATION_BANDS = ["0-9", "10-49", "50-99", "100-499", "500-999", "1000+"] as const;
type TrendTab = "overview" | "topics" | "periods" | "dataset" | "compare" | "ai";

const TREND_TABS: Array<{ id: TrendTab; label: string }> = [
  { id: "overview", label: "Start here" },
  { id: "topics", label: "Find signals" },
  { id: "periods", label: "By month / quarter" },
  { id: "dataset", label: "Data Scope" },
  { id: "compare", label: "Compare topics" },
  { id: "ai", label: "Explain trend" },
];

function isCitationBand(value: string): value is CitationBand {
  return CITATION_BANDS.includes(value as CitationBand);
}

function parseNumberParam(params: URLSearchParams, key: string, defaultValue: number, options?: { min?: number }): number {
  const raw = params.get(key);
  if (!raw) return defaultValue;
  const num = parseInt(raw, 10);
  if (isNaN(num)) return defaultValue;
  if (options?.min !== undefined && num < options.min) return options.min;
  return num;
}

function parseArrayParam(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return raw.split(",").map(x => x.trim()).filter(Boolean);
}

function parseCitationBandsParam(params: URLSearchParams, key: string): CitationBand[] {
  return parseArrayParam(params, key).filter(isCitationBand);
}

function parseTabParam(params: URLSearchParams): TrendTab {
  const tab = params.get("tab");
  if (tab === "scope") return "dataset";
  if (tab === "topics" || tab === "periods" || tab === "dataset" || tab === "compare" || tab === "ai") return tab;
  return "overview";
}

export function TrendsPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  // Controlled states synchronized with URL search params (with safety bounds)
  const [yearFrom, setYearFrom] = useState<number>(() => parseNumberParam(searchParams, "yearFrom", DEFAULT_TREND_YEAR_FROM, { min: 1900 }));
  const [yearTo, setYearTo] = useState<number>(() => parseNumberParam(searchParams, "yearTo", DEFAULT_TREND_YEAR_TO, { min: 1900 }));
  const openTopicTarget = (topic: string, openalexTopicId?: string) => getTopicTrendTarget(topic, openalexTopicId, { yearFrom, yearTo });
  // Legacy ?sortBy=momentum|growth (and ?sort=) links map to the verdict ranking.
  const [sortBy, setSortBy] = useState<TrendSortKey>(() => parseTrendSortKey(searchParams.get("sortBy") ?? searchParams.get("sort")));
  const [minPapers, setMinPapers] = useState<number>(() => parseNumberParam(searchParams, "minPapers", 2, { min: 1 }));
  const [yearFromInput, setYearFromInput] = useState(() => String(yearFrom));
  const [yearToInput, setYearToInput] = useState(() => String(yearTo));
  const [minPapersInput, setMinPapersInput] = useState(() => String(minPapers));

  // Taxonomy name-based filters
  const [domains, setDomains] = useState<string[]>(() => parseArrayParam(searchParams, "domains"));
  const [fields, setFields] = useState<string[]>(() => parseArrayParam(searchParams, "fields"));
  const [subfields, setSubfields] = useState<string[]>(() => parseArrayParam(searchParams, "subfields"));
  const [topicsFilter, setTopicsFilter] = useState<string[]>(() => parseArrayParam(searchParams, "topicsFilter"));

  // Taxonomy ID-based filters
  const [domainIds, setDomainIds] = useState<string[]>(() => parseArrayParam(searchParams, "domainIds"));
  const [fieldIds, setFieldIds] = useState<string[]>(() => parseArrayParam(searchParams, "fieldIds"));
  const [subfieldIds, setSubfieldIds] = useState<string[]>(() => parseArrayParam(searchParams, "subfieldIds"));
  const [topicIds, setTopicIds] = useState<string[]>(() => parseArrayParam(searchParams, "topicIds"));

  // Other metadata facets
  const [paperKinds, setPaperKinds] = useState<string[]>(() => parseArrayParam(searchParams, "paperKinds"));
  const [openAccessStatuses, setOpenAccessStatuses] = useState<string[]>(() => parseArrayParam(searchParams, "openAccessStatuses"));
  const [providers, setProviders] = useState<string[]>(() => parseArrayParam(searchParams, "providers"));
  const [sources, setSources] = useState<string[]>(() => parseArrayParam(searchParams, "sources"));
  const [languages, setLanguages] = useState<string[]>(() => parseArrayParam(searchParams, "languages"));
  const [citationBands, setCitationBands] = useState<CitationBand[]>(() => parseCitationBandsParam(searchParams, "citationBands"));

  const [activeTab, setActiveTab] = useState<TrendTab>(() => parseTabParam(searchParams));
  const [selectedTopics, setSelectedTopics] = useState<string[]>(() => parseArrayParam(searchParams, "compare").slice(0, 5));
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>(() => {
    const raw = searchParams.get("verdict");
    return isVerdictFilter(raw) ? raw : "all";
  });

  useEffect(() => {
    setYearFromInput(String(yearFrom));
  }, [yearFrom]);

  useEffect(() => {
    setYearToInput(String(yearTo));
  }, [yearTo]);

  useEffect(() => {
    setMinPapersInput(String(minPapers));
  }, [minPapers]);

  const commitNumericInput = (
    rawValue: string,
    fallback: number,
    min: number,
    setNumericValue: (value: number) => void,
    setInputValue: (value: string) => void,
  ) => {
    const parsed = parseInt(rawValue, 10);
    const nextValue = Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
    setNumericValue(nextValue);
    setInputValue(String(nextValue));
  };

  const handleNumericInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, commit: () => void) => {
    if (event.key === "Enter") {
      commit();
      event.currentTarget.blur();
    }
  };

  // Synchronize state changes back to searchParams
  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (yearFrom !== DEFAULT_TREND_YEAR_FROM) nextParams.set("yearFrom", String(yearFrom));
    if (yearTo !== DEFAULT_TREND_YEAR_TO) nextParams.set("yearTo", String(yearTo));
    if (sortBy !== DEFAULT_TREND_SORT) nextParams.set("sortBy", sortBy);
    if (minPapers !== 2) nextParams.set("minPapers", String(minPapers));
    if (activeTab !== "overview") nextParams.set("tab", activeTab);
    if (activeTab === "topics" && verdictFilter !== "all") nextParams.set("verdict", verdictFilter);

    if (domains.length > 0) nextParams.set("domains", domains.join(","));
    if (fields.length > 0) nextParams.set("fields", fields.join(","));
    if (subfields.length > 0) nextParams.set("subfields", subfields.join(","));
    if (topicsFilter.length > 0) nextParams.set("topicsFilter", topicsFilter.join(","));

    if (domainIds.length > 0) nextParams.set("domainIds", domainIds.join(","));
    if (fieldIds.length > 0) nextParams.set("fieldIds", fieldIds.join(","));
    if (subfieldIds.length > 0) nextParams.set("subfieldIds", subfieldIds.join(","));
    if (topicIds.length > 0) nextParams.set("topicIds", topicIds.join(","));

    if (paperKinds.length > 0) nextParams.set("paperKinds", paperKinds.join(","));
    if (openAccessStatuses.length > 0) nextParams.set("openAccessStatuses", openAccessStatuses.join(","));
    if (providers.length > 0) nextParams.set("providers", providers.join(","));
    if (sources.length > 0) nextParams.set("sources", sources.join(","));
    if (languages.length > 0) nextParams.set("languages", languages.join(","));
    if (citationBands.length > 0) nextParams.set("citationBands", citationBands.join(","));

    if (selectedTopics.length > 0) nextParams.set("compare", selectedTopics.join(","));

    setSearchParams(nextParams, { replace: true });
  }, [
    yearFrom, yearTo, sortBy, minPapers, activeTab, verdictFilter,
    domains, fields, subfields, topicsFilter,
    domainIds, fieldIds, subfieldIds, topicIds,
    paperKinds, openAccessStatuses, providers, sources, languages, citationBands,
    selectedTopics, setSearchParams
  ]);

  // Hook query: Trends Overview with all active filters
  const overviewParams = useMemo<TrendsOverviewParams>(() => ({
    yearFrom,
    yearTo,
    sortBy,
    minPapers,
    domains,
    fields,
    subfields,
    topics: topicsFilter,
    domainIds,
    fieldIds,
    subfieldIds,
    topicIds,
    paperKinds,
    openAccessStatuses,
    providers,
    sources,
    languages,
    citationBands,
  }), [
    yearFrom, yearTo, sortBy, minPapers, domains, fields, subfields, topicsFilter,
    domainIds, fieldIds, subfieldIds, topicIds, paperKinds, openAccessStatuses, providers, sources, languages, citationBands,
  ]);
  const { data, isLoading, isFetching, isError } = useTrendsOverview(overviewParams);

  /** A verdict count was clicked: open the topic table filtered to it. */
  const openVerdictList = (verdict: VerdictFilter) => {
    setVerdictFilter(verdict);
    setActiveTab("topics");
    window.setTimeout(() => document.getElementById("trend-topic-table")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const [datasetMode, setDatasetMode] = useState<"corpus" | "displayed">("corpus");
  const [metricMode, setMetricMode] = useState<TrendMetricMode>("papers");
  // PP(top 10%) replaces the citation sums when the source reports it; sums are
  // dropped when the source cannot provide them.
  const resolvedMetricMode = useMemo(() => resolveMetricMode(metricMode, data?.citationTrend), [metricMode, data?.citationTrend]);
  // `focus` lets another page (e.g. topic detail) open the AI tab on its topic.
  const [focusTopic, setFocusTopic] = useState<string>(() => searchParams.get("focus")?.trim() ?? "");

  // Calculated displayed topics yearly sum
  const displayedTopicsYearlyData = useMemo(() => {
    if (!data?.topics) return [];
    const yearlyMap = new Map<number, number>();
    data.topics.forEach((t) => {
      t.yearlyBreakdown.forEach((y) => {
        yearlyMap.set(y.year, (yearlyMap.get(y.year) || 0) + y.count);
      });
    });
    return Array.from(yearlyMap.entries())
      .map(([year, count]) => ({ year: String(year), value: count }))
      .sort((a, b) => Number(a.year) - Number(b.year));
  }, [data]);

  // Unified timelineChartData based on datasetMode and metricMode. Years without
  // a value (null citation totals, no papers for PP) are left out, never drawn as 0.
  const timelineChartData = useMemo<TimelinePoint[]>(() => {
    if (!data) return [];
    let chartData: TimelinePoint[] = [];
    if (resolvedMetricMode === "pp_top10") {
      chartData = (data.citationTrend ?? []).flatMap((c) =>
        typeof c.ppTop10Pct === "number"
          ? [{ year: String(c.year), value: c.ppTop10Pct, topCount: c.topCitedCount, papers: c.count }]
          : [],
      );
    } else if (resolvedMetricMode === "citations_total") {
      chartData = (data.citationTrend ?? []).flatMap((c) =>
        typeof c.totalCitations === "number" ? [{ year: String(c.year), value: c.totalCitations }] : [],
      );
    } else if (resolvedMetricMode === "citations_avg") {
      chartData = (data.citationTrend ?? []).flatMap((c) =>
        typeof c.avgCitations === "number" ? [{ year: String(c.year), value: c.avgCitations }] : [],
      );
    } else if (datasetMode === "corpus") {
      chartData = (data.yearlyTotalPapers ?? []).map((y) => ({
        year: String(y.year),
        value: y.count,
      }));
    } else {
      chartData = displayedTopicsYearlyData;
    }

    return chartData
      .filter((item) => {
        const y = Number(item.year);
        return y >= yearFrom && y <= yearTo;
      })
      .sort((a, b) => Number(a.year) - Number(b.year));
  }, [data, datasetMode, resolvedMetricMode, displayedTopicsYearlyData, yearFrom, yearTo]);

  const peakYear = useMemo(() => {
    return [...timelineChartData].sort((a, b) => b.value - a.value)[0] ?? null;
  }, [timelineChartData]);

  // Transform data for top topics bar chart
  const barChartData = useMemo<TrendBarChartDatum[]>(() => {
    if (!data?.topics) return [];
    return sortTopics(data.topics, sortBy)
      .map((topic) => ({
        topic: topic.topic,
        taxonomy: topic.taxonomy,
        value: getTopicMetric(topic, sortBy),
        totalPapers: topic.totalPapers,
        classification: topic.classification,
        metricLabel: sortBy === "total" ? t("Total papers") : t("Relative change per year"),
        metricDisplay: formatMetricValue(getTopicMetric(topic, sortBy), sortBy),
      }))
      .slice(0, 5);
  }, [data, sortBy, t]);

  const keywordsData = useMemo<RisingKeywordRow[]>(() => {
    if (!data?.risingKeywords) return [];
    return data.risingKeywords.map((k) => ({
      keyword: k.keyword,
      growthRatePct: k.growthRatePct,
      growth: `+${k.growthRatePct}%`,
      totalPapers: k.totalPapers,
      yearlyBreakdown: k.yearlyBreakdown,
      status: k.growthRatePct > 100 ? "Hot" : "Rising",
      shift: k.shift,
    }));
  }, [data]);

  const topRisingTopic = useMemo(() => getTopRisingTopic(data?.topics ?? []), [data?.topics]);
  const fastestKeyword = useMemo(() => getFastestKeyword((data?.risingKeywords ?? [])), [data?.risingKeywords]);

  const activeFocusTopic = useMemo(() => {
    return focusTopic || topRisingTopic?.topic || data?.topics[0]?.topic || "";
  }, [focusTopic, topRisingTopic, data]);

  const scopeString = useMemo(() => {
    const parts: string[] = [];
    if (domainIds.length > 0) {
      const name = data?.facets?.domains?.find(d => d.openalexId === domainIds[0] || d.id === domainIds[0])?.name || domainIds[0];
      if (name) parts.push(name);
    } else if (domains.length > 0 && domains[0]) {
      parts.push(domains[0]);
    }

    if (fieldIds.length > 0) {
      const name = data?.facets?.fields?.find(f => f.openalexId === fieldIds[0] || f.id === fieldIds[0])?.name || fieldIds[0];
      if (name) parts.push(name);
    } else if (fields.length > 0 && fields[0]) {
      parts.push(fields[0]);
    }

    if (subfieldIds.length > 0) {
      const name = data?.facets?.subfields?.find(s => s.openalexId === subfieldIds[0] || s.id === subfieldIds[0])?.name || subfieldIds[0];
      if (name) parts.push(name);
    } else if (subfields.length > 0 && subfields[0]) {
      parts.push(subfields[0]);
    }

    if (topicIds.length > 0) {
      const name = data?.facets?.topics?.find(t => t.openalexId === topicIds[0] || t.id === topicIds[0])?.name || topicIds[0];
      if (name) parts.push(name);
    } else if (topicsFilter.length > 0 && topicsFilter[0]) {
      parts.push(topicsFilter[0]);
    }

    return parts.length > 0 ? parts.join(" → ") : "All OpenAlex domains";
  }, [data, domainIds, domains, fieldIds, fields, subfieldIds, subfields, topicIds, topicsFilter]);

  // Hook queries for sub-features
  const compareQuery = useTrendCompare(
    {
      topics: selectedTopics,
      yearFrom,
      yearTo,
      domains,
      fields,
      subfields,
      domainIds,
      fieldIds,
      subfieldIds,
      topicIds,
      paperKinds,
      openAccessStatuses,
      providers,
      sources,
      languages,
      citationBands,
    },
    selectedTopics.length >= 2
  );

  const relationshipsQuery = useTrendRelationships(
    {
      topic: activeFocusTopic,
      yearFrom,
      yearTo,
      limit: 12,
      domains,
      fields,
      subfields,
      topics: topicsFilter,
      domainIds,
      fieldIds,
      subfieldIds,
      topicIds,
      paperKinds,
      openAccessStatuses,
      providers,
      sources,
      languages,
      citationBands,
    },
    !!activeFocusTopic
  );

  const explainMutation = useExplainTrend();
  const explainHistoryQuery = useTrendExplainHistory({ topic: activeFocusTopic, limit: 5 }, activeTab === "ai" && !!activeFocusTopic);


  // Taxonomy selector clear and toggle actions
  const toggleFilter = <T extends string>(list: T[], setList: React.Dispatch<React.SetStateAction<T[]>>, val: T) => {
    setList(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
  };

  const handleBucketClick = (facet: string, val: string, openalexId?: string) => {
    const isClear = !val && !openalexId;
    if (facet === "Domains") {
      if (isClear) {
        setDomainIds([]);
        setDomains([]);
      } else if (openalexId) {
        setDomainIds(prev => prev.includes(openalexId) ? [] : [openalexId]);
        setDomains([]);
      } else {
        setDomains(prev => prev.includes(val) ? [] : [val]);
        setDomainIds([]);
      }
      setFieldIds([]); setFields([]);
      setSubfieldIds([]); setSubfields([]);
      setTopicIds([]); setTopicsFilter([]);
    } else if (facet === "Fields") {
      if (isClear) {
        setFieldIds([]);
        setFields([]);
      } else if (openalexId) {
        setFieldIds(prev => prev.includes(openalexId) ? [] : [openalexId]);
        setFields([]);
      } else {
        setFields(prev => prev.includes(val) ? [] : [val]);
        setFieldIds([]);
      }
      setSubfieldIds([]); setSubfields([]);
      setTopicIds([]); setTopicsFilter([]);
    } else if (facet === "Subfields") {
      if (isClear) {
        setSubfieldIds([]);
        setSubfields([]);
      } else if (openalexId) {
        setSubfieldIds(prev => prev.includes(openalexId) ? [] : [openalexId]);
        setSubfields([]);
      } else {
        setSubfields(prev => prev.includes(val) ? [] : [val]);
        setSubfieldIds([]);
      }
      setTopicIds([]); setTopicsFilter([]);
    } else if (facet === "Topics") {
      if (isClear) {
        setTopicIds([]);
        setTopicsFilter([]);
      } else if (openalexId) {
        setTopicIds(prev => prev.includes(openalexId) ? [] : [openalexId]);
        setTopicsFilter([]);
      } else {
        setTopicsFilter(prev => prev.includes(val) ? [] : [val]);
        setTopicIds([]);
      }
    } else if (facet === "Paper Types") {
      toggleFilter(paperKinds, setPaperKinds, val);
    } else if (facet === "Open Access") {
      toggleFilter(openAccessStatuses, setOpenAccessStatuses, val);
    } else if (facet === "Providers") {
      toggleFilter(providers, setProviders, val);
    } else if (facet === "Top Sources") {
      toggleFilter(sources, setSources, val);
    } else if (facet === "Languages") {
      toggleFilter(languages, setLanguages, val);
    } else if (facet === "Citation Bands") {
      if (isCitationBand(val)) {
        toggleFilter<CitationBand>(citationBands, setCitationBands, val);
      }
    }
  };

  const clearAllFilters = () => {
    setDomains([]);
    setFields([]);
    setSubfields([]);
    setTopicsFilter([]);
    setDomainIds([]);
    setFieldIds([]);
    setSubfieldIds([]);
    setTopicIds([]);
    setPaperKinds([]);
    setOpenAccessStatuses([]);
    setProviders([]);
    setSources([]);
    setLanguages([]);
    setCitationBands([]);
  };

  const hasAnyFilter = useMemo(() => {
    return (
      domains.length > 0 || fields.length > 0 || subfields.length > 0 || topicsFilter.length > 0 ||
      domainIds.length > 0 || fieldIds.length > 0 || subfieldIds.length > 0 || topicIds.length > 0 ||
      paperKinds.length > 0 || openAccessStatuses.length > 0 || providers.length > 0 || sources.length > 0 ||
      languages.length > 0 || citationBands.length > 0
    );
  }, [
    domains, fields, subfields, topicsFilter,
    domainIds, fieldIds, subfieldIds, topicIds,
    paperKinds, openAccessStatuses, providers, sources, languages, citationBands
  ]);

  const buildScopedUrl = (path: string, baseParams: Record<string, string>) => {
    const params = new URLSearchParams(baseParams);
    params.set("yearFrom", String(yearFrom));
    params.set("yearTo", String(yearTo));

    const addList = (key: string, values: string[]) => {
      const cleaned = values.map((value) => value.trim()).filter(Boolean);
      if (cleaned.length > 0) params.set(key, cleaned.join(","));
    };

    addList("domainIds", domainIds);
    addList("domains", domains);
    addList("fieldIds", fieldIds);
    addList("fields", fields);
    addList("subfieldIds", subfieldIds);
    addList("subfields", subfields);
    addList("topicIds", topicIds);
    addList("topics", topicsFilter);
    addList("topicsFilter", topicsFilter);
    addList("paperKinds", paperKinds);
    addList("openAccessStatuses", openAccessStatuses);
    addList("providers", providers);
    addList("sources", sources);
    addList("languages", languages);
    addList("citationBands", citationBands);

    return `${path}?${params.toString()}`;
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();

    const currentIndex = TREND_TABS.findIndex((tab) => tab.id === activeTab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + TREND_TABS.length) % TREND_TABS.length;
    const nextTab = TREND_TABS[nextIndex];
    if (nextTab) {
      setActiveTab(nextTab.id);
      window.requestAnimationFrame(() => {
        document.getElementById(`trends-tab-${nextTab.id}`)?.focus();
      });
    }
  };

  if (isLoading && !data) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
        <p className="text-slate-500">Loading trends data...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 1. Page Intro */}
      <div className="mb-6 select-none space-y-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">Research Trend Workbench</h1>
            <DataSourceBadge source={data?.dataSource} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Find rising research topics, validate whether the signal is reliable, and move from trend to papers, reports, or AI explanation.</p>
        </div>

        {/* Unified Workflow mini guide (Premium UI) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500 dark:text-slate-400 pt-1 select-none">
          <span className="font-extrabold text-[#001b69] dark:text-blue-400 uppercase tracking-widest text-[8px] bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded border border-slate-200/40 dark:border-slate-700/30">
            Workflow Guide
          </span>
          <span className="font-bold text-slate-700 dark:text-slate-350">1. Choose research area</span>
          <span className="text-slate-300 dark:text-slate-650">➔</span>
          <span className="font-bold text-slate-700 dark:text-slate-350">2. Read trend signals</span>
          <span className="text-slate-300 dark:text-slate-650">➔</span>
          <span className="font-bold text-slate-700 dark:text-slate-350">3. Act on findings (papers, compare, report, AI)</span>
        </div>
      </div>

      {/* 2. Trend Control Center */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6 w-full space-y-4">
        {/* Row 1: Search, Year range, Sort, Min papers, AI report */}
        <div className="flex flex-col md:flex-row items-stretch md:items-start gap-4 flex-wrap w-full">
          <div className="flex-1 w-full md:w-auto min-w-[200px] relative">
            <div className="relative">
              <button
                type="button"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 z-10"
                onClick={(e) => {
                  const input = e.currentTarget.nextElementSibling as HTMLInputElement;
                  const val = input.value.trim();
                  if (val) navigate(openTopicTarget(val));
                }}
              >
                <Search className="w-4 h-4" />
              </button>
              <input
                type="text"
                placeholder="Search a topic to open detail..."
                className="w-full h-10 pl-10 pr-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-600 transition-shadow"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = e.currentTarget.value.trim();
                    if (val) navigate(openTopicTarget(val));
                  }
                }}
              />
            </div>
            <span className="text-[10px] text-slate-550 dark:text-slate-400 block mt-1 pl-1">
              Opens a topic page. Dashboard cards and charts update from year range, OpenAlex scope, and active filters.
            </span>
          </div>

          {/* Year Range */}
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <input
              type="number"
              value={yearFromInput}
              onChange={(e) => setYearFromInput(e.target.value)}
              onBlur={() => commitNumericInput(yearFromInput, DEFAULT_TREND_YEAR_FROM, 1900, setYearFrom, setYearFromInput)}
              onKeyDown={(e) => handleNumericInputKeyDown(e, () => commitNumericInput(yearFromInput, DEFAULT_TREND_YEAR_FROM, 1900, setYearFrom, setYearFromInput))}
              placeholder={t("From")}
              className="w-full md:w-20 h-10 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-center text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            <span className="text-slate-400">-</span>
            <input
              type="number"
              value={yearToInput}
              onChange={(e) => setYearToInput(e.target.value)}
              onBlur={() => commitNumericInput(yearToInput, DEFAULT_TREND_YEAR_TO, 1900, setYearTo, setYearToInput)}
              onKeyDown={(e) => handleNumericInputKeyDown(e, () => commitNumericInput(yearToInput, DEFAULT_TREND_YEAR_TO, 1900, setYearTo, setYearToInput))}
              placeholder={t("To")}
              className="w-full md:w-20 h-10 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-center text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>

          {/* Sort By */}
          <div className="relative shrink-0 w-full md:w-auto">
            <select
              value={sortBy}
              aria-label={t("Sort topics by")}
              onChange={(e) => {
                setSortBy(parseTrendSortKey(e.target.value));
              }}
              className="w-full md:w-auto h-10 pl-3 pr-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 appearance-none cursor-pointer"
            >
              <option value="trend">{t("Trend (default)")}</option>
              <option value="total">{t("Total papers")}</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>

          {/* Min Papers */}
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap" title="Hide noisy topics with fewer than this many papers in the selected window.">Min Papers:</span>
            <input
              type="number"
              value={minPapersInput}
              min="1"
              onChange={(e) => setMinPapersInput(e.target.value)}
              onBlur={() => commitNumericInput(minPapersInput, 2, 1, setMinPapers, setMinPapersInput)}
              onKeyDown={(e) => handleNumericInputKeyDown(e, () => commitNumericInput(minPapersInput, 2, 1, setMinPapers, setMinPapersInput))}
              className="w-full md:w-16 h-10 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-center text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600"
              title="Hide noisy topics with fewer than this many papers in the selected window."
            />
          </div>

          <div className="flex w-full md:w-auto gap-3 shrink-0 ml-auto justify-end">
            <Button
              className="flex-1 md:flex-none h-10 px-6 bg-[#001b69] hover:bg-[#001040] text-white font-bold rounded-lg gap-2 shadow-md transition-colors"
              onClick={() => navigate(buildScopedUrl("/reports", {
                create: "true",
                topic: scopeString,
                query: `Analyze research trends, research gaps, and future directions within ${scopeString}.`,
              }))}
            >
              <Sparkles className="w-4 h-4" fill="currentColor" /> Generate AI Report
            </Button>
          </div>
        </div>

        {/* Row 2: OpenAlex Scope Taxonomy Selector (P2 Request) */}
        {data?.facets && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 select-none space-y-3">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900 dark:text-white">OpenAlex scope</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Narrow the paper dataset before viewing trends, topics, comparisons, and AI explanations.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              {/* Domain Dropdown */}
              <div className="relative w-full">
                <select
                  value={domainIds[0] || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = data.facets.domains.find(d => d.openalexId === id || d.id === id)?.name || "";
                    handleBucketClick("Domains", name, id);
                  }}
                  className="h-9 w-full px-3 pr-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.5em 1.5em', backgroundRepeat: 'no-repeat' }}
                >
                  <option value="">All Domains</option>
                  {data.facets.domains.map(d => (
                    <option key={d.openalexId ?? d.id} value={d.openalexId ?? d.id}>{d.name} ({d.count})</option>
                  ))}
                </select>
              </div>

              {/* Field Dropdown */}
              <div className="relative w-full">
                <select
                  value={fieldIds[0] || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = data.facets.fields?.find(f => f.openalexId === id || f.id === id)?.name || "";
                    handleBucketClick("Fields", name, id);
                  }}
                  className="h-9 w-full px-3 pr-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer appearance-none"
                  disabled={!data.facets.fields || data.facets.fields.length === 0}
                  style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.5em 1.5em', backgroundRepeat: 'no-repeat' }}
                >
                  <option value="">All Fields</option>
                  {data.facets.fields?.map(f => (
                    <option key={f.openalexId ?? f.id} value={f.openalexId ?? f.id}>{f.name} ({f.count})</option>
                  ))}
                </select>
              </div>

              {/* Subfield Dropdown */}
              <div className="relative w-full">
                <select
                  value={subfieldIds[0] || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = data.facets.subfields?.find(s => s.openalexId === id || s.id === id)?.name || "";
                    handleBucketClick("Subfields", name, id);
                  }}
                  className="h-9 w-full px-3 pr-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer appearance-none"
                  disabled={!data.facets.subfields || data.facets.subfields.length === 0}
                  style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.5em 1.5em', backgroundRepeat: 'no-repeat' }}
                >
                  <option value="">All Subfields</option>
                  {data.facets.subfields?.map(s => (
                    <option key={s.openalexId ?? s.id} value={s.openalexId ?? s.id}>{s.name} ({s.count})</option>
                  ))}
                </select>
              </div>

              {/* Topic Dropdown */}
              <div className="relative w-full">
                <select
                  value={topicIds[0] || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = data.facets.topics?.find(t => t.openalexId === id || t.id === id)?.name || "";
                    handleBucketClick("Topics", name, id);
                  }}
                  className="h-9 w-full px-3 pr-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer appearance-none"
                  disabled={!data.facets.topics || data.facets.topics.length === 0}
                  style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.5em 1.5em', backgroundRepeat: 'no-repeat' }}
                >
                  <option value="">All Topics</option>
                  {data.facets.topics?.map(t => (
                    <option key={t.openalexId ?? t.id} value={t.openalexId ?? t.id}>{t.name} ({t.count})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        <ScopeNotice notice={data?.scopeNotice} />
      </div>

      {/* 3. Current Scope Summary */}
      {/* Active Scope Breadcrumb */}
      {(domainIds.length > 0 || fieldIds.length > 0 || subfieldIds.length > 0 || topicIds.length > 0) && (
        <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/10 px-4 py-2.5 rounded-xl border border-blue-100/50 dark:border-blue-900/30 mb-4 overflow-x-auto whitespace-nowrap">
          <span className="text-slate-550 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider mr-1 select-none">Scope:</span>
          {domainIds.length > 0 && (
            <span className="capitalize">{data?.facets?.domains?.find(d => d.openalexId === domainIds[0] || d.id === domainIds[0])?.name ?? domainIds[0]}</span>
          )}
          {fieldIds.length > 0 && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="capitalize">{data?.facets?.fields?.find(f => f.openalexId === fieldIds[0] || f.id === fieldIds[0])?.name ?? fieldIds[0]}</span>
            </>
          )}
          {subfieldIds.length > 0 && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="capitalize">{data?.facets?.subfields?.find(s => s.openalexId === subfieldIds[0] || s.id === subfieldIds[0])?.name ?? subfieldIds[0]}</span>
            </>
          )}
          {topicIds.length > 0 && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="capitalize">{data?.facets?.topics?.find(t => t.openalexId === topicIds[0] || t.id === topicIds[0])?.name ?? topicIds[0]}</span>
            </>
          )}
          <button
            onClick={() => {
              setDomainIds([]);
              setFieldIds([]);
              setSubfieldIds([]);
              setTopicIds([]);
            }}
            className="ml-auto text-red-650 hover:text-red-700 font-extrabold flex items-center gap-1 pl-4 border-l border-slate-200 dark:border-slate-800"
          >
            <X className="w-3 h-3" /> Clear scope
          </button>
        </div>
      )}

      {/* Active Filter Chips */}
      {hasAnyFilter && (
        <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-slate-50 dark:bg-slate-900/10 border border-slate-200/50 dark:border-slate-800/40 rounded-xl">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1 select-none">Active Filters:</span>
          {paperKinds.map((x) => (
            <FilterChip key={x} label={`Type: ${x}`} onRemove={() => toggleFilter(paperKinds, setPaperKinds, x)} />
          ))}
          {openAccessStatuses.map((x) => (
            <FilterChip key={x} label={`OA: ${x}`} onRemove={() => toggleFilter(openAccessStatuses, setOpenAccessStatuses, x)} />
          ))}
          {providers.map((x) => (
            <FilterChip key={x} label={`Provider: ${x}`} onRemove={() => toggleFilter(providers, setProviders, x)} />
          ))}
          {sources.map((x) => (
            <FilterChip
              key={x}
              label={`Source: ${data?.facets?.topSources?.find((b) => b.id === x || b.name === x)?.name ?? x}`}
              onRemove={() => toggleFilter(sources, setSources, x)}
            />
          ))}
          {languages.map((x) => (
            <FilterChip
              key={x}
              label={`Language: ${formatLanguageName(x)}`}
              onRemove={() => toggleFilter(languages, setLanguages, x)}
            />
          ))}
          {citationBands.map((x) => (
            <FilterChip key={x} label={`Citations: ${x}`} onRemove={() => toggleFilter<CitationBand>(citationBands, setCitationBands, x)} />
          ))}
          {domains.map((x) => (
            <FilterChip key={x} label={`Domain: ${x}`} onRemove={() => toggleFilter(domains, setDomains, x)} />
          ))}
          {fields.map((x) => (
            <FilterChip key={x} label={`Field: ${x}`} onRemove={() => toggleFilter(fields, setFields, x)} />
          ))}
          {subfields.map((x) => (
            <FilterChip key={x} label={`Subfield: ${x}`} onRemove={() => toggleFilter(subfields, setSubfields, x)} />
          ))}
          {topicsFilter.map((x) => (
            <FilterChip key={x} label={`Topic: ${x}`} onRemove={() => toggleFilter(topicsFilter, setTopicsFilter, x)} />
          ))}

          {domainIds.map((x) => {
            const name = data?.facets?.domains?.find(b => b.openalexId === x || b.id === x)?.name ?? x;
            return (
              <FilterChip key={x} label={`Domain: ${name}`} onRemove={() => toggleFilter(domainIds, setDomainIds, x)} />
            );
          })}
          {fieldIds.map((x) => {
            const name = data?.facets?.fields?.find(b => b.openalexId === x || b.id === x)?.name ?? x;
            return (
              <FilterChip key={x} label={`Field: ${name}`} onRemove={() => toggleFilter(fieldIds, setFieldIds, x)} />
            );
          })}
          {subfieldIds.map((x) => {
            const name = data?.facets?.subfields?.find(b => b.openalexId === x || b.id === x)?.name ?? x;
            return (
              <FilterChip key={x} label={`Subfield: ${name}`} onRemove={() => toggleFilter(subfieldIds, setSubfieldIds, x)} />
            );
          })}
          {topicIds.map((x) => {
            const name = data?.facets?.topics?.find(b => b.openalexId === x || b.id === x)?.name ?? x;
            return (
              <FilterChip key={x} label={`Topic: ${name}`} onRemove={() => toggleFilter(topicIds, setTopicIds, x)} />
            );
          })}

          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs font-bold text-red-650 hover:text-red-700 transition-colors ml-auto px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Empty / Error States or Tabs Content */}
      {isError ? (
        <div className="w-full min-h-[350px] flex flex-col items-center justify-center text-center bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm">
          <p className="text-lg font-bold text-slate-900 dark:text-white">Failed to load trends data.</p>
          <p className="text-sm text-slate-500 mt-2">Please check your network connection or adjust your filters and try again.</p>
        </div>
      ) : !data?.topics?.length ? (
        <div className="w-full min-h-[350px] flex flex-col items-center justify-center text-center bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm select-none">
          <AlertCircle className="w-10 h-10 text-amber-500 mb-4 animate-bounce" />
          <p className="text-lg font-bold text-slate-900 dark:text-white">No trends found for this scope.</p>

          {/* Active scope details */}
          {(domainIds.length > 0 || fieldIds.length > 0 || subfieldIds.length > 0 || topicIds.length > 0) && (
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-4 py-2 rounded-xl mt-3 mb-4 max-w-md border border-slate-200/50 dark:border-slate-800/40">
              Active Scope: {" "}
              {topicIds.length > 0 ? "Topic Filter" :
               subfieldIds.length > 0 ? "Subfield Filter" :
               fieldIds.length > 0 ? "Field Filter" : "Domain Filter"}
            </div>
          )}

          <p className="text-sm text-slate-500 max-w-md leading-relaxed">
            Try clearing the deepest filter first (e.g. Topic or Subfield) to broaden your scope, lowering "Min Papers", or expanding the year range.
          </p>

          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              className="h-9 px-4 font-bold text-xs rounded-lg"
              onClick={() => {
                if (topicIds.length > 0) setTopicIds([]);
                else if (subfieldIds.length > 0) setSubfieldIds([]);
                else if (fieldIds.length > 0) setFieldIds([]);
                else if (domainIds.length > 0) setDomainIds([]);
              }}
              disabled={!(domainIds.length > 0 || fieldIds.length > 0 || subfieldIds.length > 0 || topicIds.length > 0)}
            >
              Clear deepest filter
            </Button>
            <Button
              type="button"
              className="h-9 px-4 font-bold text-xs rounded-lg bg-red-650 hover:bg-red-750 text-white"
              onClick={() => {
                setDomainIds([]);
                setFieldIds([]);
                setSubfieldIds([]);
                setTopicIds([]);
              }}
            >
              Clear taxonomy filters
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Current analysis dataset strip (Guided UX) */}
          {data && (
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6 text-xs text-slate-600 dark:text-slate-400 select-none">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-bold text-slate-900 dark:text-slate-200">Current analysis dataset basis</p>
                  <p className="font-medium text-slate-650 dark:text-slate-350">
                    {isFetching && !isLoading ? "Updating scoped dataset... " : ""}
                    Analyzing <strong className="text-blue-600 dark:text-blue-400 font-extrabold">{formatNumber(data.totalPapersInWindow)}</strong> active papers across <strong className="text-blue-600 dark:text-blue-400 font-extrabold">{formatNumber(data.uniqueTopicsInScope ?? data.topics.length)}</strong> unique topics. Trend metrics use complete years through <strong className="text-slate-900 dark:text-slate-100 font-extrabold">{data.lastCompleteYear}</strong>; {yearTo > data.lastCompleteYear ? `${yearTo} is shown as YTD.` : ""}.
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-450">
                    Scope: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{scopeString}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 md:ml-auto">
                  <span className="text-[9px] bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200/50 dark:border-emerald-800/30">
                    Affected by: Year range
                  </span>
                  <span className="text-[9px] bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200/50 dark:border-emerald-800/30">
                    Affected by: OpenAlex scope
                  </span>
                  <span className="text-[9px] bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200/50 dark:border-emerald-800/30">
                    Affected by: Facets
                  </span>
                  <span className="text-[9px] bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-slate-500 dark:text-slate-450 font-bold border border-slate-200/50 dark:border-slate-800/30">
                    Not affected by: Topic detail search
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 4. Tabs Navigation (Premium Segmented Control) */}
          <div
            role="tablist"
            aria-label="Trend analysis sections"
            onKeyDown={handleTabKeyDown}
            className="mb-6 flex h-10 w-full max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-xl border border-blue-100/70 bg-blue-50/40 p-1 shadow-sm [scrollbar-width:none] dark:border-slate-800 dark:bg-slate-900 [&::-webkit-scrollbar]:hidden"
          >
            {TREND_TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`trends-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`trends-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-8 px-4 inline-flex items-center justify-center text-xs font-bold rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:focus-visible:ring-offset-slate-950 ${
                    selected
                      ? "bg-blue-700 text-white shadow-md font-extrabold border border-blue-800/10"
                      : "text-slate-650 dark:text-slate-400 hover:text-blue-700 hover:bg-blue-100/30 dark:hover:bg-slate-800/50"
                  }`}
                >
                  {t(tab.label)}
                </button>
              );
            })}
          </div>

          {/* 5. Tab Panels (Senior Component Split) */}
          <div id="trends-tab-panels" className="w-full scroll-mt-24">
            {activeTab === "overview" && (
              <OverviewTab
                data={data}
                metricMode={resolvedMetricMode}
                setMetricMode={setMetricMode}
                datasetMode={datasetMode}
                setDatasetMode={setDatasetMode}
                peakYear={peakYear}
                timelineChartData={timelineChartData}
                topRisingTopic={topRisingTopic}
                fastestKeyword={fastestKeyword}
                navigate={navigate}
                setActiveTab={setActiveTab}
                getTopicTrendTarget={openTopicTarget}
                getRisingKeywordTarget={getRisingKeywordTarget}
                setYearFrom={setYearFrom}
                setYearTo={setYearTo}
                onSelectVerdict={openVerdictList}
                scopeParams={{
                  yearFrom,
                  yearTo,
                  domainIds,
                  domains,
                  fieldIds,
                  fields,
                  subfieldIds,
                  subfields,
                  topicIds,
                  topicsFilter,
                  paperKinds,
                  openAccessStatuses,
                  providers,
                  sources,
                  languages,
                  citationBands,
                }}
              />
            )}

            {activeTab === "topics" && (
              <TopicsTab
                data={data}
                barChartData={barChartData}
                keywordsData={keywordsData}
                sortBy={sortBy}
                navigate={navigate}
                getTopicTrendTarget={openTopicTarget}
                getRisingKeywordTarget={getRisingKeywordTarget}
                selectedTopics={selectedTopics}
                setSelectedTopics={setSelectedTopics}
                setActiveTab={setActiveTab}
                setFocusTopic={setFocusTopic}
                verdictFilter={verdictFilter}
                setVerdictFilter={setVerdictFilter}
                overviewParams={overviewParams}
                scopeParams={{
                  yearFrom,
                  yearTo,
                  domainIds,
                  domains,
                  fieldIds,
                  fields,
                  subfieldIds,
                  subfields,
                  topicIds,
                  topicsFilter,
                  paperKinds,
                  openAccessStatuses,
                  providers,
                  sources,
                  languages,
                  citationBands,
                }}
              />
            )}

            {activeTab === "periods" && (
              <PeriodsTab
                onOpenTopic={(topic, openalexTopicId) => navigate(openTopicTarget(topic, openalexTopicId))}
                scope={{
                  sortBy,
                  minPapers,
                  domains,
                  fields,
                  subfields,
                  topics: topicsFilter,
                  domainIds,
                  fieldIds,
                  subfieldIds,
                  topicIds,
                  paperKinds,
                  openAccessStatuses,
                  providers,
                  sources,
                  languages,
                  citationBands,
                }}
              />
            )}

            {activeTab === "dataset" && (
              <DatasetTab
                data={data}
                yearFrom={yearFrom}
                yearTo={yearTo}
                domainIds={domainIds}
                domains={domains}
                fieldIds={fieldIds}
                fields={fields}
                subfieldIds={subfieldIds}
                subfields={subfields}
                topicIds={topicIds}
                topicsFilter={topicsFilter}
                paperKinds={paperKinds}
                openAccessStatuses={openAccessStatuses}
                providers={providers}
                sources={sources}
                languages={languages}
                citationBands={citationBands}
                handleBucketClick={handleBucketClick}
                setActiveTab={setActiveTab}
                navigate={navigate}
                clearAllFilters={clearAllFilters}
                hasAnyFilter={hasAnyFilter}
                isUpdating={isFetching}
              />
            )}

            {activeTab === "compare" && (
              <CompareTab
                data={data}
                selectedTopics={selectedTopics}
                setSelectedTopics={setSelectedTopics}
                compareQuery={compareQuery}
                yearFrom={yearFrom}
                yearTo={yearTo}
                sortBy={sortBy}
                setFocusTopic={setFocusTopic}
                setActiveTab={setActiveTab}
                clearAllFilters={clearAllFilters}
                scopeParams={{
                  yearFrom,
                  yearTo,
                  domainIds,
                  domains,
                  fieldIds,
                  fields,
                  subfieldIds,
                  subfields,
                  topicIds,
                  topicsFilter,
                  paperKinds,
                  openAccessStatuses,
                  providers,
                  sources,
                  languages,
                  citationBands,
                }}
              />
            )}

            {activeTab === "ai" && (
              <AITab
                data={data}
                activeFocusTopic={activeFocusTopic}
                setFocusTopic={setFocusTopic}
                relationshipsQuery={relationshipsQuery}
                explainMutation={explainMutation}
                explainHistoryQuery={explainHistoryQuery}
                yearFrom={yearFrom}
                yearTo={yearTo}
                domains={domains}
                fields={fields}
                subfields={subfields}
                topicsFilter={topicsFilter}
                domainIds={domainIds}
                fieldIds={fieldIds}
                subfieldIds={subfieldIds}
                topicIds={topicIds}
                paperKinds={paperKinds}
                openAccessStatuses={openAccessStatuses}
                providers={providers}
                sources={sources}
                languages={languages}
                citationBands={citationBands}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
