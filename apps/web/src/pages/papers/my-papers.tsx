import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit,
  ExternalLink,
  FileText,
  Info,
  Plus,
  Search,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { isAdminSystemRole } from "@trend/shared-types";
import { confirmAction } from "@/services/confirmation";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants/api";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionEmptyState, SectionErrorState, SkeletonList } from "@/components/loading";
import { formatQualityTierName } from "@/utils";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import { SettingsPageHeader } from "@/features/settings/components/settings-primitives";

interface MyPaper {
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
  createdAt: string;
  rejectionReason?: string;
}

type StatusFilter = "all" | "pending" | "not-downloaded" | "downloaded" | "rejected";
type SortKey = "newest" | "year" | "title";

const PAGE_SIZE = 10;

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string; icon: typeof Clock }> = {
  pending: {
    label: "Pending Review",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: Clock,
  },
  "not-downloaded": {
    label: "Approved – Awaiting PDF",
    badgeClass: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    icon: Upload,
  },
  downloaded: {
    label: "Completed",
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    badgeClass: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: XCircle,
  },
  "pending-requester-acceptance": {
    label: "PDF Awaiting Acceptance",
    badgeClass: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    icon: AlertCircle,
  },
};

export function MyPapersPage({ isEmbedded = false }: { isEmbedded?: boolean } = {}) {
  const { t, language } = useI18n();
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminSystemRole(user?.systemRole);

  const [papers, setPapers] = useState<MyPaper[]>([]);
  const [loading, setLoading] = useState(!isAdmin);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);

  const fetchMyPapers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get("/papers/my-requests");
      setPapers(res.data.data ?? []);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) void fetchMyPapers();
  }, [isAdmin, fetchMyPapers]);

  useEffect(() => setPage(1), [search, statusFilter, sortBy]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    const list = papers.filter((paper) => {
      if (statusFilter !== "all" && paper.paperStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        paper.title.toLocaleLowerCase().includes(q) ||
        (paper.externalIds?.doi ?? "").toLocaleLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      if (sortBy === "year") return (b.publicationYear || 0) - (a.publicationYear || 0);
      if (sortBy === "title") return a.title.localeCompare(b.title, language);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [papers, search, statusFilter, sortBy, language]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <SectionErrorState
          error={{ response: { status: 403 } }}
          title={t("Access Denied")}
          description={t("Admins do not have a My Papers section.")}
        />
      </main>
    );
  }

  const handleDelete = async (paperId: string) => {
    if (!(await confirmAction({ kind: "withdraw", description: "Are you sure you want to withdraw this submission?" }))) {
      return;
    }
    setCancelling(paperId);
    try {
      await api.delete(API_ROUTES.papers.cancel(paperId));
      toast.success(t("Submission withdrawn successfully."));
      setPapers((prev) => prev.filter((p) => p.id !== paperId));
    } catch (error) {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? t("Failed to withdraw submission"));
    } finally {
      setCancelling(null);
    }
  };

  const handleDownloadPdf = async (paperId: string) => {
    setDownloadingId(paperId);
    try {
      const res = await api.get(`/papers/${paperId}/pdf-url`);
      const { downloadUrl, cost } = res.data.data;
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      if (cost > 0) toast.info(`${cost} ${t("credits deducted for this download.")}`);
    } catch (error) {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? t("Failed to get download URL"));
    } finally {
      setDownloadingId(null);
    }
  };

  const submitLink = "/settings/submit-paper";

  const statusTabs: Array<{ value: StatusFilter; labelKey: string }> = [
    { value: "all", labelKey: "settings.works.filterAll" },
    { value: "pending", labelKey: "settings.works.filterPending" },
    { value: "not-downloaded", labelKey: "settings.works.filterApproved" },
    { value: "downloaded", labelKey: "settings.works.filterCompleted" },
    { value: "rejected", labelKey: "settings.works.filterRejected" },
  ];

  const body = (
    <div className="space-y-5" data-no-i18n>
      <SettingsPageHeader
        title={t("settings.works.title")}
        description={t("settings.works.subtitle")}
        action={
          <Button asChild size="sm" className="gap-1.5">
            <Link to={submitLink}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t("settings.works.submitCta")}</span>
            </Link>
          </Button>
        }
      />

      {/* Transparent academic disclaimer */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-muted/25 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>{t("settings.works.statusDisclaimer")}</p>
      </div>

      {/* Search, Filter & Sort Toolbar */}
      {papers.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("settings.works.searchPlaceholder")}
                className="h-10 pl-9"
              />
            </div>

            <select
              aria-label={t("Sort by:")}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="newest">{t("settings.works.sortNewest")}</option>
              <option value="year">{t("settings.works.sortYear")}</option>
              <option value="title">{t("settings.works.sortTitle")}</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Filter works")}>
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={statusFilter === tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === tab.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Content */}
      {loading ? (
        <SkeletonList items={4} />
      ) : loadError ? (
        <SectionErrorState compact error={loadError} onRetry={() => void fetchMyPapers()} />
      ) : papers.length === 0 ? (
        <SectionEmptyState
          icon={<FileText className="h-9 w-9 text-muted-foreground/60" aria-hidden="true" />}
          title={t("No submissions yet.")}
          description={t("Submit your first research paper to get started.")}
          action={
            <Button asChild size="sm" className="gap-1.5">
              <Link to={submitLink}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{t("settings.works.submitCta")}</span>
              </Link>
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <SectionEmptyState
          title={t("settings.works.emptyFiltered")}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              {t("settings.works.clearFilters")}
            </Button>
          }
        />
      ) : (
        <>
          <div className="divide-y divide-border/70 rounded-xl border border-border/85">
            {paginated.map((paper) => {
              const statusCfg = STATUS_CONFIG[paper.paperStatus] ?? STATUS_CONFIG.pending!;
              const StatusIcon = statusCfg.icon;
              return (
                <article key={paper.id} className="space-y-3 bg-background p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Link
                        to={`/papers/${paper.id}`}
                        className="block text-[15px] font-semibold leading-snug text-foreground hover:text-primary hover:underline"
                      >
                        {paper.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{paper.publicationYear}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{paper.paperKind ?? "article"}</span>
                        {paper.externalIds?.doi ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px]">{paper.externalIds.doi}</span>
                          </>
                        ) : null}
                        <span aria-hidden="true">·</span>
                        <span>{new Date(paper.createdAt).toLocaleDateString(language)}</span>
                      </div>
                    </div>

                    <Badge variant="outline" className={cn("shrink-0 gap-1.5 font-medium", statusCfg.badgeClass)}>
                      <StatusIcon className="h-3 w-3" aria-hidden="true" />
                      <span>{t(statusCfg.label)}</span>
                    </Badge>
                  </div>

                  {paper.qualityScore !== undefined && paper.qualityScore > 0 ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {t("Quality Score")}: <strong className="text-foreground">{paper.qualityScore}/100</strong>
                      </span>
                      {paper.qualityTierName ? (
                        <span>
                          {t("Tier")}:{" "}
                          <strong className="text-foreground">
                            {formatQualityTierName(paper.qualityTier, paper.qualityTierName)}
                          </strong>
                        </span>
                      ) : null}
                      {paper.uploadCreditReward !== undefined && paper.uploadCreditReward > 0 ? (
                        <span>
                          {t("Upload Reward")}:{" "}
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            +{paper.uploadCreditReward} {t("credits")}
                          </strong>
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {paper.paperStatus === "rejected" && paper.rejectionReason ? (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      <strong>{t("Rejection reason:")}</strong> {paper.rejectionReason}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      <Link to={`/papers/${paper.id}`}>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("View Details")}</span>
                      </Link>
                    </Button>

                    {paper.paperStatus === "rejected" ? (
                      <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                        <Link to={`/settings/submit-paper?edit=${paper.id}`}>
                          <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t("Edit & Resubmit")}</span>
                        </Link>
                      </Button>
                    ) : null}

                    {paper.pdfPath && paper.paperStatus === "downloaded" ? (
                      <Button
                        type="button"
                        size="sm"
                        loading={downloadingId === paper.id}
                        onClick={() => void handleDownloadPdf(paper.id)}
                        className="h-8 gap-1.5 text-xs"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("Download PDF")}</span>
                      </Button>
                    ) : null}

                    {paper.dataStatus !== "active" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={cancelling === paper.id}
                        onClick={() => void handleDelete(paper.id)}
                        className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("Withdraw")}</span>
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {filtered.length} {t("results")}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("Previous")}</span>
                </Button>
                <span className="font-medium text-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 gap-1"
                >
                  <span>{t("Next")}</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  if (isEmbedded) return body;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-border/85 bg-card p-6 sm:p-8">{body}</div>
    </main>
  );
}
