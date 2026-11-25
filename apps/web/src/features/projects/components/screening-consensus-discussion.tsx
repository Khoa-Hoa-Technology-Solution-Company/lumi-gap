import { useEffect, useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ScreeningPaperRow, ScreeningRoundView, WorkspacePerson } from "@trend/shared-types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { ScreeningDecisionChoices, screeningReviewOptions } from "./screening-decision-choices";
import { ScreeningStatusBadge } from "./screening-status-badge";
import { screeningChoiceTone } from "../screening-status";
import { choiceLabels, screeningActorId, ScreeningError, useScreeningCommand } from "./screening-common";
import { RoundHistory, ReviewVersionHistory } from "./screening-round-history";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";
import "../screening-review-workspace.css";

export function ScreeningConflictResolution({ projectId, round, people, readOnly, onBack }: {
  projectId: string; round: ScreeningRoundView; people: WorkspacePerson[]; readOnly: boolean;
  onBack?: () => void;
  paper?: ScreeningPaperRow | null; discussionRequested?: boolean;
}) {
  const publicId = useAuthStore(s => s.user?.id);
  const actorId = screeningActorId(round, publicId);
  const command = useScreeningCommand(projectId), cache = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedTab = params.get("section") === "review" ? "reviews" : "discussion";
  const [activeTab, setActiveTab] = useState<"discussion" | "reviews">(requestedTab);
  const tabId = useId();
  const tabs = [{ value: "discussion", label: "Trao đổi" }, { value: "reviews", label: "Hai phiếu đánh giá" }] as const;
  useEffect(() => { setActiveTab(requestedTab); }, [requestedTab]);
  const own = round.myReview;
  const [baseRevision, setBaseRevision] = useState(own?.revision);
  const [decision, setDecision] = useState<"INCLUDE" | "EXCLUDE" | "">(own?.decision === "UNSURE" ? "" : own?.decision ?? "");
  const [reason, setReason] = useState(""), [now, setNow] = useState(Date.now);
  const consensus = round.consensus, deadline = consensus?.deadline;
  useEffect(() => {
    if (!deadline || round.finalDecision) return;
    let refreshed = false;
    const timer = window.setInterval(() => {
      const time = Date.now(); setNow(time);
      if (!refreshed && time >= Date.parse(deadline)) {
        refreshed = true;
        void cache.invalidateQueries({ queryKey: ["project-research", publicId, projectId] });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, round.finalDecision, cache, publicId, projectId]);
  const ai = useResearchResource(projectId, ["screening-ai", round.id], () => screeningApi.ai(projectId, round.id), round.aiVisible);
  const stale = Boolean(own && own.revision !== baseRevision);
  const expired = Boolean(deadline && Date.parse(deadline) <= now);
  const canUpdate = !round.finalDecision && !readOnly && consensus?.canUpdate;
  const [closureOpen, setClosureOpen] = useState(false), [closureReason, setClosureReason] = useState("");
  const proposal = round.agreement?.decision === "CLOSED_UNRESOLVED" ? round.agreement : null;
  const seconds = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : 0;
  const clock = [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
  useUnsavedWorkspace(Boolean(reason || closureReason || decision && decision !== own?.decision) || command.isPending);

  return <section className="screening-conflict-container" data-focus-chat={activeTab === "discussion"} aria-label="Hai Reviewer chưa thống nhất">
    <header className="screening-consensus-header">
      <div className="screening-consensus-heading">
        <h4>Hai Reviewer chưa thống nhất</h4>
        {deadline && <span className="screening-consensus-deadline" title={`Hạn: ${new Date(deadline).toLocaleString("vi-VN")}`}>
          <span>Còn</span><time dateTime={deadline} aria-label="Thời gian thảo luận còn lại">{expired ? "Quá hạn" : clock}</time>
          <span className="sr-only">Hạn: {new Date(deadline).toLocaleString("vi-VN")}</span>
        </span>}
      </div>
      <p>{proposal ? "Chờ người đánh giá còn lại xác nhận kết thúc." : "Trao đổi căn cứ, rồi cập nhật phiếu để thống nhất."}{expired ? " Quá hạn không tự kết thúc đánh giá; hai người vẫn có thể trao đổi." : ""}</p>
    </header>
    <div className="screening-resolution-tabs" role="tablist" aria-label="Thảo luận và phiếu đánh giá">
      {tabs.map((tab, index) => <button key={tab.value} type="button" role="tab" id={`${tabId}-${tab.value}`} aria-controls={`${tabId}-${tab.value}-panel`} aria-selected={activeTab === tab.value} tabIndex={activeTab === tab.value ? 0 : -1}
        onClick={() => setActiveTab(tab.value)} onKeyDown={event => {
          const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length
            : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (nextIndex === null) return;
          event.preventDefault();
          const next = tabs[nextIndex]!;
          setActiveTab(next.value);
          document.getElementById(`${tabId}-${next.value}`)?.focus();
        }}>{tab.label}</button>)}
    </div>
    <div role="tabpanel" id={`${tabId}-discussion-panel`} aria-labelledby={`${tabId}-discussion`} hidden={activeTab !== "discussion"} tabIndex={0} className="screening-resolution-panel screening-discussion-panel">
      <RoundHistory projectId={projectId} round={round} people={people} readOnly={readOnly} visible={activeTab === "discussion"} />
    </div>
    <div role="tabpanel" id={`${tabId}-reviews-panel`} aria-labelledby={`${tabId}-reviews`} hidden={activeTab !== "reviews"} tabIndex={0} className="screening-resolution-panel space-y-5">
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {round.assignments.filter(a => a.completed && !round.hiddenReviews).map((assignment, i) => {
        const current = round.reviews.find(r => r.assignmentId === assignment.id);
        return <article key={assignment.id} className="min-w-0 space-y-3 rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{assignment.name.trim().charAt(0).toUpperCase()}</span><h5 className="text-sm font-semibold">Reviewer {i + 1} · {assignment.name}{assignment.reviewerId === actorId ? " (Bạn)" : ""}</h5></div>
          {current && <>
            <ScreeningStatusBadge tone={screeningChoiceTone(current.decision)}>{choiceLabels[current.decision]}</ScreeningStatusBadge>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{current.comment || current.exclusionReason}</p>
            {(current.comment.length > 240 || current.exclusionReason && current.exclusionReason !== current.comment) && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Xem đầy đủ căn cứ</summary><p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{current.comment}</p>{current.exclusionReason !== current.comment && <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{current.exclusionReason}</p>}</details>}
            <p className="text-xs text-muted-foreground">Phiên bản {current.revision} · <time dateTime={current.submittedAt}>{new Date(current.submittedAt).toLocaleString("vi-VN")}</time></p>
          </>}
          {current && <ReviewVersionHistory round={round} assignmentId={assignment.id} beforeRevision={current.revision} />}
        </article>;
      })}
    </div>
    {ai.data?.result && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Gợi ý AI đã có (chỉ tham khảo)</summary><p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{ai.data.result.explanation}</p>{ai.data.result.evidence.map((item, i) => <blockquote className="mt-2 text-muted-foreground [overflow-wrap:anywhere]" key={i}>{item.quote}</blockquote>)}</details>}
    {canUpdate ? <form aria-label="Cập nhật đánh giá của tôi" className="screening-form" onSubmit={async e => {
      e.preventDefault();
      if (!canUpdate || stale || !decision || reason.trim().length < 5 || !baseRevision) return;
      const payload = { decision, reason: reason.trim(), exclusionReason: decision === "EXCLUDE" ? reason.trim().slice(0, 500) : "", expectedRevision: baseRevision };
      let expiredOnServer = false;
      const ok = await command.run({ roundId: round.id, ...payload }, async clientKey => {
        const result = await screeningApi.action(projectId, round.id, "reassess", { ...payload, clientKey }) as { expired?: boolean };
        expiredOnServer = Boolean(result.expired); return result;
      });
      if (ok) { setReason(""); if (!expiredOnServer) setBaseRevision(baseRevision + 1); toast[expiredOnServer ? "info" : "success"](expiredOnServer ? "Đã hết hạn thảo luận; xem kết quả mới nhất." : "Đã cập nhật đánh giá."); }
    }}>
      <ScreeningDecisionChoices legend="Đánh giá của tôi" value={decision} options={screeningReviewOptions.filter((o): o is typeof o & { value: "INCLUDE" | "EXCLUDE" } => o.value !== "UNSURE")} onChange={setDecision} disabled={command.isPending} required />
      <label>Lý do cập nhật<textarea required minLength={5} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} disabled={command.isPending} rows={3} /></label>
      <p className="text-xs text-muted-foreground">Mọi phiên bản được lưu. Hệ thống chốt khi hai đánh giá hiện hành trùng nhau.</p>
      {stale && <p role="alert" className="text-sm">Phiếu của bạn đã đổi ở nơi khác. Đọc phiếu hiện hành trước khi tiếp tục. <Button type="button" variant="link" onClick={() => setBaseRevision(own?.revision)}>Tôi đã đọc phiếu hiện hành</Button></p>}
      <ScreeningError error={command.error} />
      <Button disabled={command.isPending || stale || !decision || reason.trim().length < 5}>Cập nhật đánh giá</Button>
    </form> : <p role="status" className="text-sm text-muted-foreground">Chỉ hai reviewer được phân công mới được cập nhật đánh giá.</p>}
    </div>
    {proposal && <section aria-label="Đề nghị kết thúc đánh giá" className="min-w-0 space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
      <h5 className="font-semibold">Chờ xác nhận kết thúc</h5>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{proposal.reason}</p>
      <p className="text-muted-foreground">Nếu cả hai xác nhận, bài không được đưa vào tập nghiên cứu được chọn theo chính sách của nhóm. Đây là kết quả không đạt đồng thuận, không phải loại theo tiêu chí.</p>
      {(proposal.canConfirm || proposal.canDecline) && !readOnly ? <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={command.isPending} onClick={() => void command.run({ roundId: round.id, proposalId: proposal.id, accept: false }, clientKey => screeningApi.declineAgreement(projectId, round.id, { expectedVersion: round.version, proposalId: proposal.id, reason: "Tiếp tục thảo luận và đối chiếu căn cứ", confirmed: true, clientKey }))}>Tiếp tục thảo luận</Button>
        <Button disabled={command.isPending} onClick={() => void command.run({ roundId: round.id, proposalId: proposal.id, accept: true }, clientKey => screeningApi.confirmAgreement(projectId, round.id, { expectedVersion: round.version, proposalId: proposal.id, confirmed: true, clientKey }))}>Đồng ý kết thúc</Button>
      </div> : <p className="text-muted-foreground">Đề nghị chưa làm thay đổi kết quả. Hai người vẫn có thể trao đổi và cập nhật phiếu.</p>}
    </section>}
    {canUpdate && !proposal && <Button type="button" variant="outline" className="h-auto whitespace-normal text-left" onClick={() => setClosureOpen(true)}>Đề nghị kết thúc do không đạt đồng thuận</Button>}
    <ScreeningError error={command.error} />
    <Dialog open={closureOpen} onOpenChange={open => { if (!command.isPending) setClosureOpen(open); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Đề nghị kết thúc đánh giá</DialogTitle><DialogDescription>Bạn và người đánh giá còn lại chưa thống nhất được kết quả. Chỉ khi cả hai xác nhận, bài mới được đóng với kết quả Không đạt đồng thuận.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={async e => {
          e.preventDefault(); if (command.isPending || closureReason.trim().length < 10) return;
          const reason = closureReason.trim(), reviewIds = round.reviews.map(r => r.id).sort();
          const ok = await command.run({ roundId: round.id, decision: "CLOSED_UNRESOLVED", reason, reviewIds }, clientKey => screeningApi.proposeAgreement(projectId, round.id, { expectedVersion: round.version, decision: "CLOSED_UNRESOLVED", reason, reviewIds, confirmed: true, clientKey }));
          if (ok) { setClosureOpen(false); setClosureReason(""); toast.success("Đã gửi đề nghị cho người đánh giá còn lại."); }
        }}>
          <label className="block space-y-2 text-sm"><span>Lý do chưa thể thống nhất</span><textarea className="min-h-28 w-full rounded-md border bg-background p-3" required minLength={10} maxLength={2000} value={closureReason} onChange={e => setClosureReason(e.target.value)} disabled={command.isPending} /></label>
          <p className="text-sm text-muted-foreground">Nếu đồng ý kết thúc, bài không được đưa vào tập nghiên cứu được chọn theo chính sách của nhóm. Phiếu và trao đổi vẫn được giữ.</p>
          <ScreeningError error={command.error} />
          <DialogFooter><Button type="button" variant="outline" disabled={command.isPending} onClick={() => setClosureOpen(false)}>Hủy</Button><Button disabled={command.isPending || closureReason.trim().length < 10}>{command.isPending ? "Đang gửi…" : "Gửi đề nghị"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Button type="button" size="sm" variant="ghost" className="screening-consensus-back" onClick={async () => { if (await canLeaveWorkspace()) { if (onBack) onBack(); else navigate(`/projects/${encodeURIComponent(projectId)}?tab=papers&view=my-work`); } }}>Quay lại</Button>
  </section>;
}
