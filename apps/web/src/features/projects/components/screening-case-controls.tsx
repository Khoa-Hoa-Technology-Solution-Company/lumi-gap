import { ScreeningStatusBadge } from "./screening-status-badge";
import { screeningStatusTone } from "../screening-status";
import { useState } from "react";
import type { ScreeningDisputeCase } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { useUnsavedWorkspace } from "./workspace-common";
import { ScreeningError, useScreeningCommand } from "./screening-common";

import { caseStatusLabels, adjudicatorRoleLabels } from "./screening-case-labels";
export { caseStatusLabels, adjudicatorRoleLabels } from "./screening-case-labels";

export function ScreeningCaseControls({ projectId, roundId, data, onSaved }: { projectId: string; roundId: string; data: ScreeningDisputeCase; onSaved: () => void }) {
  const actorId = useAuthStore(s => s.user?.id), command = useScreeningCommand(projectId);
  const [text, setText] = useState(""), [packetVersion, setPacketVersion] = useState<number | null>(null), [ownRevision, setOwnRevision] = useState<number | null>(null);
  const [reason, setReason] = useState(""), [candidate, setCandidate] = useState(""), [baseVersion, setBaseVersion] = useState<number | null>(null);
  const own = data.statements.find(s => s.reviewerId === (data.myReviewerId ?? actorId));
  const orderedStatements = data.statements.map((statement, index) => ({ statement, index }))
    .sort((a, b) => Number(b.statement.reviewerId === own?.reviewerId) - Number(a.statement.reviewerId === own?.reviewerId));
  const [editing, setEditing] = useState(!own?.completed);
  const staleStatement = packetVersion !== null && (packetVersion !== data.packetVersion || ownRevision !== own?.revision);
  const staleAction = baseVersion !== null && baseVersion !== data.version;
  useUnsavedWorkspace(Boolean(text || reason || candidate) || command.isPending);
  const run = async (input: Record<string, unknown>) => {
    const payload = { caseId: data.id, ...input };
    const success = await command.run(payload, clientKey => screeningApi.caseAction(projectId, roundId, { ...payload, clientKey }));
    if (success) onSaved();
    return success;
  };
  const editStatement = () => { if (packetVersion === null) { setPacketVersion(data.packetVersion); setOwnRevision(own?.revision ?? 0); } };
  const editReason = (value: string) => { setReason(value); if (baseVersion === null) setBaseVersion(data.version); };
  const saveStatement = async (useExisting = false) => {
    if (!own || !data.canStatement || command.isPending || staleStatement || !useExisting && text.trim().length < 10) return;
    if (await run({ action: "STATEMENT", expectedPacketVersion: packetVersion ?? data.packetVersion, expectedStatementRevision: ownRevision ?? own.revision, useExisting, text: useExisting ? "" : text.trim() })) {
      setText(""); setEditing(false); setPacketVersion(null); setOwnRevision(null);
    }
  };
  return <section className="space-y-6" aria-label="Tiến trình hồ sơ phân xử">
    <div className="flex flex-wrap items-center justify-between gap-3 border-y py-4">
      <div>
        <h2 className="text-xs font-medium text-muted-foreground">Người phân xử</h2>
        <p className="mt-1 font-semibold">{data.invitation?.name ?? "Chờ phân công"}</p>
        {data.invitation && <p className="text-xs text-muted-foreground">{adjudicatorRoleLabels[data.invitation.role] ?? "Người phân xử độc lập"}</p>}

      </div>
      <ScreeningStatusBadge tone={screeningStatusTone({ caseStatus: data.status })}>{caseStatusLabels[data.status] ?? data.status}</ScreeningStatusBadge>
    </div>
    {data.adjudicationBlockedReason && <p role="status" className="text-sm text-muted-foreground">{data.adjudicationBlockedReason}</p>}
    {data.canStart && <Button variant="outline" disabled={command.isPending} onClick={() => void run({ action: "START", expectedCaseVersion: data.version })}>Bắt đầu xem xét</Button>}
    {data.lockedAt && <p className="text-xs text-muted-foreground">Hồ sơ đã khóa lúc {new Date(data.lockedAt).toLocaleString("vi-VN")}. Ý kiến hai bên và nguồn gốc được giữ trong lịch sử.</p>}
    {!data.canStatement && text && <div role="status" className="space-y-2 text-sm"><p>{data.adjudicationBlockedReason || "Hồ sơ đã khóa."} Nội dung chưa gửi của bạn được giữ để tham khảo.</p><p className="whitespace-pre-wrap rounded-md border p-3">{text}</p></div>}
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Ý kiến hai bên</h2>
        {data.canStatement && <p className="text-xs text-muted-foreground">Hạn gửi: {new Date(data.deadline).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</p>}
      </div>
      <div className="space-y-4" aria-label="Ý kiến từng bên">{orderedStatements.map(({ statement: s, index: i }) => {
        const mine = s.reviewerId === own?.reviewerId;
        if (!mine && !s.completed) return <article key={s.reviewerId} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-3 text-sm [overflow-wrap:anywhere]">
          <h3 className="font-medium">{i === 0 ? "A" : "B"} · {s.name}</h3>
          <p className="text-muted-foreground">{s.hidden ? "Chờ gửi ý kiến" : "Chưa bổ sung ý kiến"}</p>
        </article>;
        return <article key={s.reviewerId} className="min-w-0 space-y-3 text-sm [overflow-wrap:anywhere]">
          <h3 className="font-semibold">{i === 0 ? "A" : "B"} · {s.name}{mine && <span className="font-normal text-muted-foreground"> (Bạn)</span>}</h3>
          {mine && data.canStatement && editing ? <form data-screening-section="statement" className="space-y-3" onSubmit={e => { e.preventDefault(); void saveStatement(); }}>
            <label className="block space-y-2"><span className="sr-only">Ý kiến của tôi</span><textarea className="min-h-32 w-full resize-y rounded-md border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Nêu quan điểm của bạn và căn cứ để người phân xử xem xét…" value={text} maxLength={2000} minLength={10} required disabled={command.isPending || staleStatement} onChange={e => { editStatement(); setText(e.target.value); }} /></label>
            {staleStatement && <p role="alert" className="text-xs">Phiếu hoặc ý kiến của bạn đã đổi. Bản nháp được giữ. <button type="button" className="underline" onClick={() => { setPacketVersion(data.packetVersion); setOwnRevision(own!.revision); }}>Tôi đã đọc lại hồ sơ hiện tại</button></p>}
            <Button size="sm" disabled={command.isPending || staleStatement || text.trim().length < 10}>{command.isPending ? "Đang lưu…" : "Gửi ý kiến"}</Button>
            <Button type="button" size="sm" variant="outline" disabled={command.isPending || staleStatement} onClick={() => void saveStatement(true)}>Sử dụng ý kiến đã ghi</Button>
          </form> : <>
            <p className="whitespace-pre-wrap break-words leading-6">{s.hidden ? "Ý kiến được giữ riêng đến khi hồ sơ khóa." : s.completed ? s.useExisting ? "Sử dụng ý kiến đã ghi trong phiếu" : (s.text || "Đã gửi ý kiến.") : "Chưa bổ sung ý kiến"}</p>
            {mine && data.canStatement && <Button size="sm" variant="outline" onClick={() => { setText(s.text ?? ""); setEditing(true); editStatement(); }}>Chỉnh sửa ý kiến</Button>}
          </>}
          {s.completed && <p className="text-xs text-muted-foreground">Đã gửi{s.submittedAt && ` · ${new Date(s.submittedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}`}</p>}
        </article>;
      })}</div>
    </div>
    {data.canCoordinate && data.status === "WAITING_ASSIGNMENT" && <form data-screening-section="coordination" className="screening-form" onSubmit={async e => { e.preventDefault(); if (staleAction) return; if (await run({ action: "SELECT", candidateId: candidate, reason, expectedCaseVersion: baseVersion ?? data.version })) { setCandidate(""); setReason(""); setBaseVersion(null); } }}><h3 className="font-semibold">Điều phối độc lập</h3>{data.candidates.length ? <><label>Ứng viên cùng mức ưu tiên<select value={candidate} required onChange={e => { setCandidate(e.target.value); if (baseVersion === null) setBaseVersion(data.version); }}><option value="">Chọn người phân xử</option>{data.candidates.map(p => <option key={p.id} value={p.id}>{p.name} · {adjudicatorRoleLabels[p.role]}</option>)}</select></label><label>Lý do lựa chọn<textarea value={reason} onChange={e => editReason(e.target.value)} required minLength={10} maxLength={2000} /></label><Button disabled={command.isPending || staleAction || !candidate || reason.trim().length < 10}>Phân công trực tiếp</Button></> : <><p className="text-sm">Chưa có ứng viên đủ điều kiện. Giữ hồ sơ chờ phân công và kiểm tra tư cách hoặc chính sách cho vòng này.</p><Button type="button" variant="outline" disabled={command.isPending} onClick={() => void run({ action: "RETRY", expectedCaseVersion: data.version })}>Kiểm tra ứng viên hiện tại</Button></>}</form>}
    {data.canReassign && <details><summary className="cursor-pointer text-sm">Phân công lại người phân xử</summary><form className="screening-form mt-3" onSubmit={async e => { e.preventDefault(); if (staleAction) return; if (await run({ action: "REASSIGN", reason, expectedCaseVersion: baseVersion ?? data.version })) { setReason(""); setBaseVersion(null); } }}><label>Lý do phân công lại<textarea required minLength={10} maxLength={2000} value={reason} onChange={e => editReason(e.target.value)} /></label><p className="text-xs text-muted-foreground">Hệ thống tìm người tiếp theo theo chính sách Project và giữ lịch sử phân công.</p><Button variant="outline" disabled={command.isPending || staleAction || reason.trim().length < 10}>Phân công lại theo chính sách</Button></form></details>}
    {data.canCoordinate && data.status === "COI_REVIEW" && <section data-screening-section="coordination" className="space-y-4"><h3 className="font-semibold">Xem xét xung đột lợi ích</h3>{data.conflicts.filter(report => !report.resolvedAt).map(report => <ConflictReview key={report.id} projectId={projectId} roundId={roundId} data={data} report={report} onSaved={onSaved} />)}</section>}
    {staleAction && <p role="alert" className="text-sm">Hồ sơ đã đổi, lý do được giữ. <button type="button" className="underline" onClick={() => setBaseVersion(data.version)}>Tôi đã kiểm tra hồ sơ hiện tại</button></p>}
    <ScreeningError error={command.error} />
  </section>;
}

function ConflictReview({ projectId, roundId, data, report, onSaved }: { projectId: string; roundId: string; data: ScreeningDisputeCase; report: ScreeningDisputeCase["conflicts"][number]; onSaved: () => void }) {
  const command = useScreeningCommand(projectId);
  const [reason, setReason] = useState(""), [version, setVersion] = useState<number | null>(null);
  const stale = version !== null && version !== data.version;
  useUnsavedWorkspace(Boolean(reason) || command.isPending);
  const save = async (upheld: boolean) => {
    if (stale || command.isPending || reason.trim().length < 10) return;
    const payload = { caseId: data.id, action: "REVIEW_CONFLICT", reportId: report.id, upheld, reason: reason.trim(), expectedCaseVersion: version ?? data.version };
    if (await command.run(payload, clientKey => screeningApi.caseAction(projectId, roundId, { ...payload, clientKey }))) { setReason(""); setVersion(null); onSaved(); }
  };
  return <div className="space-y-3 text-sm">
    <p className="max-w-prose whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{report.reason}</p>
    <label className="block space-y-2"><span>Lý do xử lý báo cáo (ít nhất 10 ký tự)</span><textarea className="w-full rounded-md border bg-background p-3" value={reason} maxLength={2000} onChange={e => { setReason(e.target.value); if (version === null) setVersion(data.version); }} /></label>
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={command.isPending || stale || reason.trim().length < 10} onClick={() => void save(false)}>Giữ phân công</Button><Button size="sm" disabled={command.isPending || stale || reason.trim().length < 10} onClick={() => void save(true)}>Đổi người phân xử</Button></div>
    {stale && <p role="alert">Hồ sơ đã đổi. <button type="button" className="underline" onClick={() => setVersion(data.version)}>Tôi đã đọc lại hồ sơ</button></p>}
    <ScreeningError error={command.error} />
  </div>;
}
