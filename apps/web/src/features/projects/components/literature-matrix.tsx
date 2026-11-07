import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Download, Plus, Search } from "lucide-react";
import { MAX_MATRIX_CRITERIA, type LiteratureMatrixQuery, type MatrixCriterion } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand, useResearchResource } from "../hooks/use-project-research";
import { MATRIX_BUILT_IN_LABELS, matrixToCsv } from "../literature-matrix-csv";
import { VerificationBadge } from "./research-evidence-detail";
import { WorkspaceError, WorkspaceLoading } from "./workspace-common";
import "../research-evidence.css";
import "../research-literature.css";

const BUILT_IN = Object.entries(MATRIX_BUILT_IN_LABELS) as Array<[keyof typeof MATRIX_BUILT_IN_LABELS, string]>;

/**
 * Step 3: literature matrix. One row per extraction of an included paper; the built-in columns come from the
 * extraction form and the project adds its own comparison columns (dataset, metric, ...). Values are edited in the
 * extraction itself, so every cell is versioned and goes through the same human review.
 */
export function LiteratureMatrixView({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const [status, setStatus] = useState<NonNullable<LiteratureMatrixQuery["status"]>>("VERIFIED");
  const [questionId, setQuestion] = useState(""), [theme, setTheme] = useState(""), [search, setSearch] = useState(""), [q, setQ] = useState("");
  const [managing, setManaging] = useState(false);
  const matrix = useResearchResource(projectId, ["matrix", status, questionId, theme, q], () => researchApi.matrix(projectId, { status, questionId, theme, q }));
  const exportCsv = () => {
    if (!matrix.data) return;
    const url = URL.createObjectURL(new Blob([matrixToCsv(matrix.data)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `literature-matrix-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
  };
  const data = matrix.data, canEdit = !readOnly && Boolean(data?.canEdit);
  return <section className="literature-matrix" aria-label="Ma trận tài liệu" data-no-i18n>
    <header className="research-heading"><div><h2>Ma trận tài liệu</h2><p>Mỗi dòng là một trích xuất từ bài đã qua sàng lọc. Đặt các bài cạnh nhau theo cùng tiêu chí để thấy điểm chung, khác biệt và chỗ còn trống.</p></div>
      <div className="research-actions">{canEdit && <Button variant="outline" onClick={() => setManaging((value) => !value)}>{managing ? "Đóng quản lý cột" : "Quản lý cột"}</Button>}<Button variant="outline" disabled={!data?.rows.length} onClick={exportCsv}><Download size={16} aria-hidden="true" />Xuất CSV</Button></div></header>
    {managing && data && <CriteriaManager projectId={projectId} criteria={data.criteria} />}
    <form className="evidence-filters" onSubmit={(event) => { event.preventDefault(); setQ(search); }}>
      <div className="evidence-search"><Search size={16} aria-hidden="true" /><Input aria-label="Tìm trong ma trận" placeholder="Tìm bài báo, phương pháp, hạn chế…" type="search" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <select aria-label="Trạng thái kiểm chứng" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="VERIFIED">Chỉ trích xuất đã kiểm chứng</option><option value="ALL">Gồm cả bản chưa kiểm chứng</option></select>
      <select aria-label="Lọc theo Research Question" value={questionId} onChange={(event) => setQuestion(event.target.value)}><option value="">Tất cả RQ</option>{data?.questions.map((question, index) => <option key={question.id} value={question.id}>RQ{index + 1}: {question.text.slice(0, 80)}</option>)}</select>
      <select aria-label="Lọc theo chủ đề" value={theme} onChange={(event) => setTheme(event.target.value)}><option value="">Tất cả chủ đề</option>{data?.themes.map((value) => <option key={value}>{value}</option>)}</select>
    </form>
    {status === "ALL" && <p className="evidence-warning" role="status">Đang hiện cả trích xuất chưa kiểm chứng. Chỉ dùng trích xuất đã kiểm chứng làm căn cứ cho kết luận.</p>}
    {matrix.isLoading ? <WorkspaceLoading /> : matrix.isError || !data ? <WorkspaceError error={matrix.error} retry={() => void matrix.refetch()} /> : !data.rows.length ? <div className="research-empty"><h3>Ma trận chưa có dòng nào</h3><p>{status === "VERIFIED" ? "Chưa có trích xuất nào được kiểm chứng. Thêm trích xuất cho các bài đã đưa vào, rồi nhờ một thành viên khác đối chiếu với nguồn." : "Chưa có trích xuất nào khớp bộ lọc."}</p>{!readOnly && <Button variant="outline" asChild><Link to={`/projects/${projectId}?tab=gaps&research=evidence`}><Plus size={16} aria-hidden="true" />Thêm trích xuất</Link></Button>}</div> : <>
      <p className="research-help">{data.total} trích xuất từ {new Set(data.rows.map((row) => row.paperId)).size} bài báo{data.truncated ? ` · đang hiện ${data.rows.length} dòng đầu, hãy lọc để xem phần còn lại` : ""}. Sửa một ô bằng cách mở trích xuất; bản sửa phải được kiểm chứng lại.</p>
      <div className="evidence-table-scroll" role="region" aria-label="Bảng ma trận tài liệu" tabIndex={0}>
        <table className="evidence-table matrix-table" style={{ minWidth: `${420 + (BUILT_IN.length + data.criteria.length) * 180}px` }}>
          <thead><tr><th scope="col">Bài báo</th>{BUILT_IN.map(([key, label]) => <th key={key} scope="col">{label}</th>)}{data.criteria.map((column) => <th key={column.id} scope="col" title={column.description || undefined} className="matrix-custom-column">{column.label}</th>)}<th scope="col">Kiểm chứng</th></tr></thead>
          <tbody>{data.rows.map((row) => <tr key={row.evidenceId}>
            <th scope="row"><Link className="research-source-link" to={`/projects/${projectId}?tab=gaps&research=evidence&evidence=${row.evidenceId}`}>{row.paperTitle}</Link><p className="evidence-meta">{row.publicationYear ?? "Không rõ năm"}{row.limitationIds.length ? ` · thuộc ${row.limitationIds.length} hạn chế` : ""}</p></th>
            {BUILT_IN.map(([key]) => <td key={key}><Cell value={row[key]} /></td>)}
            {data.criteria.map((column) => <td key={column.id}><Cell value={row.criteriaValues[column.id]} /></td>)}
            <td><VerificationBadge status={row.verificationStatus} /><p className="evidence-meta">{row.origin === "AI_SUGGESTED" ? "AI gợi ý" : "Thành viên trích xuất"}{row.sourceScope === "ABSTRACT" ? " · chỉ tóm tắt" : ""}</p></td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}

function Cell({ value }: { value?: string }) {
  return value ? <p className="evidence-cell-text">{value}</p> : <span className="evidence-missing">Chưa ghi nhận</span>;
}

function CriteriaManager({ projectId, criteria }: { projectId: string; criteria: MatrixCriterion[] }) {
  const command = useResearchCommand(projectId);
  const [label, setLabel] = useState(""), [description, setDescription] = useState("");
  const [editing, setEditing] = useState<{ id: string; label: string; description: string; version: number } | null>(null);
  const run = async (action: () => Promise<unknown>, after?: () => void) => { try { await command.mutateAsync(action); after?.(); } catch { /* shown below */ } };
  const move = (index: number, offset: number) => {
    const order = criteria.map((column) => column.id); const [moved] = order.splice(index, 1); order.splice(index + offset, 0, moved!);
    void run(() => researchApi.reorderCriteria(projectId, order));
  };
  return <section className="matrix-criteria" aria-label="Cột ma trận của dự án">
    <h3>Cột của dự án</h3>
    <p className="research-help">5 cột cố định (phương pháp, dữ liệu, phát hiện, kết quả, hạn chế) luôn có. Thêm tối đa {MAX_MATRIX_CRITERIA} cột riêng, ví dụ "Bộ dữ liệu", "Chỉ số đánh giá", "Ngôn ngữ". Ẩn một cột không xóa giá trị đã ghi.</p>
    {!!criteria.length && <ol className="matrix-criteria-list">{criteria.map((column, index) => <li key={column.id}>
      {editing?.id === column.id ? <form className="matrix-criteria-edit" onSubmit={(event) => { event.preventDefault(); void run(() => researchApi.updateCriterion(projectId, column.id, { label: editing.label, description: editing.description, expectedVersion: editing.version }), () => setEditing(null)); }}>
        <Input aria-label="Tên cột" maxLength={80} required value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} />
        <Input aria-label="Mô tả cột" maxLength={500} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
        <Button type="submit" size="sm" disabled={!editing.label.trim() || command.isPending}>Lưu</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Hủy</Button>
      </form> : <>
        <span><strong>{column.label}</strong>{column.description && <small className="research-help"> · {column.description}</small>}</span>
        <span className="research-actions">
          <Button type="button" size="sm" variant="ghost" aria-label={`Chuyển cột ${column.label} sang trái`} disabled={index === 0 || command.isPending} onClick={() => move(index, -1)}><ArrowLeft size={14} aria-hidden="true" /></Button>
          <Button type="button" size="sm" variant="ghost" aria-label={`Chuyển cột ${column.label} sang phải`} disabled={index === criteria.length - 1 || command.isPending} onClick={() => move(index, 1)}><ArrowRight size={14} aria-hidden="true" /></Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing({ id: column.id, label: column.label, description: column.description, version: column.version })}>Đổi tên</Button>
          <Button type="button" size="sm" variant="ghost" disabled={command.isPending} onClick={() => { if (window.confirm(`Ẩn cột "${column.label}"? Giá trị đã ghi vẫn được giữ trong lịch sử trích xuất.`)) void run(() => researchApi.archiveCriterion(projectId, column.id, column.version)); }}>Ẩn cột</Button>
        </span>
      </>}
    </li>)}</ol>}
    {criteria.length < MAX_MATRIX_CRITERIA && <form className="matrix-criteria-add" onSubmit={(event) => { event.preventDefault(); void run(() => researchApi.createCriterion(projectId, { label, description }), () => { setLabel(""); setDescription(""); }); }}>
      <Input aria-label="Tên cột mới" placeholder="Tên cột, ví dụ: Bộ dữ liệu" maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} />
      <Input aria-label="Mô tả cột mới" placeholder="Hướng dẫn điền (không bắt buộc)" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
      <Button type="submit" disabled={!label.trim() || command.isPending}><Plus size={16} aria-hidden="true" />Thêm cột</Button>
    </form>}
    {command.isError && <WorkspaceError error={command.error} />}
  </section>;
}
