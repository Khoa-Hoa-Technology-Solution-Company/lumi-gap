import { History, RotateCcw, Eye, Lock } from "lucide-react";
import type { ScreeningPhase, ScreeningRescreenReasonCategory, ScreeningRoundView, ScreeningState, WorkspacePerson } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { choiceLabels, isConflictedRound, ScreeningPager, ScreeningStatus, stateLabels } from "./screening-common";
import { ScreeningStatusBadge } from "./screening-status-badge";
import { screeningChoiceTone } from "../screening-status";
import { ScreeningDiscussion, useScreeningDiscussion } from "./screening-discussion";

export const rescreenReasonOptions: Array<{ value: ScreeningRescreenReasonCategory; label: string }> = [
  { value: "NEW_INFORMATION", label: "Có thông tin hoặc toàn văn mới" },
  { value: "PREVIOUS_DECISION_ERROR", label: "Phát hiện quyết định trước chưa chính xác" },
  { value: "CRITERIA_CHANGED", label: "Tiêu chí nghiên cứu thay đổi" },
  { value: "OTHER", label: "Lý do khác" },
];

export const rescreenReasonLabels: Record<ScreeningRescreenReasonCategory, string> = {
  NEW_INFORMATION: "Có thông tin hoặc toàn văn mới",
  PREVIOUS_DECISION_ERROR: "Phát hiện quyết định trước chưa chính xác",
  CRITERIA_CHANGED: "Tiêu chí nghiên cứu thay đổi",
  OTHER: "Lý do khác",
};

export function screeningStageLabel(phase: ScreeningPhase) {
  return phase === "FULL_TEXT" ? "Toàn văn (Full-text)" : "Tiêu đề & Tóm tắt";
}

export function screeningOutcomeSummaryLabel(status: ScreeningState) {
  if (status === "INCLUDED") return "Đã chọn";
  if (status === "EXCLUDED") return "Đã loại";
  if (status === "CLOSED_UNRESOLVED") return "Không đạt đồng thuận";
  if (status === "WAITING_FULLTEXT") return "Qua tóm tắt · Chờ toàn văn";
  return stateLabels[status] ?? status;
}

export function ReviewVersionHistory({ round, assignmentId, beforeRevision }: { round: ScreeningRoundView; assignmentId: string; beforeRevision: number }) {
  const earlier = round.reviewHistory?.filter(r => r.assignmentId === assignmentId && r.revision < beforeRevision) ?? [];
  if (!earlier.length) return null;
  return <details className="mt-2 border-t pt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Lịch sử đánh giá ({earlier.length})</summary>{earlier.map(review => <div key={review.id} className="mt-2"><strong>Phiên bản {review.revision} · {choiceLabels[review.decision]}</strong><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{review.comment || review.exclusionReason}</p><time dateTime={review.submittedAt}>{new Date(review.submittedAt).toLocaleString("vi-VN")}</time></div>)}</details>;
}

export function ScreeningDecisionHistory({
  rounds,
  total,
  page,
  hasNext,
  selectedRoundId,
  onSelectRound,
  onPage,
  open,
  onToggle,
}: {
  rounds: ScreeningRoundView[];
  total: number;
  page: number;
  hasNext: boolean;
  selectedRoundId: string | null;
  onSelectRound: (roundId: string | null) => void;
  onPage: (page: number) => void;
  open?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  if (!rounds.length) return null;
  const activeId = rounds.find(r => r.active)?.id ?? null;

  return (
    <details
      id="screening-decision-history"
      className="decision-history-panel"
      open={open}
      onToggle={e => onToggle?.(e.currentTarget.open)}
    >
      <summary className="decision-history-summary">
        <span className="inline-flex items-center gap-1.5">
          <History size={14} className="text-primary shrink-0" aria-hidden="true" />
          <span>Lịch sử đánh giá ({total} vòng)</span>
        </span>
        <span className="text-[11px] font-normal text-muted-foreground">
          {total > 1 ? "Mọi quyết định cũ được bảo toàn" : "Xem chi tiết vòng"}
        </span>
      </summary>
      <ol className="decision-history-list" aria-label="Các vòng đánh giá của bài báo">
        {rounds.map(r => {
          const isViewing = selectedRoundId ? selectedRoundId === r.id : r.active;
          const ctx = r.rescreenContext;
          const finalText = r.finalDecision
            ? screeningOutcomeSummaryLabel(r.finalDecision.decision)
            : r.rescreening
            ? "Đang đánh giá lại"
            : screeningOutcomeSummaryLabel(r.status);
          return (
            <li
              key={r.id}
              className="decision-history-item"
              data-current={r.active || undefined}
              data-viewing={isViewing || undefined}
            >
              <div className="decision-history-item-head">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <strong className="text-xs font-semibold text-foreground">
                    Vòng {r.number} {r.active ? "— Hiện tại" : "— Trước đó"}
                  </strong>
                  <span className="text-[11px] text-muted-foreground">· {screeningStageLabel(r.phase)}</span>
                  {r.invalidated && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                      Đã mất hiệu lực do mở lại vòng trước
                    </span>
                  )}
                </div>
                <ScreeningStatus status={r.status} round={r} />
              </div>

              {ctx && (
                <div className="decision-history-reopen">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <RotateCcw size={11} className="text-primary shrink-0" aria-hidden="true" />
                    <span>
                      Mở đánh giá lại bởi <strong className="text-foreground">{ctx.openedByName}</strong>
                    </span>
                    <span>·</span>
                    <time dateTime={ctx.openedAt}>{new Date(ctx.openedAt).toLocaleString("vi-VN")}</time>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {ctx.reasonCategory && (
                      <span className="rounded border border-border bg-background px-1.5 py-0.5 font-medium text-foreground">
                        {rescreenReasonLabels[ctx.reasonCategory] ?? ctx.reasonCategory}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      Trước: <strong>{screeningOutcomeSummaryLabel(ctx.previousStatus)}</strong> → {finalText}
                    </span>
                  </div>
                  {ctx.reason && (
                    <p className="mt-1 text-xs text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {ctx.reason}
                    </p>
                  )}
                </div>
              )}

              <div className="decision-history-votes">
                {r.hiddenReviews ? (
                  <div className="space-y-1">
                    <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Lock size={11} aria-hidden="true" />
                      <span>Phiếu của vòng này đang được ẩn theo chế độ đánh giá độc lập ({r.completed}/{r.settings.requiredReviewers} đã gửi).</span>
                    </p>
                    {r.myReview && (
                      <div className="decision-history-vote-row">
                        <span className="font-medium text-foreground">Phiếu của bạn:</span>
                        <ScreeningStatusBadge tone={screeningChoiceTone(r.myReview.decision)}>
                          {choiceLabels[r.myReview.decision]}
                        </ScreeningStatusBadge>
                      </div>
                    )}
                  </div>
                ) : r.reviews.length > 0 ? (
                  <ul className="space-y-1.5">
                    {r.reviews.map(review => {
                      const reviewerName = r.assignments.find(a => a.id === review.assignmentId)?.name ?? "Reviewer";
                      const detailReason = review.exclusionReason || review.comment;
                      return (
                        <li key={review.id} className="decision-history-vote-row">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="text-xs font-medium text-foreground">
                              {reviewerName}{review.assignmentId === r.myAssignmentId ? " (Bạn)" : ""}
                            </span>
                            <ScreeningStatusBadge tone={screeningChoiceTone(review.decision)}>
                              {choiceLabels[review.decision]}
                            </ScreeningStatusBadge>
                          </div>
                          {detailReason && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 [overflow-wrap:anywhere]">
                              {detailReason}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Chưa có phiếu gửi ({r.assignments.length}/{r.settings.requiredReviewers} reviewer được phân công).
                  </p>
                )}
              </div>

              <div className="decision-history-item-foot">
                <span className="text-[11px] text-muted-foreground">
                  {r.finalDecision
                    ? `Kết quả: ${finalText} · ${new Date(r.finalDecision.createdAt).toLocaleString("vi-VN")}`
                    : r.createdAt
                    ? `Tạo lúc ${new Date(r.createdAt).toLocaleString("vi-VN")}`
                    : `Trạng thái: ${finalText}`}
                </span>
                {total > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant={isViewing ? "secondary" : "ghost"}
                    className="h-6 px-2 text-[11px] gap-1"
                    onClick={() => onSelectRound(r.id === activeId ? null : r.id)}
                  >
                    <Eye size={11} aria-hidden="true" />
                    {isViewing ? "Đang xem" : r.active ? "Về vòng hiện tại" : `Xem vòng ${r.number}`}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {total > 10 && <ScreeningPager page={page} total={total} hasNext={hasNext} onPage={onPage} />}
    </details>
  );
}

export function RoundHistory({ projectId, round, people, readOnly, visible = true }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean; visible?: boolean }) {
  const actorId = useAuthStore(state => state.user?.id);
  const allowDiscussion = isConflictedRound(round) || round.settings.reviewMode === "COLLABORATIVE" || Boolean(round.finalDecision && !round.hiddenReviews);
  if (!allowDiscussion) return null;
  return <RoundDiscussionContent key={`${projectId}:${round.id}:${actorId}`} projectId={projectId} round={round} people={people} readOnly={readOnly} visible={visible} />;
}
function RoundDiscussionContent({ projectId, round, people, readOnly, visible }: { projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean; visible: boolean }) {
  const discussion = useScreeningDiscussion(projectId, round, visible);
  return <section className="paper-discussion screening-round-discussion" data-screening-section="discussion">
    <ScreeningDiscussion projectId={projectId} round={round} people={people} readOnly={readOnly} query={discussion} visible={visible} />
  </section>;
}
