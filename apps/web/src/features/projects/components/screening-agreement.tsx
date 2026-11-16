import { ResolutionEvidenceFields, emptyResolutionEvidence } from "./screening-resolution-evidence";
import { useState } from "react";
import type { ScreeningRoundView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { useUnsavedWorkspace } from "./workspace-common";
import { ScreeningError, useScreeningCommand } from "./screening-common";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { recordedAgreementBasis } from "../screening-agreement-basis";

export function ScreeningAgreementPanel({ projectId, round, readOnly }: { projectId: string; round: ScreeningRoundView; readOnly: boolean }) {
  const isTeamScreening = round.settings?.workflowKind === "TEAM_SCREENING" || round.settings?.resolutionPolicy === "CONSENSUS";
  const [decision, setDecision] = useState<"INCLUDED" | "EXCLUDED" | "NEEDS_MORE_INFO">("INCLUDED"), [reason, setReason] = useState("");
  const effectiveDecision = decision;
  const [evidence, setEvidence] = useState(emptyResolutionEvidence);
  const [version, setVersion] = useState<number | null>(null), [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declineBase, setDeclineBase] = useState<{ id: string; version: number } | null>(null);
  const [showProposal, setShowProposal] = useState(false);
  const command = useScreeningCommand(projectId), agreement = round.agreement;
  useUnsavedWorkspace(Boolean(reason || declineReason) || command.isPending);
  const stale = version !== null && version !== round.version;
  if (round.hiddenReviews || (!round.canProposeAgreement && !agreement && !reason && !declineReason && !round.requestedInfo)) return null;

  const label = (value: string) => value === "NEEDS_MORE_INFO" ? "Cần đọc thêm / bổ sung thông tin" : value === "INCLUDED" ? (round.phase === "TITLE_ABSTRACT" ? "Giữ bài qua vòng sàng lọc" : "Chọn bài cho phân tích") : "Loại bài theo tiêu chí";
  const trimmedReasonLen = reason.trim().length;

  return <section aria-label="Quyết định chung sau thảo luận" className="rounded-xl border border-border/80 bg-card p-4 space-y-4 shadow-xs">
    <header className="space-y-1">
      <h4 className="font-semibold text-sm text-foreground m-0">Quyết định chung sau thảo luận</h4>
      <p className="text-xs leading-relaxed text-muted-foreground m-0">
        {isTeamScreening
          ? "Đề xuất kết luận cuối cùng kèm căn cứ để hai reviewer cùng xác nhận."
          : "Thảo luận căn cứ và cùng xác nhận kết luận cuối cùng. Phiếu cá nhân ban đầu được giữ nguyên trong lịch sử."}
      </p>
    </header>

    {/* Display Requested More Information banner if present */}
    {round.requestedInfo && (
      <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-800/60 text-xs text-blue-900 dark:text-blue-200 space-y-1">
        <div className="font-medium flex items-center gap-1.5">
          <Info size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
          <span>Yêu cầu bổ sung thông tin từ {round.requestedInfo.requestedByName || "Reviewer"}</span>
        </div>
        <p className="whitespace-pre-wrap text-foreground/90 m-0">{round.requestedInfo.reason}</p>
        <p className="text-[11px] text-muted-foreground pt-0.5 m-0">
          Hai reviewer có thể trao đổi trong tab {isTeamScreening ? "Trao đổi & làm rõ" : "Thảo luận"}, bổ sung nguồn/toàn văn, và đề xuất quyết định Phù hợp hoặc Loại bỏ khi đã có đủ thông tin.
        </p>
      </div>
    )}

    {agreement && <div className="space-y-3 text-sm p-3.5 rounded-lg border border-border/70 bg-muted/25">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {agreement.decision === "INCLUDED"
            ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            : agreement.decision === "EXCLUDED"
              ? <XCircle size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
              : <Info size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />}
          <p className="font-semibold text-foreground m-0">{label(agreement.decision)}</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-amber-100/80 dark:bg-amber-950/60 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          {agreement.confirmedByIds.length}/{agreement.requiredReviewerIds.length} đã xác nhận
        </span>
      </div>

      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90 rounded-md bg-background/80 border border-border/50 px-3 py-2 m-0">{agreement.reason}</p>

      {agreement.exclusionReason && <p className="text-xs text-rose-700 dark:text-rose-300 font-medium m-0">Lý do loại chính thức: {agreement.exclusionReason}</p>}
      {agreement.sourceMaterial && <p className="text-[11px] text-muted-foreground m-0">Nguồn đã xem: {agreement.sourceMaterial}</p>}
      {agreement.retrieveFullText && <p className="text-[11px] text-muted-foreground m-0">Hai người xác nhận chuyển đọc toàn văn; chưa chọn cho phân tích.</p>}

      <ul className="flex flex-wrap gap-1.5 pt-2 border-t border-border/50 text-xs" aria-label="Xác nhận của reviewer">
        {agreement.requiredReviewerIds.map(id => {
          const confirmed = agreement.confirmedByIds.includes(id);
          return (
            <li key={id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${confirmed ? "bg-emerald-50/70 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300" : "bg-background border-border/70 text-muted-foreground"}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${confirmed ? "bg-emerald-500" : "bg-amber-400"}`} />
              <span>{round.assignments.find(a => a.reviewerId === id)?.name ?? "Reviewer"}: {confirmed ? "Đã xác nhận" : "Chờ xác nhận"}</span>
            </li>
          );
        })}
      </ul>

      {!readOnly && agreement.canDecline && <details className="pt-1"><summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">Chưa đồng ý · Tiếp tục thảo luận</summary><form className="screening-form !m-0 mt-2.5 space-y-2.5" onSubmit={async e => { e.preventDefault(); if (declineReason.trim().length < 10 || declineBase?.id !== agreement.id || declineBase?.version !== round.version) return; const payload = { proposalId: declineBase.id, reason: declineReason, expectedVersion: declineBase.version, confirmed: true }; if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.declineAgreement(projectId, round.id, { ...payload, clientKey }))) { setDeclineReason(""); setDeclineBase(null); } }}><label className="text-xs font-medium block">Lý do cần thảo luận thêm<textarea value={declineReason} minLength={10} maxLength={2000} required rows={2} className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-xs" onChange={e => { setDeclineReason(e.target.value); if (!declineBase) setDeclineBase({ id: agreement.id, version: round.version }); }} /></label><Button variant="outline" size="sm" disabled={command.isPending || declineReason.trim().length < 10 || declineBase?.id !== agreement.id || declineBase?.version !== round.version}>Tiếp tục thảo luận, chưa chốt</Button>{declineBase && (declineBase.id !== agreement.id || declineBase?.version !== round.version) && <div role="status" className="text-xs space-y-1.5"><p className="m-0">Đề xuất đã thay đổi. Lý do của bạn vẫn được giữ.</p><Button type="button" variant="outline" size="sm" onClick={() => setDeclineBase({ id: agreement.id, version: round.version })}>Tôi đã đọc lại đề xuất</Button></div>}</form></details>}

      {!readOnly && agreement.canConfirm && <form className="space-y-2.5 pt-2.5 border-t border-border/50" onSubmit={async e => {
        e.preventDefault(); if (confirmedFor !== `${agreement.id}:${round.version}` || !agreement.canConfirm) return;
        const payload = { proposalId: agreement.id, expectedVersion: round.version, confirmed: true };
        if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.confirmAgreement(projectId, round.id, { ...payload, clientKey }))) setConfirmedFor(null);
      }}><label className="screening-check text-xs font-medium cursor-pointer"><input type="checkbox" checked={confirmedFor === `${agreement.id}:${round.version}`} disabled={command.isPending} onChange={e => setConfirmedFor(e.target.checked ? `${agreement.id}:${round.version}` : null)} />Tôi đồng ý với quyết định chung và lý do ở trên.</label><Button size="sm" className="w-full h-9 text-xs font-medium" disabled={command.isPending || confirmedFor !== `${agreement.id}:${round.version}`}>Xác nhận quyết định chung</Button></form>}
    </div>}

    {/* Proposal Form */}
    {(round.canProposeAgreement || reason) && (() => {
      const hasExclusionCriteria = Boolean(round.settings?.exclusionCriteria?.length);
      const invalidReason = trimmedReasonLen < 10;
      const invalidExclusion = effectiveDecision === "EXCLUDED" && hasExclusionCriteria && !evidence.exclusionReason?.trim();
      const proposalForm = (
        <form className="screening-form !m-0 space-y-3.5" onSubmit={async e => {
          e.preventDefault(); if (readOnly || !round.canProposeAgreement || stale || invalidReason || invalidExclusion) return;
          const payload = {
            decision: effectiveDecision,
            ...evidence,
            ...(isTeamScreening ? {
              exclusionReason: effectiveDecision === "EXCLUDED" && hasExclusionCriteria ? evidence.exclusionReason : undefined,
              sourceMaterial: recordedAgreementBasis(round, effectiveDecision).sourceMaterial,
            } : {}),
            reason: reason.trim(),
            retrieveFullText: effectiveDecision === "NEEDS_MORE_INFO" && evidence.retrieveFullText,
            expectedVersion: version ?? round.version,
            confirmed: true,
          };
          if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.proposeAgreement(projectId, round.id, { ...payload, clientKey }))) { setReason(""); setVersion(null); setConfirmedFor(null); setShowProposal(false); }
        }}>
          <fieldset disabled={command.isPending || readOnly || !round.canProposeAgreement} className="space-y-3.5">
            {isTeamScreening ? (
              <div className="space-y-2">
                <span className="text-xs font-medium text-foreground block">Chọn kết luận chung cuối cùng:</span>
                <div className="grid grid-cols-1 gap-2">
                  <label className={`screening-radio-card flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${effectiveDecision === "INCLUDED" ? "bg-emerald-50/60 border-emerald-500/70 ring-1 ring-emerald-500/20 dark:bg-emerald-950/25 text-emerald-950 dark:text-emerald-100" : "bg-background border-border/75 hover:bg-muted/35"}`}>
                    <input type="radio" name="joint-decision" value="INCLUDED" checked={effectiveDecision === "INCLUDED"} onChange={() => { setDecision("INCLUDED"); setVersion(round.version); }} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-600" />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex items-center gap-1.5 font-semibold text-xs">
                        <CheckCircle2 size={13} className={effectiveDecision === "INCLUDED" ? "text-emerald-600 dark:text-emerald-400 shrink-0" : "text-muted-foreground shrink-0"} />
                        <span>Phù hợp</span>
                      </span>
                      <span className="block text-[11px] font-normal leading-snug text-muted-foreground">Bài báo phù hợp và đáp ứng các tiêu chí đưa vào của đề tài.</span>
                    </div>
                  </label>
                  <label className={`screening-radio-card flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${effectiveDecision === "EXCLUDED" ? "bg-rose-50/60 border-rose-500/70 ring-1 ring-rose-500/20 dark:bg-rose-950/25 text-rose-950 dark:text-rose-100" : "bg-background border-border/75 hover:bg-muted/35"}`}>
                    <input type="radio" name="joint-decision" value="EXCLUDED" checked={effectiveDecision === "EXCLUDED"} onChange={() => { setDecision("EXCLUDED"); setVersion(round.version); }} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-rose-600" />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex items-center gap-1.5 font-semibold text-xs">
                        <XCircle size={13} className={effectiveDecision === "EXCLUDED" ? "text-rose-600 dark:text-rose-400 shrink-0" : "text-muted-foreground shrink-0"} />
                        <span>Loại bỏ</span>
                      </span>
                      <span className="block text-[11px] font-normal leading-snug text-muted-foreground">
                        {hasExclusionCriteria ? "Bài báo không đáp ứng tiêu chí. Bắt buộc chọn tiêu chí loại." : "Bài báo không đáp ứng tiêu chí của đề tài."}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              <label className="text-xs font-medium">Kết luận đề xuất
                <select value={effectiveDecision} className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs" onChange={e => { setDecision(e.target.value as typeof decision); setVersion(round.version); }}>
                  <option value="INCLUDED">{label("INCLUDED")}</option>
                  <option value="EXCLUDED">{label("EXCLUDED")}</option>
                  <option value="NEEDS_MORE_INFO">{label("NEEDS_MORE_INFO")}</option>
                </select>
              </label>
            )}

            {isTeamScreening && effectiveDecision === "EXCLUDED" && hasExclusionCriteria && <label className="block text-xs font-medium space-y-1.5">
              <span>Tiêu chí loại <span className="text-rose-500">*</span></span>
              <select required value={evidence.exclusionReason} className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs" onChange={event => { setEvidence(current => ({ ...current, exclusionReason: event.target.value })); if (version === null) setVersion(round.version); }}><option value="">Chọn tiêu chí của vòng</option>{round.settings!.exclusionCriteria!.map(criterion => <option key={criterion} value={criterion}>{criterion}</option>)}</select>
            </label>}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`agreement-reason-${round.id}`} className="text-xs font-medium text-foreground">
                  Lý do chung và căn cứ đánh giá <span className="text-rose-500">*</span>
                </label>
                <span className={`text-[11px] tabular-nums ${invalidReason ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400 font-medium"}`}>
                  {invalidReason ? `${trimmedReasonLen}/10 ký tự tối thiểu` : "Đủ căn cứ"}
                </span>
              </div>
              <textarea
                id={`agreement-reason-${round.id}`}
                value={reason}
                minLength={10}
                maxLength={2000}
                required
                rows={3}
                placeholder="Nêu rõ căn cứ từ tiêu đề, tóm tắt hoặc toàn văn bài báo để cả hai reviewer cùng thống nhất..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs leading-relaxed"
                onChange={e => { setReason(e.target.value); if (version === null) setVersion(round.version); }}
              />
            </div>

            {!isTeamScreening && <ResolutionEvidenceFields value={evidence} onChange={value => { setEvidence(value); if (version === null) setVersion(round.version); }} decision={effectiveDecision} criteria={round.settings?.exclusionCriteria ?? []} required={effectiveDecision === "EXCLUDED" || (round.settings?.workflowVersion ?? 0) >= 7} canRetrieveFullText={round.phase === "TITLE_ABSTRACT" && round.settings?.allowConservativeFullText && round.settings?.stages?.includes("FULL_TEXT")} />}
          </fieldset>

          {stale && <div role="status" className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900 rounded-lg p-2.5 space-y-1.5"><p className="m-0">Vòng đã thay đổi. Bản nháp được giữ; hãy đọc lại trước khi gửi.</p><Button type="button" variant="outline" size="sm" onClick={() => { setVersion(round.version); setConfirmedFor(null); }}>Tôi đã kiểm tra vòng hiện tại</Button></div>}
          <Button size="sm" className="w-full h-9 text-xs font-medium" disabled={command.isPending || readOnly || !round.canProposeAgreement || stale || invalidReason || invalidExclusion}>Gửi đề xuất cho reviewer xác nhận</Button>
        </form>
      );

      return agreement ? (
        <details open={showProposal} onToggle={e => setShowProposal(e.currentTarget.open)} className="border border-border/70 rounded-lg p-3 bg-muted/20">
          <summary className="font-medium text-xs cursor-pointer select-none">Đề xuất kết luận khác</summary>
          <div className="mt-3">{proposalForm}</div>
        </details>
      ) : (
        proposalForm
      );
    })()}

    {declineReason && !agreement && <div role="status" className="text-xs space-y-1.5"><p className="m-0">Đề xuất không còn hiệu lực. Lý do đang soạn được giữ để bạn sao chép:</p><textarea aria-label="Lý do đang soạn" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs" value={declineReason} onChange={e => setDeclineReason(e.target.value)} /></div>}
    <ScreeningError error={command.error} />
  </section>;
}
