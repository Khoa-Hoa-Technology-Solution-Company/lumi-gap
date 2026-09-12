import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/services/api-client";
import { toast } from "sonner";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  User,
  Calendar,
  CheckSquare,
  Square,
  AlertCircle,
  Filter,
  Sparkles,
  RotateCcw,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/features/auth";
import { cn } from "@/utils/cn";
import { formatNumber, formatQualityTierName } from "@/utils";
import { formatPaperRequester, type PaperRequesterValue } from "@/features/admin/utils/paper-request";
import { useI18n } from "@/i18n";

interface AdminPaper {
  id: string;
  title: string;
  paperStatus: string;
  dataStatus: string;
  publicationYear: number;
  paperKind?: string;
  externalIds?: { doi?: string };
  qualityScore?: number;
  qualityTier?: number;
  qualityTierName?: string;
  downloadCost?: number | null;
  uploadCreditReward?: number;
  pdfPath?: string;
  requestedBy?: PaperRequesterValue;
  uploadedAt?: string;
  updatedAt?: string;
  createdAt: string;
}

const STATUS_OPTIONS = ["all", "pending", "not-downloaded", "downloaded", "rejected", "pending-requester-acceptance"];
const STATUS_LABELS: Record<string, string> = {
  all: "All Statuses",
  pending: "Pending Review",
  "not-downloaded": "Approved (No PDF)",
  downloaded: "Completed",
  rejected: "Rejected",
  "pending-requester-acceptance": "Awaiting Acceptance",
};

const STATUS_BADGES: Record<string, { label: string; class: string }> = {
  pending: {
    label: "Pending",
    class: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400",
  },
  "not-downloaded": {
    label: "Approved",
    class: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400",
  },
  downloaded: {
    label: "Completed",
    class: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  rejected: {
    label: "Rejected",
    class: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400",
  },
  "pending-requester-acceptance": {
    label: "Awaiting Acceptance",
    class: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/40 dark:text-purple-400",
  },
};

const REJECTION_PRESETS = [
  "Duplicate DOI or paper already exists",
  "Invalid or broken publication DOI link",
  "Low data quality / non-academic metadata",
  "Copyright or restricted access limitations",
];

const PAGE_SIZE = 15;

export function AdminPapersPage() {
  const { t } = useI18n();
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const isAdmin = user?.user?.role === "admin";

  const [papers, setPapers] = useState<AdminPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"normal" | "pdf">("normal");
  const [total, setTotal] = useState(0);
  const [normalTotal, setNormalTotal] = useState(0);
  const [pdfTotal, setPdfTotal] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Rejection & selection state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchPapers = async () => {
    if (isUserLoading || !isAdmin) return;
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        adminView: "1",
        kind: activeTab,
        page,
        pageSize: PAGE_SIZE,
      };
      if (statusFilter !== "all") params.status = statusFilter;
      if (search) params.search = search;
      const res = await api.get("/papers", { params });
      setPapers(res.data.data ?? []);
      setTotal(res.data.meta?.total ?? 0);
      setNormalTotal(res.data.meta?.normalTotal ?? 0);
      setPdfTotal(res.data.meta?.pdfTotal ?? 0);
      setSelectedIds([]);
    } catch {
      toast.error("Failed to load paper submission requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isUserLoading && isAdmin) {
      fetchPapers();
    } else if (!isUserLoading && !isAdmin) {
      setLoading(false);
    }
  }, [statusFilter, search, activeTab, page, isUserLoading, isAdmin]);

  const updateStatus = async (paperId: string, status: string, rejectionReason?: string) => {
    setUpdatingId(paperId);
    try {
      const response = await api.patch(`/papers/${paperId}/status`, { status, rejectionReason });
      const resultingStatus = response.data.data?.paperStatus;
      toast.success(
        status === "rejected" && resultingStatus === "not-downloaded"
          ? "PDF contribution rejected. The paper remains public and awaits another PDF."
          : `Paper request ${status === "rejected" ? "rejected" : "approved"}.`,
      );
      fetchPapers();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message ?? "Failed to update paper status");
    } finally {
      setUpdatingId(null);
      setRejectingId(null);
      setRejectReason("");
    }
  };

  // Bulk actions
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(papers.map((p) => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkProcessing(true);
    try {
      await Promise.all(selectedIds.map((id) => api.patch(`/papers/${id}/status`, { status: "not-downloaded" })));
      toast.success(`Approved ${selectedIds.length} selected paper requests.`);
      fetchPapers();
    } catch {
      toast.error("Some requests failed to approve.");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleViewPdf = async (paperId: string) => {
    try {
      const res = await api.get(`/papers/${paperId}/pdf-url`);
      const { downloadUrl } = res.data.data;
      window.open(downloadUrl, "_blank");
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message ?? "Failed to get PDF URL");
    }
  };

  const pendingCount = papers.filter((p) => p.paperStatus === "pending").length;
  const isAllSelected = papers.length > 0 && selectedIds.length === papers.length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto select-none">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t("Paper Requests")}</h1>
            {total > 0 && (
              <Badge variant="secondary" className="font-mono text-xs px-2.5 py-0.5 rounded-full">
                {formatNumber(total)} {t("total")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            {t("Review, approve, or reject user-submitted literature indexing requests.")}
          </p>
        </div>

        {/* Action / Refresh */}
        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="h-9 bg-blue-700 text-xs font-bold text-white hover:bg-blue-800">
            <Link to="/admin/papers/new">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("Add Paper")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchPapers} disabled={loading} className="h-9 text-xs">
            <RotateCcw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#121212] p-3 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 shadow-xs">
        <div className="flex flex-1 items-center gap-3 flex-wrap sm:flex-nowrap">
          {/* Checkbox Select All */}
          <button
            onClick={() => handleSelectAll(!isAllSelected)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {isAllSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span className="hidden sm:inline">Select All</span>
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-zinc-800 hidden sm:block" />

          {/* Search input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t("Search by title or DOI...")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearch(searchInput);
                  setPage(1);
                }
              }}
              className="pl-9 pr-3 h-9 w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-zinc-950 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 pl-3 pr-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {t(STATUS_LABELS[s] ?? s)}
                </option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            className="h-9 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => {
              setSearch(searchInput);
              setPage(1);
            }}
          >
            Search
          </Button>
        </div>
      </div>

      {/* Main List Section */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-xs font-medium">Loading submission requests...</p>
        </div>
      ) : papers.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/20 space-y-3">
          <FileText className="w-10 h-10 text-slate-300 dark:text-zinc-700 mx-auto" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No paper requests found.</p>
          <p className="text-xs text-slate-400">Try adjusting your search query or status filter.</p>
        </div>
      ) : (() => {
        const normalPapers = papers.filter((p) => !p.pdfPath);
        const pdfPapers = papers
          .filter((p) => !!p.pdfPath)
          .sort((a, b) => {
            const uploadedA = new Date(a.uploadedAt ?? a.updatedAt ?? a.createdAt).getTime();
            const uploadedB = new Date(b.uploadedAt ?? b.updatedAt ?? b.createdAt).getTime();
            return uploadedB - uploadedA;
          });
        const currentList = activeTab === "normal" ? normalPapers : pdfPapers;

        const renderPaper = (paper: AdminPaper) => {
          const statusConfig = STATUS_BADGES[paper.paperStatus] ?? {
              label: paper.paperStatus,
              class: "border-slate-200 bg-slate-50 text-slate-700",
            };
            const isSelected = selectedIds.includes(paper.id);
            const isPending = paper.paperStatus === "pending";
            const isRejecting = rejectingId === paper.id;
            const isUpdating = updatingId === paper.id;

            return (
              <div
                key={paper.id}
                className={cn(
                  "relative rounded-xl border bg-white dark:bg-[#11161F] p-4 transition-all duration-200 shadow-xs space-y-3",
                  isSelected
                    ? "border-blue-500/80 bg-blue-50/20 dark:border-blue-600/60 dark:bg-blue-950/10"
                    : "border-slate-200/80 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700"
                )}
              >
                {/* Header Row: Checkbox + Title + Status + Action Group */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleSelect(paper.id)}
                      className="mt-0.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      aria-label="Select paper request"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/papers/${paper.id}`}
                          className="font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-1"
                        >
                          {paper.title}
                        </Link>
                        {paper.externalIds?.doi && (
                          <a
                            href={`https://doi.org/${paper.externalIds.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-100 dark:bg-zinc-900 px-2 py-0.5 rounded border border-slate-200/60 dark:border-zinc-800 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {paper.externalIds.doi}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      {/* Metadata Row */}
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap font-medium">
                        <span>Year: <strong>{paper.publicationYear}</strong></span>
                        {formatPaperRequester(paper.requestedBy) && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            {formatPaperRequester(paper.requestedBy)}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Calendar className="w-3 h-3" />
                          {new Date(paper.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Top-Right Status & Ergonomic Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full", statusConfig.class)}>
                      {statusConfig.label}
                    </Badge>

                    {paper.pdfPath && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          handleViewPdf(paper.id);
                        }}
                        className="h-8 px-3 text-xs font-semibold text-blue-600 border-blue-200/80 hover:bg-blue-50 dark:border-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-950/30 ml-2"
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" />
                        View PDF
                      </Button>
                    )}

                    {/* Pending Action Buttons */}
                    {isPending && !isRejecting && (
                      <div className="flex items-center gap-1.5 ml-2">
                        <Button
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => updateStatus(paper.id, "not-downloaded")}
                          className="h-8 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                        >
                          {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdating}
                          onClick={() => {
                            setRejectingId(paper.id);
                            setRejectReason("");
                          }}
                          className="h-8 px-3 text-xs font-semibold text-rose-600 border-rose-200/80 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}

                    {/* Revoke Action */}
                    {(paper.paperStatus === "not-downloaded" || paper.paperStatus === "downloaded") && !isRejecting && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isUpdating}
                        onClick={() => {
                          setRejectingId(paper.id);
                          setRejectReason("");
                        }}
                        className="h-8 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 ml-1"
                      >
                        Revoke Approval
                      </Button>
                    )}
                  </div>
                </div>

                {/* Quality Metrics Pill */}
                {paper.qualityScore !== undefined && paper.qualityScore > 0 && (
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-zinc-800/60">
                    <span>
                      Quality Score: <strong className="text-blue-600 dark:text-blue-400">{paper.qualityScore}/100</strong>
                    </span>
                    {paper.qualityTierName && <span>· Tier: <strong>{formatQualityTierName(paper.qualityTier, paper.qualityTierName)}</strong></span>}
                    {paper.downloadCost != null && <span>· Cost: <strong>{paper.downloadCost} credits</strong></span>}
                    {paper.uploadCreditReward !== undefined && (
                      <span>
                        · Reward: <strong className="text-emerald-600 dark:text-emerald-400">+{paper.uploadCreditReward} credits</strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Inline Ergonomic Rejection Drawer */}
                {isRejecting && (
                  <div className="mt-3 rounded-xl border border-rose-200/80 bg-rose-50/40 p-3.5 dark:border-rose-900/50 dark:bg-rose-950/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-900 dark:text-rose-300 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        Specify Rejection Reason
                      </span>
                      <button
                        onClick={() => setRejectingId(null)}
                        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Presets */}
                    <div className="flex flex-wrap gap-1.5">
                      {REJECTION_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setRejectReason(preset)}
                          className={cn(
                            "text-[11px] px-2.5 py-1 rounded-lg border transition-colors text-left",
                            rejectReason === preset
                              ? "bg-rose-600 text-white border-rose-600 font-bold"
                              : "bg-white dark:bg-zinc-900 border-rose-200/60 dark:border-rose-900/40 text-slate-700 dark:text-slate-300 hover:bg-rose-100/50"
                          )}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    {/* Custom Reason Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Enter custom rejection detail (min 5 chars)..."
                        className="flex-1 h-8 px-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-zinc-950 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                      <Button
                        size="sm"
                        disabled={isUpdating || rejectReason.trim().length < 5}
                        onClick={() => updateStatus(paper.id, "rejected", rejectReason.trim())}
                        className="h-8 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shrink-0"
                      >
                        {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm Reject"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
        };

        return (
          <div className="space-y-6">
            {/* Pill Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab("normal");
                  setPage(1);
                }}
                className={cn(
                  "px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                  activeTab === "normal"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "bg-white dark:bg-[#11161F] border border-slate-200/80 dark:border-zinc-800/80 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-zinc-700"
                )}
              >
                <span>Normal Paper Requests</span>
                <span className={cn("px-2 py-0.5 rounded-full text-xs", activeTab === "normal" ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400")}>{normalTotal}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("pdf");
                  setPage(1);
                }}
                className={cn(
                  "px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                  activeTab === "pdf"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                    : "bg-white dark:bg-[#11161F] border border-slate-200/80 dark:border-zinc-800/80 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-zinc-700"
                )}
              >
                <span>PDF Upload Requests</span>
                <span className={cn("px-2 py-0.5 rounded-full text-xs", activeTab === "pdf" ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400")}>{pdfTotal}</span>
              </button>
            </div>

            {/* Content List */}
            {currentList.length === 0 ? (
              <div className="text-center py-16 text-xs text-slate-400 border border-dashed rounded-xl border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/20">
                No requests found in this section.
              </div>
            ) : (
              <div className="space-y-3">
                {currentList.map(renderPaper)}
              </div>
            )}
          </div>
        );
      })()}

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white dark:bg-zinc-900 dark:text-white px-4 py-2.5 rounded-2xl shadow-xl border border-slate-800 dark:border-zinc-700 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-xs font-bold">
            {selectedIds.length} item{selectedIds.length > 1 ? "s" : ""} selected
          </span>
          <div className="h-4 w-px bg-slate-700" />
          <Button
            size="sm"
            disabled={isBulkProcessing}
            onClick={handleBulkApprove}
            className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
          >
            {isBulkProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
            Approve All
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds([])}
            className="h-7 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
          >
            Clear
          </Button>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200/80 dark:border-zinc-800/80">
          <p className="text-xs text-slate-500 font-medium">
            Showing {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, total))} of{" "}
            {formatNumber(total)} requests
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-bold px-3 py-1 border rounded-lg dark:border-zinc-800 bg-white dark:bg-zinc-900">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
