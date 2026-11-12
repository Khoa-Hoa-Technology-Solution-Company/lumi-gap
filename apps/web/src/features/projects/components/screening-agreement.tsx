import { ResolutionEvidenceFields, emptyResolutionEvidence } from "./screening-resolution-evidence";
import { useState } from "react";
import type { ScreeningRoundView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { useUnsavedWorkspace } from "./workspace-common";
import { ScreeningError, useScreeningCommand } from "./screening-common";
import { CheckCircle2, XCircle, Info, HelpCircle } from "lucide-react";

export function ScreeningAgreementPanel({ projectId, round, readOnly }: { projectId: string; round: ScreeningRoundView; readOnly: boolean }) {
  const isTeamScreening = round.settings?.workflowKind === "TEAM_SCREENING";
  const [decision, setDecision] = useState<"INCLUDED" | "EXCLUDED" | "NEEDS_MORE_INFO">("INCLUDED"), [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState(emptyResolutionEvidence);
  const [version, setVersion] = useState<number | null>(null), [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState(""), [authorConsent, setAuthorConsent] = useState(false);
  const [declineBase, setDeclineBase] = useState<{ id: string; version: number } | null>(null);
  const [moreInfoReason, setMoreInfoReason] = useState("");
  const [showMoreInfoForm, setShowMoreInfoForm] = useState(false);
  const modern = (round.settings?.workflowVersion ?? 0) >= 5 || isTeamScreening;
  const [showProposal, setShowProposal] = useState(false);
  const command = useScreeningCommand(projectId), agreement = round.agreement;
  useUnsavedWorkspace(Boolean(reason || declineReason || moreInfoReason) || command.isPending);
  const stale = version !== null && version !== round.version;
  if (round.hiddenReviews || (!round.canProposeAgreement && !agreement && !reason && !declineReason && !round.requestedInfo)) return null;

  const label = (value: string) => value === "NEEDS_MORE_INFO" ? "Cần đọc thêm / bổ sung thông tin" : value === "INCLUDED" ? (round.phase === "TITLE_ABSTRACT" ? "Giữ bài qua vòng sàng lọc" : "Chọn bài cho phân tích") : "Loại bài theo tiêu chí";

  return <section aria-label="Quyết định chung sau thảo luận" className="space-y-3 border-y py-4">
    <div className="space-y-1">
      <h4 className="font-semibold text-sm">Quyết định chung sau thảo luận</h4>
      <p className="text-xs leading-5 text-muted-foreground">
        Thảo luận căn cứ và cùng xác nhận kết luận cuối cùng. Mỗi reviewer tự xác nhận cùng một kết luận và lý do. Phiếu cá nhân ban đầu được giữ nguyên trong lịch sử.
      </p>
    </div>

    {/* Display Requested More Information banner if present */}
    {round.requestedInfo && (
      <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 space-y-1">
        <div className="font-medium flex items-center gap-1.5">
          <Info size={14} className="text-blue-600 dark:text-blue-400" />
          <span>Yêu cầu bổ sung thông tin từ {round.requestedInfo.requestedByName || "Reviewer"}</span>
        </div>
        <p className="whitespace-pre-wrap text-foreground/90">{round.requestedInfo.reason}</p>
        <p className="text-[11px] text-muted-foreground pt-0.5">
          Hai reviewer có thể trao đổi trong tab Thảo luận, bổ sung nguồn/toàn văn, và đề xuất quyết định Phù hợp hoặc Loại bỏ khi đã có đủ thông tin.
        </p>
      </div>
    )}

    {agreement && <div className="space-y-3 text-sm p-3.5 rounded-lg border bg-muted/30">
      <div className="flex items-center gap-2">
        {agreement.decision === "INCLUDED" ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /> : <XCircle size={16} className="text-rose-600 dark:text-rose-400" />}
        <p className="font-semibold">{label(agreement.decision)}</p>
      </div>
      <p className="whitespace-pre-wrap break-words text-xs text-foreground/90">{agreement.reason}</p>
      {agreement.exclusionReason && <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">Lý do loại chính thức: {agreement.exclusionReason}</p>}
      {agreement.sourceMaterial && <p className="text-xs text-muted-foreground">Nguồn đã xem: {agreement.sourceMaterial}</p>}
      {agreement.retrieveFullText && <p className="text-xs text-muted-foreground">Hai người xác nhận chuyển đọc toàn văn; chưa chọn cho phân tích.</p>}
      <ul className="space-y-1 pt-1 border-t text-xs" aria-label="Xác nhận của reviewer">
        {agreement.requiredReviewerIds.map(id => (
          <li key={id} className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${agreement.confirmedByIds.includes(id) ? "bg-emerald-500" : "bg-amber-400"}`} />
            <span>{round.assignments.find(a => a.reviewerId === id)?.name ?? "Reviewer"}: {agreement.confirmedByIds.includes(id) ? "Đã xác nhận" : "Chờ xác nhận"}</span>
          </li>
        ))}
      </ul>
      {!readOnly && agreement.canDecline && <details><summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Chưa đồng ý · Tiếp tục thảo luận</summary><form className="screening-form mt-3" onSubmit={async e => { e.preventDefault(); if (declineReason.trim().length < 10 || declineBase?.id !== agreement.id || declineBase?.version !== round.version) return; const payload = { proposalId: declineBase.id, reason: declineReason, expectedVersion: declineBase.version, confirmed: true }; if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.declineAgreement(projectId, round.id, { ...payload, clientKey }))) { setDeclineReason(""); setDeclineBase(null); } }}><label>Lý do cần thảo luận thêm<textarea value={declineReason} minLength={10} maxLength={2000} required onChange={e => { setDeclineReason(e.target.value); if (!declineBase) setDeclineBase({ id: agreement.id, version: round.version }); }} /></label><Button variant="outline" size="sm" disabled={command.isPending || declineReason.trim().length < 10 || declineBase?.id !== agreement.id || declineBase?.version !== round.version}>Tiếp tục thảo luận, chưa chốt</Button>{declineBase && (declineBase.id !== agreement.id || declineBase.version !== round.version) && <div role="status"><p>Đề xuất đã thay đổi. Lý do của bạn vẫn được giữ.</p><Button type="button" variant="outline" size="sm" onClick={() => setDeclineBase({ id: agreement.id, version: round.version })}>Tôi đã đọc lại đề xuất</Button></div>}</form></details>}
      {!readOnly && agreement.canConfirm && <form className="space-y-3 pt-2 border-t" onSubmit={async e => {
        e.preventDefault(); if (confirmedFor !== `${agreement.id}:${round.version}` || !agreement.canConfirm) return;
        const payload = { proposalId: agreement.id, expectedVersion: round.version, confirmed: true };
        if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.confirmAgreement(projectId, round.id, { ...payload, clientKey }))) setConfirmedFor(null);
      }}><label className="screening-check text-xs font-medium cursor-pointer"><input type="checkbox" checked={confirmedFor === `${agreement.id}:${round.version}`} disabled={command.isPending} onChange={e => setConfirmedFor(e.target.checked ? `${agreement.id}:${round.version}` : null)} />Tôi đồng ý với quyết định chung và lý do ở trên.</label><Button size="sm" disabled={command.isPending || confirmedFor !== `${agreement.id}:${round.version}`}>Xác nhận quyết định chung</Button></form>}
    </div>}

    {/* Proposal Form */}
    {(round.canProposeAgreement || reason) && <details open={showProposal} onToggle={e => setShowProposal(e.currentTarget.open)} className="border rounded-lg p-3 bg-card">
      <summary className="font-medium text-xs cursor-pointer select-none">{agreement ? "Đề xuất kết luận khác" : "Đề xuất quyết định chung"}</summary>
      <form className="screening-form mt-3 space-y-3" onSubmit={async e => {
        e.preventDefault(); if (readOnly || !round.canProposeAgreement || stale || reason.trim().length < 10 || modern && !authorConsent) return;
        if (decision === "EXCLUDED" && round.settings?.exclusionCriteria?.length && !evidence.exclusionReason?.trim()) return;
        const payload = { decision, reason, ...evidence, retrieveFullText: decision === "NEEDS_MORE_INFO" && evidence.retrieveFullText, expectedVersion: version ?? round.version, confirmed: true };
        if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.proposeAgreement(projectId, round.id, { ...payload, clientKey }))) { setReason(""); setVersion(null); setConfirmedFor(null); setShowProposal(false); setAuthorConsent(false); }
      }}>
        <fieldset disabled={command.isPending || readOnly || !round.canProposeAgreement} className="space-y-3">
          {isTeamScreening ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Chọn kết luận chung cuối cùng:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className={`flex items-start gap-2.5 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${decision === "INCLUDED" ? "bg-emerald-50/50 border-emerald-500/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200" : "bg-background border-border/70 hover:bg-muted/40"}`}>
                  <input type="radio" name="joint-decision" value="INCLUDED" checked={decision === "INCLUDED"} onChange={() => { setDecision("INCLUDED"); setAuthorConsent(false); setVersion(round.version); }} className="mt-0.5" />
                  <div>
                    <strong className="block font-medium">Lựa chọn A — Phù hợp (Include)</strong>
                    <span className="text-[11px] text-muted-foreground">Bài báo phù hợp và đáp ứng các tiêu chí đưa vào của đề tài.</span>
                  </div>
                </label>
                <label className={`flex items-start gap-2.5 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${decision === "EXCLUDED" ? "bg-rose-50/50 border-rose-500/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200" : "bg-background border-border/70 hover:bg-muted/40"}`}>
                  <input type="radio" name="joint-decision" value="EXCLUDED" checked={decision === "EXCLUDED"} onChange={() => { setDecision("EXCLUDED"); setAuthorConsent(false); setVersion(round.version); }} className="mt-0.5" />
                  <div>
                    <strong className="block font-medium">Lựa chọn B — Loại bỏ (Exclude)</strong>
                    <span className="text-[11px] text-muted-foreground">Bài báo không đáp ứng tiêu chí. Bắt buộc chọn tiêu chí loại.</span>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <label className="text-xs font-semibold">Kết luận đề xuất
              <select value={decision} onChange={e => { setDecision(e.target.value as typeof decision); setAuthorConsent(false); setVersion(round.version); }}>
                <option value="INCLUDED">{label("INCLUDED")}</option>
                <option value="EXCLUDED">{label("EXCLUDED")}</option>
                <option value="NEEDS_MORE_INFO">{label("NEEDS_MORE_INFO")}</option>
              </select>
            </label>
          )}

          <label className="text-xs font-semibold block">Lý do chung và căn cứ đánh giá (ít nhất 10 ký tự)
            <textarea value={reason} minLength={10} maxLength={2000} required rows={3} placeholder="Nêu rõ căn cứ từ tiêu đề, tóm tắt hoặc toàn văn bài báo để cả hai reviewer cùng thống nhất..." className="w-full mt-1 p-2 rounded border text-xs" onChange={e => { setReason(e.target.value); setAuthorConsent(false); if (version === null) setVersion(round.version); }} />
          </label>

          <ResolutionEvidenceFields value={evidence} onChange={value => { setEvidence(value); setAuthorConsent(false); if (version === null) setVersion(round.version); }} decision={decision} criteria={round.settings?.exclusionCriteria ?? []} required={decision === "EXCLUDED" || (round.settings?.workflowVersion ?? 0) >= 7} canRetrieveFullText={round.phase === "TITLE_ABSTRACT" && round.settings?.allowConservativeFullText && round.settings?.stages?.includes("FULL_TEXT")} />

          <p className="text-[11px] text-muted-foreground">
            {modern ? "Gửi đề xuất ghi nhận sự đồng ý của bạn. Reviewer còn lại cần xác nhận trước khi có quyết định cuối." : "Gửi đề xuất chưa ghi kết quả cuối."}
          </p>

          {modern && (
            <label className="screening-check text-xs font-medium cursor-pointer">
              <input type="checkbox" checked={authorConsent} onChange={e => { setAuthorConsent(e.target.checked); if (version === null) setVersion(round.version); }} />
              Tôi đồng ý với kết luận và lý do đề xuất này.
            </label>
          )}
        </fieldset>

        {stale && <div role="status" className="text-xs text-amber-600"><p>Vòng đã thay đổi. Bản nháp được giữ; hãy đọc lại trước khi gửi.</p><Button type="button" variant="outline" size="sm" onClick={() => { setVersion(round.version); setConfirmedFor(null); setAuthorConsent(false); }}>Tôi đã kiểm tra vòng hiện tại</Button></div>}
        <Button size="sm" disabled={command.isPending || readOnly || !round.canProposeAgreement || stale || reason.trim().length < 10 || (decision === "EXCLUDED" && Boolean(round.settings?.exclusionCriteria?.length) && !evidence.exclusionReason?.trim()) || modern && !authorConsent}>Gửi đề xuất cho reviewer xác nhận</Button>
      </form>
    </details>}

    {/* Separate Secondary Action: Need More Information */}
    {isTeamScreening && !readOnly && round.active && !round.finalDecision && (
      <details open={showMoreInfoForm} onToggle={e => setShowMoreInfoForm(e.currentTarget.open)} className="border border-dashed rounded-lg p-3 bg-muted/20">
        <summary className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none flex items-center gap-1.5">
          <HelpCircle size={13} />
          <span>Cần thêm thông tin (Yêu cầu làm rõ nguồn / tài liệu)</span>
        </summary>
        <form className="mt-2.5 space-y-2.5" onSubmit={async e => {
          e.preventDefault();
          if (moreInfoReason.trim().length < 10 || command.isPending || readOnly) return;
          const payload = {
            expectedVersion: round.version,
            reason: moreInfoReason.trim(),
          };
          const success = await command.run({ roundId: round.id, ...payload }, clientKey =>
            screeningApi.requestMoreInfo(projectId, round.id, { ...payload, clientKey })
          );
          if (success) {
            setMoreInfoReason("");
            setShowMoreInfoForm(false);
          }
        }}>
          <p className="text-[11px] text-muted-foreground">
            Khi tóm tắt chưa đủ căn cứ để kết luận, bạn có thể gửi yêu cầu làm rõ mà không chốt kết quả. Bài báo vẫn giữ nguyên trong hàng đợi để tiếp tục thảo luận khi có thêm thông tin.
          </p>
          <label className="text-xs font-medium block">
            Thông tin hoặc bằng chứng còn thiếu cần làm rõ (ít nhất 10 ký tự):
            <textarea
              value={moreInfoReason}
              minLength={10}
              maxLength={1000}
              required
              rows={2}
              placeholder="Ví dụ: Cần toàn văn để kiểm tra số liệu mẫu và tiêu chí thu thập..."
              className="w-full mt-1 p-2 rounded border text-xs"
              onChange={e => setMoreInfoReason(e.target.value)}
            />
          </label>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={command.isPending || moreInfoReason.trim().length < 10}
            className="text-xs"
          >
            Gửi yêu cầu bổ sung thông tin
          </Button>
        </form>
      </details>
    )}

    {declineReason && !agreement && <div role="status" className="text-xs"><p>Đề xuất không còn hiệu lực. Lý do đang soạn được giữ để bạn sao chép:</p><textarea aria-label="Lý do đang soạn" className="w-full mt-1 p-2 rounded border text-xs" value={declineReason} onChange={e => setDeclineReason(e.target.value)} /></div>}
    <ScreeningError error={command.error} />
  </section>;
}
