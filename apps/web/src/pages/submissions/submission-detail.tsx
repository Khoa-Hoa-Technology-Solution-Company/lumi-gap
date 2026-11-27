import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ResearchVersion } from "@trend/shared-types";
import {
  ArrowLeft,
  Award,
  Bot,
  ChevronDown,
  FileText,
  Info,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Send,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubmissionIntroductionView } from "@/features/submissions/components/submission-introduction-view";
import { MentorManuscriptDialog } from "@/features/submissions/components/mentor-manuscript-dialog";
import { SubmissionDocumentViewer } from "@/features/submissions/components/submission-document-viewer";
import {
  ReviewStatusBadge,
  SubmissionFeedbackPanel,
} from "@/features/submissions/components/submission-feedback-panel";
import { SubmissionVersionPanel } from "@/features/submissions/components/submission-version-panel";
import { SubmissionAiPreReview } from "@/features/submissions/components/submission-ai-prereview";
import { SubmitReviewDialog } from "@/features/reviews/components/submit-review-dialog";
import {
  formatSubmissionTypeLabel,
  resolveSubmissionPrimaryAction,
  resolveVersionReviewContext,
} from "@/features/submissions/submission-review-status";
import { useI18n } from "@/i18n";
import {
  useAddSubmissionRevision,
  useCreateSubmissionVersion,
  useAiPreReviews,
  useRunAiPreReview,
  useSubmission,
  useSubmissionHistory,
  submissionsApi,
} from "@/features/submissions";
import { projectSubmissionPath } from "@/features/submissions/project-submission-path";
import "@/features/submissions/submission-detail.css";

export function SubmissionDetailPage({
  submissionId,
  projectId,
  readOnly = false,
}: {
  submissionId?: string;
  projectId?: string;
  readOnly?: boolean;
}) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const uploading = useRef(false);
  const { id: routeId = "" } = useParams();
  const id = submissionId ?? routeId;
  const backPath = projectId ? projectSubmissionPath(projectId) : "/submissions";
  const Heading = projectId ? "h2" : "h1";
  const locale = language === "vi" ? "vi-VN" : "en-US";

  const submission = useSubmission(id, projectId);
  const scopedAccess = Boolean(submission.data) && !submission.error;
  const history = useSubmissionHistory(id, scopedAccess);
  const addRevision = useAddSubmissionRevision(id);
  const createVersion = useCreateSubmissionVersion(id);
  const preReviews = useAiPreReviews(id, scopedAccess);
  const runPreReview = useRunAiPreReview(id);

  // Selected version & mentor tab state (never auto-jumps away when user selects an older version)
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    () => new URLSearchParams(window.location.search).get("revision") ?? "",
  );
  const [selectedMentorKey, setSelectedMentorKey] = useState<string>("");
  const [mobileTab, setMobileTab] = useState<"document" | "feedback">("document");
  const [pdfExpanded, setPdfExpanded] = useState(false);

  // Modal / drawer state
  const [mentorSendOpen, setMentorSendOpen] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [revisionFile, setRevisionFile] = useState<File>();
  const [revisionResponse, setRevisionResponse] = useState("");
  const [revisionContent, setRevisionContent] = useState("");
  const [revisionMode, setRevisionMode] = useState<"PDF" | "TEXT">("PDF");

  // Reset selected mentor when switching version so default priority applies cleanly
  useEffect(() => {
    setSelectedMentorKey("");
  }, [selectedVersionId]);

  const data = submission.data;
  const visibleHistory = history.error ? undefined : history.data;
  const versions = visibleHistory?.versions ?? [];

  const currentVersion: ResearchVersion = useMemo(() => {
    if (versions.length > 0) {
      const explicit = selectedVersionId ? versions.find((v) => v.id === selectedVersionId) : undefined;
      if (explicit) return explicit;
      const current = versions.find((v) => v.id === (data?.currentRevisionId ?? visibleHistory?.currentRevisionId));
      if (current) return current;
      return versions.reduce((latest, v) => (v.revisionNumber > latest.revisionNumber ? v : latest), versions[0]!);
    }
    return {
      id: data?.currentRevisionId ?? "",
      revisionNumber: data?.currentRevisionNumber ?? 1,
      hasPdf: false,
      contentSnapshot: null,
      contentType: "PDF",
      checksumSha256: null,
      sizeBytes: 0,
      originalFileName: null,
      sourceRevisionId: null,
      manuscriptSnapshotId: null,
      responseToReview: null,
      reviews: [],
      createdAt: data?.updatedAt ?? new Date().toISOString(),
    };
  }, [versions, selectedVersionId, data?.currentRevisionId, data?.currentRevisionNumber, data?.updatedAt, visibleHistory?.currentRevisionId]);

  const isLatestVersion =
    !visibleHistory?.currentRevisionId || currentVersion.id === visibleHistory.currentRevisionId;

  const reviewContext = useMemo(
    () =>
      resolveVersionReviewContext({
        submissionStatus: data?.status ?? "submitted",
        history: visibleHistory,
        version: currentVersion,
        isCurrentVersion: isLatestVersion,
        selectedMentorKey,
      }),
    [data?.status, visibleHistory, currentVersion, isLatestVersion, selectedMentorKey],
  );

  if (submission.isLoading) {
    return (
      <div className="submission-detail-shell mx-auto max-w-7xl py-6">
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-14 animate-pulse rounded-xl bg-muted" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="h-[520px] animate-pulse rounded-xl bg-muted lg:col-span-8" />
            <div className="h-[360px] animate-pulse rounded-xl bg-muted lg:col-span-4" />
          </div>
        </div>
      </div>
    );
  }

  if (!data || submission.error) {
    return (
      <div className="py-6">
        <Link to={backPath} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Quay lại danh sách bản thảo
        </Link>
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
          <p>{t("Unable to load this submission. It may be unavailable or you may not have access.")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={submission.isFetching}
            onClick={() => void submission.refetch()}
          >
            {t("Retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (selectedVersionId && visibleHistory && !versions.some(version => version.id === selectedVersionId)) return <section className="space-y-3 py-6" role="alert"><p>{t("Phiên bản này không còn khả dụng hoặc bạn không có quyền xem.")}</p><Button variant="outline" onClick={() => setSelectedVersionId(visibleHistory.currentRevisionId ?? "")}>{t("Xem phiên bản hiện có")}</Button></section>;

  const closedStatus = ["accepted", "rejected", "withdrawn"].includes(data.status);
  const canRevise = !readOnly && !history.error && visibleHistory?.canManage === true && !closedStatus;
  const canRequestReview = !readOnly && !history.error && visibleHistory?.canRequestReview === true && !closedStatus;
  const canRunPreReview =
    !readOnly && !history.error &&
    visibleHistory?.canRunAiPreReview === true &&
    !["completed", "accepted", "rejected", "withdrawn"].includes(data.status);
  const canProvideFeedback =
    !readOnly && !history.error && (visibleHistory?.canProvideFeedback ?? (data as { canProvideFeedback?: boolean }).canProvideFeedback ?? false);

  const effectiveProjectId = projectId ?? data.projectId;
  const editManuscriptUrl = visibleHistory?.sourceManuscriptWritable && data.sourceManuscriptId && effectiveProjectId
    ? `/projects/${encodeURIComponent(effectiveProjectId)}/manuscripts/${encodeURIComponent(data.sourceManuscriptId)}`
    : undefined;

  const hasMentorFlow = Boolean(
    visibleHistory?.assignedMentor ||
    reviewContext.threads.length > 0 ||
    effectiveProjectId,
  );

  const actionPlan = resolveSubmissionPrimaryAction({
    readOnly,
    canProvideFeedback,
    canRevise,
    hasEditableSource: Boolean(editManuscriptUrl),
    hasAssignedMentor: Boolean(visibleHistory?.assignedMentor || reviewContext.threads.length > 0),
    status: reviewContext.versionStatus,
    hasOpenReviewOnCurrentVersion: reviewContext.hasOpenReviewOnCurrentVersion,
    currentRevisionNumber: visibleHistory?.currentRevisionNumber ?? data.currentRevisionNumber ?? 1,
  });

  const researchDetails = [
    { title: "Mục tiêu nghiên cứu", value: data.researchGoal },
    {
      title: "Câu hỏi nghiên cứu",
      value: data.researchQuestions?.map((item: string, index: number) => `${index + 1}. ${item}`).join("\n"),
      preserve: true,
    },
    { title: "Khoảng trống nghiên cứu", value: data.claimedResearchGap },
    { title: "Đóng góp dự kiến", value: data.claimedContribution },
    { title: "Phương pháp luận", value: data.methodology },
    { title: "Phạm vi nghiên cứu", value: data.scope },
  ].filter((item) => Boolean(item.value?.trim()));

  const latestPreReview = preReviews.data?.find(review => review.sourceRevisionId === currentVersion.id);
  const preReviewRunning = latestPreReview?.status === "QUEUED" || latestPreReview?.status === "PROCESSING";
  const revisionPending = addRevision.isPending || createVersion.isPending;

  async function handleOpenMentorWorkspace() {
    try {
      const prepared = await submissionsApi.prepareMentorReview(id);
      navigate(`/reviews/${prepared.assignmentId}`);
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(t(message || "Ask the owner to share this manuscript and assign mentor review first."));
    }
  }

  function handleOpenSendOrRevision() {
    if (visibleHistory?.assignedMentor || (projectId && hasMentorFlow)) {
      setMentorSendOpen(true);
    } else {
      setShowRevision((v) => !v);
    }
  }

  async function handleRunPreReview() {
    try {
      await runPreReview.mutateAsync();
      toast.success("Đã gửi yêu cầu phân tích sơ bộ bằng AI");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? "Không thể chạy phân tích AI lúc này");
    }
  }

  async function uploadRevision() {
    if (uploading.current) return;
    if (revisionMode === "PDF" && !revisionFile) {
      toast.error("Vui lòng chọn tệp PDF phiên bản mới");
      return;
    }
    if (
      revisionMode === "PDF" &&
      revisionFile &&
      (revisionFile.type !== "application/pdf" || revisionFile.size === 0 || revisionFile.size > 10 * 1024 * 1024)
    ) {
      toast.error("Vui lòng dùng tệp PDF không vượt quá 10 MB");
      return;
    }
    if (revisionMode === "TEXT" && (!revisionContent.trim() || revisionResponse.trim().length < 3)) {
      toast.error("Nhập nội dung bản thảo và mô tả thay đổi ít nhất 3 ký tự");
      return;
    }

    uploading.current = true;
    try {
      if (revisionMode === "PDF") {
        await addRevision.mutateAsync({ file: revisionFile!, responseToReview: revisionResponse || undefined });
      } else {
        await createVersion.mutateAsync({
          content: revisionContent.trim(),
          summary: revisionResponse.trim(),
          expectedRevisionNumber: data!.currentRevisionNumber,
        });
      }
      toast.success("Đã lưu phiên bản bản thảo mới");
      setRevisionFile(undefined);
      setRevisionResponse("");
      setRevisionContent("");
      setSelectedVersionId("");
      setShowRevision(false);
    } catch {
      toast.error("Không thể tải phiên bản này lên");
    } finally {
      uploading.current = false;
    }
  }

  const refreshAll = async () => {
    await Promise.all([history.refetch(), submission.refetch()]);
  };

  const sentTimestamp = reviewContext.activeThread?.sentAt ?? currentVersion.createdAt;
  const formattedSentAt = sentTimestamp
    ? new Date(sentTimestamp).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
    : "";

  const showOverflowSendOption =
    canRevise &&
    actionPlan.kind === "CONTINUE_EDITING";
  const showOverflowAiOption = canRunPreReview && !latestPreReview;
  const showOverflowPeerReviewOption = !projectId && canRequestReview;
  const hasOverflowMenu = showOverflowSendOption || showOverflowAiOption || showOverflowPeerReviewOption;

  const contributions = visibleHistory?.contributions ?? [];

  return (
    <div className={`submission-detail-shell min-w-0 ${projectId ? "py-2" : "mx-auto max-w-7xl px-4 py-6 sm:px-6"}`}>
      {effectiveProjectId && (
        <MentorManuscriptDialog
          open={mentorSendOpen}
          onOpenChange={setMentorSendOpen}
          projectId={effectiveProjectId}
          submissionId={id}
          manuscriptId={data.sourceManuscriptId ?? undefined}
          onSent={() => {
            setMentorSendOpen(false);
            setSelectedVersionId("");
            void history.refetch();
            void submission.refetch();
            toast.success("Đã gửi bản thảo cho giảng viên góp ý.");
          }}
        />
      )}

      {/* Top Navigation Row (standalone route only; project workspace uses WorkspaceBreadcrumb) */}
      {(!projectId || (!isLatestVersion && Boolean(visibleHistory?.currentRevisionId))) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {!projectId ? (
            <Link
              to={backPath}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {t("Quay lại danh sách bản thảo")}
            </Link>
          ) : (
            <span />
          )}

          {!isLatestVersion && visibleHistory?.currentRevisionId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-primary"
              onClick={() => setSelectedVersionId(visibleHistory!.currentRevisionId!)}
            > {t("Quay về bản mới nhất (v")}{visibleHistory.currentRevisionNumber})
            </Button>
          )}
        </div>
      )}

      {/* A. Unified Header + Integrated Review Status Bar */}
      <header className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Heading className="text-lg font-bold tracking-tight break-words text-foreground sm:text-xl leading-snug">
                {data.title}
              </Heading>
              <ReviewStatusBadge status={reviewContext.versionStatus} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {formatSubmissionTypeLabel(data.submissionType)}
              </span>
              <span aria-hidden="true">·</span>
              <span>Phiên bản v{currentVersion.revisionNumber}</span>
              {data.researchField && (
                <>
                  <span className="hidden sm:inline" aria-hidden="true">·</span>
                  <span className="hidden sm:inline">{data.researchField}</span>
                </>
              )}
            </div>
          </div>

          {/* Context-aware Single Primary CTA + Refresh + Overflow */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {actionPlan.secondaryEditLink && editManuscriptUrl && (
              <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Link to={editManuscriptUrl}>
                  <Pencil className="h-3.5 w-3.5" />
                  Tiếp tục chỉnh sửa
                </Link>
              </Button>
            )}

            {actionPlan.kind === "OPEN_MENTOR_REVIEW" && (
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void handleOpenMentorWorkspace()}>
                <FileText className="h-3.5 w-3.5" />
                {actionPlan.label}
              </Button>
            )}

            {actionPlan.kind === "CONTINUE_EDITING" && editManuscriptUrl && (
              <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
                <Link to={editManuscriptUrl}>
                  <Pencil className="h-3.5 w-3.5" />
                  {actionPlan.label}
                </Link>
              </Button>
            )}

            {(actionPlan.kind === "SEND_NEXT_VERSION" ||
              actionPlan.kind === "PREPARE_UPDATE" ||
              actionPlan.kind === "SEND_TO_MENTOR") && (
                <Button
                  size="sm"
                  variant={actionPlan.kind === "PREPARE_UPDATE" ? "outline" : "default"}
                  className="h-8 gap-1.5 text-xs"
                  disabled={revisionPending}
                  onClick={handleOpenSendOrRevision}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {actionPlan.label}
                </Button>
              )}

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              disabled={history.isFetching || submission.isFetching}
              onClick={() => void refreshAll()}
              aria-label="Làm mới trạng thái"
              title="Làm mới trạng thái"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${history.isFetching || submission.isFetching ? "animate-spin" : ""}`} />
            </Button>

            {hasOverflowMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Tùy chọn bổ sung">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {showOverflowSendOption && (
                    <DropdownMenuItem onSelect={handleOpenSendOrRevision}>
                      <Upload className="mr-2 h-4 w-4" />
                      Gửi phiên bản mới để góp ý
                    </DropdownMenuItem>
                  )}
                  {showOverflowAiOption && (
                    <DropdownMenuItem disabled={runPreReview.isPending || preReviewRunning} onSelect={() => void handleRunPreReview()}>
                      <Bot className="mr-2 h-4 w-4" />
                      Chạy AI Pre-review tham khảo
                    </DropdownMenuItem>
                  )}
                  {showOverflowPeerReviewOption && (
                    <>
                      {(showOverflowSendOption || showOverflowAiOption) && <DropdownMenuSeparator />}
                      <div className="p-1">
                        <SubmitReviewDialog
                          submissionId={id}
                          revisionId={currentVersion.id}
                          artifactTitle={data.title}
                          artifactType={data.submissionType}
                          trigger={
                            <button
                              type="button"
                              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            >
                              <Send className="mr-2 h-4 w-4" />
                              Gửi yêu cầu phản biện khác
                            </button>
                          }
                        />
                      </div>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Integrated Compact Status Sub-Bar */}
        <div
          aria-label="Tóm tắt trạng thái góp ý"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border/70 bg-muted/25 px-4 py-2 text-xs sm:px-5"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <p className="font-medium leading-snug text-foreground sm:truncate" data-testid="review-summary-text" title={reviewContext.summaryText}>
              {reviewContext.summaryText}
            </p>
          </div>
          {(formattedSentAt || reviewContext.activeThread?.request?.dueAt) && (
            <p className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
              {formattedSentAt ? `Gửi lúc ${formattedSentAt}` : ""}
              {reviewContext.activeThread?.request?.dueAt
                ? `${formattedSentAt ? " · " : ""}Hạn dự kiến: ${new Date(reviewContext.activeThread.request.dueAt).toLocaleDateString(locale)}`
                : ""}
            </p>
          )}
        </div>
      </header>

      {/* Optional Revision Upload Drawer (for non-mentor/standalone submissions) */}
      {showRevision && canRevise && (
        <section className="mt-4 rounded-xl border border-primary/30 bg-card p-5 shadow-xs">
          <h3 className="text-sm font-semibold">{t("Upload a new PDF version")}</h3>
          <fieldset disabled={revisionPending}>
            <div className="mt-3 flex w-fit rounded-lg border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                className={`rounded-md px-3 py-1 font-medium transition-colors ${revisionMode === "PDF" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                onClick={() => setRevisionMode("PDF")}
              >
                Tải PDF mới
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1 font-medium transition-colors ${revisionMode === "TEXT" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                onClick={() => setRevisionMode("TEXT")}
              >
                Cập nhật văn bản
              </button>
            </div>

            <label className="mt-3 block text-sm font-medium">
              {t("Revision summary")}
              <textarea
                className="mt-1.5 min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Tóm tắt ngắn gọn các điểm nhóm đã tiếp thu và sửa đổi theo góp ý của Mentor..."
                value={revisionResponse}
                maxLength={20000}
                onChange={(e) => setRevisionResponse(e.target.value)}
              />
            </label>

            {revisionMode === "PDF" ? (
              <label className="mt-3 block text-sm font-medium">
                {t("PDF file")}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="mt-1.5 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
                  onChange={(e) => setRevisionFile(e.target.files?.[0])}
                />
              </label>
            ) : (
              <label className="mt-3 block text-sm font-medium">
                Nội dung bản thảo mới
                <textarea
                  className="mt-1.5 min-h-40 w-full rounded-md border border-input bg-background p-3 font-mono text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Dán nội dung bản thảo đã chỉnh sửa..."
                  value={revisionContent}
                  maxLength={500000}
                  onChange={(e) => setRevisionContent(e.target.value)}
                  rows={8}
                />
              </label>
            )}

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setShowRevision(false)}>
                Hủy
              </Button>
              <Button
                size="sm"
                onClick={() => void uploadRevision()}
                disabled={
                  revisionPending ||
                  (revisionMode === "PDF" ? !revisionFile : !revisionContent.trim() || revisionResponse.trim().length < 3)
                }
              >
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {t("Upload version")}
              </Button>
            </div>
          </fieldset>
        </section>
      )}

      {/* Load Errors with Independent Retry */}
      {history.error && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive"
          role="alert"
        >
          <span>{t("Unable to load version history and review requests.")}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={history.isFetching} onClick={() => void history.refetch()}>
            {t("Retry")}
          </Button>
        </div>
      )}

      {preReviews.error && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive"
          role="alert"
        >
          <span>{t("Unable to load AI pre-reviews.")}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={preReviews.isFetching} onClick={() => void preReviews.refetch()}>
            {t("Retry")}
          </Button>
        </div>
      )}

      {/* Mobile & Narrow Tablet Tab Switcher (Bản thảo | Góp ý) */}
      <div
        className={`mt-4 flex rounded-lg border border-border bg-muted/40 p-1 ${projectId ? "xl:hidden" : "lg:hidden"}`}
        role="tablist"
        aria-label="Chuyển khu vực xem"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "document"}
          onClick={() => setMobileTab("document")}
          className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${mobileTab === "document"
            ? "bg-background text-foreground shadow-2xs"
            : "text-muted-foreground hover:text-foreground"
            }`}
        >
          Bản thảo (v{currentVersion.revisionNumber})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "feedback"}
          onClick={() => setMobileTab("feedback")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors ${mobileTab === "feedback"
            ? "bg-background text-foreground shadow-2xs"
            : "text-muted-foreground hover:text-foreground"
            }`}
        >
          Góp ý
          {reviewContext.versionStatus.hasFeedback && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* C. Main Content — Two-Column Workspace (Desktop: ~67% PDF Left / ~33% Unified Feedback & History Right) */}
      <div className={`mt-3 grid grid-cols-1 gap-4 ${projectId ? "xl:grid-cols-12" : "lg:grid-cols-12"}`}>
        {/* Left Column: In-App PDF / Document Viewer + Secondary Collapsible Panels */}
        <div
          className={`min-w-0 space-y-4 ${projectId
            ? `${pdfExpanded ? "xl:col-span-12" : "xl:col-span-8"} ${mobileTab === "feedback" ? "hidden xl:block" : "block"}`
            : `${pdfExpanded ? "lg:col-span-12" : "lg:col-span-8"} ${mobileTab === "feedback" ? "hidden lg:block" : "block"}`
            }`}
        >
          {!history.error && <SubmissionDocumentViewer
            submissionId={id}
            submissionTitle={data.title}
            version={currentVersion}
            historyLoading={history.isLoading}
            isLatestVersion={isLatestVersion}
            expanded={pdfExpanded}
            onToggleExpand={() => setPdfExpanded((prev) => !prev)}
          />}

          {/* AI Pre-review (only shown when an AI result exists; clearly marked AI-only) */}
          <SubmissionAiPreReview
            preReview={latestPreReview}
            currentRevisionId={data.currentRevisionId}
            canRunPreReview={canRunPreReview}
            isRunning={runPreReview.isPending}
            onRun={() => void handleRunPreReview()}
          />

          {/* Shared Research Context (collapsed progressive disclosure; only shown when non-empty) */}
          {(data.abstract?.trim() || researchDetails.length > 0) && (
            <details className="group rounded-xl border border-border bg-card shadow-xs overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/30">
                <span className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span>Thông tin đề tài đã chia sẻ</span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t border-border/80 px-4 py-4">
                {data.abstract?.trim() && <SubmissionIntroductionView content={data.abstract} />}
                {researchDetails.length > 0 && (
                  <div className="grid grid-cols-1 gap-3">
                    {researchDetails.map((item) => (
                      <article key={item.title} className="rounded-lg border bg-muted/10 p-3.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {item.title}
                        </h4>
                        <p className={`mt-1.5 text-sm leading-relaxed text-foreground ${item.preserve ? "whitespace-pre-line" : ""}`}>
                          {item.value}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>

        {/* Right Column: Unified Inspector (Mentor Feedback + Compact Version History) */}
        <aside
          className={`min-w-0 space-y-3 ${projectId
            ? `${pdfExpanded ? "xl:hidden" : "xl:col-span-4 xl:sticky xl:top-20 xl:self-start"} ${mobileTab === "document" ? "hidden xl:block" : "block"}`
            : `${pdfExpanded ? "lg:hidden" : "lg:col-span-4 lg:sticky lg:top-20 lg:self-start"} ${mobileTab === "document" ? "hidden lg:block" : "block"}`
            }`}
        >
          <div className="rounded-xl border border-border bg-card shadow-xs divide-y divide-border/75 overflow-hidden">
            <SubmissionFeedbackPanel
              embedded
              versionNumber={currentVersion.revisionNumber}
              threads={reviewContext.threads}
              activeThread={reviewContext.activeThread}
              onSelectMentor={setSelectedMentorKey}
              language={language}
            />

            {visibleHistory && (
              <SubmissionVersionPanel
                embedded
                submissionId={id}
                submissionStatus={data.status}
                history={visibleHistory}
                selectedVersionId={currentVersion.id}
                onSelectVersion={setSelectedVersionId}
                language={language}
              />
            )}
          </div>

          {/* Contribution Linkage (ONLY when formal review contributions exist) */}
          {contributions.length > 0 && effectiveProjectId && (
            <Link
              to={`/projects/${encodeURIComponent(effectiveProjectId)}?tab=contributions`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-xs transition-colors hover:bg-muted/30"
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Award className="h-4 w-4 text-primary" aria-hidden="true" />
                Đóng góp phản biện ({contributions.length} giảng viên)
              </span>
              <span className="font-medium text-primary">Xem hồ sơ</span>
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
