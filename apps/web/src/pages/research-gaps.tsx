import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Sparkles,
  XCircle,
  Filter,
  Search,
  Zap,
  Loader2,
  ListFilter,
  ChevronLeft,
  ChevronRight,
  Star,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  useGaps,
  useAnalyzeGap,
  useGapAnalysisStatus,
  useActiveGapAnalysis,
  useRetryGapAnalysis,
} from "@/features/gaps";
import type { AnalyzeGapRequest, GapSource, ResearchGapItem } from "@trend/shared-types";
import { GapCard } from "@/features/gaps/components/gap-card";
import { GapDetailDrawer } from "@/features/gaps/components/gap-detail-drawer";
import { GapAnalysisWorkflow } from "@/features/gaps/components/gap-analysis-workflow";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";

type GapSortKey = "recommended" | "evidence" | "confidence" | "papers" | "newest" | "ai_only_last";

type GapGroup = {
  id: string;
  topic: string;
  source: GapSource;
  analysisId?: string;
  sourceReportId?: string;
  gaps: ResearchGapItem[];
};

function getGapGroupId(gap: ResearchGapItem) {
  if (gap.analysisId) return `analysis:${gap.analysisId}`;
  if (gap.sourceReportId) return `report:${gap.sourceReportId}`;
  return `single:${gap.id}`;
}

function groupResearchGaps(gaps: ResearchGapItem[]): GapGroup[] {
  const groups = new Map<string, GapGroup>();

  for (const gap of gaps) {
    const id = getGapGroupId(gap);
    const existing = groups.get(id);

    if (existing) {
      existing.gaps.push(gap);
      continue;
    }

    groups.set(id, {
      id,
      topic: gap.topic,
      source: gap.source,
      analysisId: gap.analysisId,
      sourceReportId: gap.sourceReportId,
      gaps: [gap],
    });
  }

  return [...groups.values()];
}

function AnalysisPoller({
  analysisId,
  onDone,
  onRetry,
  isRetrying,
}: {
  analysisId: string;
  onDone: () => void;
  onRetry: (analysisId: string) => void;
  isRetrying: boolean;
}) {
  const { t } = useI18n();
  const { data } = useGapAnalysisStatus(analysisId);

  useEffect(() => {
    if (data?.status === "ready") {
      onDone();
    }
  }, [data?.status, onDone]);

  if (data?.status === "failed") {
    return (
      <div role="alert" className="max-w-3xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{t("Analysis failed for {{topic}}", { topic: data.topic })}</p>
            <p className="mt-1 break-words text-xs">{data.errorMessage ?? t("Analysis failed.")}</p>
            <p className="mt-1 text-xs opacity-80">
              {t("Your credits were refunded. Retry uses the same reviewed papers and settings.")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isRetrying}
            onClick={() => onRetry(analysisId)}
            className="shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-100 dark:bg-red-950"
          >
            {isRetrying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("Retry analysis")}
          </Button>
        </div>
      </div>
    );
  }
  if (data?.status === "ready") return null;
  return (
    <div aria-live="polite" className="max-w-3xl rounded-lg border border-blue-100 bg-blue-50/50 p-4 shadow-sm dark:border-blue-900 dark:bg-blue-900/10">
      <div className="flex items-center gap-3">
      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        <div>
          <p className="text-sm font-bold text-blue-800 dark:text-blue-200">{data?.topic}</p>
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
            {data?.status === "analyzing" ? t("Analyzing documents with Gemini AI…") : t("Analysis job queued…")}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ResearchGapsPage() {
  const { t } = useI18n();
  const userId = useAuthStore((state) => state.user?.id ?? "anonymous");
  const [searchParams] = useSearchParams();
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"active" | "resolved" | "dismissed">("active");
  const [searchTopic, setSearchTopic] = useState(searchParams.get("topic") || "");
  const [sourceFilter, setSourceFilter] = useState<GapSource | "all">("all");
  const [page, setPage] = useState(1);
  const [minConfidence, setMinConfidence] = useState(0);
  const [debouncedConfidence, setDebouncedConfidence] = useState(0);
  const [selectedGap, setSelectedGap] = useState<ResearchGapItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Search & Sort & Shortlist states
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<GapSortKey>("newest");
  const [shortlistedGaps, setShortlistedGaps] = useState<ResearchGapItem[]>([]);
  const [isShortlistHydrated, setIsShortlistHydrated] = useState(false);
  const [showShortlistedOnly, setShowShortlistedOnly] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const shortlistedIds = shortlistedGaps.map((gap) => gap.id);
  const shortlistStorageKey = `research-gap-shortlist:${userId}`;

  useEffect(() => {
    setIsShortlistHydrated(false);
    try {
      const stored = window.localStorage.getItem(shortlistStorageKey);
      setShortlistedGaps(stored ? JSON.parse(stored) as ResearchGapItem[] : []);
    } catch {
      setShortlistedGaps([]);
    } finally {
      setIsShortlistHydrated(true);
    }
  }, [shortlistStorageKey]);

  useEffect(() => {
    if (!isShortlistHydrated) return;
    window.localStorage.setItem(shortlistStorageKey, JSON.stringify(shortlistedGaps));
  }, [isShortlistHydrated, shortlistStorageKey, shortlistedGaps]);

  // Sync with URL params
  const urlSource = searchParams.get("source") as GapSource | null;
  const urlTopic = searchParams.get("topic") || "";

  useEffect(() => {
    if (urlSource) {
      setSourceFilter(urlSource);
    }
    if (urlTopic) {
      setSearchTopic(urlTopic);
    }
  }, [urlSource, urlTopic]);

  // Debounce confidence slider value
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedConfidence(minConfidence), 300);
    return () => clearTimeout(timer);
  }, [minConfidence]);

  // Debounce search box
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(clientSearch), 250);
    return () => clearTimeout(timer);
  }, [clientSearch]);

  // Reset page when API filters change
  useEffect(() => {
    setPage(1);
  }, [filterStatus, debouncedConfidence, debouncedSearch, searchTopic, sourceFilter, sortBy]);

  const {
    data: gapsData,
    isLoading,
    isError,
    refetch,
  } = useGaps({
    status: filterStatus,
    pageSize: 10,
    page,
    minConfidence: debouncedConfidence,
    topic: searchTopic || undefined,
    search: debouncedSearch || undefined,
    source: sourceFilter !== "all" ? sourceFilter : undefined,
    sortBy,
  });

  const { mutate: analyze, isPending } = useAnalyzeGap();
  const { mutate: retryAnalysis, isPending: isRetrying } = useRetryGapAnalysis();
  const { data: activeAnalysis } = useActiveGapAnalysis();

  useEffect(() => {
    if (activeAnalysis && (activeAnalysis.status === "queued" || activeAnalysis.status === "analyzing")) {
      setActiveAnalysisId(activeAnalysis.id);
    }
  }, [activeAnalysis]);

  const handleDone = useCallback(() => {
    setActiveAnalysisId(null);
    void refetch();
    toast.success(t("Gap analysis completed successfully! Gaps list refreshed."));
  }, [refetch, t]);

  const handleAnalyze = (payload: AnalyzeGapRequest) => {
    analyze(
      payload,
      {
        onSuccess: ({ analysisId }) => {
          setActiveAnalysisId(analysisId);
          toast.success(t("Gap analysis queued with the reviewed evidence pack."));
        },
        onError: (err: any) => {
          toast.error(err.response?.data?.error?.message || t("Failed to trigger gap analysis."));
        }
      },
    );
  };

  const handleToggleShortlist = useCallback((gap: ResearchGapItem) => {
    setShortlistedGaps(prev => {
      if (prev.some((item) => item.id === gap.id)) {
        return prev.filter((item) => item.id !== gap.id);
      }
      return [...prev, gap];
    });
  }, []);

  const handleMoveUp = useCallback((gapId: string) => {
    setShortlistedGaps(prev => {
      const index = prev.findIndex((gap) => gap.id === gapId);
      if (index <= 0) return prev;
      const next = [...prev];
      const prevItem = next[index - 1];
      if (prevItem === undefined) return prev;
      next[index] = prevItem;
      next[index - 1] = prev[index]!;
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((gapId: string) => {
    setShortlistedGaps(prev => {
      const index = prev.findIndex((gap) => gap.id === gapId);
      if (index === -1 || index >= prev.length - 1) return prev;
      const next = [...prev];
      const nextItem = next[index + 1];
      if (nextItem === undefined) return prev;
      next[index] = nextItem;
      next[index + 1] = prev[index]!;
      return next;
    });
  }, []);

  // The API searches and sorts the entire result set before pagination.
  const rawGaps = showShortlistedOnly ? shortlistedGaps : gapsData?.data ?? [];
  const processedGaps = [...rawGaps];

  if (showShortlistedOnly && debouncedSearch.trim()) {
    const q = debouncedSearch.toLowerCase().trim();
    const shortlistedMatches = processedGaps.filter(gap => {
      const titleMatch = gap.title?.toLowerCase().includes(q) ?? false;
      const descMatch = gap.description?.toLowerCase().includes(q) ?? false;
      const topicMatch = gap.topic?.toLowerCase().includes(q) ?? false;
      const probeAMatch = gap.probe?.topicA?.toLowerCase().includes(q) ?? false;
      const probeBMatch = gap.probe?.topicB?.toLowerCase().includes(q) ?? false;
      const paperMatch = gap.supportingPapers?.some(p => p.title?.toLowerCase().includes(q)) ?? false;
      return titleMatch || descMatch || topicMatch || probeAMatch || probeBMatch || paperMatch;
    });
    processedGaps.splice(0, processedGaps.length, ...shortlistedMatches);
  }

  const groupedGaps = useMemo(() => groupResearchGaps(processedGaps), [processedGaps]);

  const toggleGapGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }, []);

  const selectedSortLabel: Record<GapSortKey, string> = {
    recommended: t("Recommended (evidence + confidence)"),
    evidence: t("Most Evidence-backed"),
    confidence: t("Highest Confidence"),
    papers: t("Most Supporting Papers"),
    newest: t("Newest Opportunities First"),
    ai_only_last: t("AI-only Last"),
  };

  const handleRetry = (analysisId: string) => {
    retryAnalysis(analysisId, {
      onSuccess: ({ analysisId: nextAnalysisId }) => {
        setActiveAnalysisId(nextAnalysisId);
        toast.success(t("Gap analysis re-queued with the same evidence pack."));
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.error?.message || t("Failed to retry gap analysis."));
      },
    });
  };

  return (
    <main className="container min-w-0 space-y-6 overflow-x-clip py-8">
      <PageHeader
        title={t("Research Gaps")}
        description={t("AI-suggested research opportunities grounded in retrieved papers.")}
      />

      {activeAnalysisId && (
        <AnalysisPoller
          analysisId={activeAnalysisId}
          onDone={handleDone}
          onRetry={handleRetry}
          isRetrying={isRetrying}
        />
      )}

      <GapAnalysisWorkflow isAnalyzing={isPending} onAnalyze={handleAnalyze} />

      {/* Unified Filters & Research Workflow Toolbar */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300 dark:border-slate-800 dark:bg-[#12161f] space-y-4">
        {/* Row 1: Search & Topic filters (Primary Inputs) */}
        <div className="flex flex-col md:flex-row gap-3.5 items-stretch md:items-center">
          {/* Client-side Search Box */}
          <div className="relative w-full min-w-0 flex-grow md:min-w-[280px] md:flex-[2]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder={t("Search gaps by title, description, paper, or topic…")}
              className="pl-9 h-10 border-slate-200/80 dark:border-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 rounded-xl text-xs font-medium bg-slate-50/50 dark:bg-slate-950/80"
            />
            {clientSearch && (
              <button
                onClick={() => setClientSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                {t("Clear")}
              </button>
            )}
          </div>

          {/* Server-side Topic Box */}
          <div className="relative w-full min-w-0 flex-grow md:min-w-[240px] md:flex-[1.5]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchTopic}
              onChange={(e) => setSearchTopic(e.target.value)}
              placeholder={t("Filter by research topic…")}
              className="pl-9 h-10 border-slate-200/80 dark:border-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-500/20 focus-visible:border-cyan-500 rounded-xl text-xs font-medium bg-slate-50/50 dark:bg-slate-950/80"
            />
            {searchTopic && (
              <button
                onClick={() => setSearchTopic("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                {t("Clear")}
              </button>
            )}
          </div>

          <span className="self-start text-[11px] font-medium text-slate-400 dark:text-slate-500 md:ml-auto md:self-center md:whitespace-nowrap">
            {t("Search applies to all matching opportunities")}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100/80 dark:border-slate-800/80" />

        {/* Row 2: Secondary Controls (Filters & Sort & Shortlist) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left Group: Filters */}
          <div className="flex min-w-0 flex-col gap-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            {/* Status filter */}
            <div className="flex items-center gap-2 shrink-0">
              <ListFilter className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("Status:")}</span>
              <div className="flex items-center gap-1 rounded-xl bg-slate-100/90 p-1 dark:bg-slate-900/90 border border-slate-200/60 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setFilterStatus("active")}
                  className={cn(
                    "h-7 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer",
                    filterStatus === "active"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                  )}
                >
                  {t("Active")}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus("resolved")}
                  className={cn(
                    "h-7 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer",
                    filterStatus === "resolved"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                  )}
                >
                  {t("Resolved")}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus("dismissed")}
                  className={cn(
                    "h-7 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer",
                    filterStatus === "dismissed"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
                  )}
                >
                  {t("Dismissed")}
                </button>
              </div>
            </div>

            {/* Source filter */}
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t("Source:")}</span>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as GapSource | "all")}
                className="h-9 cursor-pointer rounded-xl border border-slate-200/80 bg-slate-50/80 dark:bg-slate-950/80 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 dark:border-slate-800"
              >
                <option value="all">{t("All Sources")}</option>
                <option value="report">{t("Report-generated")}</option>
                <option value="standalone">{t("Standalone Analysis")}</option>
              </select>
            </div>

            {/* Min Confidence */}
            <div className="flex items-center gap-2 shrink-0">
               <Zap className="w-4 h-4 text-amber-500" />
               <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                 {t("Confidence")} &ge; {Math.round(minConfidence * 100)}%
               </span>
               <input
                 type="range"
                 min="0"
                 max="1"
                 step="0.1"
                 value={minConfidence}
                 onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                 className="h-1.5 w-20 cursor-pointer appearance-none rounded-lg bg-slate-200 dark:bg-slate-800 accent-cyan-500"
               />
            </div>
          </div>

          {/* Right Group: Actions */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
            {/* Sort Select */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">{t("Sort:")}</span>
              <select
                value={sortBy}
                disabled={showShortlistedOnly}
                onChange={(e) => setSortBy(e.target.value as GapSortKey)}
                className="h-9 max-w-[210px] sm:max-w-none cursor-pointer rounded-xl border border-slate-200/80 bg-slate-50/80 dark:bg-slate-950/80 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 dark:border-slate-800 truncate"
              >
                <option value="recommended">{t("Recommended (evidence + confidence)")}</option>
                <option value="evidence">{t("Most Evidence-backed")}</option>
                <option value="confidence">{t("Highest Confidence")}</option>
                <option value="papers">{t("Most Supporting Papers")}</option>
                <option value="newest">{t("Newest Opportunities First")}</option>
                <option value="ai_only_last">{t("AI-only Last")}</option>
              </select>
            </div>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block shrink-0" />

            {/* Show Shortlisted Only Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant={showShortlistedOnly ? "default" : "outline"}
                className={cn(
                  "h-9 px-3.5 text-xs font-bold gap-1.5 rounded-xl transition-all shrink-0",
                  showShortlistedOnly
                    ? "bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                    : "border-slate-200/80 hover:bg-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                )}
                onClick={() => setShowShortlistedOnly(prev => !prev)}
              >
                <Star className={cn("w-3.5 h-3.5", showShortlistedOnly ? "fill-amber-300 text-amber-300" : "text-slate-400")} />
                <span>{t("Shortlist")} ({shortlistedGaps.length})</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Gap cards */}
      {isLoading && <div className="flex items-center gap-2 text-cyan-600 font-medium"><Loader2 className="w-5 h-5 animate-spin" /> {t("Loading research opportunities…")}</div>}

      {isError && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 p-6 rounded-xl flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-red-800 dark:text-red-400 font-bold mb-1">{t("Failed to fetch research opportunities")}</h3>
            <p className="text-red-600 dark:text-red-500 text-sm">
              {t("Could not load research opportunities. Please try again later.")}
            </p>
          </div>
        </div>
      )}

      {/* Empty State when no results match filter */}
      {processedGaps.length === 0 && !isLoading && !isError && (
        <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 p-12 rounded-2xl text-center space-y-3">
          <Sparkles className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2 opacity-50" />
          <h3 className="text-slate-900 dark:text-white font-bold text-base">
            {showShortlistedOnly
              ? t("Your shortlist is empty")
              : t("No research opportunities match your search")}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {showShortlistedOnly
              ? t("Star interesting research opportunities from the main list. This shortlist is saved on this device.")
              : t("We couldn't find matching results. Try clearing the search or lowering the confidence threshold.")}
          </p>
          <div className="pt-2">
            {showShortlistedOnly ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 dark:border-slate-800 text-xs font-semibold"
                onClick={() => setShowShortlistedOnly(false)}
              >
                {t("Show all opportunities")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 dark:border-slate-800 text-xs font-semibold"
                onClick={() => setClientSearch("")}
              >
                {t("Clear search")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Grid container for Card List */}
      {!isError && processedGaps.length > 0 && (
        <section className="space-y-3 mt-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white">{t("Research opportunity queue")}</h2>
              <p className="text-xs text-slate-500">
                {t("Ranked for review. Open a row for full evidence, then shortlist, resolve, or dismiss it.")}
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {t("{{count}} shown", { count: processedGaps.length })} · {sortBy === "recommended" ? t("recommended order") : t("sorted by {{sort}}", { sort: selectedSortLabel[sortBy] })}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-5">
          {groupedGaps.map((group, groupIndex) => {
            const isExpanded = expandedGroupIds.includes(group.id);

            return (
              <section
                key={group.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/30"
              >
                <div className={cn(
                  "flex flex-col gap-2 rounded-xl border border-slate-200/70 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#151922] sm:flex-row sm:items-center sm:justify-between",
                  isExpanded && "mb-3",
                )}>
                  <button
                    type="button"
                    onClick={() => toggleGapGroup(group.id)}
                    className="min-w-0 text-left"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-cyan-50 px-1.5 text-[10px] font-extrabold text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">
                        {String(groupIndex + 1).padStart(2, "0")}
                      </span>
                      <h3 className="truncate text-sm font-extrabold text-slate-950 dark:text-white">
                        {group.topic}
                      </h3>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {group.gaps.length > 1
                        ? t("{{count}} research gaps from the same analysis", { count: group.gaps.length })
                        : t("1 research gap")}
                    </p>
                  </button>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-900">
                      {group.source === "standalone" ? t("Standalone Analysis") : t("Report-generated")}
                    </span>
                    {group.analysisId && (
                      <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-300">
                        ID: {group.analysisId.slice(-6)}
                      </span>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 rounded-lg border-slate-200 bg-white text-slate-500 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                      onClick={() => toggleGapGroup(group.id)}
                      title={isExpanded ? t("Collapse") : t("Expand")}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="grid grid-cols-1 gap-3">
                    {group.gaps.map((gap, gapIndex) => {
                      const absoluteIndex = processedGaps.findIndex((item) => item.id === gap.id);
                      return (
                        <GapCard
                          key={gap.id}
                          gap={gap}
                          rank={gapIndex + 1}
                          filterStatus={filterStatus}
                          onViewDetails={(g) => {
                            setSelectedGap(g);
                            setIsDrawerOpen(true);
                          }}
                          isShortlisted={shortlistedIds.includes(gap.id)}
                          onToggleShortlist={handleToggleShortlist}
                          showReorderButtons={showShortlistedOnly}
                          onMoveUp={handleMoveUp}
                          onMoveDown={handleMoveDown}
                          isFirst={absoluteIndex <= 0}
                          isLast={absoluteIndex === processedGaps.length - 1}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          </div>
        </section>
      )}

      {/* Pagination (Only visible when not displaying shortlist) */}
      {!showShortlistedOnly && gapsData?.meta && gapsData.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-10 mb-6">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-slate-500 rounded-md border-slate-200 dark:border-slate-800"
            disabled={page <= 1}
            onClick={() => setPage(prev => prev - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-slate-600 dark:text-slate-400 mx-4">
            {t("Page {{page}} of {{totalPages}}", { page, totalPages: gapsData.meta.totalPages })}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-slate-500 rounded-md border-slate-200 dark:border-slate-800"
            disabled={page >= gapsData.meta.totalPages}
            onClick={() => setPage(prev => prev + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Meta Total */}
      {!showShortlistedOnly && gapsData?.meta && (
        <p className="text-xs text-muted-foreground mt-4">
          {t("{{count}} research opportunities found", { count: gapsData.meta.total })}
        </p>
      )}

      <GapDetailDrawer
        gap={selectedGap}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedGap(null);
        }}
      />
    </main>
  );
}
