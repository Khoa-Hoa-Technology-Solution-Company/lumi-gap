import { useI18n } from "@/i18n";
import { useId } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquare,
  Scale,
  Sparkles,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface SubmissionFeedbackPanelProps {
  versionNumber: number;
  threads: VersionMentorThread[];
  activeThread?: VersionMentorThread;
  onSelectMentor: (key: string) => void;
  language: string;
  embedded?: boolean;
}

export function SubmissionFeedbackPanel({
  versionNumber,
  threads,
  activeThread,
  onSelectMentor,
  language,
  embedded = false,
}: SubmissionFeedbackPanelProps) {
  const { t } = useI18n();
  const locale = language === "vi" ? "vi-VN" : "en-US";
  const tabId = useId();
  const latestReview = activeThread?.latestReview;

  const rubricItems = (latestReview?.responses ?? []).filter((r) => r.criterionKey?.startsWith("rubric:"));
  const sectionItems = (latestReview?.responses ?? []).filter((r) => !r.criterionKey?.startsWith("rubric:"));

  return (
    <section
      className={embedded ? "overflow-hidden" : "rounded-xl border border-border bg-card shadow-xs overflow-hidden"}
      aria-label={t("Phản hồi từ giảng viên")}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/75 bg-muted/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <h3 className="text-[13px] font-semibold text-foreground">{t("Góp ý của giảng viên")}</h3>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          v{versionNumber}
        </span>
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
                  onKeyDown={(event) => {
                    const next = event.key === "Home" ? 0 : event.key === "End" ? threads.length - 1 : event.key === "ArrowRight" ? (index + 1) % threads.length : event.key === "ArrowLeft" ? (index + threads.length - 1) % threads.length : -1;
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
      <div className="p-4" id={`${tabId}-panel`} role={threads.length > 1 ? "tabpanel" : undefined} aria-labelledby={threads.length > 1 && activeThread ? `${tabId}-${activeThread.key}` : undefined}>
        {latestReview ? (
          <div className="space-y-4">
            {/* 1. Mentor + Date + Round */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{latestReview.reviewerName}</p>
                  <p className="text-xs text-muted-foreground"> {t("Vòng")} {latestReview.roundNumber}
                    {latestReview.submittedAt
                      ? ` · ${new Date(latestReview.submittedAt).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })}`
                      : ""}
                  </p>
                </div>
              </div>
              {activeThread?.status && <ReviewStatusBadge status={activeThread.status} />}
            </div>

            {/* 2. Review Verdict */}
            <div className="rounded-lg border border-border/80 bg-muted/25 px-3.5 py-2.5 text-xs">
              <span className="text-muted-foreground">{t("Kết luận vòng góp ý:")} </span>
              <span className="font-semibold text-foreground">
                {t(formatReviewVerdictLabel(latestReview.overallAssessment))}
              </span>
            </div>

            {/* 3. Overall Comment */}
            {latestReview.overallComment?.trim() && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"> {t("Nhận xét tổng quan")} </h4>
                <div className="rounded-lg border border-border/70 bg-muted/15 p-3.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                  {latestReview.overallComment}
                </div>
              </div>
            )}

            {/* 4. Required Revisions */}
            {latestReview.requiredRevisions && latestReview.requiredRevisions.length > 0 && (
              <div className="space-y-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> {t("Nội dung cần chỉnh sửa (")}{latestReview.requiredRevisions.length})
                </h4>
                <ul className="space-y-2">
                  {latestReview.requiredRevisions.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-rose-200/80 bg-rose-50/40 p-3 text-xs dark:border-rose-900/50 dark:bg-rose-950/15"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant="outline"
                          className={
                            item.priority === "MAJOR"
                              ? "border-rose-300 bg-rose-100/70 text-[10px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                              : "border-amber-300 bg-amber-100/70 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          }
                        >
                          {t(item.priority === "MAJOR" ? "Quan trọng" : "Nên sửa")}
                        </Badge>
                        {item.status && item.status !== "OPEN" && (
                          <span className="text-[11px] font-medium text-muted-foreground">{item.status}</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground">{item.description}</p>
                      {item.responses && item.responses.length > 0 && (
                        <div className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                          {item.responses.map((resp, idx) => (
                            <p key={idx}>
                              <span className="font-medium text-foreground">{t("Phản hồi của nhóm:")} </span>
                              {resp.responseText}
                            </p>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Strengths & Concerns (only if provided) */}
            {latestReview.keyConcerns?.trim() && (
              <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 p-3.5 text-xs text-amber-950 dark:text-amber-200">
                <p className="font-semibold">{t("Điểm cần lưu ý")}</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{latestReview.keyConcerns}</p>
              </div>
            )}
            {latestReview.keyStrengths?.trim() && (
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-500/10 p-3.5 text-xs text-emerald-950 dark:text-emerald-200">
                <p className="flex items-center gap-1 font-semibold">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {t("Điểm nổi bật / Đề nghị bổ sung")} </p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{latestReview.keyStrengths}</p>
              </div>
            )}

            {/* 5. Rubric / Criterion Feedback (only if present; never requires scores) */}
            {(rubricItems.length > 0 || sectionItems.length > 0) && (
              <div className="space-y-2.5 border-t border-border/70 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Scale className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {t("Nhận xét theo tiêu chí (")}{rubricItems.length + sectionItems.length})
                  </h4>
                  {latestReview.weightedScore != null && (
                    <span className="text-xs font-semibold text-primary">
                      {Number(latestReview.weightedScore).toFixed(1)}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {[...rubricItems, ...sectionItems].map((resp, idx) => {
                    const cleanKey = resp.criterionKey.replace(/^rubric:/, "");
                    const title = LEGACY_RUBRIC_LABELS[cleanKey] ?? cleanKey;
                    const comment =
                      resp.comment && !resp.comment.startsWith("Rubric score:") ? resp.comment : undefined;
                    return (
                      <div key={`${resp.criterionKey}-${idx}`} className="rounded-lg border border-border/70 bg-muted/15 p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{t(title)}</span>
                          <div className="flex items-center gap-1.5">
                            {resp.notApplicable ? (
                              <Badge variant="outline" className="text-[10px]">N/A</Badge>
                            ) : resp.score != null ? (
                              <Badge variant="outline" className="text-[11px] font-semibold">
                                {resp.score}
                              </Badge>
                            ) : resp.assessment ? (
                              <Badge variant="outline" className="text-[10px]">
                                {t(({ NEEDS_IMPROVEMENT: "Cần cải thiện", STRONG: "Tốt", ADEQUATE: "Đạt", WEAK: "Cần cải thiện", NOT_APPLICABLE: "Không áp dụng" } as Record<string, string>)[resp.assessment] ?? resp.assessment.replaceAll("_", " "))}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        {resp.evidence && (
                          <p className="italic text-muted-foreground">“{resp.evidence}”</p>
                        )}
                        {comment && (
                          <p className="whitespace-pre-wrap leading-relaxed text-foreground">{comment}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 6. Next-Step Actions */}
            <div className="space-y-2 border-t border-border/70 pt-3">
              {latestReview.requestId && (activeThread?.request?.canView ?? true) && (
                <Button asChild variant="ghost" size="sm" className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <Link to={`/review-requests/${latestReview.requestId}`}>
                    <ExternalLink className="h-3.5 w-3.5" /> {t("Xem chi tiết yêu cầu & phản hồi")} </Link>
                </Button>
              )}
            </div>
          </div>
        ) : activeThread?.status.isUnavailable ? (
          <div className="py-6 text-center space-y-2" data-testid="feedback-empty-state">
            <AlertCircle className="mx-auto h-7 w-7 text-muted-foreground/70" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">{t(activeThread.status.label)}</p>
            <p className="text-xs leading-5 text-muted-foreground"> {t("Yêu cầu góp ý gửi đến")} {activeThread.reviewerName} {t("không còn hoạt động. Bạn có thể gửi lại yêu cầu mới khi sẵn sàng.")} </p>
          </div>
        ) : activeThread ? (
          /* Compact calm empty state when waiting for Mentor feedback */
          <div className="py-3 text-center space-y-2" data-testid="feedback-empty-state">
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
              {activeThread.status.state === "IN_PROGRESS" ? (
                <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              ) : (
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1">
              <h4 className="text-[13px] font-semibold text-foreground">{t("Chưa có phản hồi từ giảng viên")}</h4>
              <p className="mx-auto max-w-[290px] text-balance text-xs leading-5 text-muted-foreground"> {t("Bạn sẽ nhận thông báo khi giảng viên hoàn tất góp ý.")} </p>
            </div>
            {activeThread.request?.canView && (
              <div className="pt-0.5">
                <Link
                  to={`/review-requests/${activeThread.request.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                > {t("Xem chi tiết yêu cầu")} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="py-3 text-center space-y-1.5" data-testid="feedback-empty-state">
            <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
            <h4 className="text-[13px] font-semibold text-foreground">{t("Chưa có phản hồi từ giảng viên")}</h4>
            <p className="mx-auto max-w-[260px] text-xs leading-5 text-muted-foreground"> {t("Bản thảo này chưa được gửi đến giảng viên hướng dẫn.")} </p>
          </div>
        )}
      </div>
    </section>
  );
}
