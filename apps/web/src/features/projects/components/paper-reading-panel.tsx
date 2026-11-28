import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FileSearch,
  FileText,
  Globe,
  Highlighter,
  Info,
  Languages,
  Loader2,
  Quote,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  FullTextStatus,
  PaperReadingSource,
  PaperTranslation,
  ProjectPaperAnalysis,
  ScreeningPaperRow,
  ScreeningRoundView,
} from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { papersApi } from "@/features/papers/api/papers.api";
import { researchApi } from "../api/project-research.api";
import { useScreeningCommand } from "./screening-common";
import { cn } from "@/utils/cn";

const PdfPreviewLazy = lazy(
  () => import("@/features/academic-profile/components/private-evidence-pdf-preview"),
);

export type ReadingTabId = "abstract" | "fulltext" | "understanding" | "info";

export interface AssessmentReferencePayload {
  kind: "abstract_quote" | "fulltext_source";
  text: string;
  sourceLabel?: string;
}

export function getFullTextStatusBadge(
  status?: FullTextStatus,
  fullTextAvailable?: boolean,
  hasAbstract?: boolean,
): { label: string; tone: "success" | "info" | "warning" | "neutral" } {
  switch (status) {
    case "AUTHORIZED_PROJECT_PDF":
      return { label: "PDF dự án", tone: "success" };
    case "AUTHORIZED_CORPUS_PDF":
      return { label: "PDF trong LumiGap", tone: "success" };
    case "EXTERNAL_PDF_LINK":
      return { label: "Liên kết PDF mở", tone: "info" };
    case "LANDING_PAGE_ONLY":
      return { label: "Trang nguồn ngoài (chưa có PDF)", tone: "warning" };
    case "UNAVAILABLE":
      return hasAbstract
        ? { label: "Chỉ có tóm tắt", tone: "neutral" }
        : { label: "Chỉ có metadata", tone: "neutral" };
    default:
      if (fullTextAvailable) return { label: "Có nguồn toàn văn", tone: "success" };
      return hasAbstract
        ? { label: "Đánh giá từ tóm tắt", tone: "neutral" }
        : { label: "Chưa có tóm tắt", tone: "warning" };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCriteriaHighlightTerms(round?: ScreeningRoundView | null): string[] {
  if (!round?.settings) return [];
  const raw = [
    ...(round.settings.researchQuestions ?? []),
    ...(round.settings.inclusionCriteria ?? []),
    ...(round.settings.exclusionCriteria ?? []),
  ].join(" ");
  const stopWords = new Set([
    "nghiên", "cứu", "bài", "báo", "liệu", "tài", "tiêu", "chí", "phải", "không", "được", "trong", "của", "với", "những", "này", "theo", "cho", "các", "một", "trên", "như",
    "study", "studies", "paper", "papers", "research", "using", "based", "with", "from", "that", "this", "have", "must", "only", "about", "which", "their", "between",
  ]);
  const tokens = raw
    .split(/[^a-zA-Z0-9À-ỹ-]+/u)
    .map(w => w.trim())
    .filter(w => w.length >= 4 && !stopWords.has(w.toLocaleLowerCase()));
  return Array.from(new Set(tokens.map(t => t.toLocaleLowerCase()))).slice(0, 14);
}

function renderHighlightedText(text: string, query: string, criteriaTerms: string[], highlightCriteria: boolean) {
  const activeQuery = query.trim();
  const terms = [
    ...(activeQuery.length >= 2 ? [activeQuery] : []),
    ...(highlightCriteria ? criteriaTerms : []),
  ];
  if (!terms.length) return text;
  const regex = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(regex);
  const lowerQuery = activeQuery.toLocaleLowerCase();
  return parts.map((part, idx) => {
    const lower = part.toLocaleLowerCase();
    if (activeQuery.length >= 2 && lower === lowerQuery) {
      return (
        <mark key={idx} className="rounded bg-primary/25 px-0.5 text-foreground font-medium">
          {part}
        </mark>
      );
    }
    if (highlightCriteria && criteriaTerms.includes(lower)) {
      return (
        <mark
          key={idx}
          className="rounded bg-amber-300/45 px-0.5 text-foreground dark:bg-amber-500/30"
          title="Từ khóa xuất hiện trong tiêu chí/câu hỏi của vòng — chỉ hỗ trợ quét nhanh"
        >
          {part}
        </mark>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function formatPaperKindLabel(kind?: string | null): string {
  switch (kind) {
    case "article":
      return "Bài báo tạp chí (Article)";
    case "review":
      return "Bài tổng quan (Review)";
    case "proceedings":
    case "conference":
      return "Kỷ yếu hội nghị (Proceedings)";
    case "preprint":
      return "Bản tiền ấn phẩm (Preprint)";
    case "book-chapter":
      return "Chương sách (Book chapter)";
    default:
      return kind || "Chưa phân loại";
  }
}

function isRepositoryVenue(venue?: string | null): boolean {
  if (!venue) return false;
  return /\b(arxiv|biorxiv|medrxiv|ssrn|zenodo|osf|research square|preprints\.org|hal)\b/i.test(venue);
}

function firstText(value?: string | string[] | null): string | null {
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === "string" && item.trim().length > 0);
    return first ? first.trim() : null;
  }
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function PaperReadingPanel({
  projectId,
  paper,
  round,
  readOnly,
  onUseReference,
  extraFooter,
  compactHeader = false,
}: {
  projectId: string;
  paper: ScreeningPaperRow;
  round?: ScreeningRoundView | null;
  readOnly: boolean;
  onUseReference?: (ref: AssessmentReferencePayload) => void;
  extraFooter?: React.ReactNode;
  compactHeader?: boolean;
}) {
  const tabId = useId();
  const [activeTab, setActiveTab] = useState<ReadingTabId>("abstract");
  const [abstractSize, setAbstractSize] = useState<"sm" | "base" | "lg">("base");
  const [showFullAuthors, setShowFullAuthors] = useState(false);
  const [copiedAbstract, setCopiedAbstract] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightCriteria, setHighlightCriteria] = useState(false);
  const [selectedPassageQuote, setSelectedPassageQuote] = useState<string>("");

  // Translation state (explicit on-demand; preserves original abstract)
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationData, setTranslationData] = useState<PaperTranslation | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // Full-text source selector & PDF blob state
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfTarget, setPdfTarget] = useState<{ page: number; x: number; y: number; key: number } | undefined>(undefined);
  const loadedFileIdRef = useRef<string | null>(null);

  // Research Paper Snapshot toggle inside Understanding tab
  const [showSnapshot, setShowSnapshot] = useState(true);

  const actorId = useAuthStore(state => state.user?.id);
  const hasPaperAnalysisApi = typeof researchApi?.paperAnalysis === "function";
  const shouldLoadDetail =
    activeTab !== "abstract" ||
    round?.phase === "FULL_TEXT" ||
    showTranslation;
  const detailQuery = useQuery<ProjectPaperAnalysis | null>({
    queryKey: ["paper-reading-detail", actorId, projectId, paper.paperId],
    queryFn: () =>
      hasPaperAnalysisApi
        ? researchApi.paperAnalysis(projectId, paper.paperId)
        : Promise.resolve(null),
    enabled: Boolean(actorId && projectId && paper.paperId && hasPaperAnalysisApi && shouldLoadDetail),
    staleTime: 60_000,
    retry: false,
    refetchInterval: query =>
      ["queued", "processing"].includes(query.state.data?.knowledge?.status ?? "") ? 2500 : false,
  });
  const command = useScreeningCommand(projectId);

  // Reset per-paper reading state cleanly when paper changes
  useEffect(() => {
    setShowTranslation(false);
    setTranslationData(null);
    setTranslationError(null);
    setSearchQuery("");
    setSelectedPassageQuote("");
    setSelectedSourceId(null);
    setPdfBlob(null);
    setPdfError(null);
    setPdfTarget(undefined);
    loadedFileIdRef.current = null;
  }, [paper.paperId]);

  // Preload cached Vietnamese translation if available (zero cost)
  const cachedViTranslation = useMemo(
    () => detailQuery.data?.cachedTranslations?.find(tr => tr.targetLanguage === "vi") ?? null,
    [detailQuery.data?.cachedTranslations],
  );

  const detail = detailQuery.data;
  const sources: PaperReadingSource[] = useMemo(() => {
    if (detail?.sources?.length) return detail.sources;
    const fallback: PaperReadingSource[] = [];
    if (paper.paperLink) {
      fallback.push({
        id: "fallback-link",
        kind: paper.fullTextAvailable ? "EXTERNAL_FULLTEXT_PDF" : "EXTERNAL_LANDING_PAGE",
        label: paper.fullTextAvailable ? "Liên kết toàn văn mở" : "Trang nguồn bên ngoài (Landing page)",
        availability: paper.fullTextAvailable ? "FULLTEXT_LINK_UNVERIFIED" : "EXTERNAL_LANDING_PAGE",
        accessState: "EXTERNAL_OPEN",
        verificationState: paper.fullTextAvailable ? "URL_PATTERN_PDF" : "UNVERIFIED_EXTERNAL",
        url: paper.paperLink,
        readableInWorkspace: false,
        usableForFullTextScreening: Boolean(paper.fullTextAvailable),
      });
    }
    if (paper.doi && /^10\.\d{4,9}\/\S+$/i.test(paper.doi)) {
      fallback.push({
        id: `doi:${paper.doi}`,
        kind: "DOI_RESOLVER",
        label: "Định danh DOI (Trang xuất bản gốc)",
        provider: "DOI.org",
        availability: "EXTERNAL_LANDING_PAGE",
        accessState: "EXTERNAL_OPEN",
        verificationState: "UNVERIFIED_EXTERNAL",
        url: `https://doi.org/${encodeURIComponent(paper.doi)}`,
        readableInWorkspace: false,
        usableForFullTextScreening: false,
      });
    }
    return fallback;
  }, [detail?.sources, paper.paperLink, paper.doi, paper.fullTextAvailable]);

  const fullTextSources = useMemo(
    () => sources.filter(s => !["ABSTRACT_ONLY", "METADATA_ONLY"].includes(s.kind)),
    [sources],
  );

  const activeSource = useMemo(() => {
    if (selectedSourceId) {
      const match = fullTextSources.find(s => s.id === selectedSourceId);
      if (match) return match;
    }
    return fullTextSources[0] ?? null;
  }, [fullTextSources, selectedSourceId]);

  // Lazy-load authorized Project PDF blob ONLY when user enters Full Text tab & selects a Project PDF
  useEffect(() => {
    if (activeTab !== "fulltext" || !activeSource || activeSource.kind !== "PROJECT_PDF" || !activeSource.fileId) {
      return;
    }
    const fileId = activeSource.fileId;
    if (loadedFileIdRef.current === fileId && pdfBlob) return;
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    void researchApi
      .download(projectId, fileId)
      .then(blob => {
        if (cancelled) return;
        loadedFileIdRef.current = fileId;
        setPdfBlob(blob);
      })
      .catch(() => {
        if (cancelled) return;
        setPdfError("Không thể tải tệp PDF của dự án. Kiểm tra quyền truy cập hoặc thử tải lại.");
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, activeSource, projectId, pdfBlob]);

  const effectiveAbstract = detail?.abstractText ?? paper.abstractText ?? "";
  const effectiveAuthors = detail?.authors?.length ? detail.authors : paper.authors ?? [];
  const effectiveKeywords = detail?.bibliographic?.keywords?.length
    ? detail.bibliographic.keywords
    : paper.keywords ?? [];
  const effectiveTopics = detail?.bibliographic?.topics ?? [];
  const effectiveFtStatus = detail?.fullTextStatus ?? paper.fullTextStatus;
  const effectiveFtAvailable = detail?.fullTextAvailable ?? paper.fullTextAvailable ?? false;
  const statusBadge = getFullTextStatusBadge(effectiveFtStatus, effectiveFtAvailable, Boolean(effectiveAbstract.trim()));
  const criteriaTerms = useMemo(() => extractCriteriaHighlightTerms(round), [round]);
  const isBlindScreening = Boolean(round?.hiddenReviews);

  async function handleToggleTranslation() {
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    if (translationData || cachedViTranslation) {
      setShowTranslation(true);
      return;
    }
    if (!effectiveAbstract.trim()) return;
    setTranslating(true);
    setTranslationError(null);
    try {
      const translated = await papersApi.translate(paper.paperId, "vi");
      setTranslationData(translated);
      setShowTranslation(true);
    } catch {
      setTranslationError("Không thể dịch tóm tắt lúc này. Bạn vẫn có thể đọc nguyên văn bên dưới.");
    } finally {
      setTranslating(false);
    }
  }

  async function handleCopyAbstract() {
    if (!effectiveAbstract) return;
    try {
      await navigator.clipboard.writeText(effectiveAbstract);
      setCopiedAbstract(true);
      toast.success("Đã sao chép tóm tắt nguyên văn");
      window.setTimeout(() => setCopiedAbstract(false), 2000);
    } catch {
      toast.error("Không thể sao chép tóm tắt");
    }
  }

  async function handleUploadProjectPdf(file: File) {
    if (readOnly) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Tệp PDF vượt quá giới hạn 10 MiB.");
      return;
    }
    const ok = await command.run(
      { upload: file.name, size: file.size, modified: file.lastModified },
      () => researchApi.upload(projectId, paper.paperId, file),
    );
    if (ok) {
      toast.success("Đã tải lên PDF toàn văn cho dự án.");
      loadedFileIdRef.current = null;
      setPdfBlob(null);
      void detailQuery.refetch();
    }
  }

  async function handleRequestAnalysis() {
    if (readOnly) return;
    const ok = await command.run({ paperId: paper.paperId, action: "analyze" }, () =>
      researchApi.requestPaperAnalysis(projectId, paper.paperId),
    );
    if (ok) {
      toast.success("Đã gửi yêu cầu phân tích hỗ trợ đọc hiểu.");
      void detailQuery.refetch();
    }
  }

  function handleJumpToEvidence(quote: string, pageNumber?: number | null) {
    if (pageNumber && activeSource?.kind === "PROJECT_PDF") {
      setActiveTab("fulltext");
      setPdfTarget({ page: pageNumber, x: 0, y: 0, key: Date.now() });
      return;
    }
    setActiveTab("abstract");
    setShowTranslation(false);
    setSearchOpen(true);
    setSearchQuery(quote.slice(0, 60));
  }

  function handleCaptureAbstractSelection() {
    const sel = window.getSelection?.()?.toString().trim() ?? "";
    if (sel.length >= 8 && effectiveAbstract.includes(sel)) {
      setSelectedPassageQuote(sel.slice(0, 320));
    }
  }

  const displayedTranslatedAbstract =
    translationData?.translatedAbstract || cachedViTranslation?.translatedAbstract || "";
  const displayedTranslatedTitle =
    translationData?.translatedTitle || cachedViTranslation?.translatedTitle || "";
  const translationProvider =
    translationData?.provider || cachedViTranslation?.provider || "Hệ thống dịch học thuật";

  const analysis = detail?.analysis ?? null;
  const knowledge = detail?.knowledge ?? null;
  const knowledgeStatus = knowledge?.status ?? (analysis ? "ready" : "not_indexed");
  const isAnalysisBusy = command.isPending || ["queued", "processing"].includes(knowledgeStatus);
  const aiSourceKind = knowledge?.sourceKind ?? (analysis as { sourceKind?: string } | null)?.sourceKind ?? "abstract";
  const aiCoverageLabel =
    knowledgeStatus === "outdated"
      ? "Nguồn phân tích đã thay đổi — bản phân tích có thể đã cũ."
      : knowledgeStatus === "failed"
        ? "Không thể lập chỉ mục phân tích từ nguồn hiện có."
        : !analysis && knowledgeStatus === "not_indexed"
          ? "Chưa có dữ liệu phân tích hỗ trợ đọc hiểu."
          : aiSourceKind === "uploaded_pdf" || aiSourceKind === "open_access_pdf" || aiSourceKind === "pdf"
            ? `Phân tích từ văn bản trích xuất của PDF${knowledge?.pageCount ? ` (${knowledge.pageCount} trang)` : ""}.`
            : "Phân tích từ tiêu đề và tóm tắt — chưa bao gồm toàn văn bài báo.";

  const tabs: Array<{ id: ReadingTabId; label: string; icon: typeof FileText; badge?: string }> = [
    { id: "abstract", label: "Tóm tắt", icon: FileText },
    {
      id: "fulltext",
      label: "Toàn văn",
      icon: BookOpen,
      badge: detail?.projectFiles?.length
        ? `${detail.projectFiles.length} PDF`
        : effectiveFtAvailable
          ? "Mở"
          : undefined,
    },
    {
      id: "understanding",
      label: "Hỗ trợ đọc hiểu",
      icon: Sparkles,
      badge: analysis ? "Sẵn có" : undefined,
    },
    { id: "info", label: "Thông tin bài báo", icon: Info },
  ];

  const venueIsRepo = isRepositoryVenue(paper.journalName);

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {/* Compact Bibliographic Byline (No duplicate H3 title — title lives in workspace header) */}
      <div className="space-y-1.5 pb-2 border-b border-border/70">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {paper.publicationYear ? (
            <span className="font-semibold text-foreground tabular-nums">{paper.publicationYear}</span>
          ) : null}
          {paper.journalName ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-foreground/90" title={paper.journalName}>
                {paper.journalName}
              </span>
              {venueIsRepo ? (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                  Kho lưu trữ
                </Badge>
              ) : null}
            </>
          ) : null}
          {paper.doi && /^10\.\d{4,9}\/\S+$/i.test(paper.doi) ? (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={`https://doi.org/${encodeURIComponent(paper.doi)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-primary hover:underline"
              >
                DOI: {paper.doi}
              </a>
            </>
          ) : null}
          {paper.paperKind ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-xs text-muted-foreground">{formatPaperKindLabel(paper.paperKind)}</span>
            </>
          ) : null}
          {!compactHeader ? (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={`/papers/${encodeURIComponent(paper.paperId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <ExternalLink size={12} />
                <span>Hồ sơ bài báo</span>
              </a>
            </>
          ) : null}
          <Badge
            variant="outline"
            className={cn(
              "ml-auto text-xs font-medium",
              statusBadge.tone === "success" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              statusBadge.tone === "info" && "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
              statusBadge.tone === "warning" && "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
            )}
          >
            {statusBadge.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            {effectiveAuthors.length
              ? showFullAuthors || effectiveAuthors.length <= 3
                ? effectiveAuthors.join(", ")
                : `${effectiveAuthors.slice(0, 3).join(", ")} và cộng sự`
              : "Chưa rõ tác giả"}
          </span>
          {effectiveAuthors.length > 3 ? (
            <button
              type="button"
              className="text-[11px] font-medium text-primary hover:underline"
              onClick={() => setShowFullAuthors(v => !v)}
            >
              {showFullAuthors ? "(Thu gọn)" : `(+${effectiveAuthors.length - 3} tác giả)`}
            </button>
          ) : null}
        </div>
      </div>

      {/* Accessible 4-Tab Reading Bar */}
      <div
        role="tablist"
        aria-label="Khu vực đọc hiểu tài liệu"
        className="flex flex-wrap gap-1 rounded-xl border border-border/75 bg-muted/40 p-1"
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${tabId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${tabId}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={e => {
                const next =
                  e.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : e.key === "ArrowLeft"
                      ? (index - 1 + tabs.length) % tabs.length
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next !== null) {
                  e.preventDefault();
                  setActiveTab(tabs[next]!.id);
                  (e.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
                }
              }}
              className={cn(
                "inline-flex flex-1 min-w-[110px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
              <span className="truncate">{tab.label}</span>
              {tab.badge ? (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* TAB 1: TÓM TẮT (ORIGINAL ABSTRACT + TRANSLATION + TOOLS)     */}
      {/* ============================================================ */}
      <div
        id={`${tabId}-panel-abstract`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-abstract`}
        hidden={activeTab !== "abstract"}
        className="space-y-3"
      >
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
          {/* Reading Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/25 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <FileText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>{showTranslation ? "Bản dịch tiếng Việt (Hỗ trợ đọc hiểu)" : "Tóm tắt nguyên văn"}</span>
              {effectiveAbstract ? (
                <span className="font-normal text-muted-foreground">
                  · {effectiveAbstract.split(/\s+/).filter(Boolean).length} từ
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {effectiveAbstract ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant={showTranslation ? "secondary" : "outline"}
                    disabled={translating}
                    onClick={() => void handleToggleTranslation()}
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    title={showTranslation ? "Chuyển về nguyên văn tóm tắt" : "Dịch tóm tắt sang tiếng Việt để hỗ trợ đọc hiểu"}
                  >
                    {translating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{showTranslation ? "Xem nguyên văn" : "Dịch tiếng Việt"}</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant={searchOpen ? "secondary" : "ghost"}
                    onClick={() => setSearchOpen(v => !v)}
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    title="Tìm từ khóa trong tóm tắt"
                  >
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Tìm kiếm</span>
                  </Button>

                  {criteriaTerms.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={highlightCriteria ? "secondary" : "ghost"}
                      aria-pressed={highlightCriteria}
                      onClick={() => setHighlightCriteria(v => !v)}
                      className="h-8 gap-1.5 px-2.5 text-xs"
                      title="Tô sáng từ khóa xuất hiện trong tiêu chí/câu hỏi của vòng (chỉ hỗ trợ đọc)"
                    >
                      <Highlighter className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Tô sáng tiêu chí</span>
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleCopyAbstract()}
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    title="Sao chép nội dung tóm tắt"
                  >
                    {copiedAbstract ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">{copiedAbstract ? "Đã chép" : "Sao chép"}</span>
                  </Button>

                  <div className="inline-flex h-8 items-center rounded-md border border-border bg-background p-0.5" role="group" aria-label="Cỡ chữ tóm tắt">
                    {(["sm", "base", "lg"] as const).map(size => (
                      <button
                        key={size}
                        type="button"
                        aria-pressed={abstractSize === size}
                        onClick={() => setAbstractSize(size)}
                        title={size === "sm" ? "Cỡ chữ nhỏ" : size === "base" ? "Cỡ chữ chuẩn" : "Cỡ chữ lớn"}
                        className={cn(
                          "rounded px-2 py-1 text-xs font-medium transition-colors",
                          abstractSize === size
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {size === "sm" ? "A-" : size === "base" ? "A" : "A+"}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Inline Search Strip */}
          {searchOpen && effectiveAbstract ? (
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/15 px-4 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm từ hoặc cụm từ trong tóm tắt…"
                className="h-7 text-xs"
              />
              {searchQuery ? (
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSearchQuery("")}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Xóa từ khóa tìm</span>
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Translation Notice / Error */}
          {translationError ? (
            <div role="alert" className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
              {translationError}
            </div>
          ) : null}

          {showTranslation && displayedTranslatedAbstract ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-500/20 bg-blue-500/5 px-4 py-2 text-xs text-blue-900 dark:text-blue-200">
              <span>
                <strong>Bản dịch hỗ trợ đọc hiểu</strong> ({translationProvider}) — đối chiếu nguyên văn khi sử dụng làm minh chứng.
              </span>
              <button
                type="button"
                className="font-semibold underline hover:no-underline"
                onClick={() => setShowTranslation(false)}
              >
                Xem nguyên văn
              </button>
            </div>
          ) : null}

          {/* Abstract Content */}
          <div className="px-6 py-5" onMouseUp={handleCaptureAbstractSelection}>
            {effectiveAbstract ? (
              <div className="space-y-4">
                {showTranslation && displayedTranslatedAbstract ? (
                  <div className="space-y-4">
                    {displayedTranslatedTitle ? (
                      <p className="text-[15.5px] font-semibold text-foreground leading-snug">
                        {displayedTranslatedTitle}
                      </p>
                    ) : null}
                    <div
                      className={cn(
                        "w-full space-y-3 text-foreground",
                        abstractSize === "sm" && "text-[14px] leading-[1.68]",
                        abstractSize === "base" && "text-[15.5px] leading-[1.78]",
                        abstractSize === "lg" && "text-[17px] leading-[1.85]",
                      )}
                    >
                      {displayedTranslatedAbstract.split(/\n{2,}/).map((para, idx) => (
                        <p key={idx} className="whitespace-pre-line">{para}</p>
                      ))}
                    </div>
                    <details open className="rounded-lg border border-border/70 bg-muted/20 p-3.5">
                      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                        Nguyên văn tóm tắt (đối chiếu trích dẫn &amp; minh chứng)
                      </summary>
                      <div className="mt-2.5 space-y-2.5 text-[13.5px] leading-[1.7] text-foreground/85">
                        {effectiveAbstract.split(/\n{2,}/).map((para, idx) => (
                          <p key={idx} className="whitespace-pre-line">
                            {renderHighlightedText(para, searchQuery, criteriaTerms, highlightCriteria)}
                          </p>
                        ))}
                      </div>
                    </details>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "w-full space-y-3 text-foreground",
                      abstractSize === "sm" && "text-[14px] leading-[1.68]",
                      abstractSize === "base" && "text-[15.5px] leading-[1.78]",
                      abstractSize === "lg" && "text-[17px] leading-[1.85]",
                    )}
                  >
                    {effectiveAbstract.split(/\n{2,}/).map((para, idx) => (
                      <p key={idx} className="whitespace-pre-line">
                        {renderHighlightedText(para, searchQuery, criteriaTerms, highlightCriteria)}
                      </p>
                    ))}
                  </div>
                )}

                {highlightCriteria && criteriaTerms.length > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Lưu ý: Tô sáng chỉ đánh dấu từ khóa trùng lặp với tiêu chí vòng để quét nhanh, không tự động kết luận mức độ phù hợp khoa học.
                  </p>
                ) : null}

                {/* Passage Reference Helper */}
                {onUseReference ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="text-[11px] text-muted-foreground">
                      {selectedPassageQuote
                        ? `Đoạn đang chọn: “${selectedPassageQuote.slice(0, 75)}${selectedPassageQuote.length > 75 ? "…" : ""}”`
                        : "Bôi đen một đoạn trong tóm tắt nguyên văn để đưa nhanh vào căn cứ đánh giá."}
                    </span>
                    {selectedPassageQuote ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => {
                          onUseReference({
                            kind: "abstract_quote",
                            text: `Trích từ tóm tắt: "${selectedPassageQuote}"`,
                            sourceLabel: "Tóm tắt nguyên văn",
                          });
                          setSelectedPassageQuote("");
                        }}
                      >
                        <Quote className="h-3 w-3" aria-hidden="true" />
                        <span>Dùng đoạn này làm căn cứ</span>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <p className="text-sm font-medium text-foreground">
                  Bài báo chưa có tóm tắt trong kho dữ liệu.
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Không tự động sinh tóm tắt giả định. Hãy kiểm tra nguồn toàn văn hoặc mở trang xuất bản gốc trước khi đánh giá.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setActiveTab("fulltext")}>
                    Kiểm tra nguồn toàn văn
                  </Button>
                  {paper.doi && /^10\.\d{4,9}\/\S+$/i.test(paper.doi) ? (
                    <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                      <a href={`https://doi.org/${encodeURIComponent(paper.doi)}`} target="_blank" rel="noopener noreferrer">
                        <Globe className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Mở nguồn DOI
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Keywords & Topics Quick Strip */}
        {(effectiveKeywords.length > 0 || effectiveTopics.length > 0 || (paper.tags?.length ?? 0) > 0) ? (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            {effectiveTopics.slice(0, 3).map((topic, idx) => {
              const label = typeof topic === "string" ? topic : topic.topicName;
              return (
                <Badge key={`topic-${idx}-${label}`} variant="secondary" className="text-[11px] font-medium">
                  {label}
                </Badge>
              );
            })}
            {effectiveKeywords.slice(0, 6).map(kw => (
              <Badge key={kw} variant="outline" className="text-[11px] font-normal">
                {kw}
              </Badge>
            ))}
            {paper.tags?.map(tag => (
              <Badge key={tag} variant="outline" className="border-primary/30 bg-primary/5 text-[11px] text-primary">
                <Tag className="mr-1 h-2.5 w-2.5" aria-hidden="true" />
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {/* ============================================================ */}
      {/* TAB 2: TOÀN VĂN (SOURCE SELECTOR + AUTHORIZED PDF VIEWER)    */}
      {/* ============================================================ */}
      <div
        id={`${tabId}-panel-fulltext`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-fulltext`}
        hidden={activeTab !== "fulltext"}
        className="space-y-3"
      >
        {/* Source Selector */}
        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-foreground">Nguồn tài liệu khả dụng</h4>
              <p className="text-[11px] text-muted-foreground">
                Phân biệt rõ PDF dự án, PDF trong kho LumiGap, liên kết PDF mở và trang nguồn bên ngoài.
              </p>
            </div>
            {!readOnly ? (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                <Upload className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>{command.isPending ? "Đang tải lên…" : "Bổ sung PDF dự án"}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={command.isPending}
                  className="sr-only"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadProjectPdf(file);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>

          {fullTextSources.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Chọn nguồn tài liệu">
              {fullTextSources.map(src => {
                const selected = activeSource?.id === src.id;
                return (
                  <button
                    key={src.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedSourceId(src.id)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    <span className="font-semibold text-foreground">{src.label}</span>
                    <span className="mt-0.5 text-[11px] text-muted-foreground">
                      {src.provider ? `${src.provider} · ` : ""}
                      {src.usableForFullTextScreening ? "Đủ điều kiện đọc toàn văn" : "Chỉ trang nguồn / tham khảo"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">Chưa có tệp toàn văn hoặc liên kết nguồn hợp lệ.</p>
              <p>
                Thành viên dự án có thể bổ sung tệp PDF hợp pháp (tối đa 10 MiB) để đọc trực tiếp trong không gian này và phục vụ vòng sàng lọc toàn văn.
              </p>
            </div>
          )}
        </div>

        {/* Active Source Reader Area */}
        {activeSource ? (
          <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{activeSource.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {activeSource.provider ?? ""}
                  {activeSource.documentVersion ? ` · Phiên bản #${activeSource.documentVersion}` : ""}
                  {activeSource.byteSize ? ` · ${(activeSource.byteSize / 1024).toFixed(0)} KB` : ""}
                  {activeSource.license ? ` · Giấy phép: ${activeSource.license}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {activeSource.usableForFullTextScreening && onUseReference ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      onUseReference({
                        kind: "fulltext_source",
                        text:
                          activeSource.kind === "PROJECT_PDF"
                            ? `PDF dự án (${activeSource.label}, mã #${activeSource.documentVersion ?? activeSource.fileId})`
                            : activeSource.url
                              ? `${activeSource.label}: ${activeSource.url}`
                              : activeSource.label,
                        sourceLabel: activeSource.label,
                      })
                    }
                  >
                    Dùng làm nguồn căn cứ toàn văn
                  </Button>
                ) : null}
                {activeSource.url ? (
                  <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                    <a href={activeSource.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      <span>Mở ở tab mới</span>
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>

            {activeSource.kind === "PROJECT_PDF" ? (
              pdfLoading ? (
                <div role="status" className="flex items-center gap-2 py-8 justify-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                  <span>Đang tải tệp PDF được cấp quyền của dự án…</span>
                </div>
              ) : pdfError ? (
                <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  {pdfError}
                </div>
              ) : pdfBlob ? (
                <Suspense
                  fallback={
                    <p role="status" className="py-6 text-center text-xs text-muted-foreground">
                      Đang khởi tạo trình đọc PDF…
                    </p>
                  }
                >
                  <PdfPreviewLazy blob={pdfBlob} zoomable continuous target={pdfTarget} />
                </Suspense>
              ) : null
            ) : activeSource.kind === "CORPUS_PDF" ? (
              <div className="space-y-2.5 text-xs text-muted-foreground">
                <p className="text-foreground font-medium">
                  Bài báo có tệp PDF đã đăng ký trong kho LumiGap.
                </p>
                <p>
                  Để tuân thủ chính sách quyền truy cập và credit hiện hành, mở trang Hồ sơ bài báo để tải hoặc đọc tệp PDF được cấp phép.
                </p>
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <a href={`/papers/${encodeURIComponent(paper.paperId)}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Mở Hồ sơ bài báo để đọc PDF
                  </a>
                </Button>
              </div>
            ) : activeSource.kind === "EXTERNAL_FULLTEXT_PDF" ? (
              <div className="space-y-2.5 text-xs text-muted-foreground">
                <p className="text-foreground font-medium">
                  Liên kết trỏ trực tiếp tới tệp PDF bên ngoài ({activeSource.provider ?? "Nguồn mở"}).
                </p>
                <p>
                  Trạng thái kiểm tra: Liên kết khớp định dạng PDF nhưng chưa được lưu trữ cục bộ trong dự án. Nếu bạn đã tải về bản hợp pháp, hãy bổ sung vào PDF dự án để đọc ổn định và lưu dấu vết phiên bản.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Trang nguồn bên ngoài — chưa xác nhận tệp toàn văn</span>
                </div>
                <p className="leading-5">
                  Liên kết hiện tại dẫn tới trang thông tin tại nhà xuất bản hoặc kho lưu trữ (landing page / DOI), không phải minh chứng có toàn văn trực tiếp. Mở liên kết để kiểm tra quyền truy cập và tải lên PDF hợp pháp cho dự án khi cần đánh giá toàn văn.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ============================================================ */}
      {/* TAB 3: HỖ TRỢ ĐỌC HIỂU (AI UNDERSTANDING + SNAPSHOT)         */}
      {/* ============================================================ */}
      <div
        id={`${tabId}-panel-understanding`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-understanding`}
        hidden={activeTab !== "understanding"}
        className="space-y-3"
      >
        {/* Source Coverage & Neutrality Banner */}
        <div className="rounded-xl border border-border/80 bg-muted/25 p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <FileSearch className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Phạm vi nguồn phân tích</span>
            </div>
            {!readOnly && (knowledgeStatus === "not_indexed" || knowledgeStatus === "outdated" || knowledgeStatus === "failed") ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isAnalysisBusy}
                onClick={() => void handleRequestAnalysis()}
                className="h-7 gap-1.5 text-xs"
              >
                {isAnalysisBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                )}
                <span>{knowledgeStatus === "outdated" ? "Cập nhật phân tích" : "Phân tích hỗ trợ đọc"}</span>
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{aiCoverageLabel}</p>
          <p className="text-[11px] text-muted-foreground">
            Công cụ trung lập chỉ hỗ trợ đọc hiểu cấu trúc bài báo — không đưa ra khuyến nghị Chọn / Loại và không thay thế quyết định độc lập của reviewer.
          </p>
          {knowledge?.warnings?.length ? (
            <ul className="list-disc pl-4 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
              {knowledge.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {detailQuery.isLoading ? (
          <div role="status" className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            <span>Đang tải thông tin hỗ trợ đọc hiểu…</span>
          </div>
        ) : isAnalysisBusy ? (
          <div role="status" className="rounded-xl border border-border/80 bg-card p-5 text-center space-y-2">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <p className="text-xs font-medium text-foreground">Đang xử lý lập chỉ mục và phân tích cấu trúc bài báo…</p>
            <p className="text-[11px] text-muted-foreground">Bạn vẫn có thể đọc nguyên văn tóm tắt và đánh giá độc lập trong lúc chờ.</p>
          </div>
        ) : analysis ? (
          <>
            {/* Optional Structured Research Paper Snapshot (Tổng quan trực quan) */}
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>Tổng quan trực quan</span>
                </div>
                <button
                  type="button"
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSnapshot(v => !v)}
                >
                  {showSnapshot ? "Thu gọn" : "Hiển thị"}
                </button>
              </div>
              {showSnapshot ? (
                <div className="p-4 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { label: "Vấn đề & mục tiêu", value: firstText(analysis.summary) },
                      { label: "Phương pháp", value: firstText(analysis.methods) },
                      { label: "Dữ liệu / đối tượng", value: firstText(analysis.dataset) },
                      { label: "Phát hiện chính", value: firstText(analysis.findings) },
                      { label: "Đóng góp", value: firstText(analysis.contributions) },
                      { label: "Hạn chế báo cáo", value: firstText(analysis.limitations) },
                    ]
                      .filter(step => Boolean(step.value))
                      .map((step, index) => (
                        <div
                          key={step.label}
                          className="rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs space-y-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                              {index + 1}
                            </span>
                            <span className="font-semibold text-foreground">{step.label}</span>
                          </div>
                          <p className="text-[11px] leading-4.5 text-muted-foreground line-clamp-3">
                            {step.value}
                          </p>
                        </div>
                      ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Sơ đồ tóm lược trực tiếp từ các trường có căn cứ trong nguồn ({aiSourceKind === "abstract" ? "Tiêu đề & Tóm tắt" : "Văn bản trích xuất PDF"}). Không thay thế việc đọc bản gốc.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Structured Understanding Details */}
            <div className="rounded-xl border border-border/80 bg-card divide-y divide-border/70">
              <UnderstandingField title="Vấn đề & Tóm lược nghiên cứu" text={analysis.summary} />
              <UnderstandingList
                title="Câu hỏi nghiên cứu được nêu trong nguồn"
                items={analysis.researchQuestions}
                emptyText="Chưa đủ căn cứ từ nguồn hiện có (không tự suy diễn câu hỏi nghiên cứu)."
              />
              <UnderstandingField title="Phương pháp nghiên cứu" text={analysis.methods} />
              <UnderstandingField title="Dữ liệu & đối tượng nghiên cứu" text={analysis.dataset} />
              <UnderstandingList title="Phát hiện chính" items={analysis.findings} />
              <UnderstandingList title="Đóng góp nghiên cứu" items={analysis.contributions} />
              <UnderstandingList title="Hạn chế được báo cáo" items={analysis.limitations} />
              <UnderstandingList title="Hướng phát triển tiếp theo" items={analysis.futureWork} />
              {analysis.keyTerms?.length ? (
                <div className="p-3.5 space-y-1.5">
                  <h5 className="text-xs font-semibold text-foreground">Thuật ngữ quan trọng</h5>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.keyTerms.map(term => (
                      <Badge key={term} variant="secondary" className="text-[11px] font-normal">
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Grounded Source Quotes from Knowledge Graph */}
            {knowledge?.edges?.length ? (
              <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-2">
                <h5 className="text-xs font-semibold text-foreground">Trích đoạn căn cứ từ nguồn đã lập chỉ mục</h5>
                <ul className="space-y-2">
                  {knowledge.edges.slice(0, 6).map(edge => (
                    <li key={edge.id} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs space-y-1">
                      <p className="italic text-foreground/90">“{edge.quote}”</p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{edge.pageNumber ? `Trang ${edge.pageNumber}` : "Từ tóm tắt"}</span>
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline"
                          onClick={() => handleJumpToEvidence(edge.quote, edge.pageNumber)}
                        >
                          Xem căn cứ
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-card p-5 text-center space-y-2">
            <p className="text-xs font-medium text-foreground">Bài báo chưa có bản phân tích hỗ trợ đọc hiểu.</p>
            <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
              Bạn không cần phân tích AI để gửi phiếu đánh giá độc lập. Nếu muốn xem tóm lược cấu trúc từ nguồn hiện có, nhấn nút “Phân tích hỗ trợ đọc” ở phía trên.
            </p>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* TAB 4: THÔNG TIN BÀI BÁO (PROVENANCE & BIBLIOGRAPHIC INFO)   */}
      {/* ============================================================ */}
      <div
        id={`${tabId}-panel-info`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-info`}
        hidden={activeTab !== "info"}
        className="space-y-3"
      >
        <div className="rounded-xl border border-border/80 bg-card p-4 space-y-4 text-xs">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{venueIsRepo ? "Kho lưu trữ (Repository)" : "Nơi công bố (Venue)"}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{paper.journalName || "Chưa có thông tin"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Nhà cung cấp siêu dữ liệu</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {detail?.bibliographic?.primaryProvider
                  ? detail.bibliographic.primaryProvider === "openalex"
                    ? "OpenAlex (siêu dữ liệu)"
                    : detail.bibliographic.primaryProvider
                  : paper.importSource || "Chưa rõ nguồn"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Loại tài liệu thư mục</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {formatPaperKindLabel(detail?.bibliographic?.paperKind ?? paper.paperKind)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ngôn ngữ & Năm xuất bản</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {(detail?.bibliographic?.language && detail.bibliographic.language !== "und"
                  ? detail.bibliographic.language.toUpperCase()
                  : "Chưa rõ ngôn ngữ")}{" "}
                · {paper.publicationYear || "Chưa rõ năm"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Trạng thái truy cập mở & Giấy phép</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {detail?.bibliographic?.openAccessStatus && detail.bibliographic.openAccessStatus !== "unknown"
                  ? `OA (${detail.bibliographic.openAccessStatus})`
                  : paper.openAccessStatus && paper.openAccessStatus !== "unknown"
                    ? `OA (${paper.openAccessStatus})`
                    : "Chưa xác định"}
                {" · "}
                {detail?.bibliographic?.licenseName || "Chưa rõ giấy phép"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Định danh học thuật</dt>
              <dd className="mt-0.5 space-y-0.5 font-mono text-[11px] text-foreground">
                {paper.doi ? <div>DOI: {paper.doi}</div> : null}
                {detail?.bibliographic?.openalexId ? <div>OpenAlex: {detail.bibliographic.openalexId}</div> : null}
                {detail?.bibliographic?.arxivId ? <div>arXiv: {detail.bibliographic.arxivId}</div> : null}
                {detail?.bibliographic?.pubmedId ? <div>PubMed: {detail.bibliographic.pubmedId}</div> : null}
                {!paper.doi && !detail?.bibliographic?.openalexId && !detail?.bibliographic?.arxivId ? (
                  <span className="font-sans text-muted-foreground">Chưa có định danh chuẩn</span>
                ) : null}
              </dd>
            </div>
          </dl>

          <div className="border-t border-border/70 pt-3">
            <dt className="text-muted-foreground">Tác giả ({effectiveAuthors.length})</dt>
            <dd className="mt-1 text-foreground leading-5">
              {effectiveAuthors.length ? effectiveAuthors.join(", ") : "Chưa có dữ liệu tác giả"}
            </dd>
          </div>

          {/* Contextual Citation & Metadata Completeness (De-emphasized during blind screening) */}
          <details open={!isBlindScreening} className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <summary className="cursor-pointer font-medium text-foreground">
              Bối cảnh trích dẫn & Độ đầy đủ siêu dữ liệu
              {isBlindScreening ? " (Thu gọn trong đánh giá mù)" : ""}
            </summary>
            <div className="mt-2.5 space-y-2 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground tabular-nums">
                <span>Lượt trích dẫn: <strong>{detail?.bibliographic?.citationCount ?? paper.citationCount ?? 0}</strong></span>
                {typeof detail?.bibliographic?.referencedWorksCount === "number" ? (
                  <span>Tài liệu tham khảo: <strong>{detail.bibliographic.referencedWorksCount}</strong></span>
                ) : null}
                {typeof detail?.bibliographic?.dataQualityScore === "number" && detail.bibliographic.dataQualityScore > 0 ? (
                  <span>Độ đầy đủ siêu dữ liệu: <strong>{Math.round(detail.bibliographic.dataQualityScore)}%</strong></span>
                ) : null}
              </div>
              <p className="leading-4.5">
                Lưu ý: Lượt trích dẫn và độ đầy đủ siêu dữ liệu chỉ là thông tin ngữ cảnh thư mục, không phải thước đo trực tiếp về giá trị khoa học hay mức độ phù hợp với dự án.
              </p>
            </div>
          </details>
        </div>
      </div>

      {/* Preserved Project Context: Notes, Proposal Reason, Legacy & Round History */}
      {extraFooter}
    </div>
  );
}

function UnderstandingField({ title, text }: { title: string; text?: string | null }) {
  return (
    <div className="p-3.5 space-y-1">
      <h5 className="text-xs font-semibold text-foreground">{title}</h5>
      {text?.trim() ? (
        <p className="text-xs leading-5 text-foreground/90 whitespace-pre-line">{text}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">Chưa đủ căn cứ từ nguồn hiện có.</p>
      )}
    </div>
  );
}

function UnderstandingList({
  title,
  items,
  emptyText = "Chưa đủ căn cứ từ nguồn hiện có.",
}: {
  title: string;
  items?: string[] | string | null;
  emptyText?: string;
}) {
  const normalized = Array.isArray(items)
    ? items.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : typeof items === "string" && items.trim().length > 0
      ? [items.trim()]
      : [];
  return (
    <div className="p-3.5 space-y-1.5">
      <h5 className="text-xs font-semibold text-foreground">{title}</h5>
      {normalized.length > 0 ? (
        <ul className="list-disc pl-4 space-y-1 text-xs leading-5 text-foreground/90">
          {normalized.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}
