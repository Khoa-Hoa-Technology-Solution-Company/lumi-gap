import { useI18n } from "@/i18n";
import { useState } from "react";
import { AlertCircle, Bot, CheckSquare, ChevronDown, Loader2, Play, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AiPreReview } from "../api/submissions.api";

interface SubmissionAiPreReviewProps {
  preReview?: AiPreReview;
  currentRevisionId?: string;
  canRunPreReview: boolean;
  isRunning: boolean;
  onRun: () => void;
}

export function SubmissionAiPreReview({
  preReview,
  currentRevisionId,
  canRunPreReview,
  isRunning,
  onRun,
}: SubmissionAiPreReviewProps) {
  const { t } = useI18n();
  const [addressedItems, setAddressedItems] = useState<Record<string, boolean>>({});

  // Progressive disclosure: hide section completely if AI pre-review has never been used
  if (!preReview) return null;

  const running = isRunning || preReview.status === "QUEUED" || preReview.status === "PROCESSING";
  const outdated =
    preReview.sourceRevisionId !== undefined &&
    currentRevisionId !== undefined &&
    preReview.sourceRevisionId !== currentRevisionId;

  return (
    <details
      className="group rounded-xl border border-border bg-card shadow-xs overflow-hidden"
      open={running || preReview.status === "FAILED"}
      data-testid="ai-prereview-panel"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium transition-colors hover:bg-muted/30 sm:px-5">
        <span className="flex min-w-0 items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate font-semibold text-foreground">{t("Đánh giá sơ bộ bằng AI")}</span>
          <Badge variant="outline" className="hidden text-[11px] font-normal text-muted-foreground sm:inline-flex"> {t("Chỉ tham khảo · Không phải góp ý của giảng viên")} </Badge>
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {preReview.sourceRevisionNumber != null && (
            <span className="text-xs text-muted-foreground">v{preReview.sourceRevisionNumber}</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="space-y-4 border-t border-border/80 px-4 py-4 text-xs leading-5 sm:px-5">
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-amber-950 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p>
            <strong>{t("Đây là phân tích tự động của AI, không phải kết luận của giảng viên hướng dẫn.")}</strong> {t("Sinh viên cần tự kiểm chứng và không coi đây là đánh giá chính thức.")} </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline"> {t("Phiên bản được phân tích: v")}{preReview.sourceRevisionNumber ?? 1}
            </Badge>
            {outdated && (
              <span className="text-amber-700 dark:text-amber-400"> {t("Đánh giá AI này dành cho phiên bản cũ hơn bản hiện tại.")} </span>
            )}
          </div>
          {canRunPreReview && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={running} onClick={onRun}>
              <Play className="h-3 w-3" />
              {running ? "Đang phân tích…" : "Chạy lại phân tích AI"}
            </Button>
          )}
        </div>

        {running && (
          <p className="text-xs text-muted-foreground" role="status"> {t("Đang phân tích bản thảo bằng AI. Kết quả sẽ tự hiển thị khi hoàn tất.")} </p>
        )}

        {preReview.status === "FAILED" && (
          <p className="text-xs text-destructive" role="alert">
            {preReview.errorMessage || "Phân tích AI không thể hoàn tất. Bạn có thể thử chạy lại sau."}
          </p>
        )}

        {preReview.status === "CANCELLED" && (
          <p className="text-xs text-muted-foreground">
            {preReview.errorMessage || "Phân tích AI đã bị hủy."}
          </p>
        )}

        {preReview.status === "COMPLETED" && (
          <div className="space-y-3">
            {preReview.summary && (
              <div className="rounded-lg border bg-muted/15 p-3 space-y-1">
                <strong className="block text-foreground">{t("Tóm tắt phân tích")}</strong>
                <p className="leading-relaxed text-foreground">{preReview.summary}</p>
              </div>
            )}

            {preReview.goalAlignment && (
              <div className="rounded-lg border bg-muted/15 p-3 space-y-1">
                <strong className="block text-foreground">{t("Mức độ phù hợp mục tiêu")}</strong>
                <p className="leading-relaxed text-foreground">
                  {typeof preReview.goalAlignment === "string"
                    ? preReview.goalAlignment
                    : preReview.goalAlignment.assessment ?? ""}
                </p>
              </div>
            )}

            {preReview.rqCoverage && preReview.rqCoverage.length > 0 && (
              <div className="rounded-lg border bg-muted/15 p-3 space-y-2">
                <strong className="flex items-center gap-1.5 text-foreground">
                  <CheckSquare className="h-3.5 w-3.5 text-primary" /> {t("Độ bao phủ câu hỏi nghiên cứu")} </strong>
                <ul className="space-y-1.5">
                  {preReview.rqCoverage.map((rq: any, idx: number) => {
                    const key = `rq_${idx}`;
                    const checked = Boolean(addressedItems[key]);
                    return (
                      <li key={idx} className="flex items-start gap-2 rounded bg-background p-2">
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

            {preReview.unsupportedClaims && preReview.unsupportedClaims.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <strong className="flex items-center gap-1.5 text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" /> {t("Luận điểm cần bổ sung bằng chứng (")}{preReview.unsupportedClaims.length})
                </strong>
                <ul className="space-y-1.5">
                  {preReview.unsupportedClaims.map((claim: any, idx: number) => {
                    const key = `claim_${idx}`;
                    const checked = Boolean(addressedItems[key]);
                    return (
                      <li key={idx} className="flex items-start gap-2 rounded border bg-card p-2">
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

            {preReview.citationIssues && preReview.citationIssues.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                <strong className="block text-amber-800 dark:text-amber-300"> {t("Lưu ý trích dẫn (")}{preReview.citationIssues.length})
                </strong>
                <ul className="list-disc pl-4 space-y-1 text-foreground">
                  {preReview.citationIssues.map((issue: any, idx: number) => (
                    <li key={idx}>{typeof issue === "string" ? issue : `${issue.citation}: ${issue.issue}`}</li>
                  ))}
                </ul>
              </div>
            )}

            {preReview.reviewFocusAreas && preReview.reviewFocusAreas.length > 0 && (
              <div className="rounded-lg border bg-muted/15 p-3 space-y-1">
                <strong className="block text-foreground">{t("Gợi ý trọng tâm rà soát")}</strong>
                <ul className="list-disc pl-4 space-y-0.5 text-foreground">
                  {preReview.reviewFocusAreas.map((area, idx) => (
                    <li key={idx}>{area}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
