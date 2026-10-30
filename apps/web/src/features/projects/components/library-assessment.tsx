import { useState } from "react";
import type { ScreeningChoice, ScreeningRoundView, ScreeningSettings } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { choiceLabels, ScreeningError, useScreeningCommand } from "./screening-common";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";
import { AssessmentContextFields, initialAssessmentContext } from "./assessment-context";

export function LibraryAssessment({ projectId, paperId, round, settings, readOnly }: { projectId: string; paperId: string; round: ScreeningRoundView | null; settings: ScreeningSettings; readOnly: boolean }) {
  const own = round?.myReview;
  const ownAssignment = round?.assignments?.find(assignment => assignment.id === round.myAssignmentId);
  const currentRevision = ownAssignment?.revision ?? own?.revision ?? 0;
  const [decision, setDecision] = useState<ScreeningChoice | "">(own?.decision ?? "");
  const [reason, setReason] = useState(own?.exclusionReason ?? ""), [comment, setComment] = useState(own?.comment ?? "");
  const [base, setBase] = useState({ roundId: round?.id ?? null, revision: currentRevision, settingsVersion: settings.version });
  const [dirty, setDirty] = useState(false), [saved, setSaved] = useState(false);
  const [context, setContext] = useState(() => initialAssessmentContext(own));
  const command = useScreeningCommand(projectId);
  useUnsavedWorkspace(dirty || command.isPending);
  const locked = readOnly || Boolean(round?.finalDecision) || (round ? !round.canReview : settings.reviewMode !== "COLLABORATIVE");
  const stale = base.roundId !== (round?.id ?? null) || base.revision < currentRevision || (!round && base.settingsVersion !== settings.version);
  const change = () => { setDirty(true); setSaved(false); };
  return <form className="screening-form library-assessment" onSubmit={async e => {
    e.preventDefault(); if (!decision || locked || stale) return;
    const payload = { roundId: base.roundId, expectedRevision: base.revision, settingsVersion: base.settingsVersion, decision, exclusionReason: reason, comment, ...context };
    let nextRoundId = base.roundId;
    let nextRevision = base.revision;
    if (await command.run({ paperId, ...payload }, async clientKey => {
      const result = await screeningApi.assess(projectId, paperId, { ...payload, clientKey }) as { roundId: string; revision: number };
      nextRoundId = result.roundId; nextRevision = result.revision; return result;
    })) { setBase({ ...base, roundId: nextRoundId, revision: nextRevision }); setDirty(false); setSaved(true); }
  }}>
    <fieldset disabled={command.isPending || locked}><legend>Đánh giá của tôi</legend>
      <div className="assessment-choices">{Object.entries(choiceLabels).map(([value, label]) => <label className="assessment-choice" data-selected={decision === value} key={value}><input type="radio" name={`assessment-${paperId}`} checked={decision === value} onChange={() => { setDecision(value as ScreeningChoice); change(); }} required />{label}</label>)}</div>
      {decision === "EXCLUDE" && <label>Lý do không phù hợp (tùy chọn)<textarea value={reason} onChange={e => { setReason(e.target.value); change(); }} maxLength={500} rows={2} /></label>}
      <details open={Boolean(comment) || decision === "UNSURE" || undefined}><summary>Thêm nhận xét (tùy chọn)</summary><label>Nhận xét theo câu hỏi nghiên cứu<textarea value={comment} onChange={e => { setComment(e.target.value); change(); }} maxLength={2000} rows={2} placeholder={decision === "UNSURE" ? "Bạn cần thêm thông tin gì để đánh giá?" : "Ghi chú ngắn (tùy chọn): phương pháp, dữ liệu, giá trị tham khảo…"} /></label></details>
      <AssessmentContextFields value={context} settings={settings} onChange={value => { setContext(value); change(); }} />
    </fieldset>
    <small>Ý kiến cá nhân không tự đổi quyết định chọn bài. Mỗi lần sửa được lưu thành một phiên bản.</small>
    {locked && <p role="status">{round?.finalDecision ? "Đã chốt chọn bài. Người phụ trách có thể mở lại để xem xét thêm." : "Hiện chỉ có quyền xem; bản nháp vẫn được giữ."}</p>}
    <ScreeningError error={command.error} />
    {stale && <><p role="status">Ý kiến hoặc vòng đánh giá đã thay đổi. Hãy xem lại trước khi gửi.</p><Button type="button" variant="outline" onClick={async () => { if (await canLeaveWorkspace()) { setDecision(own?.decision ?? ""); setReason(own?.exclusionReason ?? ""); setComment(own?.comment ?? ""); setContext(initialAssessmentContext(own)); setBase({ roundId: round?.id ?? null, revision: currentRevision, settingsVersion: settings.version }); setDirty(false); } }}>Tải ý kiến hiện tại</Button></>}
    <div className="assessment-save"><Button disabled={locked || stale || command.isPending || !decision || !dirty || (context.scope === "FULL_TEXT" && context.fullTextReference.trim().length < 10)}>{command.isPending ? "Đang lưu…" : own ? "Cập nhật ý kiến" : "Lưu ý kiến"}</Button><span role="status">{saved ? "Đã lưu ý kiến của bạn." : dirty ? "Có thay đổi chưa lưu" : own ? `Đã lưu · phiên bản ${own.revision}` : "Chưa có đánh giá"}</span></div>
  </form>;
}
