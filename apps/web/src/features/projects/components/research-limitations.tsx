import { useState } from "react";
import { Link } from "react-router-dom";
import { LIMITATION_CATEGORIES, type LimitationCategory, type ProjectLimitation, type ProjectLimitationList } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { FeasibilityPanel, VerdictBadge } from "./feasibility-panel";
import { ResearchGapEvaluation } from "./research-gap-evaluation";
import { useUnsavedWorkspace, WorkspaceError, WorkspaceLoading } from "./workspace-common";
import "../research-evidence.css";
import "../research-literature.css";

export const categoryLabels: Record<LimitationCategory, { label: string; hint: string }> = {
  DATA: { label: "Dữ liệu", hint: "Mẫu nhỏ, một bộ dữ liệu, thiếu nhóm đối tượng" },
  METHOD: { label: "Phương pháp", hint: "Thiết kế, mô hình hoặc kỹ thuật chưa được thử" },
  CONTEXT: { label: "Bối cảnh", hint: "Một quốc gia, một thiết bị, một môi trường" },
  OUTCOME: { label: "Kết quả đo", hint: "Chỉ số đánh giá còn thiếu hoặc chưa phù hợp" },
  TEMPORAL: { label: "Thời gian", hint: "Dữ liệu cũ, chưa theo dõi dài hạn" },
  OTHER: { label: "Khác", hint: "" },
};
const statusLabels = { OPEN: "Đang mở", PROMOTED: "Đã thành gap ứng viên", DISMISSED: "Đã loại" } as const;

/**
 * Step 4: limitation identification. Limitations stated in reviewed extractions are grouped into shared limitations;
 * one reported by several papers is a strong signal of a gap. A group can be assessed for feasibility and then turned
 * into a gap candidate whose supporting evidence is exactly these extractions.
 */
export function ResearchLimitations({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const view = useResearchResource(projectId, ["limitations"], () => researchApi.limitations(projectId));
  const [selected, setSelected] = useState<string[]>([]);
  if (view.isLoading) return <WorkspaceLoading />;
  if (view.isError || !view.data) return <WorkspaceError error={view.error} retry={() => void view.refetch()} />;
  const data = view.data, canEdit = !readOnly && data.canEdit;
  const toggle = (id: string) => setSelected((value) => value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  return <section className="research-limitations" aria-label="Xác định hạn chế" data-no-i18n>
    <header className="research-heading"><div><h2>Xác định hạn chế</h2><p>Gom các hạn chế mà chính tác giả các bài đã nêu. Hạn chế được nhiều bài cùng nêu là dấu hiệu mạnh của một khoảng trống nghiên cứu.</p></div></header>
    <div className="limitations-layout">
      <section className="limitations-pool" aria-label="Hạn chế chưa được nhóm">
        <h3>Chưa được nhóm <span className="research-help">({data.ungrouped.length})</span></h3>
        <p className="research-help">Chỉ gồm trích xuất đã kiểm chứng có ghi hạn chế. Chọn các trích xuất nói về cùng một hạn chế rồi nhóm lại.</p>
        {!data.ungrouped.length ? <p className="research-help">Không còn hạn chế nào chưa nhóm. Thêm trường "Hạn chế" trong <Link className="research-source-link" to={`/projects/${projectId}?tab=gaps&research=evidence`}>trích xuất</Link> và kiểm chứng để chúng xuất hiện ở đây.</p>
          : <ul className="limitations-sources">{data.ungrouped.map((row) => <li key={row.evidenceId}><label className="research-check">{canEdit && <input type="checkbox" checked={selected.includes(row.evidenceId)} onChange={() => toggle(row.evidenceId)} />}<span><strong>{row.limitations}</strong><small className="research-help">{row.paperTitle}{row.publicationYear ? ` (${row.publicationYear})` : ""}</small></span></label></li>)}</ul>}
        {canEdit && <CreateLimitationForm projectId={projectId} evidenceIds={selected} onDone={() => setSelected([])} />}
      </section>
      <section className="limitations-groups" aria-label="Hạn chế đã xác định">
        <h3>Hạn chế đã xác định <span className="research-help">({data.items.length})</span></h3>
        {!data.items.length && <div className="research-empty"><h4>Chưa có hạn chế nào</h4><p>Chọn ít nhất một trích xuất ở cột bên trái để bắt đầu.</p></div>}
        {data.items.map((item) => <LimitationCard key={item.id} projectId={projectId} item={item} data={data} canEdit={canEdit} readOnly={readOnly} />)}
      </section>
    </div>
  </section>;
}

function CategorySelect({ value, onChange }: { value: LimitationCategory; onChange: (value: LimitationCategory) => void }) {
  return <label>Loại hạn chế<select value={value} onChange={(event) => onChange(event.target.value as LimitationCategory)}>{LIMITATION_CATEGORIES.map((key) => <option key={key} value={key}>{categoryLabels[key].label}{categoryLabels[key].hint ? ` · ${categoryLabels[key].hint}` : ""}</option>)}</select></label>;
}

function CreateLimitationForm({ projectId, evidenceIds, onDone }: { projectId: string; evidenceIds: string[]; onDone: () => void }) {
  const command = useResearchCommand(projectId);
  const [statement, setStatement] = useState(""), [category, setCategory] = useState<LimitationCategory>("DATA"), [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  useUnsavedWorkspace(Boolean(statement.trim()));
  const save = async () => {
    try { await command.mutateAsync(() => researchApi.createLimitation(projectId, { statement, category, evidenceIds, clientKey })); setStatement(""); setClientKey(crypto.randomUUID()); onDone(); } catch { /* keep the draft */ }
  };
  return <form className="research-form limitations-create" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <h4>Nhóm {evidenceIds.length} trích xuất thành một hạn chế</h4>
    <label>Phát biểu hạn chế chung<textarea required minLength={3} maxLength={2000} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="Ví dụ: Chưa nghiên cứu nào thử nén mô hình trên chữ viết tay tiếng Việt có dấu" /></label>
    <CategorySelect value={category} onChange={setCategory} />
    <Button type="submit" disabled={!evidenceIds.length || statement.trim().length < 3 || command.isPending}>Tạo hạn chế</Button>
    {command.isError && <WorkspaceError error={command.error} />}
  </form>;
}

function LimitationCard({ projectId, item, data, canEdit, readOnly }: { projectId: string; item: ProjectLimitation; data: ProjectLimitationList; canEdit: boolean; readOnly: boolean }) {
  const command = useResearchCommand(projectId);
  const [mode, setMode] = useState<"edit" | "dismiss" | "promote" | null>(null);
  const [statement, setStatement] = useState(item.statement), [category, setCategory] = useState<LimitationCategory>(item.category);
  const [sourceIds, setSourceIds] = useState(() => item.sources.map((source) => source.evidenceId)), [rationale, setRationale] = useState("");
  const [promote, setPromote] = useState({ title: "", topic: "", significance: "", researchQuestion: "" });
  useUnsavedWorkspace(mode !== null);
  const run = async (action: () => Promise<unknown>) => { try { await command.mutateAsync(action); setMode(null); } catch { /* shown below */ } };
  const open = item.status === "OPEN";
  const candidates = [...item.sources.map((source) => ({ evidenceId: source.evidenceId, limitations: source.limitations, paperTitle: source.paperTitle })), ...data.ungrouped];
  return <article className={`limitation-card limitation-${item.status.toLowerCase()}`}>
    <header>
      <div><p className="limitation-statement">{item.statement}</p>
        <p className="research-help"><span className="limitation-category">{categoryLabels[item.category].label}</span> · <strong>{item.paperCount} bài báo</strong> cùng nêu · {statusLabels[item.status]} · {item.createdByName}</p></div>
      <VerdictBadge verdict={item.feasibility.verdict} />
    </header>
    {item.status === "DISMISSED" && <p className="research-help">Lý do loại: {item.statusRationale}</p>}
    {item.status === "PROMOTED" && (item.gapId ? <details className="limitation-gap"><summary>Gap ứng viên: {item.gapTitle ?? "đã tạo"} · mở để đánh giá</summary><p className="research-help">Ghi nhận đánh giá khả thi và đánh giá của nhóm ngay tại đây, hoặc <Link className="research-source-link" to={`/projects/${projectId}?tab=gaps&gap=${encodeURIComponent(item.gapId)}`}>mở trong tab Research Gaps</Link>.</p><ResearchGapEvaluation projectId={projectId} gapId={item.gapId} /></details> : <p className="research-help">Gap ứng viên đã bị xóa.</p>)}
    <details><summary>Nguồn ({item.sources.length} trích xuất)</summary><ul className="limitations-sources">{item.sources.map((source) => <li key={source.evidenceId}><Link className="research-source-link" to={`/projects/${projectId}?tab=gaps&research=evidence&evidence=${source.evidenceId}`}>{source.paperTitle}{source.publicationYear ? ` (${source.publicationYear})` : ""}</Link><p>{source.limitations}</p></li>)}</ul></details>
    <details><summary>Đánh giá khả thi ({item.feasibility.count})</summary><FeasibilityPanel projectId={projectId} kind="LIMITATION" targetId={item.id} readOnly={readOnly || item.status !== "OPEN"} /></details>
    {canEdit && open && !mode && <div className="research-actions">
      <Button size="sm" onClick={() => setMode("promote")}>Chuyển thành gap ứng viên</Button>
      <Button size="sm" variant="outline" onClick={() => setMode("edit")}>Sửa</Button>
      <Button size="sm" variant="ghost" onClick={() => setMode("dismiss")}>Loại</Button>
    </div>}
    {canEdit && item.status === "DISMISSED" && <Button size="sm" variant="outline" disabled={command.isPending} onClick={() => void run(() => researchApi.limitationStatus(projectId, item.id, { status: "OPEN", rationale: "", expectedVersion: item.version }))}>Mở lại</Button>}
    {mode === "edit" && <form className="research-form" onSubmit={(event) => { event.preventDefault(); void run(() => researchApi.updateLimitation(projectId, item.id, { statement, category, evidenceIds: sourceIds, expectedVersion: item.version })); }}>
      <label>Phát biểu hạn chế chung<textarea required minLength={3} maxLength={2000} value={statement} onChange={(event) => setStatement(event.target.value)} /></label>
      <CategorySelect value={category} onChange={setCategory} />
      <fieldset><legend>Trích xuất làm nguồn</legend>{candidates.map((source) => <label key={source.evidenceId} className="research-check"><input type="checkbox" checked={sourceIds.includes(source.evidenceId)} onChange={() => setSourceIds((value) => value.includes(source.evidenceId) ? value.filter((id) => id !== source.evidenceId) : [...value, source.evidenceId])} /><span>{source.limitations}<small className="research-help"> · {source.paperTitle}</small></span></label>)}</fieldset>
      <div className="research-actions"><Button type="submit" disabled={!sourceIds.length || statement.trim().length < 3 || command.isPending}>Lưu</Button><Button type="button" variant="ghost" onClick={() => setMode(null)}>Hủy</Button></div>
    </form>}
    {mode === "dismiss" && <form className="research-form" onSubmit={(event) => { event.preventDefault(); void run(() => researchApi.limitationStatus(projectId, item.id, { status: "DISMISSED", rationale, expectedVersion: item.version })); }}>
      <label>Lý do loại<textarea required minLength={3} maxLength={2000} value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Ví dụ: nằm ngoài phạm vi dự án; đã có nghiên cứu giải quyết" /></label>
      <div className="research-actions"><Button type="submit" disabled={rationale.trim().length < 3 || command.isPending}>Loại hạn chế</Button><Button type="button" variant="ghost" onClick={() => setMode(null)}>Hủy</Button></div>
    </form>}
    {mode === "promote" && <form className="research-form" onSubmit={(event) => { event.preventDefault(); void run(() => researchApi.promoteLimitation(projectId, item.id, { expectedVersion: item.version, title: promote.title, topic: promote.topic, significance: promote.significance, ...(promote.researchQuestion.trim() ? { researchQuestion: promote.researchQuestion } : {}) })); }}>
      <p className="research-help">Gap ứng viên mới sẽ dùng {item.sources.length} trích xuất này làm bằng chứng ủng hộ{item.feasibility.count ? `, và mang theo ${item.feasibility.count} đánh giá khả thi` : ""}. Gap vẫn phải qua đánh giá của nhóm, kiểm tra đóng gap và chuyên gia xác nhận.</p>
      <label>Tiêu đề gap<Input required minLength={3} maxLength={200} value={promote.title} onChange={(event) => setPromote({ ...promote, title: event.target.value })} /></label>
      <label>Chủ đề<Input required minLength={3} maxLength={200} value={promote.topic} onChange={(event) => setPromote({ ...promote, topic: event.target.value })} placeholder="Ví dụ: model compression OCR" /></label>
      <label>Vì sao quan trọng<textarea required minLength={10} maxLength={10000} value={promote.significance} onChange={(event) => setPromote({ ...promote, significance: event.target.value })} /></label>
      <label>Câu hỏi nghiên cứu gợi ý (không bắt buộc)<textarea maxLength={5000} value={promote.researchQuestion} onChange={(event) => setPromote({ ...promote, researchQuestion: event.target.value })} /></label>
      <div className="research-actions"><Button type="submit" disabled={promote.title.trim().length < 3 || promote.topic.trim().length < 3 || promote.significance.trim().length < 10 || command.isPending}>Tạo gap ứng viên</Button><Button type="button" variant="ghost" onClick={() => setMode(null)}>Hủy</Button></div>
    </form>}
    {command.isError && <WorkspaceError error={command.error} />}
  </article>;
}
