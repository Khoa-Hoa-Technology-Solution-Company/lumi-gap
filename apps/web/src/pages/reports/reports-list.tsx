import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Zap,
  Plus,
  Sparkles,
  BookOpen,
  AlertTriangle,
  Info,
  Database,
  Search,
  ExternalLink,
  Globe,
  ArrowUpRight,
  Cpu,
  Filter,
  ChevronDown
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  useReports,
  useCreateReport,
  useDeleteReport,
  useDeleteBatchReports,
  useReportEvidencePreview
} from "@/features/reports/hooks/use-reports";
import { toast } from "sonner";
import {
  AI_CREDIT_COSTS_CLIENT,
  type PreviewReportEvidenceResponse,
  type ReportLanguage,
  type ReportScopeFilters,
} from "@trend/shared-types";
import { searchApi, type ScoredPaper } from "@/features/search";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/utils";
import { useI18n } from "@/i18n";

type ReportSortKey = "newest" | "ready_first" | "failed_last" | "topic_az";
const REPORT_SCOPE_KEYS = [
  "paperKinds",
  "openAccessStatuses",
  "providers",
  "sources",
  "languages",
  "citationBands",
  "domains",
  "fields",
  "subfields",
  "topics",
  "domainIds",
  "fieldIds",
  "subfieldIds",
  "topicIds",
] as const;

function parseCsvParam(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function parseReportScopeFilters(params: URLSearchParams): ReportScopeFilters {
  return Object.fromEntries(
    REPORT_SCOPE_KEYS
      .map((key) => [key, parseCsvParam(params, key)] as const)
      .filter(([, values]) => values.length > 0),
  ) as ReportScopeFilters;
}

function hasReportScopeFilters(filters: ReportScopeFilters): boolean {
  return Object.values(filters).some((values) => Array.isArray(values) && values.length > 0);
}

export function ReportsListPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const citedPaperId = searchParams.get("citesPaper") || undefined;
  const { data: reports, isLoading } = useReports(undefined, citedPaperId);
  const createReport = useCreateReport();
  const deleteReport = useDeleteReport();
  const deleteBatchReports = useDeleteBatchReports();
  const previewEvidence = useReportEvidencePreview();
  const navigate = useNavigate();

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | 'ALL' | null>(null);
  const [topic, setTopic] = useState(() => sessionStorage.getItem('report_draft_topic') || "");
  const [query, setQuery] = useState(() => sessionStorage.getItem('report_draft_query') || "");
  const [language, setLanguage] = useState<ReportLanguage>(() => (sessionStorage.getItem('report_draft_language') as ReportLanguage) || "auto");
  const [yearFrom, setYearFrom] = useState<string>(() => sessionStorage.getItem('report_draft_yearFrom') || "");
  const [yearTo, setYearTo] = useState<string>(() => sessionStorage.getItem('report_draft_yearTo') || "");
  const [reportScopeFilters, setReportScopeFilters] = useState<ReportScopeFilters>(() =>
    parseReportScopeFilters(searchParams),
  );
  const [deepAnalysis, setDeepAnalysis] = useState(() => sessionStorage.getItem('report_draft_deepAnalysis') === 'true');
  const [fast, setFast] = useState(() => {
    const val = sessionStorage.getItem('report_draft_fast');
    return val !== null ? val === 'true' : true;
  });

  React.useEffect(() => {
    sessionStorage.setItem('report_draft_topic', topic);
    sessionStorage.setItem('report_draft_query', query);
    sessionStorage.setItem('report_draft_language', language);
    sessionStorage.setItem('report_draft_yearFrom', yearFrom);
    sessionStorage.setItem('report_draft_yearTo', yearTo);
    sessionStorage.setItem('report_draft_deepAnalysis', String(deepAnalysis));
    sessionStorage.setItem('report_draft_fast', String(fast));
  }, [topic, query, language, yearFrom, yearTo, deepAnalysis, fast]);

  // New States for Evidence Review Step
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<PreviewReportEvidenceResponse | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewScrollToken, setPreviewScrollToken] = useState(0);
  const [collapsedAbstracts, setCollapsedAbstracts] = useState<Record<string, boolean>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [paperPickerOpen, setPaperPickerOpen] = useState(false);
  const [paperSearchQuery, setPaperSearchQuery] = useState("");
  const [paperSearchResults, setPaperSearchResults] = useState<ScoredPaper[]>([]);
  const [paperSearchLoading, setPaperSearchLoading] = useState(false);
  const [paperSearchError, setPaperSearchError] = useState<string | null>(null);
  const [paperSearchPage, setPaperSearchPage] = useState(1);
  const [paperSearchHasMore, setPaperSearchHasMore] = useState(false);
  const [paperSearchLoadingMore, setPaperSearchLoadingMore] = useState(false);

  // New State for Inline Evidence Filter
  const [evidenceFilterOpen, setEvidenceFilterOpen] = useState(false);

  // Search & Sort states for reports list
  const [reportSearch, setReportSearch] = useState("");
  const [debouncedReportSearch, setDebouncedReportSearch] = useState("");
  const [reportSortBy, setReportSortBy] = useState<ReportSortKey>("newest");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedReportSearch(reportSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [reportSearch]);

  const evidenceSectionRef = React.useRef<HTMLDivElement | null>(null);
  const currentEvidencePaperIds = previewData?.papers.map((paper) => paper.id) ?? [];
  const currentYear = new Date().getFullYear();
  const reasoningMode = deepAnalysis ? "deep" : fast ? "fast" : "balanced";
  const reportCreditCost = deepAnalysis
    ? AI_CREDIT_COSTS_CLIENT.deep_mcp_report
    : fast
      ? AI_CREDIT_COSTS_CLIENT.fast_report
      : AI_CREDIT_COSTS_CLIENT.standard_report;
  const canPreviewEvidence = query.trim().length >= 3 && !previewEvidence.isPending;
  const activeReportScopeFilters = hasReportScopeFilters(reportScopeFilters)
    ? reportScopeFilters
    : undefined;
  const activeReportScopeCount = activeReportScopeFilters
    ? Object.values(activeReportScopeFilters).reduce((sum, values) => sum + (values?.length ?? 0), 0)
    : 0;

  React.useEffect(() => {
    if (!previewScrollToken) return;

    const scrollTimer = window.setTimeout(() => {
      evidenceSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);

    return () => window.clearTimeout(scrollTimer);
  }, [previewScrollToken]);

  React.useEffect(() => {
    const isCreate = searchParams.get("create") === "true" || searchParams.has("topic");
    if (isCreate) {
      const urlTopic = searchParams.get("topic") || "";
      const urlQuery = searchParams.get("query") || searchParams.get("q") || "";
      const urlPaperId = searchParams.get("paperId") || "";
      const urlYearFrom = searchParams.get("yearFrom") || "";
      const urlYearTo = searchParams.get("yearTo") || "";
      const urlScopeFilters = parseReportScopeFilters(searchParams);

      if (urlTopic) setTopic(urlTopic);
      if (urlQuery) setQuery(urlQuery);
      if (urlYearFrom) setYearFrom(urlYearFrom);
      if (urlYearTo) setYearTo(urlYearTo);
      if (hasReportScopeFilters(urlScopeFilters)) setReportScopeFilters(urlScopeFilters);
      if (urlPaperId) {
        setSelectedPaperIds([urlPaperId]);
        toast.info("Paper pre-selected from context", {
          description: `ID: ${urlPaperId}`
        });
      }

      // Clear URL params
      setSearchParams(prev => {
        prev.delete("create");
        prev.delete("topic");
        prev.delete("query");
        prev.delete("q");
        prev.delete("paperId");
        prev.delete("yearFrom");
        prev.delete("yearTo");
        REPORT_SCOPE_KEYS.forEach((key) => prev.delete(key));
        return prev;
      });
    }
  }, [searchParams, setSearchParams]);

  const handleDeleteAll = () => {
    if (!reports || reports.length === 0) return;
    setItemToDelete('ALL');
    setDeleteModalOpen(true);
  };

  const handleDeleteSingle = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setItemToDelete(id);
    setDeleteModalOpen(true);
  };

  const setReasoningMode = (mode: "fast" | "balanced" | "deep") => {
    if (mode === "fast") {
      setFast(true);
      setDeepAnalysis(false);
      return;
    }
    if (mode === "deep") {
      setFast(false);
      setDeepAnalysis(true);
      return;
    }
    setFast(false);
    setDeepAnalysis(false);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete === 'ALL') {
        if (!reports) return;
        await deleteBatchReports.mutateAsync(reports.map(r => r.id));
        toast.success("All reports deleted successfully");
      } else {
        await deleteReport.mutateAsync(itemToDelete);
        toast.success("Report deleted successfully");
      }
    } catch (error) {
      toast.error("Failed to delete report(s)");
    } finally {
      setDeleteModalOpen(false);
      setItemToDelete(null);
    }
  };

  // Step 2: Clicks "Preview evidence"
  const handlePreviewEvidence = async () => {
    if (!query.trim()) {
      toast.error("Please enter a question for the AI to analyze");
      return;
    }

    const fromYear = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const toYear = yearTo ? parseInt(yearTo, 10) : undefined;

    if (fromYear && toYear && fromYear > toYear) {
      toast.error("Year From must be less than or equal to Year To");
      return;
    }

    setPreviewError(null);

    try {
      const response = await previewEvidence.mutateAsync({
        query: query.trim(),
        topic: topic.trim() || undefined,
        language: language === "auto" ? "auto" : language,
        yearFrom: fromYear,
        yearTo: toYear,
        scopeFilters: activeReportScopeFilters,
        selectedPaperIds: selectedPaperIds.length > 0 ? selectedPaperIds : undefined,
      });

      setPreviewData(response);
      setSelectedPaperIds(response.selectedPaperIds);
      setShowPreview(true);
      setPreviewScrollToken((current) => current + 1);
      toast.success("Evidence pack loaded! Review papers below.");
    } catch (error: any) {
      console.error("Failed to preview evidence:", error);
      const errMsg = error?.response?.data?.error?.message ?? "Could not retrieve evidence pack from server.";
      setPreviewError(errMsg);
      toast.error(errMsg);
    }
  };

  // Step 4: User can remove retrieved/selected papers
  const handleRemovePaper = (paperId: string) => {
    if (!previewData) return;

    const updatedPapers = previewData.papers.filter(p => p.id !== paperId);
    const updatedSelectedIds = selectedPaperIds.filter(id => id !== paperId);

    setPreviewData({
      ...previewData,
      papers: updatedPapers,
      selectedPaperIds: updatedSelectedIds,
    });
    setSelectedPaperIds(updatedSelectedIds);
    toast.info("Paper removed from evidence pack.");
  };

  const handleOpenPaperPicker = () => {
    setPaperPickerOpen(true);
    setPaperSearchError(null);
    if (!paperSearchQuery.trim()) {
      setPaperSearchQuery(topic.trim() || query.trim());
    }
  };

  const handleSearchPapers = async () => {
    const searchText = paperSearchQuery.trim();
    if (searchText.length < 2) {
      setPaperSearchError("Enter at least 2 characters to search papers.");
      return;
    }

    const fromYear = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const toYear = yearTo ? parseInt(yearTo, 10) : undefined;

    setPaperSearchLoading(true);
    setPaperSearchError(null);
    try {
      const response = await searchApi.semantic({
        q: searchText,
        page: 1,
        pageSize: 8,
        yearFrom: fromYear,
        yearTo: toYear,
        ...activeReportScopeFilters,
        rerank: false,
      });
      setPaperSearchResults(response.papers);
      setPaperSearchPage(1);
      setPaperSearchHasMore(response.papers.length === 8);
    } catch (error: any) {
      const errMsg = error?.response?.data?.error?.message ?? "Could not search papers.";
      setPaperSearchError(errMsg);
    } finally {
      setPaperSearchLoading(false);
    }
  };

  const handleLoadMorePapers = async () => {
    const searchText = paperSearchQuery.trim();
    if (searchText.length < 2) return;

    const fromYear = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const toYear = yearTo ? parseInt(yearTo, 10) : undefined;

    setPaperSearchLoadingMore(true);
    const nextPage = paperSearchPage + 1;
    try {
      const response = await searchApi.semantic({
        q: searchText,
        page: nextPage,
        pageSize: 8,
        yearFrom: fromYear,
        yearTo: toYear,
        ...activeReportScopeFilters,
        rerank: false,
      });
      setPaperSearchResults(prev => [...prev, ...response.papers]);
      setPaperSearchPage(nextPage);
      setPaperSearchHasMore(response.papers.length === 8);
    } catch (error: any) {
      toast.error("Could not load more papers.");
    } finally {
      setPaperSearchLoadingMore(false);
    }
  };

  // Step 5: User can add papers from corpus search.
  const handleAddPaperFromSearch = async (paperId: string) => {
    if (!previewData) return;
    if (currentEvidencePaperIds.includes(paperId)) {
      toast.warning("This paper is already in the evidence pack.");
      return;
    }
    if (currentEvidencePaperIds.length >= previewData.maxEvidencePapers) {
      toast.warning(`Evidence pack is full. Remove a paper before adding another one.`);
      return;
    }

    const fromYear = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const toYear = yearTo ? parseInt(yearTo, 10) : undefined;
    const newSelectedIds = [...currentEvidencePaperIds, paperId];

    try {
      toast.loading("Adding paper to evidence pack...", { id: "add-paper" });
      const response = await previewEvidence.mutateAsync({
        query: query.trim(),
        topic: topic.trim() || undefined,
        language: language === "auto" ? "auto" : language,
        yearFrom: fromYear,
        yearTo: toYear,
        scopeFilters: activeReportScopeFilters,
        selectedPaperIds: newSelectedIds,
        fillWithRetrieved: false,
      });

      setPreviewData(response);
      setSelectedPaperIds(response.selectedPaperIds);
      toast.dismiss("add-paper");
      toast.success("Paper added to evidence pack.");
    } catch (error: any) {
      toast.dismiss("add-paper");
      const errMsg = error?.response?.data?.error?.message ?? "Failed to add paper.";
      toast.error(errMsg);
    }
  };

  // Step 6: Create report sends selectedPaperIds
  const handleGenerate = async (forceNoPreview = false) => {
    if (!query.trim()) {
      toast.error("Please enter a question");
      return;
    }

    const fromYear = yearFrom ? parseInt(yearFrom, 10) : undefined;
    const toYear = yearTo ? parseInt(yearTo, 10) : undefined;

    try {
      await createReport.mutateAsync({
        query: query.trim(),
        topic: topic.trim() || undefined,
        language,
        deepAnalysis,
        fast,
        yearFrom: fromYear,
        yearTo: toYear,
        scopeFilters: activeReportScopeFilters,
        selectedPaperIds: forceNoPreview
          ? undefined
          : currentEvidencePaperIds.length > 0
            ? currentEvidencePaperIds
            : undefined,
      });

      setTopic("");
      setQuery("");
      setYearFrom("");
      setYearTo("");
      setLanguage("auto");
      setReportScopeFilters({});
      setDeepAnalysis(false);
      setFast(true);

      // Reset preview states
      setPreviewData(null);
      setSelectedPaperIds([]);
      setShowPreview(false);

      toast.success("Report generation started!");
    } catch (error: any) {
      console.error("Failed to create report:", error);
      const errMsg = error.response?.data?.error?.message || "Failed to create report. Please try again.";
      toast.error(errMsg);
    }
  };

  const toggleAbstract = (paperId: string) => {
    setCollapsedAbstracts(prev => ({
      ...prev,
      [paperId]: !prev[paperId]
    }));
  };

  return (
    <main className="container py-12 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
      {/* Anti-Center Bias: Left-aligned Hero Section */}
      <section className="mb-12 flex flex-col md:flex-row gap-12 items-start justify-between">
        <div className="flex-1 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wider mb-6">
            <Sparkles className="w-4 h-4" /> AI Research Assistant
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.1] mb-6">
            Generate deep analytical reports from thousands of papers.
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-[55ch]">
            Ask a complex research question. Review the evidence pack, add or remove papers, and synthesize findings into a comprehensive report.
          </p>
        </div>
      </section>

      {/* Inline Generation Form */}
      <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm mb-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              <Plus className="h-4 w-4" />
              New grounded report
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              Define the question, then review the evidence before generation.
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Reports are generated from a fixed evidence pack, so every citation maps back to a paper you can inspect.
            </p>
          </div>
          <div className="grid min-w-[260px] grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-bold dark:border-slate-800 dark:bg-slate-900/60">
            <div className={cn(
              "rounded-lg px-3 py-2 transition-colors",
              showPreview && previewData
                ? "text-slate-500 dark:text-slate-400"
                : "bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300"
            )}>
              Step 1
              <span className="block text-[10px] font-semibold text-slate-500">Setup</span>
            </div>
            <div className={cn(
              "rounded-lg px-3 py-2 transition-colors",
              showPreview && previewData
                ? "bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300"
                : "text-slate-500 dark:text-slate-400"
            )}>
              Step 2
              <span className="block text-[10px] font-semibold text-slate-500">Evidence</span>
            </div>
          </div>
        </div>

        <div className="space-y-7">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <label htmlFor="topic" className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">Topic / Keyword</label>
              <input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("e.g. Federated Learning in Medical Imaging")}
                className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="query" className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">Research Question <span className="text-red-500">*</span></label>
              <textarea
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("e.g. What evidence shows clinical impact, limitations, and future directions?")}
                rows={1}
                className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none overflow-hidden"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Be specific. The retrieval step uses this question to choose evidence papers.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 dark:border-slate-800/60">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Report setup</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  These controls affect retrieval, output language, and model route.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTopic("");
                  setQuery("");
                  setYearFrom("");
                  setYearTo("");
                  setLanguage("auto");
                  setReasoningMode("fast");
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                Reset setup
              </button>
            </div>
            {activeReportScopeFilters && (
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-extrabold">Scoped from Trends.</span>{" "}
                    Evidence preview and generation will retrieve papers inside {activeReportScopeCount} active scope filter{activeReportScopeCount === 1 ? "" : "s"}.
                  </div>
                  <button
                    type="button"
                    onClick={() => setReportScopeFilters({})}
                    className="font-extrabold text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
                  >
                    Clear report scope
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Output Language</span>
                <div className="flex rounded-xl bg-slate-100/80 dark:bg-slate-900/60 p-1 border border-slate-200/50 dark:border-slate-800/40 w-full">
                  <button
                    type="button"
                    onClick={() => setLanguage("auto")}
                    className={cn(
                      "flex-1 h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                      language === "auto"
                        ? "bg-white dark:bg-slate-950 shadow-sm text-blue-600 dark:text-blue-400 font-bold border border-slate-200/30 dark:border-slate-800/20"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                    )}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage("en")}
                    className={cn(
                      "flex-1 h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                      language === "en"
                        ? "bg-white dark:bg-slate-950 shadow-sm text-blue-600 dark:text-blue-400 font-bold border border-slate-200/30 dark:border-slate-800/20"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                    )}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage("vi")}
                    className={cn(
                      "flex-1 h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                      language === "vi"
                        ? "bg-white dark:bg-slate-950 shadow-sm text-blue-600 dark:text-blue-400 font-bold border border-slate-200/30 dark:border-slate-800/20"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                    )}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Tiếng Việt
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Auto detects from the topic and research question.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Publication Year Range</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    id="year-from"
                    type="number"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    placeholder={t("From: 1900")}
                    className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                  />
                  <input
                    id="year-to"
                    type="number"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    placeholder={t("To: {{year}}", { year: currentYear })}
                    className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => { setYearFrom(""); setYearTo(""); }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors cursor-pointer",
                      (!yearFrom && !yearTo)
                        ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900"
                        : "bg-transparent text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                  >
                    All Time
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setYearFrom((currentYear - 3).toString());
                      setYearTo(currentYear.toString());
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors cursor-pointer",
                      (yearFrom === (currentYear - 3).toString() && yearTo === currentYear.toString())
                        ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900"
                        : "bg-transparent text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                  >
                    Last 3 Years
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setYearFrom((currentYear - 5).toString());
                      setYearTo(currentYear.toString());
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors cursor-pointer",
                      (yearFrom === (currentYear - 5).toString() && yearTo === currentYear.toString())
                        ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900"
                        : "bg-transparent text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                  >
                    Last 5 Years
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {currentYear} is treated as year-to-date when charts or trend metrics use this range.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Reasoning Profile</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReasoningMode("fast")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all cursor-pointer",
                      reasoningMode === "fast"
                        ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm dark:bg-blue-950/20 dark:text-blue-100"
                        : "border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                    )}
                  >
                    <Zap className="mb-2 h-4 w-4" />
                    <span className="block text-[11px] font-extrabold">Fast</span>
                    <span className="mt-1 block text-[10px] leading-snug opacity-70">
                      <span className="block">Quick draft</span>
                      <span className="block whitespace-nowrap font-semibold">
                        {AI_CREDIT_COSTS_CLIENT.fast_report} credits
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReasoningMode("balanced")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all cursor-pointer",
                      reasoningMode === "balanced"
                        ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm dark:bg-blue-950/20 dark:text-blue-100"
                        : "border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                    )}
                  >
                    <Database className="mb-2 h-4 w-4" />
                    <span className="block text-[11px] font-extrabold">Balanced</span>
                    <span className="mt-1 block text-[10px] leading-snug opacity-70">
                      <span className="block">Best default</span>
                      <span className="block whitespace-nowrap font-semibold">
                        {AI_CREDIT_COSTS_CLIENT.standard_report} credits
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReasoningMode("deep")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all cursor-pointer",
                      reasoningMode === "deep"
                        ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm dark:bg-blue-950/20 dark:text-blue-100"
                        : "border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                    )}
                  >
                    <Search className="mb-2 h-4 w-4" />
                    <span className="block text-[11px] font-extrabold">Deep</span>
                    <span className="mt-1 block text-[10px] leading-snug opacity-70">
                      <span className="block">Slowest</span>
                      <span className="block whitespace-nowrap font-semibold">
                        {AI_CREDIT_COSTS_CLIENT.deep_mcp_report} credits
                      </span>
                    </span>
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  This report costs <strong>{reportCreditCost} credits</strong>. Failed generations and
                  cache hits are refunded automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Action Footer Bar */}
          <div className="pt-5 border-t border-slate-100 dark:border-slate-800/60 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3 text-sm text-slate-500 dark:text-slate-400">
              <div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Next: review the evidence pack</p>
                <p className="mt-1 max-w-xl text-xs leading-relaxed">
                  {showPreview && previewData
                    ? "Evidence is loaded below. Refresh if you changed the setup, or generate once the pack looks right."
                    : "We retrieve candidate papers first. You can remove weak papers or add your own before the AI writes."}
                </p>
              </div>
            </div>

            <Button
              onClick={handlePreviewEvidence}
              disabled={!canPreviewEvidence}
              className="h-12 rounded-xl bg-blue-600 px-6 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-blue-900/40"
            >
              {previewEvidence.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              {showPreview && previewData ? "Refresh Evidence Pack" : "Review Evidence Pack"}
            </Button>
          </div>

          {/* Loading Skeleton during preview fetch */}
          {previewEvidence.isPending && (
            <div className="space-y-6 border-t border-slate-100 pt-7 dark:border-slate-800/60">
              <div className="flex items-center justify-between">
                <div>
                  <Skeleton className="h-5 w-48 rounded" />
                  <Skeleton className="mt-2 h-3 w-80 max-w-full rounded" />
                </div>
                <Skeleton className="h-7 w-32 rounded-full" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            </div>
          )}

          {/* Preview Error State with Fallback option */}
          {previewError && (
            <div className="border-t border-slate-100 pt-7 dark:border-slate-800/60">
              <div className="space-y-4 rounded-2xl border border-red-200 bg-red-500/5 p-5 text-red-950 dark:border-red-900/50 dark:text-red-200">
                <div className="flex gap-2">
                  <XCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
                  <div>
                    <span className="block font-bold">Failed to generate evidence preview</span>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{previewError}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg border-red-300 text-xs text-red-700 hover:bg-red-500/10 dark:border-red-900"
                    onClick={handlePreviewEvidence}
                  >
                    Retry Preview
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-lg bg-red-600 text-xs font-bold text-white hover:bg-red-700"
                    onClick={() => handleGenerate(true)}
                    disabled={createReport.isPending}
                  >
                    {createReport.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
                    Skip Preview & Generate Report
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Evidence Pack UI */}
          {showPreview && previewData && (
            <div ref={evidenceSectionRef} className="scroll-mt-24 space-y-6 border-t border-slate-100 pt-7 dark:border-slate-800/60">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Step 2 of 2
                  </div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                    Review the evidence pack
                  </h2>
                  <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    This ordered set becomes the citation source for the report. Remove weak papers or add missing required studies before generation.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-semibold dark:bg-slate-900/60">
                    {previewData.papers.length} / {previewData.maxEvidencePapers} Papers
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase text-blue-700 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-400">
                    {language === "auto" ? "Auto language" : language === "en" ? "English" : "Vietnamese"}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-400">
                    {reasoningMode}
                  </Badge>
                </div>
              </div>

          {/* Warnings Banner */}
          {(previewData.papers.length < 3 || previewData.warnings.length > 0) && (
            <div className="space-y-2">
              {previewData.papers.length < 3 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-400 rounded-xl text-xs flex gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span><strong>Warning:</strong> Fewer than 3 evidence papers selected. AI analysis might be limited or insufficient.</span>
                </div>
              )}
              {previewData.warnings.map((warning, idx) => (
                <div key={idx} className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-400 rounded-xl text-xs flex gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Add papers from corpus search */}
          <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-900 dark:text-white block">Curate evidence</span>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Search the active corpus by title, keyword, topic, or DOI, then add papers into this pack.
              </p>
            </div>
            <Button
              onClick={handleOpenPaperPicker}
              disabled={previewEvidence.isPending || previewData.papers.length >= previewData.maxEvidencePapers}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-black text-xs font-bold px-4 h-9 rounded-lg shadow-sm"
            >
              <Search className="h-3.5 w-3.5 mr-2" />
              Add Papers
            </Button>
          </div>

          {/* Guidelines info text */}
          <div className="flex gap-2 p-3 bg-blue-500/5 border border-blue-500/10 text-blue-800 dark:text-blue-400 rounded-xl text-xs leading-normal">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span><strong>Grounding rule:</strong> adding a paper makes it available as evidence, not a forced conclusion. If the pack is weak or contradictory, the generated report should say so.</span>
            </div>
          </div>

          {/* Evidence Papers List */}
          {previewData.papers.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <span className="text-sm font-semibold text-slate-500">No evidence found. Broaden query or year range.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {previewData.papers.map((paper) => {
                const isExpanded = collapsedAbstracts[paper.id] ?? false;
                const relevancePercent = Math.max(0, Math.min(100, paper.score * 100));
                const relevancePercentLabel = relevancePercent.toFixed(1);
                const relevanceLabel = paper.score >= 0.8 ? "Strong match" : paper.score >= 0.65 ? "Good match" : "Review match";
                const relevanceTone = paper.score >= 0.8
                  ? "text-emerald-700 dark:text-emerald-300"
                  : paper.score >= 0.65
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-amber-700 dark:text-amber-300";
                const relevanceBar = paper.score >= 0.8
                  ? "bg-emerald-500"
                  : paper.score >= 0.65
                    ? "bg-blue-500"
                    : "bg-amber-500";
                const snippet = paper.abstractText
                  ? (paper.abstractText.length > 150 && !isExpanded
                    ? `${paper.abstractText.slice(0, 150)}...`
                    : paper.abstractText)
                  : null;

                return (
                  <article key={paper.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-blue-200 dark:border-slate-800 dark:bg-slate-950/30 dark:hover:border-blue-900/50">
                    {/* Header: Badges & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-transparent",
                            paper.source === "selected"
                              ? "bg-purple-150 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400"
                              : "bg-blue-155 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                          )}
                        >
                          {paper.source === "selected" ? "Added by you" : "Retrieved"}
                        </Badge>
                        {paper.publicationYear && (
                          <span className="rounded-full bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/50 px-2 py-0.5 text-[10px] font-bold">
                            {paper.publicationYear}
                          </span>
                        )}
                        {paper.citationCount !== undefined && (
                          <span className="rounded-full bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-800/50 px-2 py-0.5 text-[10px] font-bold">
                            {formatNumber(paper.citationCount)} citations
                          </span>
                        )}
                      </div>

                      {/* Actions on the top right */}
                      <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-end">
                        {/* Compact Relevance indicator */}
                        <div className="flex items-center gap-2">
                          <span className={cn("text-[10px] font-bold uppercase tracking-wider", relevanceTone)}>
                            {relevanceLabel} ({relevancePercentLabel}%)
                          </span>
                          <div className="w-16 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className={cn("h-full rounded-full", relevanceBar)} style={{ width: `${relevancePercent}%` }} />
                          </div>
                        </div>

                        <div className="hidden sm:block h-4 w-px bg-slate-200 dark:bg-slate-800" />

                        {/* View & Remove */}
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/papers/${paper.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200/80 px-2.5 text-[11px] font-bold text-slate-600 dark:border-slate-800 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-900/60 transition-colors"
                          >
                            View paper
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                          
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                            onClick={() => handleRemovePaper(paper.id)}
                            aria-label={`Remove ${paper.title} from evidence pack`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Paper Title */}
                    <div className="space-y-2">
                      <Link
                        to={`/papers/${paper.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-center gap-2 text-sm md:text-base font-extrabold leading-snug text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <span>{paper.title}</span>
                        <ExternalLink className="h-4 w-4 flex-shrink-0 text-slate-300 group-hover:text-blue-500 transition-colors" />
                      </Link>

                      {/* Authors & Journal */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {paper.authorNames.length > 0 && (
                          <span>Authors: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{paper.authorNames.slice(0, 3).join(", ")}{paper.authorNames.length > 3 ? " et al." : ""}</strong></span>
                        )}
                        {paper.journalName && (
                          <span>Journal: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{paper.journalName}</strong></span>
                        )}
                      </div>
                    </div>

                    {/* Abstract snippet */}
                    {snippet && (
                      <div className="mt-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50/50 dark:bg-slate-900/30 p-3.5 rounded-xl border border-slate-105/50 dark:border-slate-800/40">
                        <p>
                          {snippet}
                          {paper.abstractText && paper.abstractText.length > 150 && (
                            <button
                              type="button"
                              onClick={() => toggleAbstract(paper.id)}
                              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline ml-1.5 cursor-pointer focus:outline-none"
                            >
                              {isExpanded ? "Show Less" : "Show More"}
                            </button>
                          )}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* Actions footer for Preview Box */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800 pt-6">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {previewData.papers.length === 0
                ? "Add or preview papers to enable generation."
                : "Ready to generate when this evidence set looks correct."}
            </span>
            <Button
              onClick={() => handleGenerate(false)}
              disabled={createReport.isPending || previewData.papers.length === 0}
              className="h-12 rounded-xl bg-blue-600 px-6 text-sm font-extrabold text-white shadow-sm hover:bg-blue-700"
            >
              {createReport.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2 fill-current" />
                  Generate Report · {reportCreditCost} credits
                </>
              )}
            </Button>
          </div>
            </div>
          )}
        </div>
      </div>

      {/* Reports Grid */}
      {citedPaperId && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-300">
          <span>Showing only reports whose evidence pack contains this paper.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSearchParams((previous) => {
                previous.delete("citesPaper");
                return previous;
              });
            }}
          >
            Show all reports
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {citedPaperId ? "Reports citing this paper" : "Your Reports"}
        </h2>
        {reports && reports.length > 0 && !citedPaperId && (
          <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-semibold gap-2" onClick={handleDeleteAll} disabled={deleteBatchReports.isPending}>
            {deleteBatchReports.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Clear All
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="w-full py-24 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
          <p className="text-slate-500 font-medium">Loading your reports...</p>
        </div>
      ) : (!reports || reports.length === 0) ? (
        <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-900/20">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mb-6 text-blue-500">
            <BookOpen className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {citedPaperId ? "No reports cite this paper yet" : "No reports generated yet"}
          </h3>
          <p className="text-slate-500 max-w-sm mb-6">
            Use the form above to ask a research question and generate your first AI-powered literature review.
          </p>
        </div>
      ) : (() => {
        // Process client-side filtering and sorting for reports
        const rawReports = reports ?? [];
        let processedReports = [...rawReports];

        if (debouncedReportSearch.trim()) {
          const q = debouncedReportSearch.toLowerCase().trim();
          processedReports = processedReports.filter(report => {
            const topicMatch = report.topic?.toLowerCase().includes(q) ?? false;
            const queryMatch = report.query?.toLowerCase().includes(q) ?? false;
            const statusMatch = report.status?.toLowerCase().includes(q) ?? false;
            const modelMatch = report.modelVersion?.toLowerCase().includes(q) ?? false;
            const promptMatch = report.promptVersion?.toLowerCase().includes(q) ?? false;
            return topicMatch || queryMatch || statusMatch || modelMatch || promptMatch;
          });
        }

        if (reportSortBy === "newest") {
          processedReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } else if (reportSortBy === "ready_first") {
          processedReports.sort((a, b) => {
            const orderA = a.status === "ready" ? 0 : 1;
            const orderB = b.status === "ready" ? 0 : 1;
            if (orderA !== orderB) return orderA - orderB;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        } else if (reportSortBy === "failed_last") {
          processedReports.sort((a, b) => {
            const orderA = a.status === "failed" ? 1 : 0;
            const orderB = b.status === "failed" ? 1 : 0;
            if (orderA !== orderB) return orderA - orderB;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        } else if (reportSortBy === "topic_az") {
          processedReports.sort((a, b) => {
            const topicA = a.topic?.toLowerCase() || "";
            const topicB = b.topic?.toLowerCase() || "";
            return topicA.localeCompare(topicB);
          });
        }

        return (
          <div className="space-y-6">
            {/* Reports Search & Sort Toolbar */}
            <div className="flex gap-4 flex-wrap items-center bg-white dark:bg-[#1c1f26] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="absolute left-0 top-0 w-1 h-full bg-blue-500" />

              {/* Search Box */}
              <div className="flex-1 min-w-[280px] relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={reportSearch}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReportSearch(e.target.value)}
                  placeholder="Search reports by topic, query, status..."
                  className="pl-9 h-9 border-slate-200 dark:border-slate-800 focus-visible:ring-blue-500 rounded-lg text-sm bg-slate-50/50 dark:bg-slate-900/30"
                />
                {reportSearch && (
                  <button
                    onClick={() => setReportSearch("")}
                    className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden md:block" />

              {/* Sort Select */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sort:</span>
                <select
                  value={reportSortBy}
                  onChange={(e) => setReportSortBy(e.target.value as ReportSortKey)}
                  className="h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="ready_first">Ready First</option>
                  <option value="failed_last">Failed Last</option>
                  <option value="topic_az">Topic A-Z</option>
                </select>
              </div>
            </div>

            {processedReports.length === 0 ? (
              <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 p-12 rounded-2xl text-center space-y-3">
                <Sparkles className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2 opacity-50" />
                <h3 className="text-slate-900 dark:text-white font-bold text-base">No reports match your search</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  We couldn't find any generated reports matching your search text. Try clearing the search query to show all reports.
                </p>
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-slate-200 dark:border-slate-800 text-xs font-semibold"
                    onClick={() => setReportSearch("")}
                  >
                    Clear search
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {processedReports.map((report) => (
                  <Link
                    key={report.id}
                    to={`/reports/${report.id}`}
                    className="group flex flex-col bg-white dark:bg-[#1c1f26] border border-slate-200 dark:border-slate-800/80 hover:border-blue-400 dark:hover:border-blue-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden h-full"
                  >
                    {/* Subtle background decoration */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/20 dark:bg-blue-900/5 rounded-bl-full -mr-10 -mt-10 opacity-40 group-hover:bg-blue-100/20 dark:group-hover:bg-blue-900/10 transition-colors pointer-events-none" />

                    {/* 1. Header: Topic badge left, status right */}
                    <div className="mb-3.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-4 relative z-10">
                      <Badge variant="secondary" className="bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold px-2 py-0.5 text-[9px] uppercase tracking-wider rounded">
                        # {report.topic || "General Inquiry"}
                      </Badge>

                      {/* Status Badge */}
                      <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        (report.status === 'generating' || report.status === 'queued') ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        report.status === 'failed' ? 'bg-rose-50 text-red-700 dark:bg-rose-900/30 dark:text-red-400' :
                        'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}>
                        {(report.status === 'generating' || report.status === 'queued') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                         report.status === 'failed' ? <XCircle className="w-3.5 h-3.5" /> :
                         <CheckCircle2 className="w-3.5 h-3.5" />}
                        {report.status === 'generating' ? 'Generating' :
                         report.status === 'queued' ? 'Queued' :
                         report.status === 'failed' ? 'Failed' : 'Ready'}
                      </div>
                    </div>

                    {/* 2. Main content: premium icon box on the left, query on the right */}
                    <div className="mb-4 flex items-start gap-3 flex-1 relative z-10">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10 group-hover:scale-105 group-hover:from-blue-500/15 group-hover:to-indigo-500/15 transition-all duration-300">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                          {report.query}
                        </h3>

                        {/* Compact source description */}
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-500" data-no-i18n>
                          <Database className="w-3.5 h-3.5 text-slate-400" />
                          <span>Grounded on {report.selectedPaperIds?.length ?? 5} core source{(report.selectedPaperIds?.length ?? 5) !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </div>

                    {/* 3. Report Metadata & Constraints */}
                    <div className="space-y-3 mb-4 border-t border-slate-100 dark:border-slate-800/60 pt-3 relative z-10">
                      <div className="flex flex-wrap gap-1.5">
                        {/* Years Tag */}
                        {(report.yearFrom || report.yearTo) ? (
                          <span className="bg-slate-50 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800 px-2.5 py-1 rounded-full text-[9px] text-slate-600 dark:text-slate-400 font-extrabold uppercase tracking-wider">
                            Range: {report.yearFrom && report.yearTo
                              ? `${report.yearFrom} - ${report.yearTo}`
                              : report.yearFrom
                                ? `>= ${report.yearFrom}`
                                : `<= ${report.yearTo}`}
                          </span>
                        ) : (
                          <span className="bg-slate-50 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800 px-2.5 py-1 rounded-full text-[9px] text-slate-600 dark:text-slate-400 font-extrabold uppercase tracking-wider">
                            All Years
                          </span>
                        )}

                        {/* RAG Mode Tag */}
                        {report.deepAnalysis ? (
                          <span className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                            <Zap className="w-2.5 h-2.5 fill-amber-500/30 animate-pulse" /> Deep RAG
                          </span>
                        ) : report.fast ? (
                          <span className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/25 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                            <Cpu className="w-2.5 h-2.5 text-cyan-600 dark:text-cyan-400" /> Flash Mode
                          </span>
                        ) : (
                          <span className="bg-gradient-to-r from-slate-100 to-slate-200/50 dark:from-slate-800 dark:to-slate-800/40 text-slate-600 dark:text-slate-400 border border-slate-250/30 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider shadow-sm">
                            Standard
                          </span>
                        )}

                        {report.creditCost !== undefined && (
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider border",
                            report.creditRefundedAt
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
                              : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25",
                          )}>
                            {report.creditRefundedAt ? `Refunded ${report.creditCost}` : `${report.creditCost} credits`}
                          </span>
                        )}

                        {/* Grounded Papers Tag */}
                        {report.selectedPaperIds && report.selectedPaperIds.length > 0 && (
                          <span className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/25 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                            <FileText className="w-2.5 h-2.5 text-purple-650 dark:text-purple-500" /> Grounded ({report.selectedPaperIds.length})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 4. Footer */}
                    <div className="flex items-center justify-between pt-3.5 border-t border-slate-100 dark:border-slate-800 mt-auto relative z-10">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {new Date(report.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                          Open report <ArrowUpRight className="w-3 h-3" />
                        </span>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                          onClick={(e) => handleDeleteSingle(report.id, e)}
                          disabled={deleteReport.isPending}
                          title="Delete report"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Paper Picker Modal */}
      <Dialog open={paperPickerOpen} onOpenChange={setPaperPickerOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-600" />
              Add Papers To Evidence Pack
            </DialogTitle>
            <DialogDescription>
              Search the active corpus and add papers into the report evidence pack. The report will cite only the final pack.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-2 pt-2 relative">
            <input
              value={paperSearchQuery}
              onChange={(e) => setPaperSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSearchPapers();
              }}
              placeholder="Search title, keyword, topic, DOI..."
              className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            
            <div className="relative">
              <Button
                onClick={() => setEvidenceFilterOpen(!evidenceFilterOpen)}
                variant="outline"
                className={cn(
                  "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 text-xs font-bold px-4 h-11 rounded-xl shadow-sm transition-colors",
                  evidenceFilterOpen && "bg-slate-100 dark:bg-slate-800"
                )}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                <ChevronDown className="h-3 w-3 ml-2 text-slate-400" />
              </Button>
              
              {evidenceFilterOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] w-[300px] bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-4 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Refine Evidence</h4>
                    <button
                      onClick={() => {
                        setYearFrom("");
                        setYearTo("");
                        setLanguage("auto");
                      }}
                      className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline uppercase"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Publication Year Range */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                        Publication Year
                      </label>
                      <div className="space-y-3 pt-1 select-none">
                        <div>
                          <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            <span>From Year</span>
                            <span className="font-extrabold text-blue-700 dark:text-blue-400">{yearFrom || 1900}</span>
                          </div>
                          <input
                            type="range"
                            min="1900"
                            max="2026"
                            value={yearFrom || "1900"}
                            onChange={(e) => {
                              const val = e.target.value;
                              setYearFrom(val);
                              if (yearTo && parseInt(val) > parseInt(yearTo)) setYearTo(val);
                            }}
                            className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700 active:scale-98 transition-all"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                            <span>To Year</span>
                            <span className="font-extrabold text-blue-700 dark:text-blue-400">{yearTo || 2026}</span>
                          </div>
                          <input
                            type="range"
                            min="1900"
                            max="2026"
                            value={yearTo || "2026"}
                            onChange={(e) => {
                              const val = e.target.value;
                              setYearTo(val);
                              if (yearFrom && parseInt(val) < parseInt(yearFrom)) setYearFrom(val);
                            }}
                            className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700 active:scale-98 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Paper Language */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                        Paper Language
                      </label>
                      <div className="flex rounded-lg bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200/50 dark:border-slate-800 w-full">
                        <button
                          onClick={() => setLanguage("auto")}
                          className={cn(
                            "flex-1 h-7 rounded text-[10px] font-bold transition-all",
                            language === "auto" ? "bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                          )}
                        >
                          Auto
                        </button>
                        <button
                          onClick={() => setLanguage("en")}
                          className={cn(
                            "flex-1 h-7 rounded text-[10px] font-bold transition-all",
                            language === "en" ? "bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                          )}
                        >
                          EN
                        </button>
                        <button
                          onClick={() => setLanguage("vi")}
                          className={cn(
                            "flex-1 h-7 rounded text-[10px] font-bold transition-all",
                            language === "vi" ? "bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                          )}
                        >
                          VI
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEvidenceFilterOpen(false)}
                      className="text-xs font-bold h-8"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setEvidenceFilterOpen(false);
                        handleSearchPapers();
                      }}
                      disabled={paperSearchLoading}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold h-8 px-4"
                    >
                      Apply Filters
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleSearchPapers}
              disabled={paperSearchLoading || paperSearchQuery.trim().length < 2}
              className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {paperSearchLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Search
            </Button>
          </div>

          {paperSearchError && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {paperSearchError}
            </div>
          )}

          <div className="min-h-[260px] overflow-y-auto pr-1">
            {paperSearchLoading ? (
              <div className="space-y-3 py-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : paperSearchResults.length === 0 ? (
              <div className="flex h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                <Search className="h-8 w-8 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Search papers to add evidence</p>
                <p className="text-xs text-slate-500 mt-1">Results will show title, year, citations, and semantic relevance.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paperSearchResults.map((paper) => {
                    const alreadyAdded = currentEvidencePaperIds.includes(paper.id);
                    const packFull = previewData ? currentEvidencePaperIds.length >= previewData.maxEvidencePapers : false;
                    const authors = paper.authors?.map((a) => a.displayName).filter(Boolean) ?? [];
                    const abstract =
                      paper.abstractText && paper.abstractText.length > 220
                        ? `${paper.abstractText.slice(0, 220)}...`
                        : paper.abstractText;

                    return (
                      <div key={paper.id} className="py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-full bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900">
                              Score {paper.score.toFixed(3)}
                            </Badge>
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 text-[11px] font-extrabold text-amber-700 dark:text-amber-400 shadow-sm">
                              {paper.publicationYear}
                            </span>
                            <span className="text-xs text-slate-500">{paper.citationCount ?? 0} citations</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <h3 className="text-sm font-bold leading-snug text-slate-900 dark:text-white">{paper.title}</h3>
                            <Link
                              to={`/papers/${paper.id}`}
                              target="_blank"
                              className="mt-0.5 text-slate-400 hover:text-blue-600"
                              title="Open paper detail"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                          {(authors.length > 0 || paper.journalName) && (
                            <p className="text-xs text-slate-500">
                              {authors.slice(0, 3).join(", ")}
                              {authors.length > 3 ? " et al." : ""}
                              {authors.length > 0 && paper.journalName ? " · " : ""}
                              {paper.journalName}
                            </p>
                          )}
                          {abstract && (
                            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{abstract}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={alreadyAdded ? "outline" : "default"}
                          disabled={alreadyAdded || packFull || previewEvidence.isPending}
                          onClick={() => handleAddPaperFromSearch(paper.id)}
                          className="rounded-lg font-bold"
                        >
                          {alreadyAdded ? "Added" : packFull ? "Pack Full" : "Add"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              
              {paperSearchHasMore && (
                <div className="py-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={handleLoadMorePapers}
                    disabled={paperSearchLoadingMore}
                    className="w-full sm:w-auto font-semibold border-slate-200 dark:border-slate-800"
                  >
                    {paperSearchLoadingMore ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {paperSearchLoadingMore ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription className="pt-3 text-slate-600 dark:text-slate-400">
              Are you absolutely sure? This action cannot be undone. This will permanently delete
              {itemToDelete === 'ALL' ? ` all ${reports?.length} reports` : ' this report'} from our servers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={deleteReport.isPending || deleteBatchReports.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteReport.isPending || deleteBatchReports.isPending}>
              {(deleteReport.isPending || deleteBatchReports.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Yes, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
