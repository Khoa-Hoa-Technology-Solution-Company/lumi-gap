import { useState } from "react";
import type { ScreeningBoard, ScreeningSettings, ScreeningPhase } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { screeningApi } from "../api/screening.api";
import { useUnsavedWorkspace, canLeaveWorkspace } from "./workspace-common";
import { ScreeningError, useScreeningCommand } from "./screening-common";

export function ScreeningSettingsForm({ projectId, settings }: { projectId: string; settings: ScreeningSettings }) {
  const [required, setRequired] = useState(settings.requiredReviewers), [policy, setPolicy] = useState(settings.consensusPolicy), [assisted, setAssisted] = useState(settings.aiAssisted);
  const [reviewMode, setReviewMode] = useState(settings.reviewMode), [blindReview, setBlindReview] = useState(settings.blindReview), [resolutionPolicy, setResolutionPolicy] = useState(settings.resolutionPolicy);
  const [stages, setStages] = useState<ScreeningPhase[]>(settings.stages ?? []);
  const [questions, setQuestions] = useState(settings.researchQuestions.join("\n")), [include, setInclude] = useState(settings.inclusionCriteria.join("\n")), [exclude, setExclude] = useState(settings.exclusionCriteria.join("\n"));
  const command = useScreeningCommand(projectId), [saved, setSaved] = useState(false), [baseVersion, setBaseVersion] = useState(settings.version);
  const lines = (text: string) => text.split("\n").map(s => s.trim()).filter(Boolean);
  const payload = { reviewMode, blindReview, resolutionPolicy, expectedVersion: baseVersion, requiredReviewers: required, consensusPolicy: policy, aiAssisted: assisted, researchQuestions: lines(questions), inclusionCriteria: lines(include), exclusionCriteria: lines(exclude), stages };
  const dirty = JSON.stringify(stages) !== JSON.stringify(settings.stages ?? []) || reviewMode !== settings.reviewMode || blindReview !== settings.blindReview || resolutionPolicy !== settings.resolutionPolicy || required !== settings.requiredReviewers || policy !== settings.consensusPolicy || assisted !== settings.aiAssisted || questions !== settings.researchQuestions.join("\n") || include !== settings.inclusionCriteria.join("\n") || exclude !== settings.exclusionCriteria.join("\n");
  useUnsavedWorkspace(dirty || command.isPending);
  return <form className="screening-form" onSubmit={async e => { e.preventDefault(); setSaved(false); let version = baseVersion; if (await command.run(payload, async clientKey => { const result = await screeningApi.configure(projectId, { ...payload, clientKey }) as { version: number }; version = result.version; return result; })) { setSaved(true); setBaseVersion(version); } }}>
    <p>Cấu hình v{settings.version}. Thay đổi chỉ áp dụng cho vòng bắt đầu sau khi lưu. Mỗi tiêu chí hoặc câu hỏi nằm trên một dòng.</p>
    <fieldset disabled={command.isPending}><legend className="sr-only">Quy tắc cho vòng mới</legend>
    <label>Phương thức đánh giá<select value={reviewMode} onChange={e => { const mode = e.target.value as typeof reviewMode; setReviewMode(mode); setRequired(mode !== "INDEPENDENT" ? 1 : 2); setBlindReview(mode === "INDEPENDENT"); if (mode === "COLLABORATIVE") setResolutionPolicy("ADJUDICATION"); }}><option value="COLLABORATIVE">Cộng tác, thành viên tự đánh giá</option><option value="SIMPLE">Đơn giản, một reviewer</option><option value="INDEPENDENT">Độc lập, từ hai reviewer</option></select></label>
    <div className="screening-form-grid"><label>Số người đánh giá bắt buộc<input type="number" min={reviewMode !== "INDEPENDENT" ? 1 : 2} max={reviewMode !== "INDEPENDENT" ? 1 : 10} value={required} onChange={e => setRequired(Number(e.target.value))} required /></label>
      <label>Khi reviewer bất đồng<select disabled={reviewMode === "COLLABORATIVE"} value={resolutionPolicy} onChange={e => setResolutionPolicy(e.target.value as typeof resolutionPolicy)}><option value="ADJUDICATION">Người được giao chốt phân xử, có lý do</option><option value="CONSENSUS">Thảo luận và cập nhật phiếu đến khi nhất trí</option></select></label></div>
    <label className="screening-check"><input type="checkbox" disabled={reviewMode === "COLLABORATIVE"} checked={blindReview} onChange={e => setBlindReview(e.target.checked)} />Ẩn phiếu người khác đến khi tất cả reviewer hoàn thành</label>
    <p>Tất cả người được phân công phải gửi phiếu. Phiếu chưa đủ thông tin cần được bổ sung trước khi chốt. Chủ dự án giao người chốt trong từng vòng; kết quả luôn cần xác nhận rõ ràng.</p>
    {reviewMode !== "COLLABORATIVE" && <label>Các giai đoạn theo quy trình<select value={stages.join(",")} onChange={e => setStages(e.target.value ? e.target.value.split(",") as ScreeningPhase[] : [])}><option value="">Giữ cách chọn giai đoạn cho từng vòng hiện có</option><option value="TITLE_ABSTRACT">Tiêu đề / Tóm tắt</option><option value="FULL_TEXT">Toàn văn</option><option value="TITLE_ABSTRACT,FULL_TEXT">Tiêu đề / Tóm tắt → Toàn văn</option></select><small>Nếu quy trình yêu cầu ít nhất hai người độc lập đọc toàn văn, chọn chế độ Độc lập và giai đoạn Toàn văn.</small></label>}
    <details><summary>Câu hỏi và tiêu chí của quy trình</summary>
    {settings.questionOptions?.length ? <ul>{settings.questionOptions.map((q, i) => <li key={q.id}>RQ{i + 1}: {q.text}</li>)}</ul> : <p>Liên kết RQ lấy từ kế hoạch nghiên cứu. Chưa có RQ vẫn có thể đánh giá bài.</p>}
    <label>Ghi chú câu hỏi cho quy trình (tùy chọn)<textarea value={questions} onChange={e => setQuestions(e.target.value)} rows={2} maxLength={30000} /></label>
    <label>Tiêu chí đưa vào<textarea value={include} onChange={e => setInclude(e.target.value)} rows={3} maxLength={15000} /></label>
    <label>Tiêu chí loại ra<textarea value={exclude} onChange={e => setExclude(e.target.value)} rows={3} maxLength={15000} /></label></details>
    <label className="screening-check"><input type="checkbox" checked={assisted} onChange={e => setAssisted(e.target.checked)} />Cho phép xem đề xuất AI trước khi gửi phiếu (có thể ảnh hưởng tính độc lập)</label></fieldset>
    {settings.version !== baseVersion && <><p role="status">Cấu hình đã thay đổi. Bản nháp của bạn vẫn được giữ; tải cấu hình hiện tại trước khi lưu.</p><Button type="button" variant="outline" disabled={command.isPending} onClick={async () => { if (!(await canLeaveWorkspace())) return; setStages(settings.stages ?? []); setReviewMode(settings.reviewMode); setBlindReview(settings.blindReview); setResolutionPolicy(settings.resolutionPolicy); setRequired(settings.requiredReviewers); setPolicy(settings.consensusPolicy); setAssisted(settings.aiAssisted); setQuestions(settings.researchQuestions.join("\n")); setInclude(settings.inclusionCriteria.join("\n")); setExclude(settings.exclusionCriteria.join("\n")); setBaseVersion(settings.version); }}>Tải cấu hình hiện tại</Button></>}
    <ScreeningError error={command.error} /><Button disabled={command.isPending || settings.version !== baseVersion || (!dirty && settings.version > 0)}>Lưu cấu hình cho vòng mới</Button>{saved && <p role="status">Đã lưu cấu hình.</p>}
  </form>;
}

export function ScreeningAssignmentDialog({ projectId, board, roundIds, onClose }: { projectId: string; board: ScreeningBoard; roundIds: string[]; onClose: () => void }) {
  const [mode, setMode] = useState<"AUTO" | "MANUAL">("AUTO"), [people, setPeople] = useState<string[]>([]), [due, setDue] = useState("");
  const command = useScreeningCommand(projectId); useUnsavedWorkspace(people.length > 0 || Boolean(due) || command.isPending);
  return <Dialog open onOpenChange={async open => { if (!open && !command.isPending && await canLeaveWorkspace()) onClose(); }}><DialogContent className="screening-workspace" closeLabel="Đóng" data-no-i18n><DialogTitle>Phân công {roundIds.length} bài báo</DialogTitle><DialogDescription>Chỉ phân công thành viên đang hoạt động. Phiếu đã gửi được giữ nguyên.</DialogDescription>
    <form className="screening-form" onSubmit={async e => { e.preventDefault(); const payload = { roundIds, mode, reviewerIds: people, dueAt: due ? new Date(due).toISOString() : null }; if (await command.run(payload, clientKey => screeningApi.assign(projectId, { ...payload, clientKey }))) { setPeople([]); setDue(""); onClose(); } }}>
      <label>Cách phân công<select disabled={command.isPending} value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="AUTO">Tự động cân bằng số phiếu đang chờ</option><option value="MANUAL">Chọn người đánh giá</option></select></label>
      {mode === "MANUAL" && <fieldset disabled={command.isPending}><legend>Người đánh giá</legend>{board.people.map(p => <label className="screening-check" key={p.id}><input type="checkbox" checked={people.includes(p.id)} onChange={e => setPeople(old => e.target.checked ? [...old, p.id] : old.filter(id => id !== p.id))} />{p.name}</label>)}</fieldset>}
      <label>Hạn gửi phiếu (không bắt buộc)<input disabled={command.isPending} type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></label>
      <p>Tự động giữ phân công còn hợp lệ, rồi chọn người có ít phiếu chờ nhất. Số người cần theo cấu hình đã lưu của từng vòng.</p>
      <ScreeningError error={command.error} /><Button disabled={command.isPending || (mode === "MANUAL" && people.length < 1)}>{command.isPending ? "Đang phân công…" : "Xác nhận phân công"}</Button>
    </form></DialogContent></Dialog>;
}
