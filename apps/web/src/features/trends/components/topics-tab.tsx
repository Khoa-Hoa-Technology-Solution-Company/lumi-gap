import React, { useMemo, useState } from "react";
import { ResponsiveContainer, Area, AreaChart } from "recharts";
import type { TrendsOverview, YearlyCount } from "@trend/shared-types";
import { type RisingKeywordRow, type TrendBarChartDatum } from "./trends-shared.components";
import { isSmallBaseKeyword, formatSigned, type TrendSortKey } from "../../../pages/trends.insights";
import { formatNumber } from "@/utils";
import {
  Compass,
  LineChart,
  Search,
  GitCompare,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  FileText,
  HelpCircle,
  Flame,
  Zap,
  ArrowRight,
  TrendingUp,
  ArrowDown,
  ArrowUpDown
} from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TrendTabId = "overview" | "topics" | "dataset" | "compare" | "ai";

interface TopicsTabProps {
  data: TrendsOverview;
  barChartData: TrendBarChartDatum[];
  keywordsData: RisingKeywordRow[];
  sortBy: TrendSortKey;
  navigate: (path: string) => void;
  getTopicTrendTarget: (topic: string) => string;
  getRisingKeywordTarget: (keyword: string) => string;
  selectedTopics: string[];
  setSelectedTopics: (topics: string[]) => void;
  setActiveTab: (tab: TrendTabId) => void;
  setFocusTopic: (topic: string) => void;
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

export function TopicsTab({
  data,
  barChartData,
  keywordsData,
  sortBy,
  navigate,
  getTopicTrendTarget,
  getRisingKeywordTarget,
  selectedTopics,
  setSelectedTopics,
  setActiveTab,
  setFocusTopic,
  scopeParams,
}: TopicsTabProps) {
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
      ? buildScopedUrl("/reports", {
          create: "true",
          topic,
          query: `Analyze research trends and gaps for ${topic}`,
        })
      : `/reports?create=true&topic=${encodeURIComponent(topic)}&query=${encodeURIComponent(`Analyze research trends and gaps for ${topic}`)}`;
  };

  const strongestTopic = useMemo(() => {
    if (!data.topics || data.topics.length === 0) return null;
    return [...data.topics].sort((a, b) => b.momentum - a.momentum)[0];
  }, [data.topics]);

  const earlyKeyword = useMemo(() => {
    if (!keywordsData || keywordsData.length === 0) return null;
    const nonSmallBase = keywordsData.filter(k => !isSmallBaseKeyword(k));
    if (nonSmallBase.length === 0) return null;
    return [...nonSmallBase].sort((a, b) => b.growthRatePct - a.growthRatePct)[0];
  }, [keywordsData]);

  const exploratorySignal = useMemo(() => {
    if (!keywordsData || keywordsData.length === 0) return null;
    const smallBase = keywordsData.filter(k => isSmallBaseKeyword(k));
    if (smallBase.length === 0) return null;
    return [...smallBase].sort((a, b) => b.growthRatePct - a.growthRatePct)[0];
  }, [keywordsData]);

  // 2. State & Logic cho Quick Sort nội bộ
  const [localSortBy, setLocalSortBy] = useState<"momentum" | "papers" | "growth">(sortBy === "total" ? "papers" : sortBy);

  const sortedTopics = useMemo(() => {
    const list = [...barChartData];
    if (localSortBy === "momentum") {
      return list.sort((a, b) => b.momentum - a.momentum);
    }
    if (localSortBy === "papers") {
      return list.sort((a, b) => b.totalPapers - a.totalPapers);
    }
    if (localSortBy === "growth") {
      return list.sort((a, b) => b.growthRatePct - a.growthRatePct);
    }
    return list;
  }, [barChartData, localSortBy]);

  // 3. Logic cho các nút hành động
  const handleCompare = (topic: string) => {
    if (selectedTopics.includes(topic)) {
      setActiveTab("compare");
      toast.info(`"${topic}" is already in comparison.`);
      return;
    }
    if (selectedTopics.length >= 5) {
      toast.warning("You can compare up to 5 topics at once.");
      return;
    }
    setSelectedTopics([...selectedTopics, topic]);
    setActiveTab("compare");
    toast.success(`Added "${topic}" to Compare workbench.`);
  };

  const handleExplain = (topic: string) => {
    setFocusTopic(topic);
    setActiveTab("ai");
    toast.success(`Loaded "${topic}" for AI analysis explanation.`);
  };

  const getSignalQuality = (row: RisingKeywordRow) => {
    if (row.totalPapers < 15) {
      return {
        label: "Exploratory (Small Base < 15 papers)",
        shortLabel: "Exploratory",
        bg: "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/30",
        tooltip: "Early signal matched from paper keywords with a small paper base (<15 papers). High potential volatility."
      };
    }
    if (row.growthRatePct > 50) {
      return {
        label: "Hot Signal",
        shortLabel: "Hot Signal",
        bg: "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-250/20 dark:border-red-900/30",
        tooltip: "High-momentum signal with an established base (≥15 papers)."
      };
    }
    return {
      label: "Rising Signal",
      shortLabel: "Rising Signal",
      bg: "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-900/30",
      tooltip: "Steady growth signal with an established base (≥15 papers)."
    };
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        {/* 1. Workflow Header Guide */}
        <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-blue-600 dark:text-blue-455" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Signal Discovery Workflow</h3>
            </div>
            <p className="text-xs text-slate-555 dark:text-slate-400 leading-relaxed max-w-3xl">
              Uncover promising research directions inside the current dataset. Review the strongest topics, discover early keywords inside papers, and move directly to comparative plotting or AI reports.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-455 dark:text-slate-555">
            <span>Find Signal</span>
            <ChevronRight className="w-3 h-3 text-slate-350 dark:text-slate-650" />
            <span>Compare Scope</span>
            <ChevronRight className="w-3 h-3 text-slate-350 dark:text-slate-650" />
            <span>Explain Trend</span>
          </div>
        </div>

        {/* 2. Top section: What should I read next? */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Strongest Topic */}
          <div className="relative overflow-hidden bg-gradient-to-br from-blue-50/70 to-indigo-50/20 dark:from-blue-950/25 dark:to-slate-900/30 border border-blue-100 dark:border-blue-900/40 rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_12px_rgba(0,0,0,0.02)] hover:shadow-md transition-all duration-300 group select-none">
            <div className="space-y-3.5 relative z-10">
              <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-455 uppercase tracking-widest text-[9.5px] font-extrabold bg-blue-100/50 dark:bg-blue-950/60 px-2 py-0.5 rounded w-fit">
                <Flame className="w-3.5 h-3.5" />
                Strongest Topic
              </div>
              {strongestTopic ? (
                <>
                  <h4 className="text-base font-extrabold text-slate-900 dark:text-white truncate" title={strongestTopic.topic}>
                    {strongestTopic.topic}
                  </h4>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <span className="bg-white/80 dark:bg-slate-900/60 border border-blue-100/60 dark:border-blue-900/30 text-slate-700 dark:text-slate-350 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      Momentum: <strong className="text-blue-600 dark:text-blue-455 font-extrabold">{formatSigned(strongestTopic.momentum, 2)}</strong>
                    </span>
                    <span className="bg-white/80 dark:bg-slate-900/60 border border-blue-100/60 dark:border-blue-900/30 text-slate-700 dark:text-slate-350 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      Volume: <strong className="text-slate-900 dark:text-white font-extrabold">{formatNumber(strongestTopic.totalPapers)}</strong>
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-455">No topic data available</p>
              )}
            </div>

            {/* Decal background icon */}
            <TrendingUp className="w-16 h-16 text-blue-500/10 dark:text-blue-400/5 absolute right-3 bottom-3 select-none pointer-events-none group-hover:scale-110 transition-transform duration-300" />

            {strongestTopic && (
              <button
                onClick={() => navigate(getTopicTrendTarget(strongestTopic.topic))}
                className="mt-5 relative z-10 px-3.5 py-1.5 bg-white hover:bg-blue-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-blue-200/50 dark:border-blue-900/40 text-blue-700 dark:text-blue-400 rounded-xl text-[10.5px] font-extrabold flex items-center gap-1.5 self-start transition-all shadow-sm active:scale-95 group/btn"
              >
                Open trend details
                <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform duration-350" />
              </button>
            )}
          </div>

          {/* Card 2: Early Keyword */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50/70 to-teal-50/20 dark:from-emerald-950/25 dark:to-slate-900/30 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_12px_rgba(0,0,0,0.02)] hover:shadow-md transition-all duration-300 group select-none">
            <div className="space-y-3.5 relative z-10">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-455 uppercase tracking-widest text-[9.5px] font-extrabold bg-emerald-100/50 dark:bg-emerald-950/60 px-2 py-0.5 rounded w-fit">
                <Zap className="w-3.5 h-3.5" />
                Early Keyword Signal
              </div>
              {earlyKeyword ? (
                <>
                  <h4 className="text-base font-extrabold text-slate-900 dark:text-white truncate capitalize" title={earlyKeyword.keyword}>
                    {earlyKeyword.keyword}
                  </h4>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <span className="bg-white/80 dark:bg-slate-900/60 border border-emerald-100/60 dark:border-emerald-900/30 text-slate-700 dark:text-slate-350 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      Growth: <strong className="text-emerald-600 font-extrabold">{earlyKeyword.growth}</strong>
                    </span>
                    <span className="bg-white/80 dark:bg-slate-900/60 border border-emerald-100/60 dark:border-emerald-900/30 text-slate-700 dark:text-slate-350 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      Volume: <strong className="text-slate-900 dark:text-white font-extrabold">{formatNumber(earlyKeyword.totalPapers)}</strong>
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-455">No keywords available</p>
              )}
            </div>

            {/* Decal background icon */}
            <Sparkles className="w-16 h-16 text-emerald-500/10 dark:text-emerald-400/5 absolute right-3 bottom-3 select-none pointer-events-none group-hover:scale-110 transition-transform duration-300" />

            {earlyKeyword && (
              <button
                onClick={() => navigate(getScopedSearchTarget(earlyKeyword.keyword))}
                className="mt-5 relative z-10 px-3.5 py-1.5 bg-white hover:bg-emerald-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-emerald-250/30 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-xl text-[10.5px] font-extrabold flex items-center gap-1.5 self-start transition-all shadow-sm active:scale-95 group/btn"
              >
                Explore papers
                <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform duration-350" />
              </button>
            )}
          </div>

          {/* Card 3: Exploratory Signal */}
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-50/70 to-orange-50/20 dark:from-amber-950/25 dark:to-slate-900/30 border border-amber-100 dark:border-amber-900/40 rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_12px_rgba(0,0,0,0.02)] hover:shadow-md transition-all duration-300 group select-none">
            <div className="space-y-3.5 relative z-10">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-455 uppercase tracking-widest text-[9.5px] font-extrabold bg-amber-100/50 dark:bg-amber-950/60 px-2 py-0.5 rounded w-fit">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500" />
                Exploratory Signal
              </div>
              {exploratorySignal ? (
                <>
                  <h4 className="text-base font-extrabold text-slate-900 dark:text-white truncate capitalize" title={exploratorySignal.keyword}>
                    {exploratorySignal.keyword}
                  </h4>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <span className="bg-white/80 dark:bg-slate-900/60 border border-amber-100/60 dark:border-amber-900/30 text-slate-700 dark:text-slate-350 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      Growth: <strong className="text-amber-650 font-extrabold">{exploratorySignal.growth}</strong>
                    </span>
                    <span className="bg-white/80 dark:bg-slate-900/60 border border-amber-100/60 dark:border-amber-900/30 text-slate-700 dark:text-slate-350 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      Volume: <strong className="text-slate-900 dark:text-white font-extrabold">{formatNumber(exploratorySignal.totalPapers)}</strong> <span className="text-amber-650 font-bold text-[10px]">(Small Base)</span>
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-455">No exploratory keywords found</p>
              )}
            </div>

            {/* Decal background icon */}
            <Compass className="w-16 h-16 text-amber-500/10 dark:text-amber-400/5 absolute right-3 bottom-3 select-none pointer-events-none group-hover:scale-110 transition-transform duration-300" />

            {exploratorySignal && (
              <button
                onClick={() => navigate(getScopedSearchTarget(exploratorySignal.keyword))}
                className="mt-5 relative z-10 px-3.5 py-1.5 bg-white hover:bg-amber-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-amber-250/30 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 rounded-xl text-[10.5px] font-extrabold flex items-center gap-1.5 self-start transition-all shadow-sm active:scale-95 group/btn"
              >
                Analyze exploratory papers
                <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform duration-350" />
              </button>
            )}
          </div>
        </div>

        {/* Legend strip */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/60 rounded-xl px-4 py-2 text-[10.5px] text-slate-500 dark:text-slate-400 font-semibold select-none">
          <span className="text-slate-400 uppercase tracking-wider text-[9px] font-extrabold mr-1">Legend:</span>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            <span><strong>Momentum:</strong> YoY Trend Slope</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span><strong>Growth:</strong> YoY Change %</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="px-1 py-0.2 text-[8px] font-extrabold bg-red-550/10 border border-red-200/30 text-red-700 dark:text-red-400 rounded">HOT</span>
            <span><strong>Hot Signal:</strong> High Growth & Established Base (≥15 papers)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="px-1 py-0.2 text-[8px] font-extrabold bg-amber-550/10 border border-amber-200/30 text-amber-750 dark:text-amber-455 rounded">EXP</span>
            <span><strong>Exploratory:</strong> Early Signal & Small Base (&lt;15 papers)</span>
          </div>
        </div>

        {/* 3. Main Data Area: Ranked Topics vs. Emerging Keywords */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left: Ranked Topics Table (7 columns) */}
          <div className="lg:col-span-7 bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-0 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800/50 select-none">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Top Ranked Topics by Scope
                  </h3>
                  <p className="text-xs text-slate-550 dark:text-slate-400 mt-0.5 font-medium">
                    Showing top {formatNumber(sortedTopics.length)} of {formatNumber(data.uniqueTopicsInScope ?? data.topics.length)} unique topics in this scope. Use Compare topic search to browse more.
                  </p>
                </div>
                <span className="text-[9px] bg-blue-500/10 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200/30 px-2 py-1 rounded font-bold uppercase tracking-wider">
                  Active Sort: {localSortBy}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto select-text">
              <table className="w-full min-w-[880px] text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 select-none">
                  <tr>
                    <th className="pl-5 pr-2 py-3 font-semibold w-16 text-center whitespace-nowrap">Rank</th>
                    <th className="px-4 py-3 font-semibold min-w-[260px] whitespace-nowrap">Topic</th>
                    <th
                      className={`px-3 py-3 font-semibold cursor-pointer transition-colors hover:text-blue-700 dark:hover:text-blue-400 text-right whitespace-nowrap min-w-[110px]`}
                      onClick={() => setLocalSortBy("momentum")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end w-full whitespace-nowrap">
                        MOMENTUM
                        {localSortBy === "momentum" ? (
                          <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-450" />
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
                        )}
                      </span>
                    </th>
                    <th
                      className={`px-3 py-3 font-semibold cursor-pointer transition-colors hover:text-blue-700 dark:hover:text-blue-400 text-right whitespace-nowrap min-w-[90px]`}
                      onClick={() => setLocalSortBy("papers")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end w-full whitespace-nowrap">
                        PAPERS
                        {localSortBy === "papers" ? (
                          <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-455" />
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
                        )}
                      </span>
                    </th>
                    <th
                      className={`px-3 py-3 font-semibold cursor-pointer transition-colors hover:text-blue-700 dark:hover:text-blue-400 text-right whitespace-nowrap min-w-[100px]`}
                      onClick={() => setLocalSortBy("growth")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end w-full whitespace-nowrap">
                        GROWTH
                        {localSortBy === "growth" ? (
                          <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-455" />
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 text-slate-350 dark:text-slate-700" />
                        )}
                      </span>
                    </th>
                    <th className="px-3 py-3 font-semibold text-center h-11 whitespace-nowrap min-w-[130px]">
                      <span className="inline-flex items-center gap-1 justify-center w-full whitespace-nowrap">
                        DATA CONF.
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[250px] bg-popover text-popover-foreground border shadow-md p-3 text-xs">
                            Shows sample size confidence. Larger paper count (High) yields statistically more reliable signals.
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </th>
                    <th className="pr-5 pl-2 py-3 font-semibold text-center whitespace-nowrap min-w-[110px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedTopics.map((entry, idx) => {
                    let confLabel = "High";
                    let confColor = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-emerald-250/20";
                    let confTooltip = "High sample size (≥50 papers) ensures high statistical reliability.";
                    if (entry.totalPapers < 15) {
                      confLabel = "Low";
                      confColor = "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border-amber-250/20";
                      confTooltip = "Small dataset sample size (<15 papers). Treat trend signals as exploratory.";
                    } else if (entry.totalPapers < 50) {
                      confLabel = "Medium";
                      confColor = "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-455 border-blue-250/20";
                      confTooltip = "Adequate sample size (15-49 papers). Moderate trend reliability.";
                    }

                    const growthVal = entry.growthRatePct;
                    const growthColor = growthVal > 0
                      ? "text-emerald-600 dark:text-emerald-400 font-bold"
                      : growthVal < 0
                        ? "text-red-500 dark:text-red-400 font-bold"
                        : "text-slate-500 font-semibold";

                    return (
                      <tr key={idx} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="pl-5 pr-2 py-3 text-center font-bold text-slate-400 font-mono text-xs">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-900 dark:text-white leading-snug text-sm">
                              {entry.topic}
                            </span>
                            {entry.taxonomy && (
                              <span className="text-[10.5px] text-slate-400 dark:text-slate-500 font-semibold truncate max-w-[170px]" title={`${entry.taxonomy.domainName} / ${entry.taxonomy.fieldName}`}>
                                {entry.taxonomy.domainName} / {entry.taxonomy.fieldName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-350">
                          <div className="flex items-center justify-end gap-1.5">
                            {entry.momentum > 0 && entry.growthRatePct < 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-450 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[245px] bg-popover text-popover-foreground border shadow-md p-2.5 text-[11px] leading-relaxed">
                                  Long-window momentum positive, last complete YoY declined.
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <span>{formatSigned(entry.momentum, 2)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-350">
                          {formatNumber(entry.totalPapers)}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono text-xs ${growthColor}`}>
                          {formatSigned(entry.growthRatePct, 1)}%
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-extrabold cursor-help select-none ${confColor}`}>
                                {confLabel}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-popover text-popover-foreground border shadow-sm text-xs">
                              {confTooltip}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="pr-5 pl-2 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => navigate(getTopicTrendTarget(entry.topic))}
                                  className="p-1 text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                >
                                  <LineChart className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-popover text-popover-foreground border shadow-sm">
                                Open detailed trend analysis
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => navigate(getScopedSearchTarget(entry.topic))}
                                  className="p-1 text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                >
                                  <Search className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-popover text-popover-foreground border shadow-sm">
                                Search papers matching this topic
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => handleCompare(entry.topic)}
                                  className="p-1 text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                >
                                  <GitCompare className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-popover text-popover-foreground border shadow-sm">
                                Add topic to Compare tab
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => handleExplain(entry.topic)}
                                  className="p-1 text-slate-400 hover:text-purple-750 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-popover text-popover-foreground border shadow-sm">
                                Explain trend using AI model
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Emerging Keywords Table (5 columns) */}
          <div className="lg:col-span-5 bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-0 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 pb-4 border-b border-slate-100 dark:border-slate-800/50 select-none">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Emerging Keywords</h3>
              <p className="text-xs text-slate-550 dark:text-slate-400 mt-0.5 font-medium">
                Early signals matched from paper keywords. Click icons to act.
              </p>
            </div>

            <div className="flex-1 overflow-x-auto select-text">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 select-none">
                  <tr>
                    <th className="pl-5 pr-2 py-3 font-semibold">Keyword</th>
                    <th className="px-3 py-3 font-semibold text-right">Papers</th>
                    <th className="px-3 py-3 font-semibold text-right">Growth</th>
                    <th className="px-2 py-3 font-semibold text-center">Trend</th>
                    <th className="pr-5 pl-2 py-3 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {keywordsData.map((row, idx) => {
                    const quality = getSignalQuality(row);
                    const growthNum = parseFloat(row.growth.replace(/[^0-9.-]/g, ""));
                    const keywordGrowthColor = growthNum > 0
                      ? "text-emerald-600 dark:text-emerald-400 font-bold"
                      : growthNum < 0
                        ? "text-red-500 dark:text-red-400 font-bold"
                        : "text-slate-500 font-semibold";

                    return (
                      <tr key={idx} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="pl-5 pr-2 py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="font-bold text-slate-800 dark:text-slate-200 capitalize leading-snug text-[13.5px]">
                              {row.keyword}
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[8.5px] font-extrabold cursor-help select-none ${quality.bg}`}
                                >
                                  {quality.shortLabel}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="bg-popover text-popover-foreground border shadow-sm text-xs">
                                {quality.tooltip}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-350">
                          {formatNumber(row.totalPapers)}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono text-xs ${keywordGrowthColor}`}>
                          {row.growth}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.yearlyBreakdown && row.yearlyBreakdown.length > 0 && (
                            <div className="flex justify-center items-center">
                              <div className="h-6 w-14 opacity-80 hover:opacity-100 transition-opacity">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={row.yearlyBreakdown.map((y: YearlyCount) => ({ year: String(y.year), count: y.count }))}>
                                    <Area type="monotone" dataKey="count" stroke="#10b981" fill="#ecfdf5" strokeWidth={1.5} fillOpacity={0.4} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="pr-5 pl-2 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 select-none">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => navigate(getScopedSearchTarget(row.keyword))}
                                  className="p-1 text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                >
                                  <Search className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-popover text-popover-foreground border shadow-sm">
                                Search papers matching this keyword
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => navigate(getScopedReportTarget(row.keyword))}
                                  className="p-1 text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-popover text-popover-foreground border shadow-sm">
                                Generate AI research report
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {keywordsData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-xs text-slate-400 dark:text-slate-500 italic select-none">
                        No rising keywords found matching current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* 4. Footer side notes / Definitions */}
        <div className="bg-slate-50 dark:bg-slate-900/20 border border-slate-200/50 dark:border-slate-850 rounded-xl p-4.5 select-none space-y-2">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-350">Technical Glossary & Threshold Notes</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] text-slate-550 dark:text-slate-400 leading-relaxed font-semibold">
            <div className="space-y-1">
              <p className="font-bold text-slate-800 dark:text-slate-200">Momentum</p>
              <p>Calculated as the linear regression slope of papers published per year. Higher values mean steeper upward trends.</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-800 dark:text-slate-200">Small Base Warning</p>
              <p>Triggered when a signal's papers count is under 15 papers. Growth rates might be high, but the signal is still early/exploratory.</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-800 dark:text-slate-200">Signal Quality</p>
              <p><strong>Hot</strong> = high growth with established base (&ge;15 papers). <strong>Exploratory</strong> = early exploratory signal with small paper base (&lt;15 papers).</p>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
