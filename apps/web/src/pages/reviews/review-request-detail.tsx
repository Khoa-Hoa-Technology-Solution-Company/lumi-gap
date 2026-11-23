import { useReviewPageNavigation } from "@/features/reviews/hooks/use-review-page-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileText,
  Info,
  RotateCcw,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReviewRequest, useReviewRequestAction } from "@/features/reviews";
import { useSubmissionRevisions } from "@/features/submissions";
import { ReviewIntegrityChecklist } from "@/features/reviews/components/review-integrity-checklist";
import { reviewsApi } from "@/features/reviews/api/reviews.api";
import { internalAssessmentLabel } from "@/features/reviews/scientific-review-model";
import { formatSubmissionTypeLabel } from "@/features/submissions/submission-review-status";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";

const DEFAULT_REVIEW_WINDOW_DAYS = 30; // backend DEFAULT_REVIEW_WINDOW_DAYS, used when a request has no due date

const REQUEST_STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
  REQUESTED: { label: "Chờ giảng viên phản hồi", className: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300", dot: "bg-amber-500" },
  ACCEPTED: { label: "Giảng viên đã nhận", className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  IN_REVIEW: { label: "Giảng viên đang đánh giá", className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  REVISION_REQUESTED: { label: "Cần chỉnh sửa", className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  RESUBMITTED: { label: "Đã gửi bản chỉnh sửa", className: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500" },
  SUBMITTED: { label: "Đã có góp ý", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  COMPLETED: { label: "Đã hoàn tất góp ý", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  DECLINED: { label: "Giảng viên đã từ chối", className: "border-border bg-muted/60 text-muted-foreground", dot: "bg-muted-foreground/50" },
  CANCELLED: { label: "Yêu cầu đã hủy", className: "border-border bg-muted/60 text-muted-foreground", dot: "bg-muted-foreground/50" },
};

const REVIEW_MODE_LABELS: Record<string, string> = {
  RUBRIC_ASSESSMENT: "Đánh giá theo thang tiêu chí",
  STRUCTURED_REVIEW: "Phản biện có cấu trúc",
  GUIDED_FEEDBACK: "Góp ý có hướng dẫn",
};

const ASSESSMENT_LABELS: Record<string, string> = {
  STRONG: "Tốt",
  ACCEPTABLE: "Đạt yêu cầu",
  NEEDS_IMPROVEMENT: "Cần cải thiện",
  WEAK: "Chưa đạt",
  NOT_APPLICABLE: "Không áp dụng",
};

export function ReviewRequestDetailPage() {
  const { embedded, param, navigate, href } = useReviewPageNavigation();
  const Container = embedded ? "section" : "main";
  const requestId = param("requestId") ?? "";
  const { t } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const query = useReviewRequest(requestId);
  const actions = useReviewRequestAction();
  const submissionId = query.data?.artifact.submissionId ?? "";
  const revisions = useSubmissionRevisions(submissionId);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const responseScope = useRef("");
  const [responseDirty, setResponseDirty] = useState(false);
  const [savingResponses, setSavingResponses] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const detail = query.data;
  const openItems = useMemo(
    () => detail?.reviews.flatMap((review) => review.requiredRevisions).filter((item) => ["OPEN", "REOPENED"].includes(item.status)) ?? [],
    [detail],
  );

  useEffect(() => {
    if (!selectedVersion) {
      const draft = openItems.flatMap((item) => item.responses ?? []).find((response) => response.status === "DRAFT");
      if (draft) setSelectedVersion(draft.submissionRevisionId);
      return;
    }
    const scope = `${requestId}:${selectedVersion}`;
    if (responseScope.current === scope) return;
    responseScope.current = scope;
    setResponses(
      Object.fromEntries(
        openItems.map((item) => [
          item.id,
          item.responses?.find((response) => response.submissionRevisionId === selectedVersion && response.status === "DRAFT")?.responseText ?? "",
        ]),
      ),
    );
    setResponseDirty(false);
  }, [requestId, selectedVersion, openItems]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (responseDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [responseDirty]);

  if (query.isLoading) {
    return (
      <Container className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
          <div className="h-56 animate-pulse rounded-xl bg-muted" />
        </div>
      </Container>
    );
  }

  if (!detail || query.error) {
    return (
      <Container className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-2">
            <p className="font-medium">Không tìm thấy yêu cầu đánh giá này hoặc bạn không có quyền truy cập.</p>
            <Button variant="outline" size="sm" asChild>
              <Link to={href("/reviews")}>Quay lại Trung tâm phản biện</Link>
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  const isRequester = currentUser?.id === detail.requester.id;
  const isReviewer = currentUser?.id === detail.reviewer.id;
  const canAccept = isReviewer && detail.status === "REQUESTED" && detail.assignment?.status === "assigned";
  const reviewBackPath = detail.origin === "MENTOR_GUIDANCE" && isReviewer ? "/mentor-workspace?view=work" : "/reviews";
  const projectSubmissionHref =
    detail.artifact.projectId && detail.artifact.submissionId
      ? `/projects/${encodeURIComponent(detail.artifact.projectId)}?tab=submissions&submission=${encodeURIComponent(detail.artifact.submissionId)}`
      : null;

  async function respondToInvitation(accept: boolean) {
    if (!detail || actions.accept.isPending || actions.decline.isPending) return;
    try {
      if (accept) {
        await actions.accept.mutateAsync(detail.id);
        navigate(`/reviews/${detail.assignment.id}`);
      } else {
        await actions.decline.mutateAsync({ id: detail.id });
        navigate(reviewBackPath);
      }
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message || t("mentorWorkspace.reviewResponseError"));
    }
  }

  // Mirrors the backend rule: cancel before acceptance, or after the deadline of an accepted review.
  const deadline = detail.dueAt
    ? new Date(detail.dueAt)
    : new Date(new Date(detail.createdAt).getTime() + DEFAULT_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const acceptedNotOverdue = ["ACCEPTED", "IN_REVIEW"].includes(detail.status) && deadline.getTime() >= Date.now();
  const canCancel = isRequester && (detail.status === "REQUESTED" || (["ACCEPTED", "IN_REVIEW"].includes(detail.status) && !acceptedNotOverdue));
  const canResubmit = (detail.canRespond ?? isRequester) && detail.status === "REVISION_REQUESTED" && openItems.length > 0;
  const pdfOptions = revisions.data?.filter((item) => item.revisionNumber > detail.artifact.revisionNumber) ?? [];

  const statusMeta = REQUEST_STATUS_META[detail.status] ?? {
    label: detail.status.replaceAll("_", " "),
    className: "border-border bg-muted/60 text-muted-foreground",
    dot: "bg-muted-foreground/50",
  };
  const reviewModeLabel = REVIEW_MODE_LABELS[detail.templateVersion.reviewMode] ?? detail.templateVersion.reviewMode.replaceAll("_", " ");
  const artifactTypeLabel = formatSubmissionTypeLabel(detail.artifact.type);
  const canOpenWorkspace = isReviewer && ["ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(detail.status) && Boolean(detail.assignment?.id);

  async function resubmit() {
    if (!detail) return;
    if (!selectedVersion) return toast.error("Vui lòng chọn phiên bản bản thảo đã chỉnh sửa");
    if (openItems.some((item) => !responses[item.id]?.trim())) return toast.error("Vui lòng phản hồi đầy đủ các mục cần chỉnh sửa");
    try {
      await actions.resubmit.mutateAsync({
        id: detail.id,
        input: {
          revisionId: selectedVersion,
          responses: openItems.map((item) => ({ revisionItemId: item.id, responseText: (responses[item.id] ?? "").trim() })),
        },
      });
      setResponseDirty(false);
      toast.success("Đã gửi bản chỉnh sửa tới giảng viên đánh giá");
      await query.refetch();
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message || "Không thể gửi lại bản chỉnh sửa lúc này");
    }
  }

  async function saveResponses() {
    if (!detail || !selectedVersion) return toast.error(t("Select the revised artifact version"));
    setSavingResponses(true);
    try {
      await reviewsApi.saveResponseDrafts(detail.id, {
        revisionId: selectedVersion,
        responses: openItems.map((item) => ({ revisionItemId: item.id, responseText: (responses[item.id] ?? "").trim() })),
      });
      setResponseDirty(false);
      toast.success(t("Response drafts saved"));
      await query.refetch();
    } catch {
      toast.error(t("Could not save response drafts. Your text is kept."));
    } finally {
      setSavingResponses(false);
    }
  }

  return (
    <Container className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 space-y-4" data-no-i18n>
      {/* Top Contextual Navigation Bar */}
      {(!embedded || canOpenWorkspace || canCancel) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!embedded ? (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {projectSubmissionHref && !isReviewer ? (
                <>
                  <Link
                    to={projectSubmissionHref}
                    className="inline-flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Quay lại bản thảo trong dự án
                  </Link>
                  <span className="text-border" aria-hidden="true">·</span>
                  <Link to={href("/reviews")} className="text-muted-foreground transition-colors hover:text-foreground">
                    Trung tâm phản biện
                  </Link>
                </>
              ) : (
                <Link
                  to={href("/reviews")}
                  className="inline-flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Trung tâm phản biện
                </Link>
              )}
            </div>
          ) : (
            <span />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {canOpenWorkspace && (
              <Button size="sm" className="h-8 text-xs" asChild>
                <Link to={href(`/reviews/${encodeURIComponent(detail.assignment.id)}`)}>{t("Open review workspace")}</Link>
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCancelOpen(true)}>
                Hủy yêu cầu
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Unified Header & Request Overview Card */}
      <header className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl leading-snug break-words">
                {detail.artifact.title}
              </h1>
              <Badge variant="outline" className={`h-5 gap-1.5 px-2 text-[11px] font-medium ${statusMeta.className}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} aria-hidden="true" />
                {statusMeta.label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">{artifactTypeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>Phiên bản v{detail.artifact.revisionNumber}</span>
              <span aria-hidden="true">·</span>
              <span>{reviewModeLabel}</span>
            </div>
          </div>

          {projectSubmissionHref && (
            <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 text-xs" asChild>
              <Link to={projectSubmissionHref}>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Mở bản thảo (v{detail.artifact.revisionNumber})
              </Link>
            </Button>
          )}
        </div>

        {/* Structured Metadata Strip (Replaces loose dl + separate Template card) */}
        <dl className="grid grid-cols-1 gap-3 border-t border-border/75 bg-muted/20 px-5 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-0.5 min-w-0">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <User className="h-3 w-3 shrink-0" aria-hidden="true" />
              Người gửi
            </dt>
            <dd className="truncate font-medium text-foreground">
              <Link to={`/academics/${encodeURIComponent(detail.requester.id)}`} className="hover:text-primary hover:underline">
                {detail.requester.fullName}
              </Link>
            </dd>
          </div>
          <div className="space-y-0.5 min-w-0">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <User className="h-3 w-3 shrink-0" aria-hidden="true" />
              Giảng viên đánh giá
            </dt>
            <dd className="truncate font-medium text-foreground">
              <Link to={`/academics/${encodeURIComponent(detail.reviewer.id)}`} className="hover:text-primary hover:underline">
                {detail.reviewer.fullName}
              </Link>
            </dd>
          </div>
          <div className="space-y-0.5 min-w-0">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
              Hạn phản biện
            </dt>
            <dd className="font-medium text-foreground tabular-nums">
              {detail.dueAt ? new Date(detail.dueAt).toLocaleDateString("vi-VN") : "Không đặt hạn"}
            </dd>
          </div>
          <div className="space-y-0.5 min-w-0">
            <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <ClipboardList className="h-3 w-3 shrink-0" aria-hidden="true" />
              Biểu mẫu đánh giá
            </dt>
            <dd className="font-medium text-foreground">
              Mẫu v{detail.templateVersion.versionNumber} · {detail.templateVersion.criteria.length} tiêu chí
            </dd>
          </div>
        </dl>

        {/* Optional Contextual Notes */}
        {(detail.message || (detail.mentorRelationshipActive && detail.origin !== "MENTOR_GUIDANCE") || (isRequester && acceptedNotOverdue)) && (
          <div className="space-y-2 border-t border-border/75 px-5 py-3 text-xs">
            {detail.message && (
              <p className="leading-relaxed text-foreground/90 whitespace-pre-wrap">
                <span className="font-semibold text-muted-foreground">Lời nhắn khi gửi: </span>
                {detail.message}
              </p>
            )}
            {detail.mentorRelationshipActive && detail.origin !== "MENTOR_GUIDANCE" && (
              <p className="text-muted-foreground">
                Giảng viên này hiện cũng là cố vấn của dự án. Yêu cầu phản biện chính thức này được theo dõi độc lập.
              </p>
            )}
            {isRequester && acceptedNotOverdue && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-500/25 bg-blue-500/[0.06] px-3 py-2 text-blue-900 dark:text-blue-200">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <p className="leading-5">
                  Giảng viên đã tiếp nhận đánh giá nên tạm thời chưa thể hủy yêu cầu. Nếu quá hạn {deadline.toLocaleDateString("vi-VN")} mà chưa có phản hồi, bạn có thể hủy và mời giảng viên khác.
                </p>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Mentor Accept / Decline Invitation Card (Reviewer only) */}
      {canAccept && (
        <section className="rounded-xl border border-primary/25 bg-primary/[0.03] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("mentorWorkspace.reviewInvitationTitle")}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("mentorWorkspace.reviewInvitationHint")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void respondToInvitation(true)} disabled={actions.accept.isPending || actions.decline.isPending}>
              {t("mentorWorkspace.acceptReview")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void respondToInvitation(false)} disabled={actions.accept.isPending || actions.decline.isPending}>
              {t("mentorWorkspace.declineReview")}
            </Button>
          </div>
        </section>
      )}

      {/* Review History & Feedback Card */}
      <section className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border/75 bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Lịch sử phản biện & góp ý</h2>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {detail.reviews.length} vòng
          </span>
        </div>

        {detail.reviews.length > 0 ? (
          <div className="divide-y divide-border/75">
            {[...detail.reviews].reverse().map((review, index) => {
              const revNumber = revisions.data?.find((item) => item._id === review.revisionId)?.revisionNumber;
              return (
                <article key={review.id}>
                  <details open={index === 0}>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/25 transition-colors">
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground">
                          Vòng {review.roundNumber}
                          {revNumber ? ` · Phiên bản v${revNumber}` : ""}
                          {review.weightedScore != null ? ` · Điểm ${review.weightedScore.toFixed(2)} / 5.0` : ""}
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {t(internalAssessmentLabel(review.overallAssessment, review.status)) || review.status}
                        </p>
                      </div>
                      {review.submittedAt && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          Gửi ngày {new Date(review.submittedAt).toLocaleDateString("vi-VN")}
                        </span>
                      )}
                    </summary>

                    <div className="space-y-4 border-t border-border/70 px-5 py-4">
                      {(review.keyStrengths || review.keyConcerns || review.overallComment) && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {review.keyStrengths && (
                            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3.5 text-xs">
                              <p className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                Điểm nổi bật
                              </p>
                              <p className="mt-1.5 whitespace-pre-wrap leading-5 text-foreground">{review.keyStrengths}</p>
                            </div>
                          )}
                          {review.keyConcerns && (
                            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3.5 text-xs">
                              <p className="font-semibold text-amber-800 dark:text-amber-300">Điểm cần lưu ý</p>
                              <p className="mt-1.5 whitespace-pre-wrap leading-5 text-foreground">{review.keyConcerns}</p>
                            </div>
                          )}
                          {review.overallComment && (
                            <div className="rounded-lg border border-border/75 bg-muted/20 p-3.5 text-xs sm:col-span-2">
                              <p className="font-semibold text-muted-foreground">Nhận xét tổng quan</p>
                              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-foreground">{review.overallComment}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {detail.templateVersion.criteria.some((c) => review.responses.some((r) => r.criterionKey === c.key)) && (
                        <div className="divide-y divide-border/70 rounded-lg border border-border/75">
                          {detail.templateVersion.criteria.map((criterion) => {
                            const response = review.responses.find((item) => item.criterionKey === criterion.key);
                            if (!response) return null;
                            return (
                              <div key={criterion.key} className="p-3.5 space-y-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h3 className="text-xs font-semibold text-foreground">{criterion.title}</h3>
                                  <div className="flex items-center gap-1.5">
                                    {response.assessment && (
                                      <Badge variant="outline" className="h-5 px-2 text-[11px]">
                                        {ASSESSMENT_LABELS[response.assessment] ?? response.assessment.replaceAll("_", " ")}
                                      </Badge>
                                    )}
                                    {response.score !== undefined && response.score !== null && (
                                      <Badge variant="secondary" className="h-5 px-2 text-[11px] font-semibold">
                                        {response.score} / 5
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {response.comment && <p className="text-xs leading-5 text-muted-foreground">{response.comment}</p>}
                                {response.evidence && (
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground/80">Dẫn chiếu: </span>
                                    {response.evidence}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {review.integrityChecks && Object.keys(review.integrityChecks).length > 0 && (
                        <ReviewIntegrityChecklist disabled value={review.integrityChecks} onChange={() => {}} />
                      )}

                      {review.requiredRevisions.length > 0 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-4">
                          <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200">{t("What the team needs to revise")}</h3>
                          <ul className="mt-2.5 space-y-2">
                            {review.requiredRevisions.map((item) => (
                              <li key={item.id} className="flex items-start gap-2.5 rounded-md border border-border/60 bg-background/80 p-3 text-xs">
                                <span
                                  className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    item.priority === "MAJOR"
                                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                      : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                  }`}
                                >
                                  {item.priority === "MAJOR" ? "Quan trọng" : "Nên sửa"}
                                </span>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <p className="text-sm text-foreground leading-5">{item.description}</p>
                                  {item.locator && <span className="block text-xs text-muted-foreground">{item.locator}</span>}
                                  {item.quotation && <q className="block text-xs italic text-muted-foreground">{item.quotation}</q>}
                                  {item.responses
                                    ?.filter((response) => response.status !== "DRAFT")
                                    .map((response) => (
                                      <p key={response.submissionRevisionId} className="pt-1 text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground">Phản hồi của nhóm: </span>
                                        {response.responseText} · {response.status}
                                      </p>
                                    ))}
                                </div>
                                <Badge variant="outline" className="shrink-0 text-[10px]">
                                  {item.status}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-10 text-center space-y-2.5">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Chưa có phản hồi từ giảng viên</p>
              <p className="mx-auto max-w-md text-xs leading-5 text-muted-foreground">
                Bạn sẽ nhận thông báo khi giảng viên hoàn tất đánh giá phiên bản v{detail.artifact.revisionNumber}.
              </p>
            </div>
            {projectSubmissionHref && (
              <div className="pt-1">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
                  <Link to={projectSubmissionHref}>
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Xem bản thảo trong dự án
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Resubmit Revisions Card (Requester when REVISION_REQUESTED) */}
      {canResubmit && (
        <section className="rounded-xl border border-blue-500/30 bg-blue-500/[0.04] p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Phản hồi góp ý & gửi bản chỉnh sửa</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cập nhật bản thảo trước, sau đó giải trình cách nhóm đã tiếp thu cho từng mục cần chỉnh sửa.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Phiên bản bản thảo đã chỉnh sửa
              <select
                value={selectedVersion}
                onChange={(event) => setSelectedVersion(event.target.value)}
                disabled={responseDirty}
                className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Chọn phiên bản mới</option>
                {pdfOptions.map((revision) => (
                  <option key={revision._id} value={revision._id}>
                    Phiên bản v{revision.revisionNumber} · {new Date(revision.createdAt).toLocaleDateString("vi-VN")}
                  </option>
                ))}
              </select>
            </label>
            <Link to={projectSubmissionHref ?? `/submissions/${submissionId}`} className="inline-block text-xs font-medium text-primary hover:underline">
              Quản lý phiên bản / tải lên bản thảo mới
            </Link>
          </div>

          <div className="space-y-3">
            {openItems.map((item) => (
              <label key={item.id} className="block rounded-lg border border-border bg-background p-3.5 text-xs font-medium">
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {item.priority === "MAJOR" ? "Quan trọng" : "Nên sửa"}
                  </Badge>
                  <span className="text-sm text-foreground">{item.description}</span>
                </span>
                <textarea
                  value={responses[item.id] ?? ""}
                  onChange={(event) => {
                    setResponses((current) => ({ ...current, [item.id]: event.target.value }));
                    setResponseDirty(true);
                  }}
                  className="mt-2.5 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal"
                  placeholder="Mô tả thay đổi và vị trí trong bản thảo mới..."
                />
              </label>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{t("Drafts stay private until you submit the revised manuscript. Only the mentor can accept a correction.")}</p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={saveResponses} disabled={!selectedVersion || savingResponses || actions.resubmit.isPending}>
              {t("Save response drafts")}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={resubmit} disabled={actions.resubmit.isPending || savingResponses}>
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {actions.resubmit.isPending ? "Đang gửi…" : "Gửi bản chỉnh sửa"}
            </Button>
          </div>
        </section>
      )}

      {/* Completed Banner */}
      {detail.status === "COMPLETED" && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4 text-xs leading-5 text-emerald-900 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div className="space-y-1">
            <p>{t("Internal review completed for this revision. This is not publication acceptance. Authorship, CRediT and submission declarations remain separate checks.")}</p>
            {(detail.canRespond ?? isRequester) && detail.artifact.projectId && (
              <Link className="inline-block font-semibold underline underline-offset-2" to={`/projects/${detail.artifact.projectId}?tab=contributions&contributionTab=readiness`}>
                {t("Open internal submission checks")}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Cancel Request Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy yêu cầu đánh giá này?</DialogTitle>
            <DialogDescription>
              Giảng viên sẽ ngừng quyền truy cập vào không gian đánh giá của yêu cầu này. Mọi góp ý đã gửi trước đó luôn được giữ lại.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Giữ lại yêu cầu</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await actions.cancel.mutateAsync(detail.id);
                  toast.success("Đã hủy yêu cầu đánh giá");
                  navigate(projectSubmissionHref ?? "/reviews");
                } catch {
                  toast.error("Không thể hủy yêu cầu này ở thời điểm hiện tại");
                }
              }}
            >
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
