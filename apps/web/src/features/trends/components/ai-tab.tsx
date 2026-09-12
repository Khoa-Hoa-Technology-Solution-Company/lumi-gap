import React from "react";
import { Cpu, ChevronDown, Sparkles, Loader2, Search, FileText, Copy, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import type { TopicRelationshipEdge, TopicRelationshipResponse, TrendExplanationHistoryResponse, TrendExplanationResponse, TrendTopicCandidate, TrendsOverview } from "@trend/shared-types";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useTrendTopicCandidates } from "@/features/trends/hooks/use-trends";
import type { TrendExplainInput, TrendsOverviewParams, TrendTopicCandidatesParams } from "@/features/trends/api/trends.api";
import { formatNumber } from "@/utils";
import { useI18n } from "@/i18n";

type CitationBandFilter = NonNullable<TrendsOverviewParams["citationBands"]>;

interface AITabProps {
  data: TrendsOverview;
  activeFocusTopic: string;
  setFocusTopic: (topic: string) => void;
  relationshipsQuery: Pick<UseQueryResult<TopicRelationshipResponse, Error>, "data" | "isLoading" | "isError">;
  explainMutation: UseMutationResult<TrendExplanationResponse, Error, TrendExplainInput, unknown>;
  explainHistoryQuery: Pick<UseQueryResult<TrendExplanationHistoryResponse, Error>, "data" | "isLoading" | "isError">;
  yearFrom: number;
  yearTo: number;
  domains: string[];
  fields: string[];
  subfields: string[];
  topicsFilter: string[];
  domainIds: string[];
  fieldIds: string[];
  subfieldIds: string[];
  topicIds: string[];
  paperKinds: string[];
  openAccessStatuses: string[];
  providers: string[];
  sources: string[];
  languages: string[];
  citationBands: CitationBandFilter;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

export function AITab({
  data,
  activeFocusTopic,
  setFocusTopic,
  relationshipsQuery,
  explainMutation,
  explainHistoryQuery,
  yearFrom,
  yearTo,
  domains,
  fields,
  subfields,
  topicsFilter,
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
}: AITabProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [topicSearch, setTopicSearch] = React.useState("");
  const [selectedHistoryExplanation, setSelectedHistoryExplanation] = React.useState<TrendExplanationResponse | null>(null);
  const debouncedTopicSearch = useDebouncedValue(topicSearch.trim(), 300);
  const relationshipEdges = relationshipsQuery.data?.edges ?? [];
  const currentExplanation = selectedHistoryExplanation ?? explainMutation.data;
  const selectedTopicExistsInTopList = data.topics.some((topic) => topic.topic === activeFocusTopic);
  const topicCandidateParams = React.useMemo<TrendTopicCandidatesParams>(() => ({
    q: debouncedTopicSearch,
    limit: 12,
    minPapers: 1,
    yearFrom,
    yearTo,
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
    debouncedTopicSearch,
    yearFrom,
    yearTo,
    domains,
    fields,
    subfields,
    topicsFilter,
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
  ]);
  const topicCandidatesQuery = useTrendTopicCandidates(topicCandidateParams, debouncedTopicSearch.length > 0);
  const topicCandidates = topicCandidatesQuery.data?.topics ?? [];
  const pickTopicToExplain = (topic: string) => {
    setFocusTopic(topic);
    setTopicSearch("");
  };
  const copyCurrentExplanation = async () => {
    if (!currentExplanation) return;
    const markdown = [
      `# Trend explanation: ${currentExplanation.topic ?? "Overall corpus"}`,
      "",
      currentExplanation.summary,
      "",
      "## Why it matters",
      ...currentExplanation.whyItMatters.map((item) => `- ${item}`),
      "",
      "## Evidence signals",
      ...currentExplanation.evidenceSignals.map((item) => `- ${item.text} (${item.sources.join(", ")})`),
      "",
      "## Cautions",
      ...currentExplanation.cautions.map((item) => `- ${item}`),
      "",
      "## Suggested actions",
      ...currentExplanation.suggestedActions.map((item) => `- ${item}`),
    ].join("\n");
    await navigator.clipboard?.writeText(markdown);
  };
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

  return (
    <div className="space-y-6">
      {/* Tab Purpose Header (P10 Request) */}
      <div className="text-xs text-slate-550 dark:text-slate-400 font-medium select-none">
        {t("Pick a topic and ask AI to explain why the trend may matter. The answer is grounded in aggregate trend metrics from the current dataset, not arbitrary web knowledge.")}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Cột Trái: Topic co-occurrence graph preview (5 columns) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-between min-h-[460px]">
          <div>
            <div className="flex flex-col gap-3 mb-4 select-none">
              <h3 className="min-w-0 text-lg font-bold leading-snug text-slate-900 dark:text-white">
                {t("Topics Related to")}{" "}
                <span className="break-words">{activeFocusTopic}</span>
              </h3>

              {/* select focusTopic */}
              <div className="relative w-full">
                <select
                  value={activeFocusTopic}
                  onChange={(e) => setFocusTopic(e.target.value)}
                  className="h-8 w-full truncate pl-3 pr-8 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 appearance-none cursor-pointer"
                >
                  {!selectedTopicExistsInTopList && activeFocusTopic ? (
                    <option value={activeFocusTopic}>{activeFocusTopic}</option>
                  ) : null}
                  {data.topics.map(t => (
                    <option key={t.topic} value={t.topic}>{t.topic}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-6">
              {t("These are not search results. Each row counts papers that are tagged with both")}{" "}
              <strong>{activeFocusTopic}</strong>{" "}
              {t("and the related topic inside the current scope.")}
            </p>

            <div className="mb-5 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/25 dark:bg-blue-950/10 p-3">
              <label htmlFor="trend-explain-topic-search" className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Search trend to explain
              </label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  id="trend-explain-topic-search"
                  type="search"
                  value={topicSearch}
                  onChange={(event) => setTopicSearch(event.target.value)}
                  placeholder="Search any topic inside the current scope..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-blue-950/40"
                />
              </div>

              <div className="mt-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Search uses the same year range, Data Scope, publication filters, and citation filters as this Trends page.
              </div>

              {debouncedTopicSearch.length > 0 ? (
                <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
                  {topicCandidatesQuery.isFetching ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-xs font-semibold text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Searching scoped topics...
                    </div>
                  ) : topicCandidatesQuery.isError ? (
                    <div className="px-3 py-3 text-xs font-semibold text-red-600">
                      Topic search failed. Try a shorter query or clear narrow filters.
                    </div>
                  ) : topicCandidates.length === 0 ? (
                    <div className="px-3 py-3 text-xs font-semibold text-slate-500">
                      No topic found in this scope. Broaden Data Scope or search a different phrase.
                    </div>
                  ) : (
                    topicCandidates.map((candidate: TrendTopicCandidate) => (
                      <button
                        key={`${candidate.topic}-${candidate.matchedBy}`}
                        type="button"
                        onClick={() => pickTopicToExplain(candidate.topic)}
                        className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-blue-50/70 dark:border-slate-800 dark:hover:bg-blue-950/20"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-extrabold text-slate-850 dark:text-slate-200">{candidate.topic}</span>
                          <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {candidate.taxonomy?.domainName ?? "Unknown domain"}
                            {" / "}
                            {candidate.matchedBy === "taxonomy" ? "taxonomy match" : "topic match"}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] font-extrabold text-blue-700 dark:text-blue-300">
                          {formatNumber(candidate.totalPapers)} papers
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.topics.slice(0, 5).map((topic) => (
                    <button
                      key={topic.topic}
                      type="button"
                      onClick={() => pickTopicToExplain(topic.topic)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold transition ${
                        activeFocusTopic === topic.topic
                          ? "border-blue-300 bg-blue-600 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-blue-950/20"
                      }`}
                    >
                      {topic.topic}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {relationshipsQuery.isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                <p className="text-xs text-slate-500 font-medium">Fetching relationships...</p>
              </div>
            ) : relationshipsQuery.isError ? (
              <p className="text-sm text-red-600 py-6 text-center">Failed to load co-occurrences.</p>
            ) : relationshipEdges.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-10 text-center">No co-occurring topics found for this topic.</p>
            ) : (
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {relationshipEdges.slice(0, 10).map((edge: TopicRelationshipEdge, idx: number) => {
                  const relatedName = edge.source === activeFocusTopic ? edge.target : edge.source;
                  const maxCount = Math.max(...relationshipEdges.map((e: TopicRelationshipEdge) => e.count));
                  const percentage = maxCount > 0 ? Math.round((edge.count / maxCount) * 100) : 0;
                  return (
                    <div key={idx} className="text-xs bg-slate-50/50 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800/40 rounded-xl p-3 flex flex-col justify-between hover:border-slate-200/80 dark:hover:border-slate-800/80 transition-colors">
                      <div className="flex justify-between items-center mb-1.5 font-bold">
                        <span className="text-slate-800 dark:text-slate-200 capitalize">{relatedName}</span>
                        <span className="text-blue-700 dark:text-blue-400">{edge.count} co-occurring papers</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-600 dark:bg-blue-500 h-full rounded-full" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-150 dark:border-slate-800/40">
            {/* Explain Target Context Preview (P10 Request) */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl p-3 text-xs mb-4 space-y-1 text-slate-500 dark:text-slate-400 select-none">
              <p className="font-extrabold text-slate-800 dark:text-slate-350">Explanation Context:</p>
              <div className="flex justify-between">
                <span>Selected Topic:</span>
                <strong className="text-blue-650 dark:text-blue-400 font-extrabold capitalize">{activeFocusTopic}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span className="shrink-0">Dataset Scope:</span>
                <strong className="text-slate-800 dark:text-slate-200 font-bold truncate max-w-[180px] capitalize">
                  {(() => {
                    const parts: string[] = [];
                    if (domainIds.length > 0) {
                      const name = data.facets?.domains?.find(d => d.openalexId === domainIds[0] || d.id === domainIds[0])?.name || domainIds[0];
                      if (name) parts.push(name);
                    } else if (domains.length > 0 && domains[0]) {
                      parts.push(domains[0]);
                    }
                    if (fieldIds.length > 0) {
                      const name = data.facets?.fields?.find(f => f.openalexId === fieldIds[0] || f.id === fieldIds[0])?.name || fieldIds[0];
                      if (name) parts.push(name);
                    } else if (fields.length > 0 && fields[0]) {
                      parts.push(fields[0]);
                    }
                    if (subfieldIds.length > 0) {
                      const name = data.facets?.subfields?.find(s => s.openalexId === subfieldIds[0] || s.id === subfieldIds[0])?.name || subfieldIds[0];
                      if (name) parts.push(name);
                    } else if (subfields.length > 0 && subfields[0]) {
                      parts.push(subfields[0]);
                    }
                    if (topicIds.length > 0) {
                      const name = data.facets?.topics?.find(t => t.openalexId === topicIds[0] || t.id === topicIds[0])?.name || topicIds[0];
                      if (name) parts.push(name);
                    } else if (topicsFilter.length > 0 && topicsFilter[0]) {
                      parts.push(topicsFilter[0]);
                    }
                    return parts.length > 0 ? parts.join(" > ") : "All Domains";
                  })()}
                </strong>
              </div>
            </div>

            <Button
              onClick={() => {
                setSelectedHistoryExplanation(null);
                explainMutation.mutate({
                  topic: activeFocusTopic,
                  yearFrom,
                  yearTo,
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
                  language: "en"
                });
              }}
              disabled={explainMutation.isPending}
              className="w-full h-10 bg-blue-700 hover:bg-blue-800 text-white font-extrabold rounded-xl shadow-md gap-2 flex items-center justify-center active:scale-98 transition-transform"
            >
              {explainMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating explanation...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 animate-pulse text-amber-300" />
                  Explain trend with AI
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Cột Phải: AI "Why This Trend Matters" (7 columns) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col min-h-[460px]">
          <div className="border-b border-slate-100 dark:border-slate-800/50 pb-4 mb-4 select-none">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-600" />
              AI Research Explainer
            </h3>
            <p className="text-xs text-slate-500 mt-1">Get an instant AI overview on why the selected focus topic is trending.</p>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[480px] pr-1 space-y-4">
            {explainMutation.isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : explainMutation.isError ? (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/30 rounded-xl text-xs font-semibold text-red-600 leading-relaxed select-text">
                AI explanation failed. You can still inspect the charts and facets.
              </div>
            ) : currentExplanation ? (
              <div className="space-y-4 text-xs leading-relaxed select-text">
                <div className="bg-blue-50/50 dark:bg-blue-950/15 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4">
                  <h4 className="font-extrabold text-blue-700 dark:text-blue-400 mb-1.5 uppercase text-[10px] tracking-wider">AI Trend Summary</h4>
                  <p className="text-slate-705 dark:text-slate-300 font-medium text-xs leading-relaxed">{currentExplanation.summary}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-800/40 rounded-xl p-4">
                    <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase text-[9px] tracking-wider">Why It Matters</h4>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-600 dark:text-slate-400">
                      {currentExplanation.whyItMatters.map((item: string, idx: number) => (
                        <li key={idx} className="indent-[-12px] pl-3 leading-normal">{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-800/40 rounded-xl p-4">
                    <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase text-[9px] tracking-wider">Evidence Signals</h4>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-600 dark:text-slate-400">
                      {currentExplanation.evidenceSignals.map((item, idx: number) => (
                        <li key={idx} className="indent-[-12px] pl-3 leading-normal">
                          <span>{item.text}</span>
                          <div className="mt-1 flex flex-wrap gap-1 pl-3">
                            {item.sources.map((source) => (
                              <span key={source} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[9px] font-extrabold text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
                                from {source}
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 rounded-xl p-4">
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase text-[9px] tracking-wider">Metric Trace</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentExplanation.metricTrace.map((trace) => (
                      <div key={trace.source} className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 p-2">
                        <div className="text-[10px] font-extrabold text-slate-800 dark:text-slate-200">{trace.label}</div>
                        <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400">{trace.value}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">{trace.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-amber-50/30 dark:bg-amber-950/5 border border-amber-100/50 dark:border-amber-950/20 rounded-xl p-4">
                    <h4 className="font-bold text-amber-700 dark:text-amber-400 mb-2 uppercase text-[9px] tracking-wider">Cautions</h4>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-600 dark:text-slate-400">
                      {currentExplanation.cautions.map((item: string, idx: number) => (
                        <li key={idx} className="indent-[-12px] pl-3 leading-normal">{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-emerald-50/20 dark:bg-emerald-950/5 border border-emerald-100/40 dark:border-emerald-950/20 rounded-xl p-4">
                    <h4 className="font-bold text-emerald-700 dark:text-emerald-500 mb-2 uppercase text-[9px] tracking-wider">Suggested Actions</h4>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-600 dark:text-slate-400">
                      {currentExplanation.suggestedActions.map((item: string, idx: number) => (
                        <li key={idx} className="indent-[-12px] pl-3 leading-normal">{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-2 text-[10px] text-slate-400 dark:text-slate-500 font-semibold border-t border-slate-100 dark:border-slate-800/60 select-none">
                  AI explanation is grounded in aggregate trend metrics, not individual paper-level citations. Generated at {new Date(currentExplanation.generatedAt).toLocaleDateString()}.
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1 select-none">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={copyCurrentExplanation}
                    className="h-9 rounded-xl text-xs font-extrabold gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy explanation
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(buildScopedUrl("/search", { q: activeFocusTopic }))}
                    className="h-9 rounded-xl text-xs font-extrabold gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-950/20"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Search scoped papers
                  </Button>
                  <Button
                    type="button"
                    onClick={() => navigate(buildScopedUrl("/reports", {
                      create: "true",
                      topic: activeFocusTopic,
                      query: `Explain research trends, evidence signals, cautions, and future directions for ${activeFocusTopic}.`,
                    }))}
                    className="h-9 rounded-xl text-xs font-extrabold gap-2 bg-blue-700 hover:bg-blue-800 text-white"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Generate scoped report
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/10 dark:bg-slate-900/5 select-none">
                <Cpu className="w-8 h-8 text-blue-600/30 animate-pulse mb-3" />
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">AI Explainer is ready.</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">Pick a topic and ask AI to explain why the trend may matter. The answer is grounded in aggregate trend metrics from the current dataset, not arbitrary web knowledge.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Explain History</h3>
        </div>
        {explainHistoryQuery.isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : explainHistoryQuery.isError ? (
          <p className="text-xs font-semibold text-slate-500">Sign in to keep AI explanations across reloads.</p>
        ) : (explainHistoryQuery.data?.items.length ?? 0) === 0 ? (
          <p className="text-xs text-slate-500">No saved explanations for this topic yet. Run Explain trend with AI to save one.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {explainHistoryQuery.data!.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFocusTopic(item.topic ?? "");
                  setSelectedHistoryExplanation(item);
                }}
                className="rounded-xl border border-slate-100 bg-slate-50/40 p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-800 dark:bg-slate-900/20 dark:hover:border-blue-900/50 dark:hover:bg-blue-950/20"
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate">{item.topic ?? "Overall corpus"}</span>
                  <span className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">{item.summary}</p>
                <p className="mt-2 text-[10px] font-semibold text-blue-700 dark:text-blue-400">{item.scopeLabel}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
