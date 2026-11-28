import { useI18n } from "@/i18n";
import { useMemo, useState } from "react";
import type { ResearchVersion, SubmissionHistory, SubmittedVersionReview } from "@trend/shared-types";
import { ChevronDown, GitCompare, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContentComparison } from "./content-comparison";
import { compareCriterionScore, compareReviewScores, latestReviewsByReviewerAndRubric } from "../score-comparison";
import { resolveVersionReviewContext } from "../submission-review-status";
import { StatusDot } from "./submission-feedback-panel";

interface SubmissionVersionPanelProps {
  submissionId: string;
  submissionStatus: string;
  history: SubmissionHistory;
  selectedVersionId: string;
  onSelectVersion: (versionId: string) => void;
  language: string;
  embedded?: boolean;
  compareOpen?: boolean;
  onCompareOpenChange?: (open: boolean) => void;
}

const scoreText = (review?: SubmittedVersionReview) =>
  review?.weightedScore != null ? review.weightedScore.toFixed(1) : "Không dùng điểm";

export const areVersionsComparable = (before: ResearchVersion, after: ResearchVersion) =>
  before.id !== after.id &&
  ((Boolean(before.contentSnapshot?.trim()) && Boolean(after.contentSnapshot?.trim())) ||
    (before.hasPdf && after.hasPdf) ||
    (before.reviews.length > 0 && after.reviews.length > 0));

const compatible = areVersionsComparable;

export function hasComparableVersions(versions: ResearchVersion[]): boolean {
  return versions.filter((version) => versions.some((other) => compatible(version, other))).length >= 2;
}

export function SubmissionVersionPanel({
  submissionId,
  submissionStatus,
  history,
  selectedVersionId,
  onSelectVersion,
  language,
  embedded = false,
  compareOpen: controlledCompareOpen,
  onCompareOpenChange,
}: SubmissionVersionPanelProps) {
  const { t } = useI18n();
  const locale = language === "vi" ? "vi-VN" : "en-US";
  const versions = history.versions ?? [];

  const [internalCompareOpen, setInternalCompareOpen] = useState(false);
  const compareOpen = controlledCompareOpen ?? internalCompareOpen;
  const setCompareOpen = onCompareOpenChange ?? setInternalCompareOpen;
  const [compareTab, setCompareTab] = useState<"content" | "feedback">("content");
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");

  const comparisonVersions = versions.filter(version => versions.some(other => compatible(version, other)));
  const canCompare = comparisonVersions.length >= 2;

  const afterVersion = comparisonVersions.find((v) => v.id === afterId) ?? comparisonVersions[0];
  const beforeVersion =
      comparisonVersions.find((v) => v.id === beforeId && afterVersion && compatible(v, afterVersion)) ??
      comparisonVersions.find((v) => afterVersion && compatible(v, afterVersion));

  const oldReviews = useMemo(
    () => latestReviewsByReviewerAndRubric(beforeVersion?.reviews ?? []),
    [beforeVersion],
  );
  const newReviews = useMemo(
    () => latestReviewsByReviewerAndRubric(afterVersion?.reviews ?? []),
    [afterVersion],
  );
  const reviewKeys = useMemo(
    () => [...new Set([...oldReviews.keys(), ...newReviews.keys()])],
    [oldReviews, newReviews],
  );

  const hasComparableContent = Boolean(
    beforeVersion &&
      afterVersion &&
      ((beforeVersion.contentSnapshot?.trim() && afterVersion.contentSnapshot?.trim()) || (beforeVersion.hasPdf && afterVersion.hasPdf)),
  );
  const hasComparableFeedback = Boolean(beforeVersion?.reviews.length && afterVersion?.reviews.length);

  if (versions.length === 0) return null;

  return (
    <section
      className={embedded ? "overflow-hidden" : "rounded-xl border border-border bg-card shadow-xs overflow-hidden"}
      aria-labelledby="submission-versions-heading"
    >
      <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <h3 id="submission-versions-heading" className="text-[13px] font-semibold text-foreground"> {t("Lịch sử phiên bản (")}{versions.length})
          </h3>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
        {canCompare && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mx-2 my-1 h-8 gap-1 px-2 text-xs text-primary hover:text-primary"
            onClick={() => {
              setCompareTab(hasComparableContent ? "content" : "feedback");
              setCompareOpen(true);
            }}
          >
            <GitCompare className="h-3.5 w-3.5" /> {t("So sánh phiên bản")} </Button>
        )}

      <ol className="divide-y divide-border/70">
        {versions.map((version: ResearchVersion) => {
          const isLatest = version.id === history.currentRevisionId;
          const isSelected = version.id === selectedVersionId;
          const ctx = resolveVersionReviewContext({
            submissionStatus,
            history,
            version,
            isCurrentVersion: isLatest,
          });
          const mentorNames = ctx.threads.map((t) => t.reviewerName);

          return (
            <li key={version.id}>
              <button
                type="button"
                aria-current={isSelected ? "true" : undefined}
                onClick={() => onSelectVersion(version.id)}
                className={`flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors ${
                  isSelected
                    ? "bg-primary/5 ring-1 ring-inset ring-primary/25"
                    : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                      v{version.revisionNumber}
                    </span>
                    {isLatest && (
                      <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] font-medium"> {t("Mới nhất")} </Badge>
                    )}
                    <span className="inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <StatusDot tone={ctx.versionStatus.tone} />
                      <span className="truncate">{t(ctx.versionStatus.label)}</span>
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {new Date(version.createdAt).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                </div>

                <p className="truncate text-[11.5px] text-muted-foreground">
                  {mentorNames.length > 0 ? mentorNames.join(", ") : "Chưa gửi giảng viên"}
                </p>
              </button>
            </li>
          );
        })}
      </ol>
      </details>

      {/* Version Comparison Dialog (only mounted when >= 2 versions exist) */}
      {canCompare && (
        <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
          <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("So sánh phiên bản")}</DialogTitle>
              <DialogDescription> {t("Chọn hai phiên bản để đối chiếu riêng biệt phần nội dung bản thảo hoặc góp ý giữa các vòng.")} </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground"> {t("Phiên bản trước")} <select
                  aria-label={t("Phiên bản trước")}
                  value={beforeVersion?.id ?? ""}
                  onChange={(e) => setBeforeId(e.target.value)}
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {comparisonVersions.map((v) => (
                    <option key={v.id} value={v.id} disabled={!afterVersion || !compatible(v, afterVersion)}>
                      v{v.revisionNumber} ({new Date(v.createdAt).toLocaleDateString(locale)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground"> {t("Phiên bản sau")} <select
                  aria-label={t("Phiên bản sau")}
                  value={afterVersion?.id ?? ""}
                  onChange={(e) => setAfterId(e.target.value)}
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {comparisonVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.revisionNumber} ({new Date(v.createdAt).toLocaleDateString(locale)})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Distinct Comparison Mode Tabs */}
            <div className="mt-2 flex gap-1 border-b border-border" role="group" aria-label={t("Loại đối chiếu")}>
              <button
                type="button"
                aria-pressed={compareTab === "content"}
                onClick={() => setCompareTab("content")}
                className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  compareTab === "content"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              > {t("So sánh nội dung")} </button>
              <button
                type="button"
                aria-pressed={compareTab === "feedback"}
                onClick={() => setCompareTab("feedback")}
                className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  compareTab === "feedback"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              > {t("So sánh góp ý & rubric")} </button>
            </div>

            <div className="pt-2">
              {compareTab === "content" ? (
                hasComparableContent && beforeVersion && afterVersion ? (
                  <ContentComparison key={`${submissionId}:${beforeVersion.id}:${afterVersion.id}`} id={submissionId} before={beforeVersion} after={afterVersion} />
                ) : (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"> {t("Hai phiên bản được chọn chưa có dữ liệu nội dung phù hợp để đối chiếu trực tiếp.")} </p>
                )
              ) : hasComparableFeedback ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <caption className="sr-only">{t("So sánh góp ý giữa hai phiên bản")}</caption>
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{t("Giảng viên / Rubric")}</th>
                        <th className="pr-3 font-medium">v{beforeVersion?.revisionNumber}</th>
                        <th className="pr-3 font-medium">v{afterVersion?.revisionNumber}</th>
                        <th className="font-medium">{t("Đối chiếu")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewKeys.map((key) => {
                        const oldReview = oldReviews.get(key);
                        const newReview = newReviews.get(key);
                        const result = compareReviewScores(oldReview, newReview);
                        let reason = result.reason;
                        if (!oldReview && newReview && beforeVersion?.reviews.length) {
                          reason = beforeVersion.reviews.some((r) => r.reviewerId === newReview.reviewerId)
                            ? "Khác rubric; không tính chênh lệch điểm."
                            : "Khác giảng viên; không tính chênh lệch điểm.";
                        }
                        if (!newReview && oldReview && afterVersion?.reviews.length) {
                          reason = afterVersion.reviews.some((r) => r.reviewerId === oldReview.reviewerId)
                            ? "Khác rubric; không tính chênh lệch điểm."
                            : "Khác giảng viên; không tính chênh lệch điểm.";
                        }
                        return (
                          <tr key={key} className="border-b align-top">
                            <td className="py-3 pr-3 font-medium">
                              {(newReview ?? oldReview)?.reviewerName}
                            </td>
                            <td className="py-3 pr-3 text-xs">{oldReview ? scoreText(oldReview) : "—"}</td>
                            <td className="py-3 pr-3 text-xs">{newReview ? scoreText(newReview) : "—"}</td>
                            <td className="py-3 text-xs">
                              {result.delta !== undefined ? (
                                <span className="font-semibold">
                                  {result.delta > 0 ? `+${result.delta.toFixed(2)}` : result.delta.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{reason}</span>
                              )}
                              {oldReview && newReview && (
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-primary hover:underline"> {t("Chi tiết từng tiêu chí")} </summary>
                                  <div className="mt-2 space-y-2">
                                    {[...new Set([...oldReview.responses, ...newReview.responses].map((i) => i.criterionKey))].map(
                                      (criterionKey) => {
                                        const left = oldReview.responses.find((i) => i.criterionKey === criterionKey);
                                        const right = newReview.responses.find((i) => i.criterionKey === criterionKey);
                                        const delta = compareCriterionScore(oldReview, newReview, criterionKey);
                                        return (
                                          <div key={criterionKey} className="rounded border bg-muted/20 p-2">
                                            <strong>{criterionKey.replace(/^rubric:/, "")}</strong>
                                            {delta !== undefined && (
                                              <span className="ml-1.5 font-semibold">
                                                ({delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)})
                                              </span>
                                            )}
                                            <p className="mt-1 text-muted-foreground"> {t("Trước:")} {left?.notApplicable ? "N/A" : left?.score ?? left?.assessment ?? "—"}
                                              {left?.comment ? ` · ${left.comment}` : ""}
                                            </p>
                                            <p className="text-foreground">
                                              Sau: {right?.notApplicable ? "N/A" : right?.score ?? right?.assessment ?? "—"}
                                              {right?.comment ? ` · ${right.comment}` : ""}
                                            </p>
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                </details>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"> {t("Hai phiên bản được chọn chưa có góp ý từ giảng viên để đối chiếu.")} </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
