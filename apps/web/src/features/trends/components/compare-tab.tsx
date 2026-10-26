import React from "react";
import { Users, AlertTriangle, TrendingUp, BarChart2, Award, Zap, LineChart as ChartIcon, Search, FileText, X, Filter, Sparkles } from "lucide-react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import type { TrendCompareResponse, TrendTopicCandidate, TopicComparisonItem, TrendingTopic, TrendsOverview } from "@trend/shared-types";
import type { UseQueryResult } from "@tanstack/react-query";
import { useTrendTopicCandidates } from "../hooks/use-trends";
import type { TrendTopicCandidatesParams } from "../api/trends.api";
import { getTopicMetric, formatMetricValue } from "../../../pages/trends.insights";
import type { TrendSortKey } from "../../../pages/trends.insights";
import { formatNumber } from "@/utils";
import { useI18n } from "@/i18n";
import { aggregatePpTop10, averageCitations, formatPercent, hasCitationTotals, hasPpTop10, sumCitations, WORLD_AVERAGE_PP_TOP10 } from "../trend-impact";
import { DataSourceBadge } from "./trend-data-source";
import { buildTrendScopedUrl } from "../trend-navigation";
import { TrendIntro, TrendVerdictBadge, formatRelativeChange, verdictLabel } from "./trend-verdict-badge";

type DatasetTrendTab = "overview" | "topics" | "dataset" | "compare" | "ai";
type CompareMetricMode = "papers" | "citations" | "avg_citations" | "pp_top10";
type CompareChartPoint = { year: string } & Record<string, number | string>;
type CandidateTopic = TrendingTopic | TrendTopicCandidate;

interface CompareTooltipPayload {
  name?: string;
  stroke?: string;
  color?: string;
}

interface CompareTabProps {
  data: TrendsOverview;
  selectedTopics: string[];
  setSelectedTopics: React.Dispatch<React.SetStateAction<string[]>>;
  compareQuery: Pick<UseQueryResult<TrendCompareResponse, Error>, "data" | "isLoading" | "isError" | "isFetching">;
  yearFrom: number;
  yearTo: number;
  sortBy: TrendSortKey;
  setFocusTopic: (topic: string) => void;
  setActiveTab?: (tab: DatasetTrendTab) => void;
  clearAllFilters?: () => void;
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

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

export function CompareTab({
  data,
  selectedTopics,
  setSelectedTopics,
  compareQuery,
  yearFrom,
  yearTo,
  sortBy,
  setFocusTopic,
  setActiveTab,
  clearAllFilters,
  scopeParams,
}: CompareTabProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const tr = t;
  const [requestedMetricMode, setMetricMode] = React.useState<CompareMetricMode>("papers");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [showAllCandidates, setShowAllCandidates] = React.useState(false);

  const buildScopedUrl = (path: string, baseParams: Record<string, string>) => buildTrendScopedUrl(path, baseParams, { ...scopeParams, yearFrom, yearTo });

  // Helper taxonomy lookups
  const getDomainName = (id: string) => data.facets?.domains?.find(d => d.openalexId === id || d.id === id)?.name || id;
  const getFieldName = (id: string) => data.facets?.fields?.find(f => f.openalexId === id || f.id === id)?.name || id;
  const getSubfieldName = (id: string) => data.facets?.subfields?.find(s => s.openalexId === id || s.id === id)?.name || id;
  const getTopicName = (id: string) => data.facets?.topics?.find(t => t.openalexId === id || t.id === id)?.name || id;

  // Derive active scope string
  const activeScopeText = React.useMemo(() => {
    const fullScope = data.dataSource === "openalex" ? "Scope: All OpenAlex works" : "Scope: Full active dataset";
    if (!scopeParams) return fullScope;
    const parts: string[] = [];

    const addFilterNames = (label: string, values: string[]) => {
      if (values && values.length > 0) {
        parts.push(`${label}: ${values.join(", ")}`);
      }
    };

    const mappedDomains = scopeParams.domainIds.length > 0 ? scopeParams.domainIds.map(getDomainName) : scopeParams.domains;
    const mappedFields = scopeParams.fieldIds.length > 0 ? scopeParams.fieldIds.map(getFieldName) : scopeParams.fields;
    const mappedSubfields = scopeParams.subfieldIds.length > 0 ? scopeParams.subfieldIds.map(getSubfieldName) : scopeParams.subfields;
    const mappedTopics = scopeParams.topicIds.length > 0 ? scopeParams.topicIds.map(getTopicName) : scopeParams.topicsFilter;

    addFilterNames("Domain", mappedDomains);
    addFilterNames("Field", mappedFields);
    addFilterNames("Subfield", mappedSubfields);
    addFilterNames("Topic", mappedTopics);
    addFilterNames("Type", scopeParams.paperKinds);
    addFilterNames("OA", scopeParams.openAccessStatuses);
    addFilterNames("Provider", scopeParams.providers);
    addFilterNames("Source", scopeParams.sources);
    addFilterNames("Language", scopeParams.languages);
    addFilterNames("Citations", scopeParams.citationBands);

    if (parts.length === 0) return fullScope;
    return `Scope: ${parts.join(" / ")}`;
  }, [data, scopeParams]);

  const isRefetching = compareQuery.isFetching && !!compareQuery.data;

  // Citation sums are null when the source cannot sum citations (OpenAlex);
  // it reports PP(top 10%) instead. Null stays null, it is never shown as 0.
  const comparedTopics = compareQuery.data?.topics;
  const hasPp = React.useMemo(() => (comparedTopics ?? []).some((topic) => hasPpTop10(topic.citationTrend)), [comparedTopics]);
  const hasTotals = React.useMemo(() => (comparedTopics ?? []).some((topic) => hasCitationTotals(topic.citationTrend)), [comparedTopics]);
  const metricMode: CompareMetricMode = requestedMetricMode === "papers"
    ? "papers"
    : hasPp
      ? "pp_top10"
      : hasTotals
        ? requestedMetricMode === "pp_top10" ? "citations" : requestedMetricMode
        : "papers";

  const getTotalCitations = React.useCallback((topic: TopicComparisonItem) => sumCitations(topic.citationTrend), []);

  const getAverageCitations = React.useCallback((topic: TopicComparisonItem) => averageCitations(topic.citationTrend), []);

  const getPpTop10 = React.useCallback((topic: TopicComparisonItem) => aggregatePpTop10(topic.citationTrend), []);

  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), 300);
  const isRemoteCandidateSearch = debouncedSearchTerm.length > 0;
  const topicCandidateParams = React.useMemo<TrendTopicCandidatesParams>(() => ({
    q: debouncedSearchTerm,
    limit: 40,
    minPapers: 1,
    yearFrom,
    yearTo,
    domainIds: scopeParams?.domainIds ?? [],
    domains: scopeParams?.domains ?? [],
    fieldIds: scopeParams?.fieldIds ?? [],
    fields: scopeParams?.fields ?? [],
    subfieldIds: scopeParams?.subfieldIds ?? [],
    subfields: scopeParams?.subfields ?? [],
    topicIds: scopeParams?.topicIds ?? [],
    topics: scopeParams?.topicsFilter ?? [],
    paperKinds: scopeParams?.paperKinds ?? [],
    openAccessStatuses: scopeParams?.openAccessStatuses ?? [],
    providers: scopeParams?.providers ?? [],
    sources: scopeParams?.sources ?? [],
    languages: scopeParams?.languages ?? [],
    citationBands: scopeParams?.citationBands as TrendTopicCandidatesParams["citationBands"],
  }), [debouncedSearchTerm, scopeParams, yearFrom, yearTo]);
  const topicCandidatesQuery = useTrendTopicCandidates(topicCandidateParams, isRemoteCandidateSearch);

  const candidateTopics = React.useMemo<CandidateTopic[]>(() => {
    if (isRemoteCandidateSearch) return topicCandidatesQuery.data?.topics ?? [];
    return data.topics ?? [];
  }, [data.topics, isRemoteCandidateSearch, topicCandidatesQuery.data]);
  const totalCandidateCount = isRemoteCandidateSearch
    ? topicCandidatesQuery.data?.totalCandidates ?? candidateTopics.length
    : data.topics.length;

  // Candidate chips pagination limit control
  const visibleCandidates = React.useMemo(() => {
    if (showAllCandidates) return candidateTopics;
    return candidateTopics.slice(0, 10);
  }, [candidateTopics, showAllCandidates]);

  // Build chart datasets combining papers/citations dynamically
  const compareChartData = React.useMemo(() => {
    const topicsList = compareQuery.data?.topics || [];
    const dataPoints: CompareChartPoint[] = [];

    for (let y = yearFrom; y <= yearTo; y++) {
      const point: CompareChartPoint = { year: String(y) };

      topicsList.forEach(topic => {
        const papersEntry = topic.yearlyBreakdown?.find(entry => entry.year === y);
        const citationsEntry = topic.citationTrend?.find(entry => entry.year === y);

        const papersCount = papersEntry?.count ?? 0;
        // A missing value leaves a gap in the line instead of drawing 0.
        const citationsCount = citationsEntry?.totalCitations;
        const avgCitationsValue = citationsEntry?.avgCitations;
        const ppValue = citationsEntry?.ppTop10Pct;

        if (metricMode === "papers") {
          point[topic.topic] = papersCount;
        } else if (metricMode === "citations") {
          if (typeof citationsCount === "number") point[topic.topic] = citationsCount;
        } else if (metricMode === "avg_citations") {
          if (typeof avgCitationsValue === "number") point[topic.topic] = avgCitationsValue;
        } else if (typeof ppValue === "number") {
          point[topic.topic] = ppValue;
        }
      });

      dataPoints.push(point);
    }
    return dataPoints;
  }, [compareQuery.data, yearFrom, yearTo, metricMode]);

  // Determine empty topics inside this scope
  const emptyTopics = React.useMemo(() => {
    const topicsList = compareQuery.data?.topics || [];
    return selectedTopics.filter(topic => {
      const found = topicsList.find(t => t.topic === topic);
      return !found || found.totalPapers === 0;
    });
  }, [compareQuery.data, selectedTopics]);

  // Determine volume divergence warning
  const showVolumeWarning = React.useMemo(() => {
    if (!compareQuery.data?.topics || compareQuery.data.topics.length < 2) return false;
    const volumes = compareQuery.data.topics.map(t => t.totalPapers).filter(v => v > 0);
    if (volumes.length < 2) return false;
    const maxVol = Math.max(...volumes);
    const minVol = Math.min(...volumes);
    return minVol > 0 && maxVol / minVol > 5;
  }, [compareQuery.data]);

  // Verdicts exist only for the topics of the overview list, so the compare
  // response (which can hold any searched topic) is joined to them by name.
  const classificationByTopic = React.useMemo(() => {
    const map = new Map<string, TrendingTopic["classification"]>();
    for (const topic of data.topics ?? []) map.set(topic.topic.toLowerCase(), topic.classification);
    return map;
  }, [data.topics]);
  const classificationOf = React.useCallback(
    (topic: string) => classificationByTopic.get(topic.toLowerCase()),
    [classificationByTopic],
  );

  // Client-side computed deterministic insights (No LLM)
  const topRising = React.useMemo(() => {
    const rising = (compareQuery.data?.topics || [])
      .map((topic) => ({ topic, classification: classificationOf(topic.topic) }))
      .filter((entry): entry is { topic: TopicComparisonItem; classification: TrendingTopic["classification"] } => entry.classification?.verdict === "rising");
    if (rising.length === 0) return null;
    return [...rising].sort((a, b) => (b.classification.relativeChangePct ?? 0) - (a.classification.relativeChangePct ?? 0))[0];
  }, [compareQuery.data, classificationOf]);

  const largestVolume = React.useMemo(() => {
    const list = compareQuery.data?.topics || [];
    if (list.length === 0) return null;
    return [...list].sort((a, b) => b.totalPapers - a.totalPapers)[0];
  }, [compareQuery.data]);

  // Highest citation impact: PP(top 10%) when reported, otherwise citations per paper.
  const highestCitations = React.useMemo(() => {
    const list = (compareQuery.data?.topics || [])
      .map((topic) => ({ topic, value: hasPp ? getPpTop10(topic) : getAverageCitations(topic) }))
      .filter((entry): entry is { topic: TopicComparisonItem; value: number } => entry.value !== null);
    if (list.length === 0) return null;
    return [...list].sort((a, b) => b.value - a.value)[0];
  }, [compareQuery.data, getAverageCitations, getPpTop10, hasPp]);

  const smallBaseWarnings = React.useMemo(() => {
    const list = compareQuery.data?.topics || [];
    return list.filter(t => t.totalPapers < 30);
  }, [compareQuery.data]);

  // Dynamic instruction helper text below metric toggles
  const metricHelperText = React.useMemo(() => {
    if (metricMode === "papers") {
      return "Shows how many papers were published each year. Use this to compare research activity.";
    }
    if (metricMode === "pp_top10") {
      return "Shows the share of each year's papers among the 10% most cited works of the same year, type and subfield. 10% is the world average, so topics can be compared despite different sizes and ages.";
    }
    if (metricMode === "citations") {
      return "Shows accumulated citation volume. Older topics may look stronger because they had more time to collect citations.";
    }
    return "Normalizes citation impact per paper. Useful when one topic has much larger volume.";
  }, [metricMode]);

  // Deterministic Recommendation Insight Strip
  const recommendationText = React.useMemo(() => {
    if (selectedTopics.length < 2) {
      return "Select at least 2 topics to generate a comparison recommendation.";
    }
    if (!compareQuery.data?.topics || compareQuery.data.topics.length < 2) {
      return "Select at least 2 topics to generate a comparison recommendation.";
    }

    const fastest = topRising;
    const highestCit = highestCitations;

    if (fastest && highestCit) {
      if (fastest.topic.topic === highestCit.topic.topic) {
        return t("Recommendation: {{topic}} is the strongest scoped candidate, with a significant rise in its field share ({{change}}) and the highest citation impact. Focus on this direction.", {
          topic: fastest.topic.topic,
          change: formatRelativeChange(fastest.classification, t) ?? "",
        });
      }
      return hasPp
        ? t("Recommendation: {{topic}} has the strongest significant rise in its field share, but {{other}} has the larger share of highly cited papers. Check PP(top 10%) before choosing a report direction.", { topic: fastest.topic.topic, other: highestCit.topic.topic })
        : t("Recommendation: {{topic}} has the strongest significant rise in its field share, but {{other}} may be more citation-efficient. Use Avg citations before choosing a report direction.", { topic: fastest.topic.topic, other: highestCit.topic.topic });
    }
    return t("Compare trend verdicts, volumes, and citation metrics to decide your research direction.");
  }, [selectedTopics, compareQuery.data, topRising, highestCitations, hasPp, t]);

  // Custom Recharts Tooltip showing all metrics
  const CustomChartTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: CompareTooltipPayload[];
    label?: string | number;
  }) => {
    if (active && payload && payload.length) {
      const labelText = String(label ?? "");
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-lg text-xs space-y-2 select-none min-w-[200px]">
          <p className="font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800/80 pb-1.5 mb-1.5">
            Year: {labelText}
          </p>
          {payload.map((p, idx) => {
            const topicName = p.name;
            const topicData = compareQuery.data?.topics?.find(t => t.topic === topicName);

            const papersEntry = topicData?.yearlyBreakdown?.find((entry) => String(entry.year) === labelText);
            const citationsEntry = topicData?.citationTrend?.find((entry) => String(entry.year) === labelText);
            const papers = papersEntry?.count ?? 0;
            const citations = citationsEntry?.totalCitations;
            const avg = citationsEntry?.avgCitations;
            const pp = citationsEntry?.ppTop10Pct;

            return (
              <div key={idx} className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-850 dark:text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.stroke || p.color }} />
                  <span className="capitalize">{topicName}</span>
                </div>
                <div className="pl-4 space-y-0.5 text-[11px] text-slate-550 dark:text-slate-450 font-semibold">
                  <p>Papers: <span className="text-slate-900 dark:text-white font-bold">{formatNumber(papers)}</span></p>
                  {hasPp ? (
                    <p>PP(top 10%): <span className="text-slate-900 dark:text-white font-bold">{typeof pp === "number" ? formatPercent(pp) : "—"}</span></p>
                  ) : (
                    <>
                      <p>Citations: <span className="text-slate-900 dark:text-white font-bold">{typeof citations === "number" ? formatNumber(citations) : "—"}</span></p>
                      <p>Avg Citations: <span className="text-slate-900 dark:text-white font-bold">{typeof avg === "number" ? avg.toFixed(2) : "—"}</span></p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const getInterpretation = (topic: TopicComparisonItem) => {
    const avgCitations = getAverageCitations(topic);
    const pp = getPpTop10(topic);

    if (pp !== null && pp > WORLD_AVERAGE_PP_TOP10) return t("Above world-average citation impact");
    if (pp === null && avgCitations !== null && avgCitations > 15) return t("High citation impact");
    return "—";
  };

  // Reusable scroll helper
  const scrollToCompareSection = () => {
    const el = document.getElementById("trends-tab-panels");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  // Edge state: No topics found in current scope
  if (!data.topics || data.topics.length === 0) {
    return (
      <div className="py-12 text-center border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/10 dark:bg-slate-900/5 select-none space-y-4">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">No comparable topics found in this scope.</p>
          <p className="text-xs text-slate-500">Clear filters or lower the minimum paper threshold to find candidates.</p>
        </div>
        <div className="flex justify-center gap-3 select-none">
          {clearAllFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllFilters}
              className="text-xs font-bold rounded-xl"
            >
              Clear Data Scope
            </Button>
          )}
          {setActiveTab && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setActiveTab("dataset")}
              className="text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700"
            >
              Go to Data Scope
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header with Active Scope Info */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Compare candidate research directions</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed mt-1">
            Pick 2-5 topics to compare publication activity, citation impact, and growth stability inside the current Data Scope. Use this to decide what to read, report, or investigate next.
          </p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          <DataSourceBadge source={compareQuery.data?.dataSource ?? data.dataSource} />
          <span className={`inline-block text-[10px] font-extrabold px-3 py-1 rounded-xl border select-none ${
            isRefetching
              ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50 animate-pulse"
              : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800"
          }`}>
            {isRefetching ? "Updating comparison for latest scope..." : activeScopeText}
          </span>
        </div>
      </div>

      {/* 2. Candidate Source Explanation */}
      <div className="bg-slate-50/50 dark:bg-slate-900/10 border-l-2 border-slate-350 dark:border-slate-700 p-3.5 rounded-r-xl select-none text-xs text-slate-600 dark:text-slate-400 font-semibold">
        Start with top scoped topics, or search all topic candidates inside the current Data Scope. Search checks topic names plus OpenAlex domain, field, and subfield labels.
      </div>

      {/* 3. Topic Search / Add Control */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 select-none">
          <div className="w-full md:max-w-xs relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search all scoped topics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search all topic candidates in current scope"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="text-xs font-bold text-slate-500">
            {isRemoteCandidateSearch
              ? topicCandidatesQuery.isFetching
                ? `Searching all scoped topics for "${debouncedSearchTerm}"...`
                : `Found ${formatNumber(totalCandidateCount)} scoped topic candidates`
              : `Showing ${formatNumber(visibleCandidates.length)} top candidates from ${formatNumber(data.uniqueTopicsInScope ?? data.topics.length)} unique scoped topics`}
          </div>
        </div>

        {isRemoteCandidateSearch && topicCandidatesQuery.isError ? (
          <div className="py-6 text-center border border-dashed border-red-200 dark:border-red-900/40 rounded-2xl p-4 bg-red-50/20 dark:bg-red-950/10 select-none space-y-2.5">
            <p className="text-xs font-bold text-red-600 dark:text-red-400">
              Topic search failed. You can still compare the top scoped topics, or search papers directly.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(buildScopedUrl("/home", { q: debouncedSearchTerm }))}
              className="text-xs font-bold rounded-lg border-blue-200 hover:bg-blue-50 text-blue-700 dark:border-blue-900/30 dark:hover:bg-blue-950/20 dark:text-blue-400 flex items-center gap-1.5 mx-auto"
            >
              <Search className="w-3.5 h-3.5" /> Search scoped papers
            </Button>
          </div>
        ) : isRemoteCandidateSearch && topicCandidatesQuery.isFetching && candidateTopics.length === 0 ? (
          <div className="py-6 text-center border border-dashed border-blue-200 dark:border-blue-900/40 rounded-2xl p-4 bg-blue-50/20 dark:bg-blue-950/10 select-none">
            <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
              Searching topic candidates across the current Data Scope...
            </p>
          </div>
        ) : candidateTopics.length === 0 && searchTerm.trim() !== "" ? (
          <div className="py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/10 dark:bg-slate-900/5 select-none space-y-2.5">
            <p className="text-xs font-bold text-slate-500">
              {data.dataSource === "openalex"
                ? "No matching topic candidate in the current scope. Try a different keyword or widen your Data Scope."
                : "No matching topic candidate in the current scope. This may mean the topic is not synced yet, or your Data Scope is too narrow."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(buildScopedUrl("/home", { q: debouncedSearchTerm || searchTerm }))}
              className="text-xs font-bold rounded-lg border-blue-200 hover:bg-blue-50 text-blue-700 dark:border-blue-900/30 dark:hover:bg-blue-950/20 dark:text-blue-400 flex items-center gap-1.5 mx-auto"
            >
              <Search className="w-3.5 h-3.5" /> Search scoped papers for "{debouncedSearchTerm || searchTerm}"
            </Button>
          </div>
        ) : (
          /* 4. Suggested Candidate Chips */
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2.5 select-none">
              {visibleCandidates.map((t) => {
                const isSelected = selectedTopics.includes(t.topic);
                const candidateClassification = "classification" in t ? t.classification : undefined;
                const metricDisplay = sortBy === "trend" && candidateClassification
                  ? `${verdictLabel(candidateClassification.verdict, tr)} · ${formatRelativeChange(candidateClassification, tr) ?? "—"}`
                  : tr("{{count}} papers", { count: formatMetricValue(getTopicMetric(t, "total"), "total") });
                const isMaxSelected = selectedTopics.length >= 5;

                return (
                  <button
                    key={t.topic}
                    type="button"
                    disabled={!isSelected && isMaxSelected}
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedTopics(prev => prev.filter(x => x !== t.topic));
                      } else {
                        if (isMaxSelected) return;
                        setSelectedTopics(prev => [...prev, t.topic]);
                      }
                    }}
                    title={!isSelected && isMaxSelected ? "Max 5 topics selected" : undefined}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-155 border flex flex-col items-start text-left active:scale-95 ${
                      isSelected
                        ? "bg-blue-600 border-blue-600 text-white font-extrabold shadow-md hover:bg-blue-700"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    }`}
                  >
                    <span className="capitalize font-bold">{t.topic}</span>
                    {t.taxonomy && (
                      <span className={`text-[9px] uppercase tracking-wider font-bold mt-0.5 ${isSelected ? "text-blue-200" : "text-slate-400"}`}>
                        {t.taxonomy.domainName}
                      </span>
                    )}
                    <span className={`text-[9px] font-bold mt-1 ${isSelected ? "text-white" : "text-blue-650 dark:text-blue-400"}`}>
                      {metricDisplay}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Limit control button or topics <= 10 notes */}
            <div className="flex items-center justify-between select-none border-t border-slate-100 dark:border-slate-850 pt-2.5">
              {totalCandidateCount > 10 ? (
                <button
                  type="button"
                  onClick={() => setShowAllCandidates(prev => !prev)}
                  className="text-xs font-extrabold text-blue-600 dark:text-blue-450 hover:underline flex items-center gap-1"
                >
                  {showAllCandidates ? "Show fewer topics" : `Show ${Math.min(totalCandidateCount, 40)} scoped topic candidates`}
                </button>
              ) : (
                <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500">
                  {isRemoteCandidateSearch
                    ? "Search results come from the backend candidate index for the current Data Scope."
                    : "Only the strongest scoped topics are shown here. Use topic search above to browse the wider scoped topic set."}
                </span>
              )}

              {selectedTopics.length >= 5 && (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-500 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> Compare up to 5 topics at once to keep the chart readable.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. Recommended Comparisons (Enriched cards) */}
      {selectedTopics.length < 2 && data.recommendedComparisons && data.recommendedComparisons.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider">Recommended Comparisons</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.recommendedComparisons.slice(0, 4).map((rec, idx) => {
              const isContrast = rec.reason.toLowerCase().includes("contrast") || rec.reason.toLowerCase().includes("vs");
              const isRelated = rec.reason.toLowerCase().includes("related") || rec.reason.toLowerCase().includes("same");
              const badgeLabel = isContrast ? "Cross-domain contrast" : isRelated ? "Same field" : "Related subfield";

              return (
                <div key={idx} className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-slate-300 dark:hover:border-slate-750 transition-all">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                        {rec.sharedTaxonomy ? `${rec.sharedTaxonomy.fieldName || rec.sharedTaxonomy.domainName}` : "Scholarly overlap"}
                      </span>
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-550 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded">
                        {badgeLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {rec.topics.map(tName => {
                        const info = data.topics?.find(tp => tp.topic === tName);
                        const volumeText = info ? t("{{count}} papers", { count: formatNumber(info.totalPapers) }) : t("No papers");
                        const trendText = info
                          ? `${verdictLabel(info.classification.verdict, t)}${formatRelativeChange(info.classification, t) ? `, ${formatRelativeChange(info.classification, t)}` : ""}`
                          : t("No verdict");

                        return (
                          <div key={tName} className="flex flex-col bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200/40 dark:border-slate-800">
                            <span className="text-xs font-extrabold text-slate-850 dark:text-slate-200 capitalize">{tName}</span>
                            <span className="text-[9px] font-bold text-slate-450 dark:text-slate-500 mt-0.5">
                              {volumeText} ({trendText})
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-slate-550 dark:text-slate-400 leading-relaxed font-semibold mb-4">{rec.reason}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8.5 w-fit text-xs font-bold gap-1.5 rounded-xl border-blue-200 hover:bg-blue-50/50 dark:border-blue-900/30 dark:hover:bg-blue-950/20 text-blue-700 dark:text-blue-400"
                    onClick={() => {
                      setSelectedTopics(rec.topics);
                      setTimeout(scrollToCompareSection, 100);
                    }}
                  >
                    <Users className="w-3.5 h-3.5" /> Use this comparison
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Selected Topics Summary & Workbench */}
      {selectedTopics.length > 0 && (
        <div className="bg-slate-50/30 dark:bg-slate-900/5 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3.5 select-none">
          <div className="flex items-center justify-between gap-4">
            <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-500" />
              Comparing {selectedTopics.length} {selectedTopics.length === 1 ? "topic" : "topics"} inside {activeScopeText}
            </h4>
            {selectedTopics.length === 1 && (
              <span className="text-xs font-bold text-blue-650 dark:text-blue-400 animate-pulse">
                Select one more topic to compare trends side by side.
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedTopics.map((topic) => (
              <span
                key={topic}
                className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/35 border border-blue-150 dark:border-blue-900 text-blue-750 dark:text-blue-300 pl-3 pr-1 py-1 rounded-xl text-xs font-extrabold shadow-sm"
              >
                <span className="capitalize">{topic}</span>
                <button
                  type="button"
                  onClick={() => setSelectedTopics(prev => prev.filter(x => x !== topic))}
                  aria-label={`Remove topic ${topic}`}
                  className="p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-full text-blue-400 hover:text-blue-700 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>

          {/* Invalid Selected Topics warnings */}
          {emptyTopics.length > 0 && (
            <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-200/30 dark:border-red-900/30 rounded-xl p-3 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-500" />
              <span>Some selected topics have no papers in this scope. Remove them or clear filters.</span>
            </div>
          )}
        </div>
      )}

      {selectedTopics.length >= 2 && !compareQuery.isLoading && !compareQuery.isError && (
        <div id="compare-chart-section" className="space-y-6">
          {/* Volume Divergence Warning */}
          {showVolumeWarning && (
            <div className="bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30 rounded-xl p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 select-none animate-fadeIn">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
              <span className="font-semibold">
                One topic has much larger volume than another. Compare shape and normalized impact, not only raw count.
              </span>
            </div>
          )}

          {/* 7. FE-Computed Recommendation Insights Panel */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topRising && (
                <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{t("Top rising topic")}</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-white capitalize mt-0.5 line-clamp-1">{topRising.topic.topic}</div>
                    <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">{formatRelativeChange(topRising.classification, t)}</div>
                  </div>
                </div>
              )}

              {largestVolume && (
                <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-650 dark:text-purple-400 rounded-lg shrink-0">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Largest Volume</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-white capitalize mt-0.5 line-clamp-1">{largestVolume.topic}</div>
                    <div className="text-[10px] text-purple-650 dark:text-purple-400 font-bold">{formatNumber(largestVolume.totalPapers)} total papers</div>
                  </div>
                </div>
              )}

              {highestCitations && (
                <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Highest Citation Impact</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-white capitalize mt-0.5 line-clamp-1">{highestCitations.topic.topic}</div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      {hasPp
                        ? `${formatPercent(highestCitations.value)} PP(top 10%)`
                        : t("{{value}} avg citations", { value: highestCitations.value.toFixed(1) })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Combined Recommendation text */}
            <div className="bg-blue-50/30 dark:bg-blue-950/15 border-l-4 border-blue-500 rounded-r-xl p-4 text-xs text-slate-700 dark:text-slate-350 select-none">
              <span className="font-semibold">{recommendationText}</span>
            </div>

            {/* Small-base warnings */}
            {smallBaseWarnings.length > 0 && (
              <div className="bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30 rounded-xl p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 select-none">
                <Zap className="w-4 h-4 text-amber-500 shrink-0 animate-bounce" />
                <span>
                  <strong>{t("Small-base warning")}:</strong> {t("{{topics}}: fewer than 30 papers in the window, too few for a trend verdict.", { topics: smallBaseWarnings.map(topic => topic.topic).join(", ") })}
                </span>
              </div>
            )}
          </div>

          {/* 3. Primary Recharts Line Chart */}
          <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            {/* Segmented Metric Toggle */}
            <div className="flex items-center justify-between gap-4 flex-wrap select-none border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                <ChartIcon className="w-4 h-4 text-blue-500" /> Topic Trend comparison
              </div>
              <div className="flex bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 p-1 rounded-xl gap-0.5">
                <button
                  type="button"
                  onClick={() => setMetricMode("papers")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                    metricMode === "papers"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-550 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Papers / year
                </button>
                {hasPp ? (
                  <button
                    type="button"
                    onClick={() => setMetricMode("pp_top10")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                      metricMode === "pp_top10"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-550 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    PP(top 10%)
                  </button>
                ) : hasTotals ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setMetricMode("citations")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                        metricMode === "citations"
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-550 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Total citations
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetricMode("avg_citations")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                        metricMode === "avg_citations"
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-550 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      Avg citations
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {/* Dynamic Metric Helper Instruction Text */}
            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold select-none leading-relaxed italic">
              {metricHelperText}
            </p>

            {/* Recharts line chart */}
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={compareChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="year"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 550 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 550 }}
                    tickFormatter={(value) => value === 0 ? '' : metricMode === "pp_top10" ? `${value}%` : formatNumber(value)}
                    domain={metricMode === "pp_top10" ? [0, (dataMax: number) => Math.max(dataMax, WORLD_AVERAGE_PP_TOP10 * 1.2)] : undefined}
                  />
                  {metricMode === "pp_top10" && (
                    <ReferenceLine
                      y={WORLD_AVERAGE_PP_TOP10}
                      stroke="#64748b"
                      strokeDasharray="6 4"
                      label={{ value: t("10% = world average"), position: "insideBottomRight", fill: "#64748b", fontSize: 10, fontWeight: "bold" }}
                    />
                  )}
                  <RechartsTooltip content={<CustomChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  />
                  {selectedTopics.map((topic, index) => {
                    const colors = ["#1d4ed8", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];
                    return (
                      <Line
                        key={topic}
                        type="monotone"
                        dataKey={topic}
                        stroke={colors[index % colors.length]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 8. Comparison Table + Action links */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-[#121212] mt-4">
            <TrendIntro className="border-b border-slate-100 px-6 py-3 dark:border-slate-800" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 dark:bg-slate-900/20">
                  <tr>
                    <th className="px-6 py-4 font-medium whitespace-nowrap min-w-[260px]">Topic Name</th>
                    <th className="px-6 py-4 font-medium text-right whitespace-nowrap min-w-[90px]">Papers</th>
                    <th className="px-6 py-4 font-medium whitespace-nowrap min-w-[190px]">{t("Trend")}</th>
                    <th className="px-6 py-4 font-medium whitespace-nowrap min-w-[250px]">{t("Relative change")}</th>
                    {hasPp ? (
                      <th className="px-6 py-4 font-medium text-right whitespace-nowrap min-w-[150px]">PP(top 10%)</th>
                    ) : (
                      <>
                        <th className="px-6 py-4 font-medium text-right whitespace-nowrap min-w-[150px]">Total Citations</th>
                        <th className="px-6 py-4 font-medium text-right whitespace-nowrap min-w-[140px]">Avg Citations</th>
                      </>
                    )}
                    <th className="px-6 py-4 font-medium text-right whitespace-nowrap min-w-[140px]">{t("Citation impact")}</th>
                    <th className="px-6 py-4 font-medium text-center whitespace-nowrap min-w-[110px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {compareQuery.data?.topics.map((t: TopicComparisonItem, i: number) => {
                    const colors = ["#1d4ed8", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];
                    const colorClass = colors[i % colors.length];
                    const totalCitations = getTotalCitations(t);
                    const avgCitations = getAverageCitations(t);
                    const ppTop10 = getPpTop10(t);
                    const rowClassification = classificationOf(t.topic);

                    return (
                      <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200 capitalize flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorClass }} />
                          {t.topic}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-700 dark:text-slate-350">
                          {formatNumber(t.totalPapers)}
                        </td>
                        <td className="px-6 py-4 align-top">
                          {rowClassification ? (
                            <TrendVerdictBadge classification={rowClassification} size="sm" />
                          ) : (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{tr("No verdict: this topic is not in the overview list")}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 align-top">
                          {rowClassification && rowClassification.verdict !== "insufficient" ? (
                            <span className="font-mono text-sm font-extrabold text-slate-800 dark:text-slate-200">{formatRelativeChange(rowClassification, tr) ?? "—"}</span>
                          ) : (
                            <span className="text-[11px] font-semibold text-slate-400">—</span>
                          )}
                        </td>
                        {hasPp ? (
                          <td className="px-6 py-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                            {ppTop10 === null ? "—" : formatPercent(ppTop10)}
                          </td>
                        ) : (
                          <>
                            <td className="px-6 py-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                              {totalCitations === null ? "—" : formatNumber(totalCitations)}
                            </td>
                            <td className="px-6 py-4 text-right font-semibold text-slate-750 dark:text-slate-300">
                              {avgCitations === null ? "—" : avgCitations.toFixed(2)}
                            </td>
                          </>
                        )}
                        <td className="px-6 py-4 text-right select-none">
                          <span className="inline-block text-[10.5px] font-extrabold text-slate-650 bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 px-2 py-0.5 rounded-lg">
                            {getInterpretation(t)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2.5 select-none">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => navigate(buildScopedUrl("/home", { q: t.topic }))}
                                  aria-label={`Search scoped papers for topic ${t.topic}`}
                                  className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 text-slate-500 dark:text-slate-450 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 rounded-xl transition-all shadow-sm active:scale-90 shrink-0"
                                >
                                  <Search className="w-4 h-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-popover text-popover-foreground border shadow-sm">
                                Search scoped papers for "{t.topic}"
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => navigate(buildScopedUrl("/reports", {
                                    create: "true",
                                    topic: t.topic,
                                    query: `Analyze research trends, research gaps, and future directions within ${t.topic}.`,
                                  }))}
                                  aria-label={`Generate scoped report for topic ${t.topic}`}
                                  className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 text-slate-500 dark:text-slate-455 hover:text-purple-650 dark:hover:text-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 rounded-xl transition-all shadow-sm active:scale-90 shrink-0"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-popover text-popover-foreground border shadow-sm">
                                Generate scoped report for "{t.topic}"
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFocusTopic(t.topic);
                                    setActiveTab?.("ai");
                                  }}
                                  aria-label={`Explain trend with AI for topic ${t.topic}`}
                                  className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 text-slate-500 dark:text-slate-450 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 rounded-xl transition-all shadow-sm active:scale-90 shrink-0"
                                >
                                  <Sparkles className="w-4 h-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-popover text-popover-foreground border shadow-sm">
                                Explain trend for "{t.topic}" using AI model
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

        </div>
      )}
    </div>
  );
}
