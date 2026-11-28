import { useI18n } from "@/i18n";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { SubmittedVersionRevisionItem } from "@trend/shared-types";
import { scientificIntegrityChecks } from "@trend/shared-types";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  ListChecks,
  Maximize2,
  MessageSquare,
  Minimize2,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { localizeIntegrityTitle } from "@/features/reviews/system-rubric-i18n";
import { useRevisionResponseDrafts } from "../revision-response-drafts";
import {
  formatReviewVerdictLabel,
  type ReviewStatusPresentation,
  type ReviewStatusTone,
  type VersionMentorThread,
} from "../submission-review-status";

const LEGACY_RUBRIC_LABELS: Record<string, string> = {
  rq_clarity: "Câu hỏi nghiên cứu & Mục tiêu",
  methodology: "Phương pháp luận",
  results: "Kết quả & Dữ liệu",
  evidence: "Bằng chứng & Lập luận",
  discussion: "Thảo luận & So sánh",
  limitations: "Giới hạn nghiên cứu",
  citations: "Trích dẫn & Nguồn tham khảo",
  integrity: "Liêm chính học thuật & AI",
  research_problem: "Vấn đề & mục tiêu nghiên cứu",
  literature_context: "Cơ sở lý thuyết & tài liệu",
  analysis_evidence: "Phân tích & bằng chứng",
  writing_structure: "Trình bày & cấu trúc học thuật",
  originality_contribution: "Đóng góp & tính mới",
  data: "Dữ liệu & Thực nghiệm",
  data_experiments: "Dữ liệu & Thực nghiệm",
  results_discussion: "Kết quả & Thảo luận",
  references_citations: "Tài liệu tham khảo & Trích dẫn",
};

export function statusBadgeClasses(tone: ReviewStatusTone): string {
  switch (tone) {
    case "amber":
      return "border-amber-300/80 bg-amber-500/10 text-amber-800 dark:border-amber-700/60 dark:text-amber-300";
    case "blue":
      return "border-blue-300/80 bg-blue-500/10 text-blue-800 dark:border-blue-700/60 dark:text-blue-300";
    case "rose":
      return "border-rose-300/80 bg-rose-500/10 text-rose-800 dark:border-rose-700/60 dark:text-rose-300";
    case "indigo":
      return "border-indigo-300/80 bg-indigo-500/10 text-indigo-800 dark:border-indigo-700/60 dark:text-indigo-300";
    case "emerald":
      return "border-emerald-300/80 bg-emerald-500/10 text-emerald-800 dark:border-emerald-700/60 dark:text-emerald-300";
    default:
      return "border-border bg-muted/60 text-muted-foreground";
  }
}

export function StatusDot({ tone }: { tone: ReviewStatusTone }) {
  const color: Record<ReviewStatusTone, string> = {
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    rose: "bg-rose-500",
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    slate: "bg-muted-foreground/60",
  };
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color[tone]}`} aria-hidden="true" />;
}

export function ReviewStatusBadge({ status }: { status: ReviewStatusPresentation }) {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={`gap-1.5 font-medium ${statusBadgeClasses(status.tone)}`}>
      <StatusDot tone={status.tone} />
      {t(status.label)}
    </Badge>
  );
}

type FeedbackInnerTab = "overview" | "revisions" | "assessment";

export interface PreviousRoundRevisionGroup {
  roundNumber: number;
  versionNumber: number;
  reviewerId?: string;
  reviewerName: string;
  items: SubmittedVersionRevisionItem[];
}

interface SubmissionFeedbackPanelProps {
  submissionId?: string;
  projectId?: string;
  versionNumber: number;
  threads: VersionMentorThread[];
  activeThread?: VersionMentorThread;
  onSelectMentor: (key: string) => void;
  language: string;
  embedded?: boolean;
  canPrepareRevision?: boolean;
  onOpenPrepareResubmission?: (mentorId?: string) => void;
  previousRoundRevisions?: PreviousRoundRevisionGroup[];
  expanded?: boolean;
  onToggleExpand?: () => void;
}

function isSuggestionItem(item: SubmittedVersionRevisionItem): boolean {
  return item.priority.toUpperCase() === "SUGGESTION";
}

function revisionLifecyclePresentation(
  item: SubmittedVersionRevisionItem,
  hasLocalDraft: boolean,
  t: (key: string) => string,
): { label: string; className: string } {
  const status = item.status.toUpperCase();
  if (status === "ACCEPTED") {
    return {
      label: t("Đã xác nhận đạt yêu cầu"),
      className: "border-emerald-300/80 bg-emerald-500/10 text-emerald-800 dark:border-emerald-700/60 dark:text-emerald-300",
    };
  }
  if (status === "REOPENED") {
    return {
      label: hasLocalDraft ? t("Đã chuẩn bị phản hồi bổ sung") : t("Cần chỉnh sửa thêm"),
      className: hasLocalDraft
        ? "border-indigo-300/80 bg-indigo-500/10 text-indigo-800 dark:border-indigo-700/60 dark:text-indigo-300"
        : "border-amber-300/80 bg-amber-500/10 text-amber-900 dark:border-amber-700/60 dark:text-amber-300",
    };
  }
  if (status === "ADDRESSED") {
    return {
      label: t("Đã gửi phản hồi · Chờ mentor rà soát"),
      className: "border-blue-300/80 bg-blue-500/10 text-blue-800 dark:border-blue-700/60 dark:text-blue-300",
    };
  }
  if (hasLocalDraft) {
    return {
      label: t("Đã chuẩn bị phản hồi"),
      className: "border-indigo-300/80 bg-indigo-500/10 text-indigo-800 dark:border-indigo-700/60 dark:text-indigo-300",
    };
  }
  return {
    label: t("Chưa chuẩn bị phản hồi"),
    className: "border-border bg-muted/50 text-muted-foreground",
  };
}

function priorityPresentation(priority: string, t: (key: string) => string) {
  const norm = priority.toUpperCase();
  if (norm === "MAJOR") {
    return {
      label: t("Chỉnh sửa lớn"),
      className: "border-amber-300/80 bg-amber-500/12 text-amber-900 dark:border-amber-700/60 dark:text-amber-200",
    };
  }
  if (norm === "SUGGESTION") {
    return {
      label: t("Gợi ý"),
      className: "border-sky-300/70 bg-sky-500/10 text-sky-800 dark:border-sky-700/60 dark:text-sky-300",
    };
  }
  return {
    label: t("Chỉnh sửa nhỏ"),
    className: "border-border bg-muted/60 text-foreground/80",
  };
}

export function SubmissionFeedbackPanel({
  submissionId,
  projectId,
  versionNumber,
  threads,
  activeThread,
  onSelectMentor,
  language,
  embedded = false,
  canPrepareRevision = false,
  onOpenPrepareResubmission,
  previousRoundRevisions = [],
  expanded = false,
  onToggleExpand,
}: SubmissionFeedbackPanelProps) {
  const { t } = useI18n();
  const locale = language === "vi" ? "vi-VN" : "en-US";
  const tabId = useId();
  const innerTabId = useId();
  const userId = useAuthStore((state) => state.user?.id);
  const latestReview = activeThread?.latestReview;

  const requestId = activeThread?.request?.id ?? latestReview?.requestId ?? undefined;
  const { drafts, setDraft } = useRevisionResponseDrafts({
    userId,
    projectId,
    submissionId,
    requestId,
  });

  const currentRevisions = latestReview?.requiredRevisions ?? [];
  const relevantPreviousGroups = useMemo(
    () =>
      previousRoundRevisions.filter((group) => {
        if (!activeThread) return true;
        if (activeThread.reviewerId && group.reviewerId) return group.reviewerId === activeThread.reviewerId;
        return group.reviewerName === activeThread.reviewerName;
      }),
    [previousRoundRevisions, activeThread],
  );

  const rubricItems = (latestReview?.responses ?? []).filter((r) => r.criterionKey?.startsWith("rubric:"));
  const sectionItems = (latestReview?.responses ?? []).filter((r) => !r.criterionKey?.startsWith("rubric:"));
  const allAssessmentItems = [...rubricItems, ...sectionItems];
  const integrityEntries = useMemo(() => {
    const map = latestReview?.integrityChecks;
    if (!map) return [];
    return scientificIntegrityChecks
      .filter((check) => Boolean(map[check.key]))
      .map((check) => ({
        key: check.key,
        title: localizeIntegrityTitle(check.title, language),
        status: map[check.key]!.status,
        note: map[check.key]!.note,
      }));
  }, [latestReview?.integrityChecks, language]);

  const mandatoryItems = currentRevisions.filter((item) => !isSuggestionItem(item));
  const optionalSuggestionItems = currentRevisions.filter(isSuggestionItem);
  const openMandatoryItems = mandatoryItems.filter((item) => ["OPEN", "REOPENED"].includes(item.status.toUpperCase()));
  const addressedMandatoryItems = mandatoryItems.filter((item) => item.status.toUpperCase() === "ADDRESSED");
  const acceptedMandatoryItems = mandatoryItems.filter((item) => item.status.toUpperCase() === "ACCEPTED");
  const draftedMandatoryCount = openMandatoryItems.filter((item) => Boolean(drafts[item.id]?.trim())).length;

  const hasRevisionsTab = currentRevisions.length > 0 || relevantPreviousGroups.length > 0;
  const hasAssessmentTab =
    allAssessmentItems.length > 0 || integrityEntries.length > 0 || latestReview?.weightedScore != null;
  const showInnerTabs = Boolean(latestReview) && (hasRevisionsTab || hasAssessmentTab);

  // Remember user's manual inner tab per thread+version; default to "revisions" when open mandatory revisions need action.
  const threadContextKey = `${versionNumber}:${activeThread?.key ?? "none"}`;
  const [tabByContext, setTabByContext] = useState<Record<string, FeedbackInnerTab>>({});
  const [expandedDraftIds, setExpandedDraftIds] = useState<Record<string, boolean>>({});

  const defaultTab: FeedbackInnerTab =
    openMandatoryItems.length > 0 && hasRevisionsTab ? "revisions" : "overview";
  const requestedTab = tabByContext[threadContextKey] ?? defaultTab;
  const activeInnerTab: FeedbackInnerTab =
    requestedTab === "revisions" && !hasRevisionsTab
      ? "overview"
      : requestedTab === "assessment" && !hasAssessmentTab
        ? "overview"
        : requestedTab;

  const setActiveInnerTab = (next: FeedbackInnerTab) => {
    setTabByContext((prev) => ({ ...prev, [threadContextKey]: next }));
  };

  // Auto-open inline response editors for reopened items when user lands on revisions tab
  useEffect(() => {
    if (!currentRevisions.length) return;
    setExpandedDraftIds((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of currentRevisions) {
        if (item.status.toUpperCase() === "REOPENED" && next[item.id] === undefined) {
          next[item.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentRevisions]);

  const canInlineRespond =
    canPrepareRevision &&
    Boolean(requestId) &&
    activeThread?.request?.status?.toUpperCase() === "REVISION_REQUESTED";

  const integritySummary = useMemo(() => {
    let checked = 0;
    let concern = 0;
    let notApplicable = 0;
    for (const item of integrityEntries) {
      if (item.status === "CHECKED") checked += 1;
      else if (item.status === "CONCERN") concern += 1;
      else if (item.status === "NOT_APPLICABLE") notApplicable += 1;
    }
    return { total: integrityEntries.length, checked, concern, notApplicable };
  }, [integrityEntries]);

  const revisionCountBadge =
    openMandatoryItems.length > 0
      ? openMandatoryItems.length
      : currentRevisions.length > 0
        ? currentRevisions.length
        : relevantPreviousGroups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section
      className={embedded ? "overflow-hidden" : "rounded-xl border border-border bg-card shadow-xs overflow-hidden"}
      aria-label={t("Phản hồi từ giảng viên")}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/75 bg-muted/20 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <h3 className="truncate text-[13px] font-semibold text-foreground">{t("Góp ý của giảng viên")}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            v{versionNumber}
          </span>
          {onToggleExpand && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="hidden h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground xl:inline-flex"
              onClick={onToggleExpand}
              title={t(expanded ? "Xem song song" : "Mở rộng góp ý")}
              aria-label={t(expanded ? "Xem song song" : "Mở rộng góp ý")}
            >
              {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              <span>{t(expanded ? "Thu gọn" : "Mở rộng")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Multi-Mentor Switcher Tabs */}
      {threads.length > 1 && (
        <div className="border-b border-border/70 bg-muted/20 px-3 py-2" role="tablist" aria-label={t("Chọn giảng viên đánh giá")}>
          <div className="flex flex-wrap gap-1.5">
            {threads.map((thread, index) => {
              const selected = thread.key === activeThread?.key;
              return (
                <button
                  key={thread.key}
                  type="button"
                  role="tab"
                  id={`${tabId}-${thread.key}`}
                  aria-selected={selected}
                  aria-controls={`${tabId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  title={`${thread.reviewerName} — ${t(thread.status.label)}`}
                  onKeyDown={(event) => {
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? threads.length - 1
                          : event.key === "ArrowRight"
                            ? (index + 1) % threads.length
                            : event.key === "ArrowLeft"
                              ? (index + threads.length - 1) % threads.length
                              : -1;
                    if (next < 0 || !threads[next]) return;
                    event.preventDefault();
                    onSelectMentor(threads[next]!.key);
                    document.getElementById(`${tabId}-${threads[next]!.key}`)?.focus();
                  }}
                  onClick={() => onSelectMentor(thread.key)}
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? "border-primary/40 bg-background text-foreground shadow-2xs"
                      : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <StatusDot tone={thread.status.tone} />
                  <span className="truncate">{thread.reviewerName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Feedback Content */}
      <div
        className="p-4"
        id={`${tabId}-panel`}
        role={threads.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={threads.length > 1 && activeThread ? `${tabId}-${activeThread.key}` : undefined}
      >
        {latestReview ? (
          <div className="space-y-3.5">
            {/* Mentor + Version + Round + Date + Scoped Mentor Status */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold leading-snug text-foreground" title={latestReview.reviewerName}>
                    {latestReview.reviewerName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Vòng")} {latestReview.roundNumber} · {t("Bản thảo")} v{versionNumber}
                    {latestReview.submittedAt
                      ? ` · ${new Date(latestReview.submittedAt).toLocaleDateString(locale, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}`
                      : ""}
                  </p>
                </div>
              </div>
              {activeThread?.status && <ReviewStatusBadge status={activeThread.status} />}
            </div>

            {/* Organized Feedback Sub-Tabs (max 3: Tổng quan | Cần chỉnh sửa | Đánh giá) */}
            {showInnerTabs && (
              <div
                className="flex items-center gap-1 border-b border-border/80"
                role="tablist"
                aria-label={t("Các mục góp ý")}
              >
                <button
                  type="button"
                  role="tab"
                  id={`${innerTabId}-overview`}
                  aria-selected={activeInnerTab === "overview"}
                  onClick={() => setActiveInnerTab("overview")}
                  className={`border-b-2 px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activeInnerTab === "overview"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("Tổng quan")}
                </button>

                {hasRevisionsTab && (
                  <button
                    type="button"
                    role="tab"
                    id={`${innerTabId}-revisions`}
                    aria-selected={activeInnerTab === "revisions"}
                    onClick={() => setActiveInnerTab("revisions")}
                    className={`inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      activeInnerTab === "revisions"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{t("Cần chỉnh sửa")}</span>
                    {revisionCountBadge > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10.5px] tabular-nums ${
                          openMandatoryItems.length > 0
                            ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {revisionCountBadge}
                      </span>
                    )}
                  </button>
                )}

                {hasAssessmentTab && (
                  <button
                    type="button"
                    role="tab"
                    id={`${innerTabId}-assessment`}
                    aria-selected={activeInnerTab === "assessment"}
                    onClick={() => setActiveInnerTab("assessment")}
                    className={`border-b-2 px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      activeInnerTab === "assessment"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("Đánh giá")}
                  </button>
                )}
              </div>
            )}

            {/* TAB 1: OVERVIEW */}
            {(!showInnerTabs || activeInnerTab === "overview") && (
              <div className="space-y-3.5" role={showInnerTabs ? "tabpanel" : undefined} aria-labelledby={showInnerTabs ? `${innerTabId}-overview` : undefined}>
                {/* Verdict + Academic Score Summary (only if rubric score exists) */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/25 px-3.5 py-2.5 text-xs">
                  <div>
                    <span className="text-muted-foreground">{t("Kết luận vòng góp ý:")} </span>
                    <span className="font-semibold text-foreground">
                      {t(formatReviewVerdictLabel(latestReview.overallAssessment))}
                    </span>
                  </div>
                  {latestReview.weightedScore != null && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                      <Scale className="h-3 w-3" aria-hidden="true" />
                      {Number(latestReview.weightedScore).toFixed(1)}
                    </span>
                  )}
                </div>

                {/* Overall Comment (verbatim) */}
                {latestReview.overallComment?.trim() && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Nhận xét tổng quan")}
                    </h4>
                    <div className="rounded-lg border border-border/70 bg-muted/15 p-3.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                      {latestReview.overallComment}
                    </div>
                  </div>
                )}

                {/* Strengths */}
                {latestReview.keyStrengths?.trim() && (
                  <div className="rounded-lg border border-emerald-300/60 bg-emerald-500/10 p-3.5 text-xs text-emerald-950 dark:text-emerald-200">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("Điểm mạnh")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed">{latestReview.keyStrengths}</p>
                  </div>
                )}

                {/* Areas to improve */}
                {latestReview.keyConcerns?.trim() && (
                  <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 p-3.5 text-xs text-amber-950 dark:text-amber-200">
                    <p className="font-semibold">{t("Nội dung cần cải thiện")}</p>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed">{latestReview.keyConcerns}</p>
                  </div>
                )}

                {/* Compact callout leading to Revisions tab (never duplicates full list here) */}
                {hasRevisionsTab && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
                    <div className="min-w-0 text-xs">
                      <p className="font-medium text-foreground">
                        {openMandatoryItems.length > 0
                          ? t("Có {{count}} yêu cầu chỉnh sửa đang chờ nhóm xử lý.", { count: openMandatoryItems.length })
                          : acceptedMandatoryItems.length > 0 && acceptedMandatoryItems.length === mandatoryItems.length
                            ? t("Tất cả {{count}} yêu cầu bắt buộc đã được xác nhận đạt.", { count: acceptedMandatoryItems.length })
                            : addressedMandatoryItems.length > 0
                              ? t("Đã gửi phản hồi cho {{count}} yêu cầu · Chờ giảng viên rà soát.", { count: addressedMandatoryItems.length })
                              : t("Có {{count}} mục chỉnh sửa & gợi ý từ giảng viên.", { count: revisionCountBadge })}
                      </p>
                      {optionalSuggestionItems.length > 0 && (
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          {t("Kèm {{count}} gợi ý cải thiện không bắt buộc.", { count: optionalSuggestionItems.length })}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={openMandatoryItems.length > 0 ? "default" : "outline"}
                      className="h-7 gap-1 text-xs"
                      onClick={() => setActiveInnerTab("revisions")}
                    >
                      <span>
                        {openMandatoryItems.length > 0
                          ? t("Xem {{count}} yêu cầu chỉnh sửa", { count: openMandatoryItems.length })
                          : t("Xem danh sách chỉnh sửa")}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: REQUIRED REVISIONS & RESPONSE PREPARATION */}
            {showInnerTabs && activeInnerTab === "revisions" && (
              <div className="space-y-3.5" role="tabpanel" aria-labelledby={`${innerTabId}-revisions`}>
                {/* Separate Progress Indicators (never one misleading 100% bar) */}
                {mandatoryItems.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-border/80 bg-muted/20 px-3.5 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                        <ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        {openMandatoryItems.length > 0
                          ? draftedMandatoryCount === openMandatoryItems.length
                            ? t("Đã chuẩn bị phản hồi cho tất cả yêu cầu bắt buộc.")
                            : t("Đã chuẩn bị phản hồi {{done}}/{{total}} yêu cầu bắt buộc.", {
                                done: draftedMandatoryCount,
                                total: openMandatoryItems.length,
                              })
                          : acceptedMandatoryItems.length === mandatoryItems.length
                            ? t("{{done}}/{{total}} yêu cầu đã được xác nhận đạt.", {
                                done: acceptedMandatoryItems.length,
                                total: mandatoryItems.length,
                              })
                            : t("Đã gửi phản hồi cho {{count}} yêu cầu · Chờ giảng viên rà soát.", {
                                count: addressedMandatoryItems.length + acceptedMandatoryItems.length,
                              })}
                      </span>
                      {acceptedMandatoryItems.length > 0 && openMandatoryItems.length > 0 && (
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          {t("{{done}}/{{total}} yêu cầu đã được xác nhận đạt.", {
                            done: acceptedMandatoryItems.length,
                            total: mandatoryItems.length,
                          })}
                        </span>
                      )}
                    </div>
                    {canInlineRespond && (
                      <p className="text-[11px] leading-4 text-muted-foreground">
                        {t("Nội dung bạn soạn dưới đây là bản nháp cục bộ trên phiên làm việc này và sẽ tự động điền khi mở Chuẩn bị bản mới. Bản nháp chưa được gửi cho giảng viên.")}
                      </p>
                    )}
                  </div>
                )}

                {/* Calm Neutral Revision Cards */}
                {currentRevisions.length > 0 && (
                  <ul className="space-y-2.5">
                    {currentRevisions.map((item) => {
                      const isSuggestion = isSuggestionItem(item);
                      const draftValue = drafts[item.id] ?? "";
                      const hasDraft = Boolean(draftValue.trim());
                      const lifecycle = revisionLifecyclePresentation(item, hasDraft, t);
                      const priorityMeta = priorityPresentation(item.priority, t);
                      const isEditable =
                        canInlineRespond && ["OPEN", "REOPENED"].includes(item.status.toUpperCase());
                      const editorOpen = Boolean(expandedDraftIds[item.id] || hasDraft);
                      const criterionLabel = item.criterionKey
                        ? LEGACY_RUBRIC_LABELS[item.criterionKey.replace(/^rubric:/, "")] ?? item.criterionKey
                        : undefined;
                      const submittedResponses = (item.responses ?? []).filter(
                        (resp) => resp.status.toUpperCase() !== "DRAFT",
                      );

                      return (
                        <li
                          key={item.id}
                          className="rounded-lg border border-border bg-card p-3.5 text-xs transition-colors"
                        >
                          {/* Top Meta Row */}
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className={`text-[10.5px] font-medium ${priorityMeta.className}`}>
                                {priorityMeta.label}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                {t("Vòng")} {latestReview.roundNumber}
                              </span>
                              {criterionLabel && (
                                <span className="text-[11px] text-muted-foreground">· {t(criterionLabel)}</span>
                              )}
                            </div>
                            <Badge variant="outline" className={`text-[10.5px] font-medium ${lifecycle.className}`}>
                              {lifecycle.label}
                            </Badge>
                          </div>

                          {/* Verbatim Lecturer Requirement */}
                          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                            {item.description}
                          </p>

                          {/* Locator / Quotation (text evidence, never breaks cross-version) */}
                          {(item.locator || item.quotation) && (
                            <div className="mt-2 space-y-1 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11.5px] text-muted-foreground">
                              {item.locator && (
                                <p>
                                  <span className="font-medium text-foreground/80">{t("Vị trí:")} </span>
                                  {item.locator}
                                </p>
                              )}
                              {item.quotation && <p className="italic">“{item.quotation}”</p>}
                            </div>
                          )}

                          {/* Previous Submitted Team Responses + Mentor Verification Status */}
                          {submittedResponses.length > 0 && (
                            <div className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2.5">
                              {submittedResponses.map((resp, idx) => (
                                <div key={resp.id ?? idx} className="rounded-md bg-muted/25 px-2.5 py-2 text-xs">
                                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
                                    <span className="font-medium text-foreground">{t("Phản hồi của nhóm:")}</span>
                                    {resp.status.toUpperCase() === "REOPENED" && (
                                      <span className="font-medium text-amber-800 dark:text-amber-300">
                                        {t("Phản hồi này cần được làm rõ thêm.")}
                                      </span>
                                    )}
                                    {resp.status.toUpperCase() === "ACCEPTED" && (
                                      <span className="font-medium text-emerald-700 dark:text-emerald-300">
                                        {t("Đã xác nhận đạt yêu cầu")}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground/90">
                                    {resp.responseText}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Inline Response Draft Preparation */}
                          {isEditable && (
                            <div className="mt-2.5 border-t border-border/60 pt-2.5">
                              {!editorOpen ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedDraftIds((prev) => ({ ...prev, [item.id]: true }))
                                  }
                                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <span>
                                    {isSuggestion
                                      ? t("Ghi chú phản hồi gợi ý (không bắt buộc)")
                                      : t("Soạn phản hồi cho yêu cầu này")}
                                  </span>
                                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              ) : (
                                <label className="block space-y-1.5">
                                  <span className="flex items-center justify-between gap-2 text-[11.5px] font-medium text-foreground">
                                    <span>
                                      {t("Phản hồi của nhóm")}{" "}
                                      <span className="font-normal text-muted-foreground">
                                        ({isSuggestion ? t("không bắt buộc") : t("bản nháp")})
                                      </span>
                                    </span>
                                    {hasDraft && (
                                      <span className="text-[11px] font-normal text-indigo-700 dark:text-indigo-300">
                                        {t("Đã lưu bản nháp phiên này")}
                                      </span>
                                    )}
                                  </span>
                                  <textarea
                                    rows={2}
                                    maxLength={10000}
                                    value={draftValue}
                                    onChange={(event) => setDraft(item.id, event.target.value)}
                                    placeholder={t("Mô tả vị trí đã chỉnh sửa hoặc giải trình phương án của nhóm...")}
                                    className="w-full rounded-md border border-input bg-background p-2.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  />
                                </label>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Previous Round Revision Tracking (when viewing a newer resubmitted version) */}
                {relevantPreviousGroups.length > 0 && (
                  <div className="space-y-2 border-t border-border/70 pt-3">
                    <h4 className="text-xs font-semibold text-muted-foreground">
                      {t("Theo dõi yêu cầu từ vòng trước")}
                    </h4>
                    {relevantPreviousGroups.map((group) => (
                      <div key={`${group.versionNumber}-${group.roundNumber}`} className="space-y-2">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {t("Vòng")} {group.roundNumber} · {t("Bản thảo")} v{group.versionNumber} · {group.reviewerName}
                        </p>
                        <ul className="space-y-2">
                          {group.items.map((item) => {
                            const lifecycle = revisionLifecyclePresentation(item, false, t);
                            const submittedResponses = (item.responses ?? []).filter(
                              (resp) => resp.status.toUpperCase() !== "DRAFT",
                            );
                            return (
                              <li key={item.id} className="rounded-lg border border-border/80 bg-muted/15 p-3 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <span className="font-medium text-foreground/80">
                                    {priorityPresentation(item.priority, t).label}
                                  </span>
                                  <Badge variant="outline" className={`text-[10.5px] font-medium ${lifecycle.className}`}>
                                    {lifecycle.label}
                                  </Badge>
                                </div>
                                <p className="mt-1.5 text-xs leading-relaxed text-foreground">{item.description}</p>
                                {submittedResponses.length > 0 && (
                                  <p className="mt-1.5 border-t border-border/60 pt-1.5 text-[11.5px] text-muted-foreground">
                                    <span className="font-medium text-foreground">{t("Phản hồi đã gửi:")} </span>
                                    {submittedResponses.at(-1)?.responseText}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {/* Direct CTA to Prepare & Send New Version (reusing MentorManuscriptDialog with prefilled drafts) */}
                {canInlineRespond && onOpenPrepareResubmission && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      size="sm"
                      className="w-full gap-1.5 text-xs"
                      onClick={() => onOpenPrepareResubmission(activeThread?.reviewerId)}
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("Chuẩn bị bản mới")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: READ-ONLY ACADEMIC ASSESSMENT & RESEARCH INTEGRITY */}
            {showInnerTabs && activeInnerTab === "assessment" && (
              <div className="space-y-4" role="tabpanel" aria-labelledby={`${innerTabId}-assessment`}>
                {/* Academic Rubric (Read-Only Compact Table) */}
                {(allAssessmentItems.length > 0 || latestReview.weightedScore != null) && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Scale className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        {t("Đánh giá học thuật")} ({allAssessmentItems.length})
                      </h4>
                      {latestReview.weightedScore != null && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                          {t("Điểm trọng số:")} {Number(latestReview.weightedScore).toFixed(1)}
                        </span>
                      )}
                    </div>

                    {allAssessmentItems.length > 0 && (
                      <div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/80 bg-card">
                        {allAssessmentItems.map((resp, idx) => {
                          const cleanKey = resp.criterionKey.replace(/^rubric:/, "");
                          const title = resp.criterionTitle || LEGACY_RUBRIC_LABELS[cleanKey] || cleanKey;
                          const comment =
                            resp.comment && !resp.comment.startsWith("Rubric score:") ? resp.comment : undefined;
                          const scoreDisplay = resp.notApplicable
                            ? "N/A"
                            : resp.score != null
                              ? resp.maxScore != null
                                ? `${resp.score}/${resp.maxScore}`
                                : `${resp.score}`
                              : resp.assessment
                                ? t(
                                    ({
                                      NEEDS_IMPROVEMENT: "Cần cải thiện",
                                      STRONG: "Tốt",
                                      ADEQUATE: "Đạt",
                                      WEAK: "Cần cải thiện",
                                      NOT_APPLICABLE: "Không áp dụng",
                                    } as Record<string, string>)[resp.assessment] ?? resp.assessment.replaceAll("_", " "),
                                  )
                                : null;

                          return (
                            <div key={`${resp.criterionKey}-${idx}`} className="space-y-1.5 p-3 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="font-semibold text-foreground">{t(title)}</span>
                                  {resp.weight != null && resp.weight > 0 && (
                                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                                      ({resp.weight}%)
                                    </span>
                                  )}
                                </div>
                                {scoreDisplay && (
                                  <Badge variant="outline" className="shrink-0 text-[11px] font-semibold tabular-nums">
                                    {scoreDisplay}
                                  </Badge>
                                )}
                              </div>
                              {resp.evidence && (
                                <p className="italic text-muted-foreground">“{resp.evidence}”</p>
                              )}
                              {comment && (
                                <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">{comment}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Research Integrity & Ethics (Read-Only, Strictly Independent of Rubric Score) */}
                {integrityEntries.length > 0 && (
                  <div className="space-y-2.5 border-t border-border/70 pt-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        {t("Liêm chính & đạo đức nghiên cứu")}
                      </h4>
                      <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                        {t("Đã kiểm tra {{done}}/{{total}} mục", {
                          done: integritySummary.total,
                          total: scientificIntegrityChecks.length,
                        })}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-border/70 bg-muted/20 p-2.5 text-center text-[11px]">
                      <div>
                        <p className="font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                          {integritySummary.checked}
                        </p>
                        <p className="text-muted-foreground">{t("Không phát hiện vấn đề")}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
                          {integritySummary.concern}
                        </p>
                        <p className="text-muted-foreground">{t("Cần xem xét")}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-muted-foreground tabular-nums">
                          {integritySummary.notApplicable}
                        </p>
                        <p className="text-muted-foreground">{t("Không áp dụng")}</p>
                      </div>
                    </div>

                    {integritySummary.concern > 0 && (
                      <ul className="space-y-2">
                        {integrityEntries
                          .filter((entry) => entry.status === "CONCERN")
                          .map((entry) => (
                            <li
                              key={entry.key}
                              className="rounded-lg border border-amber-300/70 bg-amber-500/8 p-3 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-foreground">{entry.title}</span>
                                <Badge
                                  variant="outline"
                                  className="border-amber-300/80 bg-amber-500/15 text-[10.5px] text-amber-900 dark:border-amber-700/60 dark:text-amber-200"
                                >
                                  {t("Cần xem xét")}
                                </Badge>
                              </div>
                              {entry.note && (
                                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-foreground/90">
                                  {entry.note}
                                </p>
                              )}
                            </li>
                          ))}
                      </ul>
                    )}

                    <p className="text-[11px] leading-4 text-muted-foreground">
                      {t("Cần xem xét không đồng nghĩa với kết luận vi phạm và tách biệt hoàn toàn với điểm đánh giá học thuật.")}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Link to Full Review Request Detail */}
            <div className="border-t border-border/70 pt-2.5">
              {latestReview.requestId && (activeThread?.request?.canView ?? true) && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Link to={`/review-requests/${latestReview.requestId}`}>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("Xem chi tiết yêu cầu & phản hồi")}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ) : activeThread?.status.isUnavailable ? (
          <div className="space-y-2 py-6 text-center" data-testid="feedback-empty-state">
            <AlertCircle className="mx-auto h-7 w-7 text-muted-foreground/70" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">{t(activeThread.status.label)}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("Yêu cầu góp ý gửi đến")} {activeThread.reviewerName}{" "}
              {t("không còn hoạt động. Bạn có thể gửi lại yêu cầu mới khi sẵn sàng.")}
            </p>
          </div>
        ) : activeThread ? (
          <div className="space-y-3 py-3" data-testid="feedback-empty-state">
            <div className="space-y-2 text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
                {activeThread.status.state === "IN_PROGRESS" ? (
                  <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                )}
              </div>
              <div className="space-y-1">
                <h4 className="text-[13px] font-semibold text-foreground">{t("Chưa có phản hồi từ giảng viên")}</h4>
                <p className="mx-auto max-w-[290px] text-balance text-xs leading-5 text-muted-foreground">
                  {activeThread.status.isResubmitted
                    ? t("Bản chỉnh sửa đã được gửi. Nhóm đang chờ giảng viên rà soát và xác nhận.")
                    : t("Bạn sẽ nhận thông báo khi giảng viên hoàn tất góp ý.")}
                </p>
              </div>
              {activeThread.request?.canView && (
                <div className="pt-0.5">
                  <Link
                    to={`/review-requests/${activeThread.request.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {t("Xem chi tiết yêu cầu")} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>

            {/* Show previous round verification items when waiting for mentor review on resubmitted version */}
            {relevantPreviousGroups.length > 0 && (
              <div className="space-y-2 border-t border-border/70 pt-3 text-left">
                <h5 className="text-xs font-semibold text-muted-foreground">
                  {t("Theo dõi yêu cầu từ vòng trước")}
                </h5>
                {relevantPreviousGroups.map((group) => (
                  <div key={`${group.versionNumber}-${group.roundNumber}`} className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {t("Vòng")} {group.roundNumber} · {t("Bản thảo")} v{group.versionNumber}
                    </p>
                    <ul className="space-y-1.5">
                      {group.items.map((item) => {
                        const lifecycle = revisionLifecyclePresentation(item, false, t);
                        const lastResp = (item.responses ?? []).filter((r) => r.status.toUpperCase() !== "DRAFT").at(-1);
                        return (
                          <li key={item.id} className="rounded-lg border border-border/70 bg-muted/15 p-2.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="font-medium text-foreground/80">
                                {priorityPresentation(item.priority, t).label}
                              </span>
                              <Badge variant="outline" className={`text-[10px] font-medium ${lifecycle.className}`}>
                                {lifecycle.label}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-foreground">{item.description}</p>
                            {lastResp && (
                              <p className="mt-1 border-t border-border/60 pt-1 text-[11px] text-muted-foreground">
                                <span className="font-medium text-foreground">{t("Phản hồi đã gửi:")} </span>
                                {lastResp.responseText}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 py-3 text-center" data-testid="feedback-empty-state">
            <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
            <h4 className="text-[13px] font-semibold text-foreground">{t("Chưa có phản hồi từ giảng viên")}</h4>
            <p className="mx-auto max-w-[260px] text-xs leading-5 text-muted-foreground">
              {t("Bản thảo này chưa được gửi đến giảng viên hướng dẫn.")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
