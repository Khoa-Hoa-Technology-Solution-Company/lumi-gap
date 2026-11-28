import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  FileCheck2,
  FilePlus2,
  Search,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSubmissions } from "@/features/submissions";
import type { SubmissionSummary } from "@/features/submissions/api/submissions.api";
import { projectSubmissionPath } from "@/features/submissions/project-submission-path";
import {
  formatSubmissionTypeLabel,
  type ReviewStatusTone,
} from "@/features/submissions/submission-review-status";
import { statusBadgeClasses, StatusDot } from "@/features/submissions/components/submission-feedback-panel";
import { useI18n } from "@/i18n";

export type SubmissionListFilter = "ALL" | "NEEDS_REVISION" | "WAITING" | "UNSENT" | "COMPLETED";
export type SubmissionListSort = "PRIORITY" | "UPDATED";

export interface SubmissionListRowMeta {
  filterBucket: Exclude<SubmissionListFilter, "ALL">;
  priorityRank: number;
  statusLabel: string;
  statusTone: ReviewStatusTone;
  ctaLabel: string;
  ctaEmphasized: boolean;
  actionSummary: string;
  reviewerText?: string;
}

export function deriveSubmissionListRowMeta(
  submission: SubmissionSummary,
  t: (key: string, values?: Record<string, string | number>) => string = (k) => k,
): SubmissionListRowMeta {
  const summary = submission.reviewSummary;
  const reviewers = summary?.activeReviewerNames ?? [];
  const reviewerText =
    reviewers.length === 1
      ? reviewers[0]
      : reviewers.length > 1
        ? `${reviewers[0]} (+${reviewers.length - 1})`
        : undefined;

  if (summary) {
    const state = summary.state;
    if (state === "REVISION_REQUESTED") {
      const mandatory = summary.openMandatoryRevisionCount;
      const actionSummary =
        mandatory > 0
          ? reviewerText
            ? t("Có {{count}} yêu cầu chỉnh sửa từ {{mentor}}", { count: mandatory, mentor: reviewerText })
            : t("Có {{count}} yêu cầu chỉnh sửa từ giảng viên", { count: mandatory })
          : summary.waitingCount > 0
            ? t("Có yêu cầu chỉnh sửa cần xử lý · {{count}} giảng viên đang phản biện", { count: summary.waitingCount })
            : reviewerText
              ? t("{{mentor}} đã đề nghị chỉnh sửa cho bản thảo này", { mentor: reviewerText })
              : t("Giảng viên đã đề nghị chỉnh sửa cho bản thảo này");
      return {
        filterBucket: "NEEDS_REVISION",
        priorityRank: 0,
        statusLabel: t("Cần chỉnh sửa"),
        statusTone: "amber",
        ctaLabel: t("Xem góp ý"),
        ctaEmphasized: true,
        actionSummary,
        reviewerText,
      };
    }

    if (state === "RESUBMITTED") {
      return {
        filterBucket: "WAITING",
        priorityRank: 1,
        statusLabel: t("Đã gửi bản chỉnh sửa"),
        statusTone: "blue",
        ctaLabel: t("Theo dõi"),
        ctaEmphasized: false,
        actionSummary: reviewerText
          ? t("Đang chờ {{mentor}} rà soát bản v{{version}}", { mentor: reviewerText, version: submission.currentRevisionNumber })
          : t("Đang chờ giảng viên rà soát bản v{{version}}", { version: submission.currentRevisionNumber }),
        reviewerText,
      };
    }

    if (state === "IN_PROGRESS") {
      return {
        filterBucket: "WAITING",
        priorityRank: 2,
        statusLabel: t("Đang phản biện"),
        statusTone: "blue",
        ctaLabel: t("Xem bản thảo"),
        ctaEmphasized: false,
        actionSummary: reviewerText
          ? t("{{mentor}} đang xem và đánh giá bản v{{version}}", { mentor: reviewerText, version: submission.currentRevisionNumber })
          : t("Giảng viên đang xem và đánh giá bản v{{version}}", { version: submission.currentRevisionNumber }),
        reviewerText,
      };
    }

    if (state === "PENDING") {
      return {
        filterBucket: "WAITING",
        priorityRank: 2,
        statusLabel: t("Chờ giảng viên"),
        statusTone: "amber",
        ctaLabel: t("Theo dõi"),
        ctaEmphasized: false,
        actionSummary: reviewerText
          ? t("Đã gửi cho {{mentor}} · Chờ tiếp nhận và phản hồi", { mentor: reviewerText })
          : t("Đã gửi bản thảo · Chờ giảng viên phản hồi"),
        reviewerText,
      };
    }

    if (state === "INTERNAL_APPROVED") {
      return {
        filterBucket: "COMPLETED",
        priorityRank: 4,
        statusLabel: t("Chấp thuận nội bộ"),
        statusTone: "emerald",
        ctaLabel: t("Xem kết quả"),
        ctaEmphasized: false,
        actionSummary: reviewerText
          ? t("Đã chấp thuận trong vòng phản biện nội bộ bởi {{mentor}}", { mentor: reviewerText })
          : t("Đã chấp thuận trong vòng phản biện nội bộ"),
        reviewerText,
      };
    }

    if (state === "COMPLETED") {
      return {
        filterBucket: "COMPLETED",
        priorityRank: 4,
        statusLabel: t("Hoàn tất phản biện"),
        statusTone: "emerald",
        ctaLabel: t("Xem kết quả"),
        ctaEmphasized: false,
        actionSummary: reviewerText
          ? t("{{mentor}} đã hoàn tất góp ý cho phiên bản này", { mentor: reviewerText })
          : t("Quá trình phản biện nội bộ đã hoàn tất"),
        reviewerText,
      };
    }

    if (state === "FEEDBACK_SUBMITTED") {
      return {
        filterBucket: "COMPLETED",
        priorityRank: 3,
        statusLabel: t("Đã nhận góp ý"),
        statusTone: "indigo",
        ctaLabel: t("Xem phản hồi"),
        ctaEmphasized: false,
        actionSummary: reviewerText
          ? t("{{mentor}} đã gửi nhận xét cho bản v{{version}}", { mentor: reviewerText, version: submission.currentRevisionNumber })
          : t("Giảng viên đã gửi nhận xét cho bản thảo"),
        reviewerText,
      };
    }

    if (state === "DECLINED" || state === "CANCELLED" || state === "EXPIRED") {
      const labelMap: Record<string, string> = {
        DECLINED: t("Giảng viên đã từ chối"),
        CANCELLED: t("Yêu cầu đã hủy"),
        EXPIRED: t("Yêu cầu đã hết hạn"),
      };
      return {
        filterBucket: "UNSENT",
        priorityRank: 3,
        statusLabel: labelMap[state] ?? t("Chưa gửi"),
        statusTone: "slate",
        ctaLabel: t("Gửi để góp ý"),
        ctaEmphasized: false,
        actionSummary: t("Yêu cầu trước không còn hiệu lực. Bạn có thể mở bản thảo để gửi lại."),
        reviewerText,
      };
    }

    // Explicit UNSENT (hasReviewRequest === false)
    return {
      filterBucket: "UNSENT",
      priorityRank: 3,
      statusLabel: t("Chưa gửi"),
      statusTone: "slate",
      ctaLabel: t("Gửi để góp ý"),
      ctaEmphasized: false,
      actionSummary: t("Bản thảo đã được lưu · Chưa gửi yêu cầu góp ý cho giảng viên"),
    };
  }

  // Fallback when API payload lacks reviewSummary (e.g., legacy test fixture)
  const norm = submission.status.toLowerCase();
  if (norm === "revision_requested") {
    return {
      filterBucket: "NEEDS_REVISION",
      priorityRank: 0,
      statusLabel: t("Cần chỉnh sửa"),
      statusTone: "amber",
      ctaLabel: t("Xem góp ý"),
      ctaEmphasized: true,
      actionSummary: t("Giảng viên đã gửi yêu cầu chỉnh sửa"),
    };
  }
  if (norm === "waiting_feedback" || norm === "under_review") {
    return {
      filterBucket: "WAITING",
      priorityRank: 2,
      statusLabel: norm === "under_review" ? t("Đang phản biện") : t("Chờ giảng viên"),
      statusTone: norm === "under_review" ? "blue" : "amber",
      ctaLabel: norm === "under_review" ? t("Xem bản thảo") : t("Theo dõi"),
      ctaEmphasized: false,
      actionSummary: t("Đang chờ phản hồi từ giảng viên"),
    };
  }
  if (norm === "feedback_received") {
    return {
      filterBucket: "COMPLETED",
      priorityRank: 3,
      statusLabel: t("Đã nhận góp ý"),
      statusTone: "indigo",
      ctaLabel: t("Xem phản hồi"),
      ctaEmphasized: false,
      actionSummary: t("Đã có nhận xét từ giảng viên"),
    };
  }
  if (norm === "ready_to_advance" || norm === "completed" || norm === "accepted") {
    return {
      filterBucket: "COMPLETED",
      priorityRank: 4,
      statusLabel: t("Chấp thuận nội bộ"),
      statusTone: "emerald",
      ctaLabel: t("Xem kết quả"),
      ctaEmphasized: false,
      actionSummary: t("Đã hoàn tất phản biện nội bộ"),
    };
  }
  return {
    filterBucket: "UNSENT",
    priorityRank: 3,
    statusLabel: t("Chưa gửi"),
    statusTone: "slate",
    ctaLabel: t("Gửi để góp ý"),
    ctaEmphasized: false,
    actionSummary: t("Bản thảo đã được lưu · Chưa gửi yêu cầu góp ý"),
  };
}

export function submissionStatusBadge(status: string, t: (key: string) => string = (k) => k) {
  const norm = status.toLowerCase();
  if (norm === "submitted") {
    return <Badge variant="secondary">{t("Chưa gửi")}</Badge>;
  }
  if (norm === "accepted") {
    return <Badge className="border-emerald-300/80 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">{t("Chấp thuận nội bộ")}</Badge>;
  }
  if (norm === "waiting_feedback") {
    return (
      <Badge className="gap-1 border-amber-300/80 bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:border-amber-700/60 dark:text-amber-300">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {t("Chờ giảng viên")}
      </Badge>
    );
  }
  if (norm === "revision_requested") {
    return (
      <Badge className="gap-1 border-amber-400/80 bg-amber-500/15 text-amber-900 hover:bg-amber-500/20 dark:border-amber-700/60 dark:text-amber-200">
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        {t("Cần chỉnh sửa")}
      </Badge>
    );
  }
  if (norm === "feedback_received") {
    return (
      <Badge className="gap-1 border-blue-300/80 bg-blue-500/15 text-blue-800 hover:bg-blue-500/20 dark:border-blue-700/60 dark:text-blue-300">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        {t("Đã nhận góp ý")}
      </Badge>
    );
  }
  if (norm === "ready_to_advance") {
    return (
      <Badge className="gap-1 border-emerald-300/80 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/20 dark:border-emerald-700/60 dark:text-emerald-300">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {t("Chấp thuận nội bộ")}
      </Badge>
    );
  }
  if (norm === "draft") {
    return <Badge variant="outline" className="text-muted-foreground">{t("Bản nháp")}</Badge>;
  }
  return <Badge variant="secondary">{t(status.replaceAll("_", " "))}</Badge>;
}

export function submissionTypeBadge(type?: string) {
  return <Badge variant="outline" className="font-normal">{formatSubmissionTypeLabel(type)}</Badge>;
}

const FILTER_OPTIONS: Array<{ key: SubmissionListFilter; label: string }> = [
  { key: "ALL", label: "Tất cả" },
  { key: "NEEDS_REVISION", label: "Cần chỉnh sửa" },
  { key: "WAITING", label: "Chờ góp ý" },
  { key: "UNSENT", label: "Chưa gửi" },
  { key: "COMPLETED", label: "Hoàn tất" },
];

export function SubmissionListPage({ projectId, readOnly = false }: { projectId?: string; readOnly?: boolean }) {
  const query = useSubmissions(projectId);
  const { t, language } = useI18n();
  const locale = language === "vi" ? "vi-VN" : "en-US";
  const Heading = projectId ? "h2" : "h1";
  const newPath = projectId ? projectSubmissionPath(projectId, "new") : "/submissions/new";

  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<SubmissionListFilter>("ALL");
  const [sortBy, setSortBy] = useState<SubmissionListSort>("PRIORITY");

  const enrichedRows = useMemo(() => {
    const items = query.data ?? [];
    return items.map((submission) => ({
      submission,
      meta: deriveSubmissionListRowMeta(submission, t),
      typeLabel: formatSubmissionTypeLabel(submission.submissionType),
    }));
  }, [query.data, t]);

  const searchedRows = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase();
    if (!q) return enrichedRows;
    return enrichedRows.filter(({ submission, meta, typeLabel }) => {
      const haystack = [
        submission.title,
        submission.latestFileName ?? "",
        typeLabel,
        ...(submission.reviewSummary?.activeReviewerNames ?? []),
        meta.statusLabel,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(q);
    });
  }, [enrichedRows, searchTerm]);

  // Only show trustworthy counts when full dataset is loaded (not truncated at server cap 100)
  const hasCompleteCountScope = Boolean(query.data) && !query.error && (query.data?.length ?? 0) < 100;

  const filterCounts = useMemo(() => {
    const counts: Record<SubmissionListFilter, number> = {
      ALL: searchedRows.length,
      NEEDS_REVISION: 0,
      WAITING: 0,
      UNSENT: 0,
      COMPLETED: 0,
    };
    for (const row of searchedRows) {
      counts[row.meta.filterBucket] += 1;
    }
    return counts;
  }, [searchedRows]);

  const visibleRows = useMemo(() => {
    const filtered =
      activeFilter === "ALL"
        ? searchedRows
        : searchedRows.filter((row) => row.meta.filterBucket === activeFilter);
    return [...filtered].sort((a, b) => {
      if (sortBy === "PRIORITY" && a.meta.priorityRank !== b.meta.priorityRank) {
        return a.meta.priorityRank - b.meta.priorityRank;
      }
      return Date.parse(b.submission.updatedAt) - Date.parse(a.submission.updatedAt);
    });
  }, [searchedRows, activeFilter, sortBy]);

  const emptyMessage = useMemo(() => {
    if (searchTerm.trim()) return t("Không tìm thấy bản thảo phù hợp.");
    switch (activeFilter) {
      case "NEEDS_REVISION":
        return t("Hiện không có bản thảo nào cần nhóm chỉnh sửa.");
      case "WAITING":
        return t("Hiện không có bản thảo nào đang chờ giảng viên phản hồi.");
      case "UNSENT":
        return t("Các bản thảo chưa gửi góp ý sẽ xuất hiện tại đây.");
      case "COMPLETED":
        return t("Chưa có bản thảo nào hoàn tất phản biện.");
      default:
        return t("Gửi bản thảo đầu tiên để nhận góp ý và theo dõi quá trình hoàn thiện nghiên cứu.");
    }
  }, [activeFilter, searchTerm, t]);

  return (
    <div className={projectId ? "project-submissions min-w-0" : "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"} data-no-i18n>
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Heading className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {t("Bản thảo & góp ý")}
          </Heading>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("Theo dõi phản hồi của giảng viên và hoàn thiện bản thảo nghiên cứu qua từng phiên bản.")}
          </p>
        </div>
        {!readOnly && (
          <Button asChild className="shrink-0 self-start shadow-xs" size="sm">
            <Link to={newPath}>
              <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t("Gửi bản thảo để góp ý")}
            </Link>
          </Button>
        )}
      </header>

      {readOnly && (
        <p className="mt-4 rounded-lg border border-border bg-muted/30 px-3.5 py-2 text-xs text-muted-foreground" role="status">
          {t("Archived projects are read-only.")}
        </p>
      )}

      {query.isLoading ? (
        <div className="mt-5 space-y-2.5" role="status" aria-label={t("Loading submissions")}>
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted/60" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-muted/50" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-muted/50" />
        </div>
      ) : query.error ? (
        <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-5" role="alert">
          <p className="text-sm font-medium text-destructive">{t("Chưa thể tải danh sách bản thảo. Vui lòng thử lại.")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
            {t("Thử lại")}
          </Button>
        </div>
      ) : (query.data?.length ?? 0) === 0 ? (
        <section className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/10 px-5 py-12 text-center sm:py-14">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Send className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">{t("Chưa có bản thảo nào")}</h3>
          <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
            {t("Gửi bản thảo đầu tiên để nhận góp ý và theo dõi quá trình hoàn thiện nghiên cứu.")}
          </p>
          {!readOnly && (
            <Button asChild className="mt-5" size="sm">
              <Link to={newPath}>
                <FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("Gửi bản thảo để góp ý")}
              </Link>
            </Button>
          )}
        </section>
      ) : (
        <div className="mt-4 space-y-3.5">
          {/* Compact Search, Filter Pills & Sort Controls */}
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t("Lọc bản thảo theo trạng thái")}>
              {FILTER_OPTIONS.map((option) => {
                const selected = activeFilter === option.key;
                const count = filterCounts[option.key];
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveFilter(option.key)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <span>{t(option.label)}</span>
                    {hasCompleteCountScope && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[11px] tabular-nums ${
                          selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 sm:w-56 sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t("Tìm bản thảo...")}
                  aria-label={t("Tìm bản thảo...")}
                  className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    aria-label={t("Xóa từ khóa tìm kiếm")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">{t("Sắp xếp danh sách bản thảo")}</span>
                <select
                  aria-label={t("Sắp xếp danh sách bản thảo")}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SubmissionListSort)}
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="PRIORITY">{t("Ưu tiên cần xử lý")}</option>
                  <option value="UPDATED">{t("Mới cập nhật nhất")}</option>
                </select>
              </label>
            </div>
          </div>

          {/* Compact List Rows */}
          {visibleRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/10 px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              {(searchTerm.trim() || activeFilter !== "ALL") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-xs"
                  onClick={() => {
                    setSearchTerm("");
                    setActiveFilter("ALL");
                  }}
                >
                  {t("Xem tất cả bản thảo")}
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              {visibleRows.map(({ submission, meta, typeLabel }) => {
                const detailPath = projectSubmissionPath(projectId ?? submission.projectId, submission._id);
                const updatedText = new Date(submission.updatedAt).toLocaleDateString(locale, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                });
                const isUrgent = meta.filterBucket === "NEEDS_REVISION";

                return (
                  <article
                    key={submission._id}
                    className={`flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between ${
                      isUrgent ? "border-l-2 border-l-amber-500/80 bg-amber-500/[0.025]" : ""
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className={`mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border sm:flex ${
                          isUrgent
                            ? "border-amber-300/80 bg-amber-500/10 text-amber-700 dark:border-amber-700/60 dark:text-amber-300"
                            : "border-border bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Priority 1 & 2: Title first, followed by single clear status */}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <Link
                            to={detailPath}
                            className="break-words text-[15px] font-semibold leading-snug text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                          >
                            {submission.title}
                          </Link>
                          <Badge
                            variant="outline"
                            className={`gap-1.5 text-[11px] font-medium ${statusBadgeClasses(meta.statusTone)}`}
                          >
                            <StatusDot tone={meta.statusTone} />
                            {meta.statusLabel}
                          </Badge>
                        </div>

                        {/* Priority 3: Next action / reviewer context */}
                        <p className={`mt-1 text-xs leading-5 ${isUrgent ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          {meta.actionSummary}
                        </p>

                        {/* Priority 4, 5, 6: Type · Filename (if real) · Version · Reviewer · Date */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">{t(typeLabel)}</span>
                          {submission.latestFileName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="max-w-[220px] truncate" title={submission.latestFileName}>
                                {submission.latestFileName}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums font-medium">v{submission.currentRevisionNumber}</span>
                          {meta.reviewerText && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="max-w-[180px] truncate" title={meta.reviewerText}>
                                  {meta.reviewerText}
                                </span>
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {t("Cập nhật")} {updatedText}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Context-aware single CTA (never nested inside another Link) */}
                    <div className="flex shrink-0 items-center sm:pl-3">
                      <Button
                        asChild
                        size="sm"
                        variant={meta.ctaEmphasized ? "default" : "outline"}
                        className="h-8 text-xs"
                      >
                        <Link to={detailPath}>{meta.ctaLabel}</Link>
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
