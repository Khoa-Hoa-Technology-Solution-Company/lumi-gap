import { useState } from "react";
import type { ScreeningRoundView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { useUnsavedWorkspace } from "./workspace-common";
import { ScreeningError, useScreeningCommand } from "./screening-common";

export function ScreeningAgreementPanel({ projectId, round, readOnly }: { projectId: string; round: ScreeningRoundView; readOnly: boolean }) {
  const [decision, setDecision] = useState<"INCLUDED" | "EXCLUDED" | "NEEDS_MORE_INFO">("INCLUDED"), [reason, setReason] = useState("");
  const [version, setVersion] = useState<number | null>(null), [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState(""), [authorConsent, setAuthorConsent] = useState(false);
  const [declineBase, setDeclineBase] = useState<{ id: string; version: number } | null>(null);
  const modern = (round.settings?.workflowVersion ?? 0) >= 5;
  const [showProposal, setShowProposal] = useState(false);
  const command = useScreeningCommand(projectId), agreement = round.agreement;
  useUnsavedWorkspace(Boolean(reason || declineReason) || command.isPending);
  const stale = version !== null && version !== round.version;
  if (round.hiddenReviews || (!round.canProposeAgreement && !agreement && !reason && !declineReason)) return null;
  const label = (value: string) => value === "NEEDS_MORE_INFO" ? "Cần đọc thêm / bổ sung thông tin" : value === "INCLUDED" ? (round.phase === "TITLE_ABSTRACT" ? "Giữ bài qua vòng sàng lọc" : "Chọn bài cho phân tích") : "Loại bài theo tiêu chí";
  return <section aria-label="Quyết định chung sau thảo luận" className="space-y-3 border-y py-4">
    <h4 className="font-semibold">Quyết định chung sau thảo luận</h4>
    <p className="text-sm leading-6 text-muted-foreground">Mỗi reviewer tự xác nhận cùng một kết luận và lý do. Phiếu cá nhân được giữ nguyên, kể cả khi hai người vẫn có ý kiến khác nhau.</p>
    {agreement && <div className="space-y-3 text-sm">
      <p className="font-medium">{label(agreement.decision)}</p><p className="whitespace-pre-wrap break-words">{agreement.reason}</p>
      <ul className="space-y-1" aria-label="Xác nhận của reviewer">{agreement.requiredReviewerIds.map(id => <li key={id}>{round.assignments.find(a => a.reviewerId === id)?.name ?? "Reviewer"}: {agreement.confirmedByIds.includes(id) ? "Đã xác nhận" : "Chờ xác nhận"}</li>)}</ul>
      {!readOnly && agreement.canDecline && <details><summary>Chưa đồng ý · Tiếp tục thảo luận</summary><form className="screening-form mt-3" onSubmit={async e => { e.preventDefault(); if (declineReason.trim().length < 10 || declineBase?.id !== agreement.id || declineBase?.version !== round.version) return; const payload = { proposalId: declineBase.id, reason: declineReason, expectedVersion: declineBase.version, confirmed: true }; if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.declineAgreement(projectId, round.id, { ...payload, clientKey }))) { setDeclineReason(""); setDeclineBase(null); } }}><label>Lý do cần thảo luận thêm<textarea value={declineReason} minLength={10} maxLength={2000} required onChange={e => { setDeclineReason(e.target.value); if (!declineBase) setDeclineBase({ id: agreement.id, version: round.version }); }} /></label><Button variant="outline" disabled={command.isPending || declineReason.trim().length < 10 || declineBase?.id !== agreement.id || declineBase?.version !== round.version}>Tiếp tục thảo luận, chưa chốt</Button>{declineBase && (declineBase.id !== agreement.id || declineBase.version !== round.version) && <div role="status"><p>Đề xuất đã thay đổi. Lý do của bạn vẫn được giữ.</p><Button type="button" variant="outline" onClick={() => setDeclineBase({ id: agreement.id, version: round.version })}>Tôi đã đọc lại đề xuất</Button></div>}</form></details>}
      {!readOnly && agreement.canConfirm && <form className="space-y-3" onSubmit={async e => {
        e.preventDefault(); if (confirmedFor !== `${agreement.id}:${round.version}` || !agreement.canConfirm) return;
        const payload = { proposalId: agreement.id, expectedVersion: round.version, confirmed: true };
        if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.confirmAgreement(projectId, round.id, { ...payload, clientKey }))) setConfirmedFor(null);
      }}><label className="screening-check"><input type="checkbox" checked={confirmedFor === `${agreement.id}:${round.version}`} disabled={command.isPending} onChange={e => setConfirmedFor(e.target.checked ? `${agreement.id}:${round.version}` : null)} />Tôi đồng ý với quyết định chung và lý do ở trên.</label><Button disabled={command.isPending || confirmedFor !== `${agreement.id}:${round.version}`}>Xác nhận quyết định chung</Button></form>}
    </div>}
    {(round.canProposeAgreement || reason) && <details open={showProposal} onToggle={e => setShowProposal(e.currentTarget.open)}><summary>{agreement ? "Đề xuất kết luận khác" : "Đề xuất quyết định chung"}</summary><form className="screening-form mt-3" onSubmit={async e => {
      e.preventDefault(); if (readOnly || !round.canProposeAgreement || stale || reason.trim().length < 10 || modern && !authorConsent) return;
      const payload = { decision, reason, expectedVersion: version ?? round.version, confirmed: true };
      if (await command.run({ roundId: round.id, ...payload }, clientKey => screeningApi.proposeAgreement(projectId, round.id, { ...payload, clientKey }))) { setReason(""); setVersion(null); setConfirmedFor(null); setShowProposal(false); setAuthorConsent(false); }
    }}><fieldset disabled={command.isPending || readOnly || !round.canProposeAgreement} className="space-y-3"><label>Kết luận đề xuất<select value={decision} onChange={e => { setDecision(e.target.value as typeof decision); setAuthorConsent(false); setVersion(round.version); }}><option value="INCLUDED">{label("INCLUDED")}</option><option value="EXCLUDED">{label("EXCLUDED")}</option><option value="NEEDS_MORE_INFO">{label("NEEDS_MORE_INFO")}</option></select></label><label>Lý do chung (ít nhất 10 ký tự)<textarea value={reason} minLength={10} maxLength={2000} required rows={3} onChange={e => { setReason(e.target.value); setAuthorConsent(false); if (version === null) setVersion(round.version); }} /></label><p className="text-sm text-muted-foreground">{modern ? "Gửi đề xuất ghi nhận sự đồng ý của bạn. Các reviewer còn lại cần xác nhận; chưa tự ghi kết quả cuối." : "Gửi đề xuất chưa ghi kết quả cuối."} Đề xuất mới sẽ cần xác nhận lại từ đầu.</p>{modern && <label className="screening-check"><input type="checkbox" checked={authorConsent} onChange={e => { setAuthorConsent(e.target.checked); if (version === null) setVersion(round.version); }} />Tôi đồng ý với kết luận và lý do đề xuất này.</label>}</fieldset>
      {stale && <div role="status"><p>Vòng đã thay đổi. Bản nháp được giữ; hãy đọc lại trước khi gửi.</p><Button type="button" variant="outline" onClick={() => { setVersion(round.version); setConfirmedFor(null); setAuthorConsent(false); }}>Tôi đã kiểm tra vòng hiện tại</Button></div>}
      <Button disabled={command.isPending || readOnly || !round.canProposeAgreement || stale || reason.trim().length < 10 || modern && !authorConsent}>Gửi đề xuất cho reviewer xác nhận</Button>
    </form></details>}
    {declineReason && !agreement && <div role="status"><p>Đề xuất không còn hiệu lực. Lý do đang soạn được giữ để bạn sao chép:</p><textarea aria-label="Lý do đang soạn" value={declineReason} onChange={e => setDeclineReason(e.target.value)} /></div>}
    <ScreeningError error={command.error} />
  </section>;
}
