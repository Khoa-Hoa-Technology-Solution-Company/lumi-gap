import { ScreeningStatusBadge } from "./screening-status-badge";
import { ScreeningDecisionChoices, screeningReviewOptions } from "./screening-decision-choices";
import { screeningChoiceTone } from "../screening-status";
import { RoundHistory } from "./screening-round-history";
import { useScreeningDiscussionUnread } from "../hooks/use-screening-discussion-unread";
import { ScreeningCaseStatus } from "./screening-case-status";
import { ScreeningAgreementPanel } from "./screening-agreement";
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
import { CheckCircle2, XCircle, HelpCircle, Scale, Edit3, Info, Clock, MessageSquare, CheckSquare } from "lucide-react";
import { toast } from "sonner";

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
  const [isExtendOpen, setIsExtendOpen] = useState(false);
  const [extendReason, setExtendReason] = useState("");
  const [isCloseUnresolvedOpen, setIsCloseUnresolvedOpen] = useState(false);
  const [closeReason, setCloseReason] = useState<"NO_CONSENSUS" | "NO_RESPONSE" | "INSUFFICIENT_INFORMATION" | "DEADLINE_EXPIRED">("NO_CONSENSUS");
  const [closeNote, setCloseNote] = useState("");

  const isTeamScreening = round.settings?.workflowKind === "TEAM_SCREENING";
  const timing = round.discussionTiming;

  // Reassess form state
  const myCurrentReview = round.myReview;
  const myReview = round.myReview ?? round.reviews.find(r => r.reviewerId === currentUserId);
  const [newDecision, setNewDecision] = useState<ScreeningChoice | "">(myCurrentReview?.decision ?? "");
  const [reassessReason, setReassessReason] = useState("");
  const [exclusionReason, setExclusionReason] = useState(myCurrentReview?.exclusionReason ?? "");
  const [comment, setComment] = useState("");
  const [fullTextReference, setFullTextReference] = useState("");

  const deadlineStr = timing?.effectiveDeadlineAt || (round as any).consensus?.deadline;
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!deadlineStr || round.finalDecision) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [deadlineStr, round.finalDecision]);

  const remainingMs = deadlineStr ? Date.parse(deadlineStr) - now : null;
  const isExpired = timing?.isOverdue || (remainingMs !== null && remainingMs <= 0);
  const remainingSecs = remainingMs !== null ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0;
  const formattedCountdown = [
    Math.floor(remainingSecs / 3600),
    Math.floor((remainingSecs % 3600) / 60),
    remainingSecs % 60,
  ]
    .map(n => String(n).padStart(2, "0"))
    .join(":");

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
  const issueDescription = isTeamScreening
    ? (needsClarification
      ? "Thảo luận căn cứ và cùng xác nhận kết luận cuối cùng."
      : reasonMismatch
      ? "Hai reviewer chọn loại nhưng chưa thống nhất tiêu chí loại. Thảo luận căn cứ và cùng xác nhận kết luận cuối cùng."
      : "Hai phiếu độc lập có kết luận khác nhau. Thảo luận căn cứ và cùng xác nhận kết luận cuối cùng.")
    : (needsClarification
      ? "Đối chiếu nguồn và trao đổi trước khi cập nhật phiếu."
      : reasonMismatch ? "Hai reviewer chọn loại nhưng chưa thống nhất tiêu chí loại. Đối chiếu nguồn và cập nhật căn cứ hoặc nhờ phân xử."
      : "Hai phiếu đang khác kết luận. Trao đổi để đối chiếu tiêu chí và căn cứ đánh giá.");

  const otherReview = round.hiddenReviews ? undefined : round.reviews.find(r => r.reviewerId !== currentUserId);

  useUnsavedWorkspace(Boolean(reassessReason || comment || adjudicateReason || extendReason || isReassessOpen && fullTextReference !== (myReview?.fullTextReference ?? "")) || command.isPending);

  // Submit extend discussion
  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (command.isPending || readOnly || !extendReason.trim()) return;
    const payload = {
      expectedVersion: round.version,
      hours: 24,
      reason: extendReason.trim(),
    };
    const success = await command.run({ roundId: round.id, ...payload }, clientKey =>
      screeningApi.extendDiscussion(projectId, round.id, { ...payload, clientKey })
    );
    if (success) {
      setIsExtendOpen(false);
      setExtendReason("");
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "screening"] });
    }
  };

  // Submit close unresolved
  const handleCloseUnresolvedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (command.isPending || readOnly || !closeReason) return;
    const payload = {
      expectedVersion: round.version,
      reason: closeReason,
      note: closeNote.trim() || undefined,
    };
    const success = await command.run({ roundId: round.id, ...payload }, clientKey =>
      screeningApi.closeUnresolved(projectId, round.id, { ...payload, clientKey })
    );
    if (success) {
      setIsCloseUnresolvedOpen(false);
      setCloseReason("NO_CONSENSUS");
      setCloseNote("");
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "screening"] });
    }
  };

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
      void queryClient.invalidateQueries({ queryKey: ["project-research"] });
      toast.success("Đã cập nhật đánh giá thành công!");
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
    <div className="screening-conflict-container space-y-4" data-focus-chat={activeTab === "discussion" && !round.adjudicationCase}>
      <ScreeningCaseStatus projectId={projectId} round={round} />

      <section className="screening-resolution-intro screening-consensus-card rounded-xl border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 space-y-2.5 shadow-xs" aria-label={issueTitle}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Scale size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <h4 className="text-sm font-semibold text-foreground m-0">{issueTitle}</h4>
          </div>

          {deadlineStr && (
            <div className="screening-consensus-countdown-pill" title={`Hạn: ${new Date(deadlineStr).toLocaleString("vi-VN")}`}>
              <span className="screening-live-dot" />
              <Clock size={12} className="shrink-0" />
              <span>Đang thảo luận</span>
              <span>·</span>
              <time dateTime={deadlineStr} aria-label="Thời gian thảo luận còn lại">
                {isExpired ? "Đã hết hạn" : `Còn ${formattedCountdown}`}
              </time>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed m-0">
          {round.adjudicationCase
            ? "Hồ sơ đã mở. Bổ sung quan điểm riêng và theo dõi kết quả trong Hồ sơ phân xử."
            : issueDescription}
        </p>

        {timing?.isOverdue && (
          <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium m-0">
            Thời hạn thảo luận ban đầu (48 giờ) đã kết thúc. Nhóm nghiên cứu cần thống nhất quyết định chung bên dưới, hoặc Chủ đề tài có thể gia hạn/đóng đánh giá.
          </p>
        )}

        {round.canManage && !readOnly && round.active && !round.finalDecision && (
          <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-900/40">
            {timing && timing.extensionCount < timing.maxExtensions && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs font-normal bg-background/80"
                onClick={() => setIsExtendOpen(true)}
              >
                Gia hạn thảo luận (+24h)
              </Button>
            )}
            {round.canCloseUnresolved && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-normal"
                onClick={() => setIsCloseUnresolvedOpen(true)}
              >
                Đóng — Không đồng thuận
              </Button>
            )}
          </div>
        )}
      </section>

      {/* For Team Screening, consensus proposal & confirmation is displayed directly */}
      {isTeamScreening && (
        <ScreeningAgreementPanel projectId={projectId} round={round} readOnly={readOnly} />
      )}

      {/* Legacy/Systematic Review actions: Both reviewers can act directly after discussion */}
      {!readOnly &&
        !isTeamScreening &&
        isReviewerOnRound &&
        round.active &&
        !round.finalDecision &&
        !round.adjudicationCase &&
        !isAdjudicating &&
        !isWaitingAdjudicator &&
        (round.canReassess || round.canRequestAdjudication) && (
        <section className="screening-resolution-actions" aria-label="Xử lý sau trao đổi">
          <div className="screening-resolution-action-buttons flex items-center gap-2">
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
                className="gap-1.5 font-medium text-xs h-8"
              >
                <Edit3 size={13} />
                {round.settings.screeningMode ? "Cập nhật phiếu của tôi" : "Đổi kết luận của tôi"}
              </Button>
            )}

            {round.canRequestAdjudication && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAdjudicateOpen(true)}
                className="gap-1.5 text-xs h-8"
              >
                <Scale size={13} />
                Nhờ người phân xử
              </Button>
            )}
          </div>
        </section>
      )}

      <div className="screening-resolution-tabs" role="tablist" aria-label="Đánh giá và trao đổi">
        {([{ value: "discussion", label: "Trao đổi", icon: MessageSquare }, { value: "ballots", label: "Hai phiếu đánh giá", icon: CheckSquare }] as const).map((tab, index) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`${workspaceId}-${tab.value}-tab`}
              aria-selected={isActive}
              aria-controls={`${workspaceId}-${tab.value}-panel`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.value)}
              onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "discussion" : event.key === "End" ? "ballots" : index === 0 ? "ballots" : "discussion";
                setActiveTab(next);
                document.getElementById(`${workspaceId}-${next}-tab`)?.focus();
              }}
              className={`screening-tab-button ${isActive ? "active" : ""}`}
            >
              <Icon size={14} className="mr-1.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.value === "discussion" && unreadDiscussion.length > 0 && (
                <span className="screening-discussion-unread-count" aria-label={`${unreadDiscussion.length} tin nhắn chưa đọc`}>
                  {unreadDiscussion.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section className="screening-review-comparison screening-resolution-panel space-y-4" role="tabpanel" id={`${workspaceId}-ballots-panel`} aria-labelledby={`${workspaceId}-ballots-tab`} hidden={activeTab !== "ballots"} tabIndex={0}>
        {round.hiddenReviews ? (
          <p className="screening-review-note">Phiếu được công bố khi quy trình cho phép xem đánh giá của cả hai reviewer.</p>
        ) : (
          <div className="screening-review-list screening-review-cards-grid grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {round.reviews.map((r, idx) => {
              const assign = round.assignments.find(a => a.id === r.assignmentId);
              const reviewerName = assign?.name || `Reviewer ${idx + 1}`;
              const isMe = r.reviewerId === currentUserId;
              const isInclude = r.decision === "INCLUDE";
              const isExclude = r.decision === "EXCLUDE";
              const contentText = (r.exclusionReason || r.comment || r.fullTextReference || "").trim();
              const needsDetail = contentText.length > 180 || Boolean(r.exclusionReason && r.comment || r.fullTextReference);
              return (
                <article
                  key={r.id}
                  className={`screening-review-row screening-review-card ${isInclude ? "is-include" : isExclude ? "is-exclude" : "is-unsure"} p-3.5 rounded-xl border bg-card space-y-2.5 transition-shadow`}
                  aria-label={`Phiếu của ${reviewerName}`}
                >
                  <div className="screening-review-row-heading flex items-center justify-between gap-2">
                    <div className="screening-review-person flex items-center gap-2.5 min-w-0">
                      <span className="screening-review-avatar shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-muted text-muted-foreground" aria-hidden="true">
                        {reviewerName.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="screening-review-identity min-w-0">
                        <strong className="text-xs font-semibold text-foreground truncate block">
                          {reviewerName}{isMe && <span> (Bạn)</span>}
                        </strong>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Phiên bản {r.revision} · <time dateTime={r.submittedAt}>{new Date(r.submittedAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric", year: "numeric" })}</time>{r.scope === "FULL_TEXT" && " · Toàn văn"}
                        </p>
                      </div>
                    </div>
                    <ScreeningStatusBadge tone={screeningChoiceTone(r.decision)}>
                      {isInclude ? <CheckCircle2 size={13} aria-hidden="true" className="shrink-0" /> : isExclude ? <XCircle size={13} aria-hidden="true" className="shrink-0" /> : <HelpCircle size={13} aria-hidden="true" className="shrink-0" />}
                      <span>{choiceLabels[r.decision]}</span>
                    </ScreeningStatusBadge>
                  </div>
                <div className="screening-review-rationale text-xs space-y-1.5 pt-1 border-t border-border/40">
                  <p className="screening-resolution-reason text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words" data-truncated={needsDetail || undefined}>
                    {contentText ? (
                      <>
                        {r.exclusionReason && <span>Lý do loại: </span>}
                        {contentText}
                      </>
                    ) : (
                      <span className="screening-review-note text-muted-foreground italic text-[11px]">Không kèm ghi chú</span>
                    )}
                  </p>
                  {needsDetail && (
                    <button
                      type="button"
                      className="screening-review-detail-link text-[11px] font-medium text-primary hover:underline cursor-pointer block mt-1"
                      aria-label={`Xem lý do của ${reviewerName}`}
                      onClick={() => setViewingReview(r)}
                    >
                      Xem lý do
                    </button>
                  )}
                </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Inline Reassessment / Consensus Update Form matching user request */}
        {!readOnly && round.active && !round.finalDecision && isReviewerOnRound && (
          <div className="screening-inline-reassess-card rounded-xl border border-border/80 bg-card p-4 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <h5 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Edit3 size={14} className="text-primary" />
                <span>Đánh giá của tôi</span>
              </h5>
              {myReview && (
                <span className="text-[11px] text-muted-foreground">
                  Phiếu hiện tại: <strong>{choiceLabels[myReview.decision]}</strong> (v{myReview.revision})
                </span>
              )}
            </div>

            <form onSubmit={handleReassessSubmit} className="screening-form space-y-3.5" aria-label="Cập nhật đánh giá của tôi">
              {/* Radio choice cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <label className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${newDecision === "INCLUDE" ? "border-emerald-500 bg-emerald-50/80 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 ring-2 ring-emerald-500/20 shadow-xs" : "border-border/80 bg-background text-foreground/80 hover:bg-muted/50"}`}>
                  <input
                    type="radio"
                    name="inline-eval-decision"
                    value="INCLUDE"
                    checked={newDecision === "INCLUDE"}
                    onChange={() => setNewDecision("INCLUDE")}
                    disabled={command.isPending}
                    className="accent-emerald-600"
                  />
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className={newDecision === "INCLUDE" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"} />
                    <span>Phù hợp</span>
                  </div>
                </label>

                <label className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${newDecision === "EXCLUDE" ? "border-rose-500 bg-rose-50/80 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200 ring-2 ring-rose-500/20 shadow-xs" : "border-border/80 bg-background text-foreground/80 hover:bg-muted/50"}`}>
                  <input
                    type="radio"
                    name="inline-eval-decision"
                    value="EXCLUDE"
                    checked={newDecision === "EXCLUDE"}
                    onChange={() => setNewDecision("EXCLUDE")}
                    disabled={command.isPending}
                    className="accent-rose-600"
                  />
                  <div className="flex items-center gap-1.5">
                    <XCircle size={14} className={newDecision === "EXCLUDE" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"} />
                    <span>Không phù hợp</span>
                  </div>
                </label>
              </div>

              {/* Exclusion criteria if EXCLUDE */}
              {newDecision === "EXCLUDE" && Boolean(round.settings?.exclusionCriteria?.length) && (
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Tiêu chí loại trừ <span className="text-rose-500">*</span>
                  </label>
                  <select
                    aria-label="Tiêu chí loại"
                    value={exclusionReason}
                    onChange={e => setExclusionReason(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Chọn tiêu chí loại trừ...</option>
                    {round.settings.exclusionCriteria!.map(criterion => (
                      <option key={criterion} value={criterion}>{criterion}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Fulltext reference if FULL_TEXT scope */}
              {round.phase === "FULL_TEXT" && (
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Nguồn toàn văn và vị trí đã đối chiếu <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    aria-label="Nguồn toàn văn và vị trí đã đối chiếu"
                    value={fullTextReference}
                    onChange={e => setFullTextReference(e.target.value)}
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}

              {/* Lý do cập nhật */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-foreground">
                    Lý do cập nhật <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {reassessReason.length}/2000 ký tự (tối thiểu 5)
                  </span>
                </div>
                <textarea
                  value={reassessReason}
                  onChange={e => setReassessReason(e.target.value)}
                  placeholder="Ghi rõ lý do bạn cập nhật hoặc căn cứ đối chiếu từ bài báo..."
                  rows={3}
                  required
                  minLength={5}
                  maxLength={2000}
                  disabled={command.isPending}
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Explanatory note */}
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 leading-relaxed">
                <Info size={13} className="shrink-0 text-muted-foreground" />
                <span>Mọi phiên bản được lưu. Hệ thống chốt khi hai đánh giá hiện hành trùng nhau.</span>
              </p>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewDecision(myReview?.decision ?? "");
                    setReassessReason("");
                    setExclusionReason(myCurrentReview?.exclusionReason ?? "");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Quay lại
                </Button>

                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    command.isPending ||
                    !newDecision ||
                    reassessReason.trim().length < 5 ||
                    (newDecision === "EXCLUDE" && Boolean(round.settings?.exclusionCriteria?.length) && !exclusionReason.trim()) ||
                    (round.phase === "FULL_TEXT" && fullTextReference.trim().length < 10)
                  }
                  className="text-xs font-semibold px-4 h-8"
                >
                  {command.isPending ? "Đang lưu..." : "Cập nhật đánh giá"}
                </Button>
              </div>
            </form>
          </div>
        )}
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

      {/* Modal: Gia hạn thảo luận */}
      <Dialog open={isExtendOpen} onOpenChange={setIsExtendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gia hạn thời gian thảo luận</DialogTitle>
            <DialogDescription>
              Cộng thêm tối đa 24 giờ để hai reviewer tiếp tục trao đổi và thống nhất kết luận. Mỗi vòng chỉ được gia hạn tối đa 1 lần.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleExtendSubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Lý do gia hạn <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={extendReason}
                onChange={e => setExtendReason(e.target.value)}
                placeholder="Nêu lý do cần thêm thời gian thảo luận..."
                rows={3}
                required
                minLength={5}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">Tối thiểu 5 ký tự để lưu vào lịch sử kiểm toán.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsExtendOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" size="sm" disabled={command.isPending || extendReason.trim().length < 5}>
                {command.isPending ? "Đang gia hạn..." : "Xác nhận gia hạn 24 giờ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Đóng không đồng thuận */}
      <Dialog open={isCloseUnresolvedOpen} onOpenChange={setIsCloseUnresolvedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Đóng vòng đánh giá — Không đạt đồng thuận</DialogTitle>
            <DialogDescription>
              Kết thúc quy trình đánh giá bài báo này ở trạng thái không đồng thuận. Hai phiếu độc lập và toàn bộ trao đổi vẫn được lưu lại nguyên vẹn.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCloseUnresolvedSubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Lý do đóng <span className="text-rose-500">*</span>
              </label>
              <select
                aria-label="Lý do đóng"
                value={closeReason}
                onChange={e => setCloseReason(e.target.value as "NO_CONSENSUS" | "NO_RESPONSE" | "INSUFFICIENT_INFORMATION" | "DEADLINE_EXPIRED")}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground"
              >
                <option value="NO_CONSENSUS">Không đạt đồng thuận sau thảo luận</option>
                <option value="DEADLINE_EXPIRED">Hết thời hạn thảo luận</option>
                <option value="NO_RESPONSE">Không có phản hồi từ người đánh giá</option>
                <option value="INSUFFICIENT_INFORMATION">Không đủ thông tin để kết luận</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Ghi chú bổ sung (tùy chọn)
              </label>
              <textarea
                value={closeNote}
                onChange={e => setCloseNote(e.target.value)}
                placeholder="Ghi chú thêm về lý do kết thúc vòng..."
                rows={2}
                maxLength={1000}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsCloseUnresolvedOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" size="sm" variant="destructive" disabled={command.isPending}>
                {command.isPending ? "Đang đóng..." : "Xác nhận đóng vòng"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
