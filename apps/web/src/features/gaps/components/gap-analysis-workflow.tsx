import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  Filter,
  Loader2,
  Plus,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AnalyzeGapRequest,
  GapEvidencePaper,
  Paper,
  PreviewGapEvidenceResponse,
} from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGapEvidencePreview } from "../hooks/use-gaps";
import { searchApi } from "@/features/search/api/search.api";
import { papersApi } from "@/features/papers/api/papers.api";
import { formatNumber } from "@/utils/format";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";

interface GapAnalysisWorkflowProps {
  isAnalyzing: boolean;
  onAnalyze: (payload: AnalyzeGapRequest) => void;
}

type PaperSearchCandidate = Pick<
  Paper,
  "id" | "title" | "publicationYear" | "citationCount"
> & {
  score?: number;
};

type PaperLanguageFilter = "auto" | "en" | "vi";

const MIN_PUBLICATION_YEAR = 1900;
const SEARCH_RESULTS_PAGE_SIZE = 10;
const SEARCH_RESULTS_LIMIT = 50;

export function GapAnalysisWorkflow({
  isAnalyzing,
  onAnalyze,
}: GapAnalysisWorkflowProps) {
  const currentYear = new Date().getFullYear();
  const { t } = useI18n();
  const [topic, setTopic] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [preview, setPreview] = useState<PreviewGapEvidenceResponse | null>(null);
  const [papers, setPapers] = useState<GapEvidencePaper[]>([]);
  const [manuallyAddedPaperIds, setManuallyAddedPaperIds] = useState<string[]>([]);
  const [paperSearch, setPaperSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PaperSearchCandidate[]>([]);
  const [searchResultPage, setSearchResultPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [paperPickerOpen, setPaperPickerOpen] = useState(false);
  const [paperFilterOpen, setPaperFilterOpen] = useState(false);
  const [paperYearFrom, setPaperYearFrom] = useState("");
  const [paperYearTo, setPaperYearTo] = useState("");
  const [paperLanguage, setPaperLanguage] = useState<PaperLanguageFilter>("auto");
  const evidenceRef = useRef<HTMLDivElement>(null);
  const paperResultsRef = useRef<HTMLDivElement>(null);
  const previewEvidence = useGapEvidencePreview();

  const years = useMemo(() => ({
    yearFrom: yearFrom ? Number(yearFrom) : undefined,
    yearTo: yearTo ? Number(yearTo) : undefined,
  }), [yearFrom, yearTo]);
  const paperSearchFilters = useMemo(() => ({
    yearFrom: paperYearFrom ? Number(paperYearFrom) : undefined,
    yearTo: paperYearTo ? Number(paperYearTo) : undefined,
    languages: paperLanguage === "auto" ? undefined : [paperLanguage],
  }), [paperLanguage, paperYearFrom, paperYearTo]);
  const activePaperFilterCount =
    (paperYearFrom || paperYearTo ? 1 : 0) + (paperLanguage === "auto" ? 0 : 1);
  const searchResultPageCount = Math.ceil(searchResults.length / SEARCH_RESULTS_PAGE_SIZE);
  const paginatedSearchResults = searchResults.slice(
    (searchResultPage - 1) * SEARCH_RESULTS_PAGE_SIZE,
    searchResultPage * SEARCH_RESULTS_PAGE_SIZE,
  );
  const selectedIds = papers.map((paper) => paper.id);
  const canPreview = topic.trim().length >= 3 && !previewEvidence.isPending;
  const canAnalyze = papers.length >= 3 && !isAnalyzing;

  const validateYears = () => {
    if (years.yearFrom && years.yearTo && years.yearFrom > years.yearTo) {
      toast.error(t("Year From must be less than or equal to Year To."));
      return false;
    }
    return true;
  };

  const loadPreview = async (
    pinnedIds: string[] = [],
    manualIds: string[] = manuallyAddedPaperIds,
  ) => {
    if (!canPreview || !validateYears()) return;
    try {
      const data = await previewEvidence.mutateAsync({
        topic: topic.trim(),
        ...years,
        selectedPaperIds: pinnedIds,
        evidenceMode: "hybrid",
      });
      const returnedIds = new Set(data.papers.map((paper) => paper.id));
      const retainedManualIds = manualIds.filter((id) => returnedIds.has(id));
      const manualIdSet = new Set(retainedManualIds);

      setPreview(data);
      setManuallyAddedPaperIds(retainedManualIds);
      setPapers(data.papers.map((paper) => ({
        ...paper,
        source: manualIdSet.has(paper.id) ? "selected" : "retrieved",
      })));
      requestAnimationFrame(() => evidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message ?? t("Could not retrieve gap evidence."));
    }
  };

  const searchPapers = async () => {
    if (paperSearch.trim().length < 2) return;
    setIsSearching(true);
    setHasSearched(false);
    setSearchError(null);
    setSearchResultPage(1);
    try {
      const query = paperSearch.trim();
      const isDoi = /^https?:\/\/doi\.org\/|^doi:\s*|^10\.\d{4,9}\//i.test(query);
      const keywordPromise = papersApi.list({
        q: query,
        page: 1,
        pageSize: SEARCH_RESULTS_LIMIT,
        ...paperSearchFilters,
        sort: "relevance",
      });
      const semanticPromise = isDoi
        ? Promise.resolve(null)
        : searchApi.semantic({
            q: query,
            page: 1,
            pageSize: SEARCH_RESULTS_LIMIT,
            ...paperSearchFilters,
            sort: "relevance",
          });
      const [keywordResult, semanticResult] = await Promise.allSettled([
        keywordPromise,
        semanticPromise,
      ]);
      const fulfilled: PaperSearchCandidate[] = [];
      if (keywordResult.status === "fulfilled") {
        fulfilled.push(...keywordResult.value.papers);
      }
      if (semanticResult.status === "fulfilled" && semanticResult.value) {
        fulfilled.push(...semanticResult.value.papers);
      }

      if (fulfilled.length === 0) {
        const reason = keywordResult.status === "rejected"
          ? keywordResult.reason
          : semanticResult.status === "rejected"
            ? semanticResult.reason
            : new Error("Paper search failed");
        throw reason;
      }

      const uniqueResults = new Map<string, PaperSearchCandidate>();
      for (const paper of fulfilled) {
        const existing = uniqueResults.get(paper.id);
        if (!existing || (paper.score ?? 0) > (existing.score ?? 0)) {
          uniqueResults.set(paper.id, paper);
        }
      }
      setSearchResults([...uniqueResults.values()].slice(0, SEARCH_RESULTS_LIMIT));
    } catch (error: any) {
      setSearchError(error.response?.data?.error?.message ?? t("Paper search failed."));
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  };

  const addPaper = async (paperId: string) => {
    if (!preview || selectedIds.includes(paperId)) return;
    if (papers.length >= preview.maxEvidencePapers) {
      toast.error(t("Evidence pack is limited to {{count}} papers. Remove one first.", { count: preview.maxEvidencePapers }));
      return;
    }
    await loadPreview(
      [paperId, ...selectedIds],
      Array.from(new Set([paperId, ...manuallyAddedPaperIds])),
    );
  };

  const analyzeReviewedPack = () => {
    if (!canAnalyze || !validateYears()) return;
    onAnalyze({
      topic: topic.trim(),
      ...years,
      selectedPaperIds: selectedIds,
      evidenceMode: "selected",
    });
  };

  const reset = () => {
    setPreview(null);
    setPapers([]);
    setManuallyAddedPaperIds([]);
    setSearchResults([]);
    setSearchResultPage(1);
    setHasSearched(false);
    setPaperSearch("");
    setPaperPickerOpen(false);
    setPaperFilterOpen(false);
    setPaperYearFrom("");
    setPaperYearTo("");
    setPaperLanguage("auto");
  };

  return (
    <section className="relative overflow-visible rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 dark:border-slate-800 dark:bg-[#12161f]">
      <div className="border-b border-slate-100/80 px-6 py-5 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-2.5 text-cyan-600 dark:from-cyan-500/20 dark:to-blue-500/20 dark:text-cyan-400 border border-cyan-500/20 shadow-xs">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-slate-950 dark:text-white">
                  {t("Create a grounded gap analysis")}
                </h2>
                <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                  AI Grounded Engine
                </Badge>
              </div>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("Define the topic, review the exact evidence papers, then spend credits on AI analysis.")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* Info Callout */}
        <div className="flex items-start gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs font-medium leading-relaxed text-cyan-950 dark:border-cyan-500/20 dark:bg-cyan-950/30 dark:text-cyan-200">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
          <span>
            {t("This is not a paper comparison. The system reads the reviewed evidence set to identify under-explored, contradictory, or methodologically missing research opportunities.")}
          </span>
        </div>

        {/* Inputs */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_130px_130px]">
          <label className="space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>{t("Research topic")}</span>
            <input
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
                if (preview) reset();
              }}
              placeholder={t("e.g. federated learning in medical imaging")}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 outline-none transition-all focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-800 dark:bg-slate-950/80 dark:text-white dark:focus:border-cyan-500 dark:focus:bg-slate-950"
            />
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>{t("Year from")}</span>
            <input
              type="number"
              value={yearFrom}
              onChange={(event) => {
                setYearFrom(event.target.value);
                if (preview) reset();
              }}
              placeholder="1900"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 outline-none transition-all focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-800 dark:bg-slate-950/80 dark:text-white dark:focus:border-cyan-500 dark:focus:bg-slate-950"
            />
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>{t("Year to")}</span>
            <input
              type="number"
              value={yearTo}
              onChange={(event) => {
                setYearTo(event.target.value);
                if (preview) reset();
              }}
              placeholder="2026"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm font-medium text-slate-900 outline-none transition-all focus:border-cyan-500 focus:bg-white focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-800 dark:bg-slate-950/80 dark:text-white dark:focus:border-cyan-500 dark:focus:bg-slate-950"
            />
          </label>
        </div>

        {!preview ? (
          <div className="flex flex-col gap-4 border-t border-slate-100/80 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              {t("Evidence preview is free. The 30-credit charge happens only after you approve at least 3 papers.")}
            </div>
            <Button
              onClick={() => void loadPreview()}
              disabled={!canPreview}
              className="h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-6 text-sm font-bold text-white shadow-md transition-all hover:from-cyan-500 hover:to-blue-500 hover:shadow-cyan-500/20 active:scale-[0.98] disabled:opacity-50"
            >
              {previewEvidence.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
              {t("Review Evidence")}
            </Button>
          </div>
        ) : (
          <div ref={evidenceRef} className="scroll-mt-24 space-y-5 border-t border-slate-100 pt-5 dark:border-slate-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                  <CheckCircle2 className="h-4 w-4" /> {t("Step 2: Review evidence")}
                </div>
                <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                  {t("These papers are the only sources the gap worker will read. Remove weak matches or add a missing study.")}
                </p>
              </div>
              <Badge variant="outline" className="w-fit rounded-full px-3 py-1">
                {papers.length} / {preview.maxEvidencePapers} {t("papers")}
              </Badge>
            </div>

            {preview.warnings.map((warning) => (
              <div key={warning} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {warning}
              </div>
            ))}

            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {papers.map((paper, index) => (
                <article key={paper.id} className="grid gap-3 p-4 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-start">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn(
                        "text-[10px] uppercase",
                        paper.source === "selected" ? "border-purple-200 text-purple-700" : "border-blue-200 text-blue-700",
                      )}>
                        {paper.source === "selected" ? t("Added by you") : t("Retrieved")}
                      </Badge>
                      {paper.publicationYear && <span className="text-xs text-slate-500">{paper.publicationYear}</span>}
                      {paper.citationCount !== undefined && (
                        <span className="text-xs text-slate-500">
                          {formatNumber(paper.citationCount)} {t("citations")}
                        </span>
                      )}
                      {paper.source === "retrieved" && (
                        <span className="text-xs font-semibold text-emerald-700">
                          {Math.round(Math.max(0, Math.min(1, paper.score)) * 100)}
                          {t("% match")}
                        </span>
                      )}
                    </div>
                    <Link
                      to={`/papers/${paper.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-start gap-1.5 font-semibold leading-snug text-slate-950 hover:text-cyan-700 dark:text-white dark:hover:text-cyan-300"
                    >
                      {paper.title}
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {paper.authorNames.slice(0, 3).join(", ")}
                      {paper.authorNames.length > 3 ? " et al." : ""}
                      {paper.journalName ? ` · ${paper.journalName}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("Remove from evidence")}
                    onClick={() => {
                      setPapers((current) => current.filter((item) => item.id !== paper.id));
                      setManuallyAddedPaperIds((current) => current.filter((id) => id !== paper.id));
                    }}
                    className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </article>
              ))}
            </div>

            <>
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-cyan-300 bg-cyan-50/50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-cyan-900 dark:bg-cyan-950/20">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {t("Add supporting evidence")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("Search the corpus for a missing study, then add it to the evidence set.")}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => setPaperPickerOpen(true)}
                  className="h-10 shrink-0 rounded-lg bg-cyan-600 px-4 font-bold text-white hover:bg-cyan-700"
                >
                  <Plus className="h-4 w-4" />
                  {t("Add a paper from the corpus")}
                </Button>
              </div>

              <Dialog
                open={paperPickerOpen}
                onOpenChange={(open) => {
                  setPaperPickerOpen(open);
                  if (!open) setPaperFilterOpen(false);
                }}
              >
                <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-visible sm:max-w-3xl">
                  <DialogHeader className="pr-8">
                    <DialogTitle className="flex items-center gap-2 text-lg">
                      <Search className="h-5 w-5 text-cyan-600" />
                      {t("Add supporting evidence")}
                    </DialogTitle>
                    <DialogDescription>
                      {t("Search the corpus for a missing study, then add it to the evidence set.")}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      {t("Searches exact title, DOI, keywords, and semantic meaning in one step.")}
                    </p>
                    <Badge variant="outline" className="w-fit shrink-0 border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                      {t("Hybrid paper search")}
                    </Badge>
                  </div>

                  <div className="relative flex flex-col gap-2 sm:flex-row">
                <input
                  value={paperSearch}
                  onChange={(event) => setPaperSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void searchPapers();
                  }}
                  placeholder={t("Enter a title, DOI, keyword, method, dataset, or research problem")}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                />
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPaperFilterOpen((open) => !open)}
                    aria-expanded={paperFilterOpen}
                    className={cn(
                      "h-10 w-full rounded-lg border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm sm:w-auto dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300",
                      paperFilterOpen && "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-200",
                    )}
                  >
                    <Filter className="h-4 w-4" />
                    {t("Filters")}
                    {activePaperFilterCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-600 px-1 text-[10px] text-white">
                        {activePaperFilterCount}
                      </span>
                    )}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", paperFilterOpen && "rotate-180")} />
                  </Button>

                  {paperFilterOpen && (
                    <div className="absolute right-0 top-12 z-50 w-[min(300px,calc(100vw-4rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-[#1e1e1e]">
                      <div className="mb-4 flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {t("Refine Evidence")}
                        </h4>
                        <button
                          type="button"
                          onClick={() => {
                            setPaperYearFrom("");
                            setPaperYearTo("");
                            setPaperLanguage("auto");
                          }}
                          className="text-[10px] font-bold uppercase text-cyan-700 hover:underline dark:text-cyan-400"
                        >
                          {t("Reset")}
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {t("Publication Year")}
                          </span>
                          <div className="space-y-3 pt-1">
                            <label className="block">
                              <span className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                <span>{t("From Year")}</span>
                                <span className="font-extrabold text-cyan-700 dark:text-cyan-400">
                                  {paperYearFrom || MIN_PUBLICATION_YEAR}
                                </span>
                              </span>
                              <input
                                type="range"
                                min={MIN_PUBLICATION_YEAR}
                                max={currentYear}
                                value={paperYearFrom || MIN_PUBLICATION_YEAR}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setPaperYearFrom(value);
                                  if (paperYearTo && Number(value) > Number(paperYearTo)) {
                                    setPaperYearTo(value);
                                  }
                                }}
                                className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-cyan-600 dark:bg-slate-700"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                <span>{t("To Year")}</span>
                                <span className="font-extrabold text-cyan-700 dark:text-cyan-400">
                                  {paperYearTo || currentYear}
                                </span>
                              </span>
                              <input
                                type="range"
                                min={MIN_PUBLICATION_YEAR}
                                max={currentYear}
                                value={paperYearTo || currentYear}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setPaperYearTo(value);
                                  if (paperYearFrom && Number(value) < Number(paperYearFrom)) {
                                    setPaperYearFrom(value);
                                  }
                                }}
                                className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-cyan-600 dark:bg-slate-700"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {t("Paper Language")}
                          </span>
                          <div className="flex rounded-lg border border-slate-200/60 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
                            {(["auto", "en", "vi"] as const).map((language) => (
                              <button
                                key={language}
                                type="button"
                                onClick={() => setPaperLanguage(language)}
                                className={cn(
                                  "h-7 flex-1 rounded text-[10px] font-bold uppercase transition-all",
                                  paperLanguage === language
                                    ? "bg-white text-cyan-700 shadow-sm dark:bg-slate-800 dark:text-cyan-400"
                                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
                                )}
                              >
                                {language === "auto" ? t("Auto") : language}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPaperFilterOpen(false)}
                          className="h-8 text-xs font-bold"
                        >
                          {t("Cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setPaperFilterOpen(false);
                            void searchPapers();
                          }}
                          disabled={isSearching || paperSearch.trim().length < 2}
                          className="h-8 bg-cyan-600 px-4 text-xs font-bold text-white hover:bg-cyan-700"
                        >
                          {t("Apply Filters")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <Button variant="outline" onClick={() => void searchPapers()} disabled={isSearching || paperSearch.trim().length < 2}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {t("Search")}
                </Button>
              </div>
              {searchError && <p className="mt-2 text-xs text-red-600">{searchError}</p>}
              {hasSearched && !isSearching && !searchError && searchResults.length === 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  {t("No matching papers yet. Try another phrase or switch search mode.")}
                </p>
              )}
              {searchResults.length > 0 && (
                <div ref={paperResultsRef} className="max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
                  {paginatedSearchResults.map((paper) => {
                    const added = selectedIds.includes(paper.id);
                    return (
                        <div key={paper.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">{paper.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {paper.publicationYear} · {formatNumber(paper.citationCount ?? 0)} {t("citations")}
                            {paper.score === undefined
                              ? ` ${t("· keyword match")}`
                              : paper.score <= 1
                                ? ` · ${Math.round(Math.max(0, paper.score) * 100)}${t("% semantic match")}`
                                : ` · ${t("Relevance score")} ${paper.score.toFixed(2)}`}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          title={added ? t("Added") : t("Add")}
                          aria-label={added ? t("Added") : t("Add")}
                          disabled={added}
                          onClick={() => void addPaper(paper.id)}
                          className="h-9 w-9 shrink-0 rounded-lg border-cyan-200 bg-cyan-50 text-cyan-700 shadow-none hover:border-cyan-300 hover:bg-cyan-100 hover:text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300 dark:hover:bg-cyan-900/50"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                  {searchResultPageCount > 1 && (
                    <div className="flex items-center justify-center gap-1 p-2">
                      {Array.from({ length: searchResultPageCount }, (_, index) => index + 1).map((page) => (
                        <button
                          key={page}
                          type="button"
                          aria-label={`${t("Page")} ${page}`}
                          aria-current={page === searchResultPage ? "page" : undefined}
                          onClick={() => {
                            setSearchResultPage(page);
                            paperResultsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className={cn(
                            "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold transition-colors",
                            page === searchResultPage
                              ? "bg-cyan-600 text-white shadow-sm"
                              : "text-slate-500 hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-400 dark:hover:bg-cyan-950/40 dark:hover:text-cyan-300",
                          )}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
                </DialogContent>
              </Dialog>
            </>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <Button variant="ghost" onClick={reset}>
                <ArrowLeft className="h-4 w-4" /> {t("Change topic")}
              </Button>
              <div className="flex flex-col items-end gap-1.5">
                <Button
                  onClick={analyzeReviewedPack}
                  disabled={!canAnalyze}
                  className="h-11 rounded-lg bg-cyan-600 px-6 font-bold text-white hover:bg-cyan-700"
                >
                  {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {t("Analyze {{count}} Reviewed Papers", { count: papers.length })}
                </Button>
                <span className="text-[11px] text-slate-500">
                  {t("Costs 30 credits · failures and cache hits are refunded")}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
