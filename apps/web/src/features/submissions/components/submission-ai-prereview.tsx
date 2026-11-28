import { useI18n } from "@/i18n";
import { useMemo, useState } from "react";
import { AlertCircle, Bot, CheckSquare, ChevronDown, Clock, History, Loader2, Play, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AiPreReview } from "../api/submissions.api";

interface SubmissionAiPreReviewProps {
  /** Legacy single pre-review prop (kept backwards-compatible for existing callers/tests). */
  preReview?: AiPreReview;
  /** Full submission AI pre-review list for strict version-specific selection and history. */
  preReviews?: AiPreReview[];
  selectedRevisionId?: string;
  selectedRevisionNumber?: number;
  currentRevisionId?: string;
  canRunPreReview: boolean;
  isRunning: boolean;
  onRun: (revisionId?: string) => void;
  onSelectVersion?: (revisionId: string) => void;
}

const LONG_RUNNING_THRESHOLD_MS = 90_000;

export function SubmissionAiPreReview({
  preReview,
  preReviews,
  selectedRevisionId,
  selectedRevisionNumber,
  currentRevisionId,
  canRunPreReview,
  isRunning,
  onRun,
  onSelectVersion,
}: SubmissionAiPreReviewProps) {
  const { t, language } = useI18n();
  const locale = language === "vi" ? "vi-VN" : "en-US";
  const [addressedItems, setAddressedItems] = useState<Record<string, boolean>>({});

  const targetRevisionId = selectedRevisionId ?? currentRevisionId;

  const allRuns = useMemo(() => {
    if (preReviews && preReviews.length > 0) return preReviews;
    return preReview ? [preReview] : [];
  }, [preReviews, preReview]);

  // Strict revision-id match (never display v1's result as if it belonged to v2)
  const versionRuns = useMemo(() => {
    if (!targetRevisionId) return allRuns;
    return allRuns.filter((item) => item.sourceRevisionId === targetRevisionId);
  }, [allRuns, targetRevisionId]);

  const latestForVersion = versionRuns[0];
  const lastCompletedForVersion = versionRuns.find((item) => item.status === "COMPLETED");
  const activeSubmissionJob = allRuns.find((item) => item.status === "QUEUED" || item.status === "PROCESSING");
  const otherVersionActiveJob =
    activeSubmissionJob && targetRevisionId && activeSubmissionJob.sourceRevisionId !== targetRevisionId
      ? activeSubmissionJob
      : undefined;
  const previousCompletedOtherVersion = useMemo(
    () =>
      allRuns.find(
        (item) => item.status === "COMPLETED" && item.sourceRevisionId && item.sourceRevisionId !== targetRevisionId,
      ),
    [allRuns, targetRevisionId],
  );

  // Progressive disclosure: hide completely when submission has never used AI pre-review and none is running
  if (allRuns.length === 0 && !isRunning) return null;

  const isQueued = latestForVersion?.status === "QUEUED";
  const isProcessing = latestForVersion?.status === "PROCESSING";
  const versionJobRunning = isRunning || isQueued || isProcessing;
  const isFailed = latestForVersion?.status === "FAILED";
  const isCancelled = latestForVersion?.status === "CANCELLED";
  const elapsedMs = latestForVersion?.createdAt ? Date.now() - Date.parse(latestForVersion.createdAt) : 0;
  const isLongRunning = versionJobRunning && elapsedMs > LONG_RUNNING_THRESHOLD_MS;

  const displayVersionNumber =
    selectedRevisionNumber ?? latestForVersion?.sourceRevisionNumber ?? 1;
  // Preserve last completed analysis for this exact version even if a newer retry failed (AI-13)
  const completedResult =
    latestForVersion?.status === "COMPLETED" ? latestForVersion : lastCompletedForVersion;
  const olderHistoryRuns = versionRuns.slice(1);

  return (
    <details
      className="group rounded-xl border border-border bg-card shadow-xs overflow-hidden"
      open={versionJobRunning || isFailed || Boolean(otherVersionActiveJob)}
      data-testid="ai-prereview-panel"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/30 sm:px-5">
        <span className="flex min-w-0 items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate font-semibold text-foreground">{t("Đánh giá sơ bộ bằng AI")}</span>
          <Badge variant="outline" className="hidden text-[11px] font-normal text-muted-foreground sm:inline-flex">
            {t("Phiên bản v")}{displayVersionNumber} · {t("Chỉ tham khảo")}
          </Badge>
          {versionJobRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {isQueued && (
            <Badge variant="outline" className="border-amber-300/80 bg-amber-500/10 text-[10.5px] text-amber-800 dark:text-amber-300">
              {t("Đang chờ xử lý")}
            </Badge>
          )}
          {isProcessing && (
            <Badge variant="outline" className="border-blue-300/80 bg-blue-500/10 text-[10.5px] text-blue-800 dark:text-blue-300">
              {t("Đang phân tích")}
            </Badge>
          )}
          {isFailed && (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-[10.5px] text-destructive">
              {t("Chưa hoàn tất")}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="space-y-3.5 border-t border-border/80 px-4 py-4 text-xs leading-5 sm:px-5">
        {/* Single calm academic disclaimer (no redundant stacked warnings) */}
        <div className="flex items-start gap-2 rounded-lg border border-border/80 bg-muted/25 px-3 py-2 text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p>{t("Đây là phân tích tự động của AI, không phải kết luận của giảng viên hướng dẫn. Kết quả AI chỉ hỗ trợ rà soát bản thảo, không thay thế đánh giá của giảng viên.")}</p>
        </div>

        {/* Another revision currently analyzing (concurrency notice — Section 41) */}
        {otherVersionActiveJob && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-300/60 bg-blue-500/8 px-3 py-2.5 text-blue-950 dark:text-blue-200" role="status">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <p>
              {t("Phiên bản v{{version}} đang được phân tích. Bạn có thể chạy phân tích v{{current}} sau khi tác vụ hiện tại kết thúc.", {
                version: otherVersionActiveJob.sourceRevisionNumber ?? 1,
                current: displayVersionNumber,
              })}
            </p>
          </div>
        )}

        {/* Idle state for this specific version (never borrows v1's result under v2) */}
        {!latestForVersion && !isRunning && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/10 px-3.5 py-3">
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">
                {t("Phiên bản v{{version}} chưa có đánh giá sơ bộ bằng AI.", { version: displayVersionNumber })}
              </p>
              {previousCompletedOtherVersion?.sourceRevisionId && onSelectVersion && (
                <button
                  type="button"
                  onClick={() => onSelectVersion(previousCompletedOtherVersion.sourceRevisionId!)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t("Xem phân tích của phiên bản trước (v{{version}})", {
                    version: previousCompletedOtherVersion.sourceRevisionNumber ?? 1,
                  })}
                </button>
              )}
            </div>
            {canRunPreReview && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                disabled={Boolean(otherVersionActiveJob) || isRunning}
                onClick={() => onRun(targetRevisionId)}
              >
                <Play className="h-3 w-3" aria-hidden="true" />
                {t("Phân tích phiên bản v{{version}}", { version: displayVersionNumber })}
              </Button>
            )}
          </div>
        )}

        {/* Queued / Processing / Long-running states (honest status, zero fake progress) */}
        {versionJobRunning && (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/15 px-3.5 py-3" role="status">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
              <span>
                {isQueued
                  ? t("Đang chờ xử lý")
                  : t("Đang phân tích phiên bản v{{version}}", { version: displayVersionNumber })}
              </span>
            </div>
            <p className="text-muted-foreground">
              {isQueued
                ? t("Yêu cầu phân tích phiên bản v{{version}} đã được tiếp nhận và đang chờ hàng đợi xử lý nền.", {
                    version: displayVersionNumber,
                  })
                : t("Đang phân tích bản thảo bằng AI. Kết quả sẽ tự hiển thị khi hoàn tất.")}
            </p>
            {isLongRunning && (
              <p className="text-amber-800 dark:text-amber-300">
                {t("Quá trình phân tích đang mất nhiều thời gian hơn dự kiến. Bạn vẫn có thể tiếp tục làm việc và xem kết quả tại đây sau.")}
              </p>
            )}
          </div>
        )}

        {/* Failed / Cancelled notice (always keeps Retry & preserves previous completed result below) */}
        {isFailed && (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3" role="alert">
            <div className="space-y-1">
              <p className="font-semibold text-destructive">{t("Chưa thể hoàn tất phân tích AI.")}</p>
              <p className="text-foreground/85">
                {latestForVersion.errorMessage || t("Phân tích AI không thể hoàn tất. Bạn có thể thử chạy lại sau.")}
              </p>
            </div>
            {canRunPreReview && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1 text-xs"
                disabled={Boolean(otherVersionActiveJob) || isRunning}
                onClick={() => onRun(targetRevisionId)}
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                {t("Thử lại")}
              </Button>
            )}
          </div>
        )}

        {isCancelled && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5 text-muted-foreground">
            <span>{latestForVersion.errorMessage || t("Phân tích AI đã bị hủy.")}</span>
            {canRunPreReview && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={Boolean(otherVersionActiveJob) || isRunning}
                onClick={() => onRun(targetRevisionId)}
              >
                <Play className="h-3 w-3" aria-hidden="true" />
                {t("Chạy lại phân tích AI")}
              </Button>
            )}
          </div>
        )}

        {/* Completed Result for this exact version (also preserved if a subsequent retry failed) */}
        {completedResult && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <Badge variant="outline">
                  {t("Phiên bản được phân tích: v")}{completedResult.sourceRevisionNumber ?? displayVersionNumber}
                </Badge>
                {completedResult.completedAt && (
                  <span className="tabular-nums">
                    {new Date(completedResult.completedAt).toLocaleString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {latestForVersion?.id !== completedResult.id && (
                  <Badge variant="secondary" className="text-[10.5px]">
                    {t("Kết quả lần phân tích thành công trước đó")}
                  </Badge>
                )}
              </div>
              {canRunPreReview && !versionJobRunning && !isFailed && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  disabled={Boolean(otherVersionActiveJob)}
                  onClick={() => onRun(targetRevisionId)}
                >
                  <Play className="h-3 w-3" aria-hidden="true" />
                  {t("Chạy lại phân tích AI")}
                </Button>
              )}
            </div>

            {completedResult.summary && (
              <div className="space-y-1 rounded-lg border bg-muted/15 p-3">
                <strong className="block text-foreground">{t("Tóm tắt phân tích")}</strong>
                <p className="leading-relaxed text-foreground">{completedResult.summary}</p>
              </div>
            )}

            {completedResult.goalAlignment && (
              <div className="space-y-1 rounded-lg border bg-muted/15 p-3">
                <strong className="block text-foreground">{t("Mức độ phù hợp mục tiêu")}</strong>
                <p className="leading-relaxed text-foreground">
                  {typeof completedResult.goalAlignment === "string"
                    ? completedResult.goalAlignment
                    : completedResult.goalAlignment.assessment ?? ""}
                </p>
              </div>
            )}

            {completedResult.rqCoverage && completedResult.rqCoverage.length > 0 && (
              <div className="space-y-2 rounded-lg border bg-muted/15 p-3">
                <strong className="flex items-center gap-1.5 text-foreground">
                  <CheckSquare className="h-3.5 w-3.5 text-primary" /> {t("Độ bao phủ câu hỏi nghiên cứu")}
                </strong>
                <ul className="space-y-1.5">
                  {completedResult.rqCoverage.map((rq: { research_question?: string; question?: string; assessment?: string; status?: string }, idx: number) => {
                    const key = `rq_${completedResult.id}_${idx}`;
                    const checked = Boolean(addressedItems[key]);
                    return (
                      <li key={key} className="flex items-start gap-2 rounded bg-background p-2">
                        <input
                          type="checkbox"
                          id={key}
                          checked={checked}
                          onChange={(e) => setAddressedItems((prev) => ({ ...prev, [key]: e.target.checked }))}
                          className="mt-0.5 rounded border-input"
                        />
                        <label
                          htmlFor={key}
                          className={`cursor-pointer ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}
                        >
                          <span className="font-semibold">{rq.research_question ?? rq.question ?? `RQ ${idx + 1}`}:</span>{" "}
                          {rq.assessment ?? rq.status ?? ""}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {completedResult.unsupportedClaims && completedResult.unsupportedClaims.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-500/5 p-3">
                <strong className="flex items-center gap-1.5 text-amber-900 dark:text-amber-300">
                  <AlertCircle className="h-3.5 w-3.5" /> {t("Luận điểm cần bổ sung bằng chứng (")}{completedResult.unsupportedClaims.length})
                </strong>
                <ul className="space-y-1.5">
                  {completedResult.unsupportedClaims.map((claim: string | { quote?: string; reason?: string; claim?: string }, idx: number) => {
                    const key = `claim_${completedResult.id}_${idx}`;
                    const checked = Boolean(addressedItems[key]);
                    return (
                      <li key={key} className="flex items-start gap-2 rounded border bg-card p-2">
                        <input
                          type="checkbox"
                          id={key}
                          checked={checked}
                          onChange={(e) => setAddressedItems((prev) => ({ ...prev, [key]: e.target.checked }))}
                          className="mt-0.5 rounded border-input"
                        />
                        <label
                          htmlFor={key}
                          className={`cursor-pointer ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}
                        >
                          {typeof claim === "string" ? (
                            claim
                          ) : (
                            <>
                              {claim.quote && <p className="italic text-muted-foreground">“{claim.quote}”</p>}
                              <p className="mt-0.5 font-medium">{claim.reason ?? claim.claim}</p>
                            </>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {completedResult.citationIssues && completedResult.citationIssues.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <strong className="block text-amber-800 dark:text-amber-300">
                  {t("Lưu ý trích dẫn (")}{completedResult.citationIssues.length})
                </strong>
                <ul className="list-disc space-y-1 pl-4 text-foreground">
                  {completedResult.citationIssues.map((issue: string | { citation?: string; issue?: string }, idx: number) => (
                    <li key={idx}>{typeof issue === "string" ? issue : `${issue.citation}: ${issue.issue}`}</li>
                  ))}
                </ul>
              </div>
            )}

            {completedResult.reviewFocusAreas && completedResult.reviewFocusAreas.length > 0 && (
              <div className="space-y-1 rounded-lg border bg-muted/15 p-3">
                <strong className="block text-foreground">{t("Gợi ý trọng tâm rà soát")}</strong>
                <ul className="list-disc space-y-0.5 pl-4 text-foreground">
                  {completedResult.reviewFocusAreas.map((area, idx) => (
                    <li key={idx}>{area}</li>
                  ))}
                </ul>
              </div>
            )}

            {completedResult.limitations && completedResult.limitations.length > 0 && (
              <div className="space-y-1 rounded-lg border border-border/70 bg-muted/10 p-3 text-muted-foreground">
                <strong className="block text-foreground">{t("Phạm vi & giới hạn phân tích")}</strong>
                <ul className="list-disc space-y-0.5 pl-4">
                  {completedResult.limitations.map((lim, idx) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Analysis history for this version */}
        {olderHistoryRuns.length > 0 && (
          <details className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("Lịch sử phân tích phiên bản này")} ({olderHistoryRuns.length})</span>
            </summary>
            <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
              {olderHistoryRuns.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                  <span className="tabular-nums">
                    {new Date(run.completedAt ?? run.createdAt).toLocaleString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="font-medium text-foreground/80">
                    {run.status === "COMPLETED"
                      ? t("Hoàn tất")
                      : run.status === "FAILED"
                        ? t("Chưa hoàn tất")
                        : run.status === "CANCELLED"
                          ? t("Đã hủy")
                          : t("Đang xử lý")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}
