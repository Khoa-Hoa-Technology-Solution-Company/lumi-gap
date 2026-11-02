import { RoundHistory } from "./screening-round-history";
import { ScreeningCaseStatus } from "./screening-case-status";
import { caseStatusLabels } from "./screening-case-controls";
import { useUnsavedWorkspace } from "./workspace-common";
import React, { useState } from "react";
import type { ScreeningRoundView, ScreeningPaperRow, WorkspacePerson, ScreeningChoice } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { screeningApi } from "../api/screening.api";
import { useAuthStore } from "@/stores/auth-store";
import { screeningActorId, useScreeningCommand, ScreeningError } from "./screening-common";
import { CheckCircle2, XCircle, HelpCircle, Scale, Edit3, Users, Clock, FileText, Info } from "lucide-react";

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
}

export function ScreeningConflictResolution({ projectId, round, paper, people, readOnly }: ConflictResolutionProps) {
  const publicActorId = useAuthStore(state => state.user?.id);
  const currentUserId = screeningActorId(round, publicActorId);
  const queryClient = useQueryClient();
  const command = useScreeningCommand(projectId);

  // Modals state
  const [isReassessOpen, setIsReassessOpen] = useState(false);
  const [isAdjudicateOpen, setIsAdjudicateOpen] = useState(false);

  // Reassess form state
  const myCurrentReview = round.myReview;
  const myReview = round.myReview ?? round.reviews.find(r => r.reviewerId === currentUserId);
  const [newDecision, setNewDecision] = useState<ScreeningChoice>(myCurrentReview?.decision ?? "INCLUDE");
  const [reassessReason, setReassessReason] = useState("");
  const [exclusionReason, setExclusionReason] = useState(myCurrentReview?.exclusionReason ?? "");
  const [comment, setComment] = useState("");

  // Adjudication form state
  const [adjudicateReason, setAdjudicateReason] = useState("");

  // Review detail modal state
  const [viewingReview, setViewingReview] = useState<(typeof round.reviews)[number] | null>(null);

  const isReviewerOnRound = Boolean(round.myAssignmentId && round.myReview);
  const isAdjudicating = round.adjudicationCase ? ["IN_PROGRESS", "ASSIGNED"].includes(round.adjudicationCase.status) : round.status === "ADJUDICATING";
  const isWaitingAdjudicator = round.adjudicationCase?.status === "WAITING_ASSIGNMENT";

  // Check if reassessing to newDecision would create immediate consensus
  const otherReview = round.reviews.find(r => r.reviewerId !== currentUserId);
  const wouldResolveAgreement = otherReview && otherReview.decision === newDecision && (newDecision === "INCLUDE" || (newDecision === "EXCLUDE" && (!round.settings.exclusionCriteria?.length || exclusionReason)));

  useUnsavedWorkspace(Boolean(reassessReason || comment || adjudicateReason) || command.isPending);

  // Submit reassessment
  const handleReassessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reassessReason.trim().length < 5 || command.isPending || readOnly) return;
    if (newDecision === "EXCLUDE" && round.settings.exclusionCriteria?.length && !exclusionReason.trim()) return;

    const payload = {
      decision: newDecision,
      reason: reassessReason.trim(),
      exclusionReason: newDecision === "EXCLUDE" ? exclusionReason.trim() : "",
      comment: comment.trim(),
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
    <div className="screening-conflict-container space-y-5">
      {/* Main Screen Header: Compact, clean, non-redundant */}
      <div className="screening-conflict-header rounded-xl border border-amber-200/80 bg-amber-50/60 px-3.5 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-lg bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 shrink-0">
              <Scale size={16} />
            </div>
            <div className="min-w-0 text-xs">
              <span className="font-bold text-foreground">Giải quyết bất đồng: </span>
              <span className="text-muted-foreground">
                {round.adjudicationCase
                  ? "Hồ sơ đã mở. Reviewer bổ sung quan điểm riêng và theo dõi phân xử."
                  : "Có bất đồng kết luận giữa 2 reviewer. Bạn có thể trao đổi thảo luận, sửa phiếu hoặc nhờ phân xử."}
              </span>
            </div>
          </div>
          {round.adjudicationCase ? (
            <span className="shrink-0 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-950/50 dark:text-purple-300">
              {caseStatusLabels[round.adjudicationCase.status] ?? "Đang xử lý hồ sơ"}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Có bất đồng
            </span>
          )}
        </div>
      </div>

      {/* Section B: Two Reviewer Assessments (Clean stacked comparison cards with proper spacing) */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Users size={13} className="text-muted-foreground" />
          <span>Đánh giá độc lập của 2 reviewer</span>
        </h4>
        <div className="rounded-xl border border-border/80 bg-card/60 shadow-xs overflow-hidden divide-y divide-border/60">
          {round.reviews.map(r => {
            const assign = round.assignments.find(a => a.id === r.assignmentId);
            const reviewerName = assign?.name || "Reviewer";
            const isMe = r.reviewerId === currentUserId;
            const isInclude = r.decision === "INCLUDE";
            const isExclude = r.decision === "EXCLUDE";
            const contentText = (r.exclusionReason || r.comment || "").trim();
            const hasReason = Boolean(contentText);

            return (
              <div
                key={r.id}
                className={`p-3 space-y-2 transition-colors ${
                  isInclude
                    ? "bg-emerald-50/15 dark:bg-emerald-950/15"
                    : isExclude
                    ? "bg-rose-50/15 dark:bg-rose-950/15"
                    : "bg-amber-50/15 dark:bg-amber-950/15"
                }`}
              >
                {/* Header row: Avatar + Name + Revision on left; Decision Badge on right */}
                <div className="flex items-center justify-between gap-2.5 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-xs ${
                      isInclude
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                        : isExclude
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                    }`}>
                      {reviewerName.slice(0, 1).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground truncate">
                        {reviewerName} {isMe && <span className="font-normal text-muted-foreground">(Bạn)</span>}
                      </div>

                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate mt-0.5">
                        <span>Phiên bản {r.revision}</span>
                        <span>·</span>
                        <span>{new Date(r.submittedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} {new Date(r.submittedAt).toLocaleDateString("vi-VN")}</span>
                        {r.scope === "FULL_TEXT" && (
                          <>
                            <span>·</span>
                            <span className="font-medium text-primary">Toàn văn</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isInclude
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                      : isExclude
                      ? "bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
                      : "bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
                  }`}>
                    {isInclude && <CheckCircle2 size={12} className="shrink-0" />}
                    {isExclude && <XCircle size={12} className="shrink-0" />}
                    {!isInclude && !isExclude && <HelpCircle size={12} className="shrink-0" />}
                    <span>{choiceLabels[r.decision]}</span>
                  </span>
                </div>

                {/* Sub row: Reason snippet or status with 'Xem lý do' button */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-xs">
                  {hasReason ? (
                    <div className="flex items-center justify-between w-full gap-2 min-w-0">
                      <p className="text-[11px] text-muted-foreground truncate italic min-w-0">
                        {r.exclusionReason ? `Lý do: ${r.exclusionReason}` : r.comment}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setViewingReview(r)}
                        className="h-6 px-2 text-[11px] gap-1 font-medium hover:bg-muted cursor-pointer shrink-0"
                        title="Bấm để xem lý do và căn cứ đánh giá"
                      >
                        <FileText size={11} className="text-muted-foreground" />
                        <span>Xem lý do</span>
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/60 italic px-0.5">
                      Không kèm ghi chú
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <RoundHistory projectId={projectId} round={round} people={people} readOnly={readOnly} />

      {/* Both reviewers can act directly after discussion, without a message quota. */}
      {!readOnly &&
        isReviewerOnRound &&
        round.active &&
        !round.finalDecision &&
        !round.adjudicationCase &&
        !isAdjudicating &&
        !isWaitingAdjudicator &&
        (round.canReassess || round.canRequestAdjudication) && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground">Bạn muốn xử lý thế nào?</h4>
            <span className="text-[11px] text-muted-foreground">Hai bên có quyền bình đẳng</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {round.canReassess && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setNewDecision(myCurrentReview?.decision ?? "INCLUDE");
                  setExclusionReason(myCurrentReview?.exclusionReason ?? "");
                  setIsReassessOpen(true);
                }}
                className="gap-1.5 font-medium shadow-sm"
              >
                <Edit3 size={14} />
                Sửa đánh giá của tôi
              </Button>
            )}

            {round.canRequestAdjudication && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAdjudicateOpen(true)}
                className="gap-1.5 border-purple-300 text-purple-900 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300"
              >
                <Scale size={14} />
                Nhờ người phân xử
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            💡 <em>Mẹo:</em> Khi bạn sửa đánh giá cùng quyết định với đồng reviewer, hệ thống tự ghi nhận thống nhất nếu hai phiếu đáp ứng tiêu chí và quy tắc của giai đoạn.
          </p>
        </div>
      )}

      <ScreeningCaseStatus projectId={projectId} round={round} />

      <ScreeningError error={command.error} />

      {/* Modal: Sửa đánh giá của tôi (Reassessment - Simplified) */}
      <Dialog open={isReassessOpen} onOpenChange={setIsReassessOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa đánh giá của tôi</DialogTitle>
            <DialogDescription>
              Cập nhật lại kết luận sau khi thảo luận. Phiếu ban đầu vẫn được lưu lại trong lịch sử khoa học.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReassessSubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Kết luận mới</label>
              <div className="grid grid-cols-3 gap-2">
                {(["INCLUDE", "EXCLUDE", "UNSURE"] as ScreeningChoice[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewDecision(c)}
                    className={`rounded-lg border p-2 text-xs font-semibold transition-all ${
                      newDecision === c
                        ? c === "INCLUDE"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : c === "EXCLUDE"
                          ? "border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                          : "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {choiceLabels[c]}
                  </button>
                ))}
              </div>
            </div>

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
              <Button type="submit" size="sm" disabled={command.isPending || reassessReason.trim().length < 5}>
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
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  (myCurrentReview?.decision ?? myReview?.decision) === "INCLUDE"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : (myCurrentReview?.decision ?? myReview?.decision) === "EXCLUDE"
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                }`}>
                  {choiceLabels[myCurrentReview?.decision ?? myReview?.decision ?? "INCLUDE"]}
                </span>
              </div>

              <div>
                <span className="text-xs sm:text-sm font-semibold text-foreground block mb-1.5">
                  Reviewer còn lại
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  otherReview?.decision === "INCLUDE"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : otherReview?.decision === "EXCLUDE"
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                }`}>
                  {otherReview ? choiceLabels[otherReview.decision] : "Chưa đánh giá"}
                </span>
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
                Thời hạn hoàn tất ý kiến: 48 giờ
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

      {/* Modal: Chi tiết lý do và căn cứ đánh giá của Reviewer */}
      <Dialog open={Boolean(viewingReview)} onOpenChange={open => { if (!open) setViewingReview(null); }}>
        <DialogContent className="max-w-md">
          {viewingReview && (() => {
            const assign = round.assignments.find(a => a.id === viewingReview.assignmentId);
            const reviewerName = assign?.name || "Reviewer";
            const isMe = viewingReview.reviewerId === currentUserId;
            const isInclude = viewingReview.decision === "INCLUDE";
            const isExclude = viewingReview.decision === "EXCLUDE";

            return (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between gap-2 pr-6">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-xs ${
                        isInclude
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                          : isExclude
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                      }`}>
                        {reviewerName.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <DialogTitle className="text-sm font-semibold">
                          Phiếu đánh giá: {reviewerName} {isMe && "(Bạn)"}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                          Phiên bản {viewingReview.revision} · {new Date(viewingReview.submittedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} {new Date(viewingReview.submittedAt).toLocaleDateString("vi-VN")}
                        </DialogDescription>
                      </div>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      isInclude
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                        : isExclude
                        ? "bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
                        : "bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
                    }`}>
                      {choiceLabels[viewingReview.decision]}
                    </span>
                  </div>
                </DialogHeader>

                <div className="space-y-3 py-2 text-xs">
                  {viewingReview.exclusionReason && (
                    <div className="rounded-lg border border-rose-200/80 bg-rose-50/50 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
                      <div className="flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-400 mb-1">
                        <XCircle size={14} />
                        <span>Lý do loại bài:</span>
                      </div>
                      <p className="text-foreground whitespace-pre-wrap leading-relaxed break-words text-xs max-h-56 overflow-y-auto">
                        {viewingReview.exclusionReason}
                      </p>
                    </div>
                  )}

                  {viewingReview.comment && (
                    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                      <div className="flex items-center gap-1.5 font-semibold text-muted-foreground mb-1">
                        <FileText size={14} />
                        <span>Ghi chú & căn cứ:</span>
                      </div>
                      <p className="text-foreground whitespace-pre-wrap leading-relaxed break-words text-xs max-h-56 overflow-y-auto">
                        {viewingReview.comment}
                      </p>
                    </div>
                  )}

                  {viewingReview.fullTextReference && (
                    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                      <div className="font-semibold text-muted-foreground mb-1">Đoạn trích toàn văn:</div>
                      <p className="text-foreground whitespace-pre-wrap leading-relaxed break-words text-xs max-h-56 overflow-y-auto">
                        {viewingReview.fullTextReference}
                      </p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" size="sm" onClick={() => setViewingReview(null)}>
                    Đóng
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
