import { ScreeningStatusBadge } from "./screening-status-badge";
import { ScreeningDecisionChoices, screeningReviewOptions } from "./screening-decision-choices";
import { screeningChoiceTone } from "../screening-status";
import { RoundHistory } from "./screening-round-history";
import { useScreeningDiscussionUnread } from "../hooks/use-screening-discussion-unread";
import { ScreeningCaseStatus } from "./screening-case-status";
import { useUnsavedWorkspace } from "./workspace-common";
import React, { useEffect, useId, useState } from "react";
import type { ScreeningRoundView, ScreeningPaperRow, WorkspacePerson, ScreeningChoice } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { screeningApi } from "../api/screening.api";
import { useAuthStore } from "@/stores/auth-store";
import { screeningActorId, useScreeningCommand, ScreeningError } from "./screening-common";
import "../screening-review-workspace.css";
import { CheckCircle2, XCircle, HelpCircle, Scale, Edit3, Info } from "lucide-react";

const choiceLabels: Record<ScreeningChoice, string> = {
  INCLUDE: "Phù hợp",
  EXCLUDE: "Không phù hợp",
  UNSURE: "Chưa chắc chắn",
};

interface ConflictResolutionProps {
  projectId: string;
  round: ScreeningRoundView;
  paper?: ScreeningPaperRow | null;
  people: WorkspacePerson[];
  readOnly: boolean;
  discussionRequested?: boolean;
}

export function ScreeningConflictResolution({ projectId, round, paper, people, readOnly, discussionRequested = false }: ConflictResolutionProps) {
  const publicActorId = useAuthStore(state => state.user?.id);
  const currentUserId = screeningActorId(round, publicActorId);
  const queryClient = useQueryClient();
  const command = useScreeningCommand(projectId);
  const [activeTab, setActiveTab] = useState<"ballots" | "discussion">(discussionRequested ? "discussion" : "ballots");
  const workspaceId = useId();
  const unreadDiscussion = useScreeningDiscussionUnread(round.id, !round.hiddenReviews);
  useEffect(() => { if (discussionRequested) setActiveTab("discussion"); }, [discussionRequested]);

  // Modals state
  const [isReassessOpen, setIsReassessOpen] = useState(false);
  const [isAdjudicateOpen, setIsAdjudicateOpen] = useState(false);

  // Reassess form state
  const myCurrentReview = round.myReview;
  const myReview = round.myReview ?? round.reviews.find(r => r.reviewerId === currentUserId);
  const [newDecision, setNewDecision] = useState<ScreeningChoice | "">("");
  const [reassessReason, setReassessReason] = useState("");
  const [exclusionReason, setExclusionReason] = useState(myCurrentReview?.exclusionReason ?? "");
  const [comment, setComment] = useState("");
  const [fullTextReference, setFullTextReference] = useState("");

  // Adjudication form state
  const [adjudicateReason, setAdjudicateReason] = useState("");

  // Review detail modal state
  const [viewingReview, setViewingReview] = useState<(typeof round.reviews)[number] | null>(null);

  const isReviewerOnRound = Boolean(round.myAssignmentId && round.myReview);
  const isAdjudicating = round.adjudicationCase ? ["IN_PROGRESS", "ASSIGNED"].includes(round.adjudicationCase.status) : round.status === "ADJUDICATING";
  const isWaitingAdjudicator = round.adjudicationCase?.status === "WAITING_ASSIGNMENT";
  const needsClarification = round.classification === "NEEDS_CLARIFICATION" || round.classification === "NEEDS_MORE_INFORMATION";
  const reasonMismatch = round.classification === "EXCLUSION_REASON_MISMATCH";
  const issueTitle = needsClarification ? "Làm rõ thông tin" : reasonMismatch ? "Thống nhất lý do loại" : "Giải quyết bất đồng";
  const issueDescription = needsClarification
    ? "Đối chiếu nguồn và trao đổi trước khi cập nhật phiếu."
    : reasonMismatch ? "Hai reviewer chọn loại nhưng chưa thống nhất tiêu chí loại. Đối chiếu nguồn và cập nhật căn cứ hoặc nhờ phân xử."
    : "Hai phiếu đang khác kết luận. Trao đổi để đối chiếu tiêu chí và căn cứ đánh giá.";

  const otherReview = round.hiddenReviews ? undefined : round.reviews.find(r => r.reviewerId !== currentUserId);

  useUnsavedWorkspace(Boolean(reassessReason || comment || adjudicateReason || isReassessOpen && fullTextReference !== (myReview?.fullTextReference ?? "")) || command.isPending);

  // Submit reassessment
  const handleReassessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDecision || !round.settings.screeningMode && newDecision === myReview?.decision || !round.canReassess || !round.active || round.finalDecision || reassessReason.trim().length < 5 || command.isPending || readOnly) return;
    if (newDecision === "EXCLUDE" && round.settings.exclusionCriteria?.length && !exclusionReason.trim()) return;
    if (round.phase === "FULL_TEXT" && fullTextReference.trim().length < 10) return;

    const payload = {
      decision: newDecision,
      reason: reassessReason.trim(),
      exclusionReason: newDecision === "EXCLUDE" ? exclusionReason.trim() : "",
      comment: comment.trim(),
      scope: round.phase,
      ...(round.phase === "FULL_TEXT" ? { fullTextReference: fullTextReference.trim() } : {}),
      researchQuestionIds: myReview?.researchQuestions?.map(question => question.id) ?? [],
      expectedRevision: round.version,
      confirmed: true,
    };

    const success = await command.run({ roundId: round.id, ...payload }, clientKey =>
      screeningApi.reassess(projectId, round.id, { ...payload, clientKey })
    );

    if (success) {
      setIsReassessOpen(false);
      setReassessReason("");
      setComment("");
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "screening"] });
    }
  };

  // Submit request for independent adjudication
  const handleRequestAdjudicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (command.isPending || readOnly || !round.canRequestAdjudication || round.finalDecision || !round.active || adjudicateReason.trim().length < 5) return;

    const trimmedReason = adjudicateReason.trim();
    const payload = {
      expectedVersion: round.version,
      confirmed: true,
      reason: trimmedReason,
      disputePoint: trimmedReason,
    };

    const success = await command.run({ roundId: round.id, ...payload }, clientKey =>
      screeningApi.requestAdjudication(projectId, round.id, { ...payload, clientKey })
    );

    if (success) {
      setIsAdjudicateOpen(false);
      setAdjudicateReason("");
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "screening"] });
    }
  };

  return (
    <div className="screening-conflict-container" data-focus-chat={activeTab === "discussion" && !round.adjudicationCase}>
      <ScreeningCaseStatus projectId={projectId} round={round} />

      <section className="screening-resolution-intro" aria-label={issueTitle}>
        <p>{round.adjudicationCase
          ? "Hồ sơ đã mở. Bổ sung quan điểm riêng và theo dõi kết quả trong Hồ sơ phân xử."
          : issueDescription}</p>
      </section>

      {/* Both reviewers can act directly after discussion, without a message quota. */}
      {!readOnly &&
        isReviewerOnRound &&
        round.active &&
        !round.finalDecision &&
        !round.adjudicationCase &&
        !isAdjudicating &&
        !isWaitingAdjudicator &&
        (round.canReassess || round.canRequestAdjudication) && (
        <section className="screening-resolution-actions" aria-label="Xử lý sau trao đổi">
          <div className="screening-resolution-action-buttons">
            {round.canReassess && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewDecision("");
                  setExclusionReason(myCurrentReview?.exclusionReason ?? "");
                  setFullTextReference(myReview?.fullTextReference ?? "");
                  setIsReassessOpen(true);
                }}
                className="gap-1.5 font-medium"
              >
                <Edit3 size={14} />
                {round.settings.screeningMode ? "Cập nhật phiếu của tôi" : "Đổi kết luận của tôi"}
              </Button>
            )}

            {round.canRequestAdjudication && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAdjudicateOpen(true)}
                className="gap-1.5"
              >
                <Scale size={14} />
                Nhờ người phân xử
              </Button>
            )}
          </div>
        </section>
      )}

      <div className="screening-resolution-tabs" role="tablist" aria-label="Đánh giá và trao đổi">
        {([{ value: "discussion", label: "Trao đổi" }, { value: "ballots", label: "Hai phiếu đánh giá" }] as const).map((tab, index) => <button
          key={tab.value} type="button" role="tab" id={`${workspaceId}-${tab.value}-tab`}
          aria-selected={activeTab === tab.value} aria-controls={`${workspaceId}-${tab.value}-panel`}
          tabIndex={activeTab === tab.value ? 0 : -1}
          onClick={() => setActiveTab(tab.value)}
          onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? "discussion" : event.key === "End" ? "ballots" : index === 0 ? "ballots" : "discussion";
            setActiveTab(next); document.getElementById(`${workspaceId}-${next}-tab`)?.focus();
          }}
        >{tab.label}{tab.value === "discussion" && unreadDiscussion.length > 0 && <span className="screening-discussion-unread-count" aria-label={`${unreadDiscussion.length} tin nhắn chưa đọc`}>{unreadDiscussion.length}</span>}</button>)}
      </div>

      <section className="screening-review-comparison screening-resolution-panel" role="tabpanel" id={`${workspaceId}-ballots-panel`} aria-labelledby={`${workspaceId}-ballots-tab`} hidden={activeTab !== "ballots"} tabIndex={0}>
        {round.hiddenReviews ? <p className="screening-review-note">Phiếu được công bố khi quy trình cho phép xem đánh giá của cả hai reviewer.</p> :
          <div className="screening-review-list">
            {round.reviews.map(r => {
              const assign = round.assignments.find(a => a.id === r.assignmentId);
              const reviewerName = assign?.name || "Reviewer";
              const isMe = r.reviewerId === currentUserId;
              const contentText = (r.exclusionReason || r.comment || r.fullTextReference || "").trim();
              const needsDetail = contentText.length > 180 || Boolean(r.exclusionReason && r.comment || r.fullTextReference);
              return <article key={r.id} className="screening-review-row" aria-label={`Phiếu của ${reviewerName}`}>
                <div className="screening-review-row-heading">
                  <div className="screening-review-person">
                    <span className="screening-review-avatar" aria-hidden="true">{reviewerName.slice(0, 1).toUpperCase()}</span>
                    <div className="screening-review-identity">
                      <strong>{reviewerName}{isMe && <span> (Bạn)</span>}</strong>
                      <p>Phiên bản {r.revision} · <time dateTime={r.submittedAt}>{new Date(r.submittedAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric", year: "numeric" })}</time>{r.scope === "FULL_TEXT" && " · Toàn văn"}</p>
                    </div>
                  </div>
                  <ScreeningStatusBadge tone={screeningChoiceTone(r.decision)}>
                    {r.decision === "INCLUDE" ? <CheckCircle2 size={13} aria-hidden="true" /> : r.decision === "EXCLUDE" ? <XCircle size={13} aria-hidden="true" /> : <HelpCircle size={13} aria-hidden="true" />}
                    {choiceLabels[r.decision]}
                  </ScreeningStatusBadge>
                </div>
                <div className="screening-review-rationale">
                  <p className="screening-resolution-reason" data-truncated={needsDetail || undefined}>{contentText ? <>{r.exclusionReason && <span>Lý do loại: </span>}{contentText}</> : <span className="screening-review-note">Không kèm ghi chú</span>}</p>
                  {needsDetail && <button type="button" className="screening-review-detail-link" aria-label={`Xem lý do của ${reviewerName}`} onClick={() => setViewingReview(r)}>Xem lý do</button>}
                </div>
              </article>;
            })}
          </div>}
      </section>

      <div className="screening-resolution-panel screening-discussion-panel" role="tabpanel" id={`${workspaceId}-discussion-panel`} aria-labelledby={`${workspaceId}-discussion-tab`} hidden={activeTab !== "discussion"} tabIndex={0}>
        <RoundHistory projectId={projectId} round={round} people={people} readOnly={readOnly} visible={activeTab === "discussion"} />
      </div>

      <ScreeningError error={command.error} />

      {/* Modal: Sửa đánh giá của tôi (Reassessment - Simplified) */}
      <Dialog open={isReassessOpen} onOpenChange={setIsReassessOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{round.settings.screeningMode ? "Cập nhật phiếu của tôi" : "Đổi kết luận của tôi"}</DialogTitle>
            <DialogDescription>
              {round.settings.screeningMode ? "Đối chiếu nguồn, cập nhật kết luận hoặc lý do. Mỗi phiên bản phiếu được giữ trong lịch sử." : "Hai reviewer đã gửi phiếu. Chọn kết luận khác sau khi thảo luận; phiếu ban đầu vẫn được giữ trong lịch sử."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReassessSubmit} className="space-y-4 py-2">
            <ScreeningDecisionChoices legend="Kết luận mới" value={newDecision} onChange={setNewDecision}
              currentValue={myReview?.decision} required disabled={command.isPending}
              options={screeningReviewOptions.map(option => ({ ...option, disabled: !round.settings.screeningMode && option.value === myReview?.decision }))} />

            {newDecision === "EXCLUDE" && Boolean(round.settings.exclusionCriteria?.length) && <label className="block text-xs font-semibold">
              Tiêu chí loại
              <select aria-label="Tiêu chí loại" required value={exclusionReason} onChange={e => setExclusionReason(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-xs">
                <option value="">Chọn tiêu chí loại</option>
                {round.settings.exclusionCriteria!.map(criterion => <option key={criterion} value={criterion}>{criterion}</option>)}
              </select>
            </label>}

            {round.phase === "FULL_TEXT" && <label className="block space-y-1 text-xs font-semibold">
              <span>Nguồn toàn văn và vị trí đã đối chiếu *</span>
              <textarea aria-label="Nguồn toàn văn và vị trí đã đối chiếu" value={fullTextReference} onChange={e => setFullTextReference(e.target.value)} required minLength={10} maxLength={1000} rows={3} className="w-full rounded-lg border border-border bg-background p-2.5 text-xs font-normal" />
            </label>}

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Lý do xem xét lại đánh giá <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={reassessReason}
                onChange={e => setReassessReason(e.target.value)}
                placeholder="Ghi rõ lý do bạn thay đổi hoặc cập nhật đánh giá..."
                rows={3}
                required
                minLength={5}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">Tối thiểu 5 ký tự để ghi nhận lý do khoa học minh bạch.</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsReassessOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" size="sm" disabled={command.isPending || !newDecision || !round.settings.screeningMode && newDecision === myReview?.decision || reassessReason.trim().length < 5 || round.phase === "FULL_TEXT" && fullTextReference.trim().length < 10 || newDecision === "EXCLUDE" && Boolean(round.settings.exclusionCriteria?.length) && !exclusionReason.trim()}>
                {command.isPending ? "Đang lưu..." : "Lưu đánh giá mới"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Chuyển bất đồng sang phân xử */}
      <Dialog open={isAdjudicateOpen} onOpenChange={setIsAdjudicateOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
              Chuyển bất đồng sang phân xử
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
              Hai Reviewer chưa đạt được kết luận thống nhất về bài báo này.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 2 Reviewer Decision Comparison */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs sm:text-sm font-semibold text-foreground block mb-1.5">
                  Đánh giá của bạn
                </span>
                <ScreeningStatusBadge tone={screeningChoiceTone(myCurrentReview?.decision ?? myReview?.decision ?? "UNSURE")}>
                  {choiceLabels[myCurrentReview?.decision ?? myReview?.decision ?? "INCLUDE"]}
                </ScreeningStatusBadge>
              </div>

              <div>
                <span className="text-xs sm:text-sm font-semibold text-foreground block mb-1.5">
                  Reviewer còn lại
                </span>
                <ScreeningStatusBadge tone={otherReview ? screeningChoiceTone(otherReview.decision) : "neutral"}>
                  {otherReview ? choiceLabels[otherReview.decision] : "Chưa đánh giá"}
                </ScreeningStatusBadge>
              </div>
            </div>

            {/* Info notice */}
            <div className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed pt-1">
              <Info size={16} className="text-muted-foreground shrink-0 mt-0.5" />
              <p>
                LumiGap sẽ tổng hợp hai phiếu đánh giá, lý do và thảo luận hiện có. Cả hai Reviewer sẽ có cơ hội hoàn tất ý kiến trước khi hồ sơ được chuyển cho người phân xử.
              </p>
            </div>

            {/* Timeline notice */}
            <div className="space-y-1 pt-1">
              <h5 className="text-xs sm:text-sm font-bold text-foreground">
                Thời hạn hoàn tất ý kiến: {round.settings.statementWindowHours ?? 48} giờ
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Hồ sơ được chuyển sớm nếu cả hai hoàn tất. Hết hạn, hệ thống sử dụng các ý kiến hiện có.
              </p>
            </div>

            {/* Input opinion / dispute reason (mandatory) */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <label htmlFor="adjudicate-opinion" className="text-xs sm:text-sm font-semibold text-foreground flex items-center justify-between">
                <span>Ý kiến / Lý do đề nghị phân xử <span className="text-rose-500">*</span></span>
                <span className="text-[11px] text-muted-foreground font-normal">Tối thiểu 5 ký tự</span>
              </label>
              <textarea
                id="adjudicate-opinion"
                value={adjudicateReason}
                onChange={e => setAdjudicateReason(e.target.value)}
                placeholder="Nêu tóm tắt lý do bạn đề nghị phân xử độc lập hoặc quan điểm của bạn về bài báo này..."
                className="w-full min-h-[85px] rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-2 focus:ring-ring"
                rows={3}
              />
            </div>

            <ScreeningError error={command.error} />
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-3 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAdjudicateOpen(false)}
              className="text-xs font-medium"
            >
              Tiếp tục trao đổi
            </Button>
            <Button
              type="button"
              onClick={handleRequestAdjudicationSubmit}
              disabled={
                command.isPending ||
                readOnly ||
                !round.active ||
                !round.canRequestAdjudication ||
                Boolean(round.finalDecision) ||
                adjudicateReason.trim().length < 5
              }
              className="text-xs font-medium"
            >
              {command.isPending ? "Đang tạo..." : "Tạo yêu cầu phân xử"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingReview) && !round.hiddenReviews} onOpenChange={open => { if (!open) setViewingReview(null); }}>
        <DialogContent className="screening-ballot-dialog max-w-lg max-h-[85dvh]" closeLabel="Đóng">
          {viewingReview && !round.hiddenReviews && (() => {
            const reviewerName = round.assignments.find(a => a.id === viewingReview.assignmentId)?.name || "Reviewer";
            return <>
              <DialogHeader className="text-left pr-5">
                <DialogTitle className="text-base leading-relaxed break-words">Phiếu đánh giá: {reviewerName}{viewingReview.reviewerId === currentUserId && " (Bạn)"}</DialogTitle>
                <DialogDescription>Phiên bản {viewingReview.revision} · {new Date(viewingReview.submittedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</DialogDescription>
              </DialogHeader>
              <div><ScreeningStatusBadge tone={screeningChoiceTone(viewingReview.decision)}>{choiceLabels[viewingReview.decision]}</ScreeningStatusBadge></div>
              <div className="screening-ballot-content">
                {viewingReview.exclusionReason && <section><h4>Lý do loại bài</h4><p>{viewingReview.exclusionReason}</p></section>}
                {viewingReview.comment && <section><h4>Ghi chú và căn cứ</h4><p>{viewingReview.comment}</p></section>}
                {viewingReview.fullTextReference && <section><h4>Nguồn toàn văn đã đối chiếu</h4><p>{viewingReview.fullTextReference}</p></section>}
              </div>
              <DialogFooter><Button type="button" variant="outline" size="sm" onClick={() => setViewingReview(null)}>Đóng</Button></DialogFooter>
            </>;
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
