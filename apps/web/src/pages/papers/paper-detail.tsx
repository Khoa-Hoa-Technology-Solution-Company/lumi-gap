import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Edit,
  ExternalLink,
  FileText,
  FolderPlus,
  Globe,
  Languages,
  Link2,
  Loader2,
  Quote,
  Scale,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddToProjectDropdown } from "@/features/projects/components/add-to-project-dropdown";
import {
  usePaper,
  usePaperReferences,
  usePaperRelatedWorks,
  useTranslatePaper,
  usePaperTranslationCapabilities,
} from "@/features/papers";
import { useSearch } from "@/features/search";
import { useBookmarkStatus, useCreateBookmark, useDeleteBookmark } from "@/features/bookmarks";
import { usePaperReportCount } from "@/features/reports/hooks/use-paper-report-count";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/services/api-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CompareDialog } from "@/features/compare";
import type { QualityView } from "@trend/shared-types";
import type { AxiosError } from "axios";
import { getExternalPdfUrl, getPaperPdfPanelState, shouldShowReadPdfAction } from "./paper-pdf-panel";
import { formatNumber } from "@/utils";
import { formatLanguageName } from "@/utils/language";

// Presentational subcomponents
import { PaperReadingSection } from "@/features/papers/components/paper-detail/paper-reading-section";
import { PaperResearchSignalsSection } from "@/features/papers/components/paper-detail/paper-research-signals-section";
import { PaperRelationshipsSection } from "@/features/papers/components/paper-detail/paper-relationships-section";
import { PaperMetadataSidebar } from "@/features/papers/components/paper-detail/paper-metadata-sidebar";

function getApiErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return (
    axiosError.response?.data?.error?.message ||
    (error instanceof Error ? error.message : undefined) ||
    fallback
  );
}

export function PaperDetailPage() {
  const { id } = useParams<{ id: string }>();
  const {
    data: paper,
    isLoading,
    isError: isPaperError,
    error: paperError,
    refetch,
  } = usePaper(id);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === "admin";
  const { data: bookmarkStatus } = useBookmarkStatus("paper", id, {
    enabled: Boolean(currentUser),
  });
  const createBookmark = useCreateBookmark();
  const deleteBookmark = useDeleteBookmark();
  const { data: reportCount, isLoading: isReportCountLoading } = usePaperReportCount(id);

  const {
    data: refResponse,
    isLoading: isRefsLoading,
    isError: isRefsError,
    refetch: refetchReferences,
  } = usePaperReferences(id);
  const references = refResponse?.references;
  const totalReferenced = refResponse?.totalReferenced;
  const inCorpus = refResponse?.inCorpus;

  const {
    data: openAlexRelatedResponse,
    isLoading: isOpenAlexRelatedLoading,
    isError: isOpenAlexRelatedError,
    refetch: refetchOpenAlexRelated,
  } = usePaperRelatedWorks(id);

  const queryClient = useQueryClient();
  const translatePaper = useTranslatePaper(id);
  const { data: translationCapabilities } = usePaperTranslationCapabilities();
  const [translationLanguage, setTranslationLanguage] = useState("vi");
  const [showTranslation, setShowTranslation] = useState(false);
  const [translatePopoverOpen, setTranslatePopoverOpen] = useState(false);

  useEffect(() => {
    const supported = translationCapabilities?.targetLanguages ?? [];
    const firstSupported = supported[0];
    if (firstSupported && !supported.includes(translationLanguage)) {
      setTranslationLanguage(firstSupported);
      setShowTranslation(false);
    }
  }, [translationCapabilities?.targetLanguages, translationLanguage]);

  useEffect(() => {
    const handleClickOutside = () => setTranslatePopoverOpen(false);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTranslatePopoverOpen(false);
    };
    if (translatePopoverOpen) {
      window.addEventListener("click", handleClickOutside);
      window.addEventListener("keydown", handleEscape);
    }
    return () => {
      window.removeEventListener("click", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [translatePopoverOpen]);

  const {
    data: relatedData,
    isLoading: isRelatedLoading,
    isError: isRelatedError,
    refetch: refetchRelated,
  } = useSearch(
    {
      q: paper?.title || "",
      pageSize: 5,
    },
    { enabled: Boolean(paper?.title) },
  );

  const relatedPapers = useMemo(() => {
    if (!relatedData?.papers) return [];
    return relatedData.papers.filter((candidate) => candidate.id !== id).slice(0, 4);
  }, [relatedData, id]);

  const translation =
    translatePaper.data?.paperId === paper?.id &&
    translatePaper.data?.targetLanguage === translationLanguage
      ? translatePaper.data
      : undefined;

  const [ratingView, setRatingView] = useState<QualityView | null>(null);
  const [ratingLoading, setRatingLoading] = useState(Boolean(currentUser));
  const [ratingError, setRatingError] = useState<string | null>(null);

  const fetchRatingView = async () => {
    setRatingLoading(true);
    setRatingError(null);
    try {
      const res = await api.get(`/quality/paper/${id}`);
      if (res.data.success) {
        setRatingView(res.data.data);
      }
    } catch (err) {
      console.error("Failed to fetch paper rating view:", err);
      setRatingError(getApiErrorMessage(err, "Ratings are temporarily unavailable."));
    } finally {
      setRatingLoading(false);
    }
  };

  const refreshRatingAndCurrentUser = async () => {
    await fetchRatingView();
    try {
      const response = await api.get("/auth/me");
      if (response.data.success) {
        useAuthStore.setState({ user: response.data.data.user });
        queryClient.setQueryData(["current-user"], response.data.data);
      }
    } catch {
      void queryClient.invalidateQueries({ queryKey: ["current-user"] });
    }
  };

  useEffect(() => {
    if (id && currentUser) void fetchRatingView();
    else setRatingLoading(false);
  }, [id, currentUser]);

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [deletingPdf, setDeletingPdf] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [showAllAuthors, setShowAllAuthors] = useState(false);

  const handleUploadPdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type === "application/pdf") {
        setUploadingPdf(true);
        toast.loading("Uploading PDF...", { id: "pdf-upload" });
        try {
          const formData = new FormData();
          formData.append("pdf", file);
          const response = await api.post(`/papers/${id}/upload-pdf`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          queryClient.setQueryData(["paper", id], response.data.data);
          void queryClient.invalidateQueries({ queryKey: ["papers"] });
          toast.success("PDF uploaded and this paper was rescored.", { id: "pdf-upload" });
        } catch (error) {
          console.error(error);
          toast.error(getApiErrorMessage(error, "Failed to upload PDF"), { id: "pdf-upload" });
        } finally {
          setUploadingPdf(false);
        }
      } else {
        toast.error("Only PDF files are allowed");
      }
    }
  };

  const handleDownloadPdf = async () => {
    const externalPdfUrl = paper ? getExternalPdfUrl(paper) : undefined;
    if (externalPdfUrl) {
      window.open(externalPdfUrl, "_blank", "noopener,noreferrer");
      toast.success("Opening Open Access PDF...");
      return;
    }

    const pdfWindow = window.open("about:blank", "_blank");
    if (!pdfWindow) {
      toast.error("Allow pop-ups for PaperLens before opening this PDF.");
      return;
    }
    pdfWindow.opener = null;
    setDownloading(true);
    try {
      const res = await api.get(`/papers/${id}/pdf-url`);
      const { downloadUrl, cost } = res.data.data;
      pdfWindow.location.replace(downloadUrl);
      if (cost > 0) {
        toast.success(`Downloaded PDF. Deducted ${cost} points.`);
        try {
          const resMe = await api.get("/auth/me");
          if (resMe.data.success) {
            useAuthStore.setState({ user: resMe.data.data.user });
            queryClient.setQueryData(["current-user"], resMe.data.data);
          }
        } catch (e) {
          queryClient.invalidateQueries({ queryKey: ["current-user"] });
        }
      } else {
        toast.success("Downloading PDF...");
      }
    } catch (error) {
      pdfWindow.close();
      console.error(error);
      toast.error(getApiErrorMessage(error, "Failed to load PDF"));
    } finally {
      setDownloading(false);
    }
  };

  const handleAcceptPdf = async () => {
    if (!confirm("Are you sure you want to approve this PDF?")) return;
    setAccepting(true);
    try {
      await api.patch(`/papers/${id}/accept-pdf`);
      toast.success("PDF accepted and sent to administrators for final review.");
      refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to approve PDF"));
    } finally {
      setAccepting(false);
    }
  };

  const handleRejectPdf = async () => {
    if (!confirm("Are you sure you want to reject this PDF? The file will be deleted and the uploader will lose points.")) return;
    setRejecting(true);
    try {
      await api.patch(`/papers/${id}/reject-pdf`);
      toast.success("PDF rejected and deleted.");
      refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to reject PDF"));
    } finally {
      setRejecting(false);
    }
  };

  const handleDeletePdf = async () => {
    if (!confirm("Are you sure you want to delete this PDF? This is an admin action.")) return;
    setDeletingPdf(true);
    try {
      await api.delete(`/papers/${id}/pdf`);
      toast.success("PDF deleted successfully.");
      refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to delete PDF"));
    } finally {
      setDeletingPdf(false);
    }
  };

  if (isLoading) {
    return <div className="container py-8 text-center text-slate-500 mt-20">Loading paper details...</div>;
  }

  if (isPaperError) {
    const message = (paperError as {
      response?: { status?: number; data?: { error?: { message?: string } } };
      message?: string;
    })?.response;
    const notFound = message?.status === 404;
    return (
      <div role="alert" className="container py-16 text-center mt-20">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {notFound ? "Paper not found" : "Paper details are unavailable"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {message?.data?.error?.message || (paperError as Error)?.message || "Please try again."}
        </p>
        {!notFound && (
          <Button className="mt-5" variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (!paper) {
    return <div className="container py-8 text-center text-slate-500 mt-20">Paper not found.</div>;
  }

  const isBookmarked = !!bookmarkStatus?.bookmarked;
  const bookmarkId = bookmarkStatus?.bookmarkId;

  const pdfPanel = getPaperPdfPanelState({ paper, currentUser });
  const isRequester = pdfPanel.isRequester;
  const canAcceptPdf = pdfPanel.canAcceptPdf;
  const isPrivateDownload = pdfPanel.isPrivateDownload;
  const canDownloadPdf = pdfPanel.canDownloadPdf;
  const canUploadPdf = pdfPanel.canUploadPdf;
  const shouldShowPdfPanel = pdfPanel.shouldShowPanel;
  const showReadPdfAction = shouldShowReadPdfAction(paper, canDownloadPdf);
  const displayPaperStatus =
    paper.paperStatus ?? (paper.pdfPath || pdfPanel.isExternalPdf ? "downloaded" : "not-downloaded");
  const visibleAuthors = showAllAuthors ? paper.authors : paper.authors.slice(0, 8);

  const displayTitle = showTranslation && translation ? translation.translatedTitle : paper.title;
  const displayAbstract = showTranslation && translation
    ? translation.translatedAbstract
    : paper.abstractText;

  const handleTranslate = () => {
    translatePaper.mutate(translationLanguage, {
      onSuccess: () => setShowTranslation(true),
      onError: (error) => {
        toast.error(getApiErrorMessage(error, "Paper translation failed. Please try again."));
      },
    });
  };

  const handleBookmarkToggle = () => {
    if (!currentUser) {
      toast.error("Sign in to save papers.");
      return;
    }
    if (isBookmarked && bookmarkId) {
      deleteBookmark.mutate({ id: bookmarkId, targetKind: "paper", targetId: id! });
    } else {
      createBookmark.mutate({ targetKind: "paper", targetId: id! });
    }
  };

  const handleCopyCitation = () => {
    if (!paper) return;
    const authorString = paper.authors.length > 0
      ? paper.authors.map(a => a.displayName).join(", ")
      : "Unknown Author";
    const titleString = paper.title.endsWith(".") ? paper.title : `${paper.title}.`;
    const journalString = paper.journalName ? `${paper.journalName}` : "";
    const doi = paper.externalIds?.doi?.replace(/^https?:\/\/doi\.org\//i, "");
    const citation = `${authorString} (${paper.publicationYear || "n.d."}). ${titleString}${journalString ? ` ${journalString}.` : ""}${doi ? ` https://doi.org/${doi}` : ""}`;

    navigator.clipboard.writeText(citation).then(
      () => {
        toast.success("Citation copied to clipboard.");
      },
      () => {
        toast.error("Could not copy citation.");
      }
    );
  };

  return (
    <main
      className="container py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      data-testid="paper-detail-page"
    >
      {/* Breadcrumb */}
      <div className="flex items-center text-xs font-medium text-slate-500 mb-6">
        <span className="hover:text-slate-900 cursor-pointer">Publication Trend</span>
        <ChevronRight className="w-3 h-3 mx-1" />
        <span className="text-slate-900 dark:text-white">Paper Detail</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Column */}
        <div className="flex min-w-0 flex-1 flex-col space-y-10">

          {/* Section A: Paper Identity and Actions */}
          <div className="space-y-6">
            <div>
              <h1
                className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight mb-4"
                data-testid="paper-detail-title"
              >
                {displayTitle}
              </h1>

              {/* Metadata Strip */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium mb-5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                  displayPaperStatus === "pending"
                    ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                    : displayPaperStatus === "not-downloaded"
                      ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
                      : displayPaperStatus === "downloaded"
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                        : displayPaperStatus === "rejected"
                          ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
                          : "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20"
                }`}>
                  {displayPaperStatus === "pending"
                    ? "Pending Review"
                    : displayPaperStatus === "not-downloaded"
                      ? "Awaiting PDF"
                      : displayPaperStatus === "downloaded"
                        ? "Completed"
                        : displayPaperStatus === "rejected"
                          ? "Rejected"
                          : "Awaiting Acceptance"}
                </span>

                {paper.openAccessUrl && (
                  <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Open Access
                  </span>
                )}

                {paper.journalName && (
                  <>
                    <span className="text-slate-700 dark:text-slate-300 font-semibold">{paper.journalName}</span>
                    <span className="text-slate-400">•</span>
                  </>
                )}

                <span className="text-slate-500">Published {paper.publicationYear}</span>

                {paper.externalIds?.doi && (
                  <>
                    <span className="text-slate-400">•</span>
                    <a
                      href={`https://doi.org/${paper.externalIds.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 font-mono"
                    >
                      DOI {paper.externalIds.doi} <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </div>

              {/* Authors List */}
              <div className="mb-6">
                <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Authors ({paper.authors.length})
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {visibleAuthors.map((author, idx) => (
                    <div
                      key={`${author.displayName}-${idx}`}
                      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-zinc-950/40"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-white dark:border-slate-900 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-400">
                        {author.displayName.charAt(0)}
                      </div>
                      <span className="text-xs font-semibold text-blue-800 dark:text-blue-400">
                        {author.displayName}
                      </span>
                    </div>
                  ))}
                  {paper.authors.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setShowAllAuthors((v) => !v)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-zinc-900 dark:text-slate-300 dark:hover:border-blue-900/60 dark:hover:bg-blue-950/20 dark:hover:text-blue-300 min-h-[36px]"
                    >
                      {showAllAuthors ? "Show fewer authors" : `Show all ${paper.authors.length} authors`}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Action Bar (Responsive Touch Targets >= 44px) */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-6 gap-4">
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 overflow-x-auto max-w-full pb-1 sm:pb-0">
                {showReadPdfAction ? (
                  <Button
                    data-testid="paper-pdf-action"
                    className="bg-blue-800 hover:bg-blue-900 text-white font-bold h-11 px-5 gap-2 rounded-xl min-h-[44px]"
                    onClick={handleDownloadPdf}
                    disabled={downloading}
                  >
                    {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    Read PDF
                  </Button>
                ) : null}

                {currentUser && (
                  <Button
                    variant={isBookmarked ? "default" : "outline"}
                    className={`h-11 px-4 gap-2 font-bold rounded-xl min-h-[44px] ${
                      isBookmarked
                        ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 hover:border-amber-600"
                        : "text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700"
                    }`}
                    onClick={handleBookmarkToggle}
                    disabled={createBookmark.isPending || deleteBookmark.isPending}
                  >
                    <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`} />
                    {isBookmarked ? "Saved" : "Save"}
                  </Button>
                )}

                {currentUser && (
                  <AddToProjectDropdown paperId={id!}>
                    <Button
                      variant="outline"
                      className="h-11 px-4 gap-2 font-bold rounded-xl text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 min-h-[44px]"
                    >
                      <FolderPlus className="w-4 h-4" />
                      Add to Project
                    </Button>
                  </AddToProjectDropdown>
                )}

                <Button
                  variant="outline"
                  className="h-11 px-4 gap-2 text-slate-700 dark:text-slate-300 font-bold border-slate-200/80 dark:border-slate-700 rounded-xl min-h-[44px]"
                  onClick={handleCopyCitation}
                >
                  <Quote className="w-4 h-4" /> Cite
                </Button>

                {currentUser && (
                  <Button
                    variant="outline"
                    className="h-11 px-4 gap-2 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 font-bold rounded-xl min-h-[44px]"
                    onClick={() => setCompareOpen(true)}
                  >
                    <Scale className="w-4 h-4" /> Compare
                  </Button>
                )}

                <div className="relative inline-block">
                  <Button
                    data-testid="paper-translate-menu"
                    variant={showTranslation ? "default" : "outline"}
                    className={`h-11 px-4 gap-2 font-bold rounded-xl min-h-[44px] ${
                      showTranslation
                        ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                        : "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTranslatePopoverOpen(!translatePopoverOpen);
                    }}
                    title="Translate this paper"
                    aria-label="Translate this paper"
                    aria-expanded={translatePopoverOpen}
                    aria-haspopup="dialog"
                    aria-controls="paper-translation-menu"
                  >
                    <Globe className="w-4 h-4 text-blue-500" />
                    <span>{showTranslation ? "View original" : "Translate"}</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  </Button>

                  {translatePopoverOpen && (
                    <div
                      id="paper-translation-menu"
                      role="dialog"
                      aria-label="Translate paper"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 mt-2 w-64 p-3.5 bg-white dark:bg-[#181818] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                    >
                      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100 dark:border-slate-800">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          Translate paper
                        </span>
                        {showTranslation && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label
                            htmlFor="action-target-language"
                            className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1"
                          >
                            Target Language
                          </label>
                          <select
                            id="action-target-language"
                            value={translationLanguage}
                            onChange={(e) => {
                              setTranslationLanguage(e.target.value);
                              setShowTranslation(false);
                            }}
                            className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-zinc-900 px-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                          >
                            {(translationCapabilities?.targetLanguages ?? []).map((code) => (
                              <option key={code} value={code}>
                                {formatLanguageName(code)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {!currentUser || translationCapabilities?.enabled !== true ? (
                          <Button
                            type="button"
                            disabled
                            className="w-full h-8 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-0 cursor-not-allowed"
                            title={
                              !currentUser
                                ? "Sign in to translate this paper"
                                : translationCapabilities?.message || "Translation unavailable in this deployment"
                            }
                          >
                            Translate
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => {
                              handleTranslate();
                              setTranslatePopoverOpen(false);
                            }}
                            disabled={translatePaper.isPending}
                            className="w-full h-8 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                          >
                            {translatePaper.isPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Languages className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {translatePaper.isPending ? "Translating..." : "Translate"}
                          </Button>
                        )}

                        {!!translation && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowTranslation((curr: boolean) => !curr);
                              setTranslatePopoverOpen(false);
                            }}
                            className="w-full h-7 text-xs font-bold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                          >
                            {showTranslation ? "View original" : "Show translation"}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Citation count non-interactive fact */}
              <div className="flex items-center gap-1.5 text-slate-500 font-semibold text-xs shrink-0">
                <Link2 className="w-4 h-4 text-slate-400" />
                <span>{formatNumber(paper.citationCount)} Citations</span>
              </div>
            </div>
          </div>

          {/* Section B: Read the Paper */}
          <PaperReadingSection
            paper={paper}
            displayAbstract={displayAbstract}
            showTranslation={showTranslation}
            translationLanguage={translationLanguage}
            translationSourceLanguage={translation?.sourceLanguage ?? paper.language}
            translationProvider={translation?.provider || "AI Translator"}
            onToggleTranslation={() => setShowTranslation((curr) => !curr)}
          />

          {/* Section C: Understand the Paper (Research Signals & Review) */}
          <PaperResearchSignalsSection
            paper={paper}
            currentUser={currentUser}
          />

          {/* Section D: Evidence and Relationships */}
          <PaperRelationshipsSection
            paper={paper}
            references={references}
            totalReferenced={totalReferenced}
            inCorpusReferences={inCorpus}
            isRefsLoading={isRefsLoading}
            isRefsError={isRefsError}
            onRetryReferences={() => void refetchReferences()}
            openAlexRelatedResponse={openAlexRelatedResponse}
            isOpenAlexRelatedLoading={isOpenAlexRelatedLoading}
            isOpenAlexRelatedError={isOpenAlexRelatedError}
            onRetryOpenAlexRelated={() => void refetchOpenAlexRelated()}
            relatedPapers={relatedPapers}
            isRelatedLoading={isRelatedLoading}
            isRelatedError={isRelatedError}
            onRetryRelated={() => void refetchRelated()}
          />

          {/* Section E: Operational PDF Workflow */}
          {shouldShowPdfPanel && (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#11161F] space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                {pdfPanel.mode === "upload"
                  ? "Submit internal PDF"
                  : pdfPanel.isExternalPdf
                    ? "Open Access full-text PDF"
                    : "Internal full-text PDF"}
              </h3>

              {pdfPanel.isExternalPdf ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900/40 dark:bg-emerald-950/15">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 shrink-0 text-emerald-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          PDF is available for reading
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Hosted by an external Open Access repository
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Free external access
                    </span>
                  </div>
                  <Button
                    onClick={handleDownloadPdf}
                    className="h-10 gap-2 rounded-lg bg-indigo-600 px-5 font-bold text-white hover:bg-indigo-700 min-h-[44px]"
                  >
                    <FileText className="h-4 w-4" />
                    Read PDF
                  </Button>
                </div>
              ) : paper.pdfPath ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/20">
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-rose-500 shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">
                          {paper.paperStatus === "downloaded"
                            ? "PDF is available for download"
                            : paper.paperStatus === "pending"
                              ? "PDF is awaiting admin approval"
                              : "PDF is awaiting requester acceptance"}
                        </p>
                        {paper.uploadedBy && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Uploaded by: <strong>{paper.uploadedBy.fullName}</strong>
                            {paper.uploadedBy.university && ` (${paper.uploadedBy.university})`}
                          </p>
                        )}
                      </div>
                    </div>

                    {paper.paperStatus === "downloaded" && (
                      <div className="text-xs text-slate-500 sm:text-right shrink-0">
                        {isPrivateDownload ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Free (Owner/Admin)</span>
                        ) : (
                          <span>Download Cost: <strong className="text-indigo-600 dark:text-indigo-400">{paper.downloadCost ?? 0} credits</strong></span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {paper.paperStatus === "rejected" && isRequester && (
                      <Link to={`/settings/submit-paper?edit=${id}`}>
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-5 gap-2 rounded-lg min-h-[44px]">
                          <Edit className="w-4 h-4" />
                          Edit & Resubmit
                        </Button>
                      </Link>
                    )}

                    {canDownloadPdf && (
                      <Button
                        onClick={handleDownloadPdf}
                        disabled={downloading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-5 gap-2 rounded-lg min-h-[44px]"
                      >
                        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Download PDF
                      </Button>
                    )}

                    {canAcceptPdf && (
                      <>
                        <Button
                          onClick={handleAcceptPdf}
                          disabled={accepting}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-5 gap-2 rounded-lg min-h-[44px]"
                        >
                          {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Accept PDF
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleRejectPdf}
                          disabled={rejecting}
                          className="text-red-600 hover:bg-red-50 border-red-200 dark:border-red-900/50 dark:hover:bg-red-950/20 font-bold h-10 px-5 gap-2 rounded-lg min-h-[44px]"
                        >
                          {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                          Reject PDF
                        </Button>
                      </>
                    )}

                    {isAdmin && (
                      <Button
                        variant="outline"
                        onClick={handleDeletePdf}
                        disabled={deletingPdf}
                        className="text-red-600 border-red-200 dark:border-red-900/50 dark:hover:bg-red-950/20 font-bold h-10 px-5 gap-2 rounded-lg min-h-[44px]"
                      >
                        {deletingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Delete PDF
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl p-8 text-center bg-slate-50/30 dark:bg-zinc-900/10">
                  <p className="text-slate-500 dark:text-zinc-500 text-sm mb-4">
                    {pdfPanel.mode === "pending-approval"
                      ? "This paper request is waiting for admin approval. PDF upload unlocks after approval."
                      : "No internal PDF has been uploaded for this paper yet."}
                  </p>

                  {canUploadPdf && (
                    <div className="max-w-md mx-auto">
                      <label
                        htmlFor="pdf-upload"
                        className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-400/50 rounded-lg p-6 bg-white dark:bg-zinc-950 cursor-pointer transition-all group"
                      >
                        <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mb-2 transition-colors" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Upload internal PDF</span>
                        <span className="text-xs text-slate-500 mt-1">PDF only (Max 10MB)</span>
                        <input id="pdf-upload" type="file" accept="application/pdf" className="hidden" onChange={handleUploadPdfChange} />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar Facts Rail */}
        <PaperMetadataSidebar
          paper={paper}
          reportCount={reportCount}
          isReportCountLoading={isReportCountLoading}
          currentUser={currentUser}
          ratingView={ratingView}
          ratingLoading={ratingLoading}
          ratingError={ratingError}
          onRefreshRatingView={refreshRatingAndCurrentUser}
        />
      </div>

      {currentUser && (
        <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} currentPaper={paper} />
      )}
    </main>
  );
}
