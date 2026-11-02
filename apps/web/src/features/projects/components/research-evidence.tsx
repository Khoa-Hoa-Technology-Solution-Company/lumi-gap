import { Fragment, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import type { ProjectEvidence, ResearchSynthesisPaper } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { researchApi } from "../api/project-research.api";
import { useResearchResource } from "../hooks/use-project-research";
import { canLeaveWorkspace, WorkspaceError, WorkspaceLoading } from "./workspace-common";
import { EvidenceEditor, EvidenceDetail, VerificationBadge } from "./research-evidence-detail";
import "../research-evidence.css";

export const reviewLabels = { PENDING: "Awaiting human review", ACCEPTED: "Human accepted", REJECTED: "Rejected extraction" } as const;
export function ResearchEvidence({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const [params, setParams] = useSearchParams(), focused = params.get("evidence") ?? "";
  const [editor, setEditor] = useState<ProjectEvidence | "new" | null>(() => !readOnly && params.has("extract") ? "new" : null);
  const [initialPaper, setInitialPaper] = useState(params.get("extract") ?? "");
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [questionId, setQuestion] = useState(""), [theme, setTheme] = useState(""), [status, setStatus] = useState("");
  const [eligibility, setEligibility] = useState("ELIGIBLE"), [mode, setMode] = useState<"papers" | "questions">("papers");
  const [expanded, setExpanded] = useState<string | null>(null);
  const workspace = useResearchResource(projectId, ["evidence-workspace", query, page, questionId, theme, status, eligibility], () => researchApi.evidenceWorkspace(projectId, { q: query, page, pageSize: 20, questionId, theme, status, eligibility }), !focused);
  const linked = useResearchResource(projectId, ["evidence", focused], () => researchApi.evidence(projectId, { itemId: focused, page: 1 }), Boolean(focused));
  const change = async (action: () => void) => { if (await canLeaveWorkspace()) action(); };
  const edit = (item?: ProjectEvidence, paperId = "") => void change(() => { setInitialPaper(paperId); setEditor(item ?? "new"); });
  const closeEditor = () => { setEditor(null); if (params.has("extract")) { const next = new URLSearchParams(params); next.delete("extract"); setParams(next, { replace: true }); } };
  const filter = (set: (value: string) => void, value: string) => void change(() => { set(value); setPage(1); setExpanded(null); });
  const rows = workspace.data?.items ?? [];
  const groups = mode === "papers" ? [{ id: "papers", title: "", papers: rows }] : [
    ...(workspace.data?.questions ?? []).map(question => ({ id: question.id, title: question.text, papers: rows.filter(paper => paper.questions.some(item => item.id === question.id)).map(paper => ({ ...paper, entries: paper.entries.filter(entry => entry.relatedQuestions?.some(item => item.id === question.id)) })) })),
    { id: "unlinked", title: "Chưa liên kết Research Question", papers: rows.filter(paper => !paper.questions.length) },
  ].filter(group => group.papers.length);
  return <section className="evidence-workspace" aria-label="Bảng tổng hợp nghiên cứu">
    <header className="research-heading"><div><h2>Bảng tổng hợp nghiên cứu</h2><p>So sánh phương pháp, kết quả và hạn chế của các công trình để trả lời câu hỏi nghiên cứu.</p></div>{!readOnly && <Button onClick={() => edit()}><Plus size={16} aria-hidden="true" />Thêm trích xuất</Button>}</header>
    {editor && <EvidenceEditor key={editor === "new" ? `new-${initialPaper}` : editor.id} projectId={projectId} item={editor === "new" ? undefined : editor} initialPaperId={initialPaper} onClose={closeEditor} />}
    {focused ? <>
      <Button variant="ghost" onClick={() => void change(() => { const next = new URLSearchParams(params); next.delete("evidence"); setParams(next); })}>← Xem tất cả bài báo</Button>
      {linked.isLoading ? <WorkspaceLoading /> : linked.isError ? <WorkspaceError error={linked.error} /> : linked.data?.legacyGapId ? <Link className="research-source-link" to={`/gaps/${encodeURIComponent(linked.data.legacyGapId)}`}>Xem bản ghi bằng chứng gốc</Link> : linked.data?.items.map(item => <EvidenceDetail key={item.id} projectId={projectId} item={item} readOnly={readOnly} onEdit={() => edit(item)} />)}
    </> : <>
      <div className="evidence-viewbar"><div className="evidence-segment" aria-label="Cách xem tổng hợp"><button type="button" aria-pressed={mode === "papers"} onClick={() => void change(() => { setMode("papers"); setExpanded(null); })}>Theo bài báo</button><button type="button" aria-pressed={mode === "questions"} onClick={() => void change(() => { setMode("questions"); setExpanded(null); })}>Theo Research Question</button></div><Link className="research-source-link" to={`/projects/${encodeURIComponent(projectId)}?tab=gaps&research=synthesis`}>Viết tổng hợp liên công trình →</Link></div>
      <form className="evidence-filters" onSubmit={event => { event.preventDefault(); void change(() => { setQuery(search); setPage(1); setExpanded(null); }); }}>
        <div className="evidence-search"><Search size={16} aria-hidden="true" /><Input aria-label="Tìm bài báo hoặc nội dung" placeholder="Tìm bài báo, phương pháp, phát hiện…" type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} /><Button variant="ghost" type="submit" size="sm">Tìm</Button></div>
        <select aria-label="Lọc theo Research Question" value={questionId} onChange={event => filter(setQuestion, event.target.value)}><option value="">Tất cả RQ</option>{workspace.data?.questions.map((question, index) => <option key={question.id} value={question.id}>RQ{index + 1}: {question.text}</option>)}</select>
        <select aria-label="Lọc theo chủ đề" value={theme} onChange={event => filter(setTheme, event.target.value)}><option value="">Tất cả chủ đề</option>{workspace.data?.themes.map(value => <option key={value}>{value}</option>)}</select>
        <select aria-label="Trạng thái kiểm chứng" value={status} onChange={event => filter(setStatus, event.target.value)}><option value="">Mọi trạng thái kiểm chứng</option><option value="DRAFT">AI gợi ý / Bản nháp</option><option value="NEEDS_VERIFICATION">Cần kiểm chứng</option><option value="VERIFIED">Đã đối chiếu với nguồn</option><option value="REVISIT">Cần xem xét lại</option></select>
        <select aria-label="Điều kiện nguồn" value={eligibility} onChange={event => filter(setEligibility, event.target.value)}><option value="ELIGIBLE">Nguồn đủ điều kiện phân tích</option><option value="ALL">Tất cả, gồm nguồn cần xem lại</option></select>
      </form>
      <p className="evidence-guidance">{eligibility === "ELIGIBLE" ? "Chỉ hiển thị bài đã đủ điều kiện phân tích theo quy trình sàng lọc." : "Nguồn chưa đủ điều kiện được giữ để tra cứu, không dùng trong tổng hợp chính thức."} Nội dung chưa kiểm chứng là bản làm việc.</p>
      {workspace.isLoading ? <WorkspaceLoading /> : workspace.isError ? <WorkspaceError error={workspace.error} retry={() => void workspace.refetch()} /> : !rows.length ? <div className="research-empty"><h3>{query || questionId || theme || status ? "Không có bài báo khớp bộ lọc" : "Bắt đầu từ một bài báo đã được chọn"}</h3><p>Chọn một nguồn đủ điều kiện trong Thư viện, rồi ghi phương pháp, phát hiện và hạn chế. Đối chiếu nội dung với nguồn trước khi dùng để viết Literature Review.</p><Button asChild variant="outline"><Link to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=library`}>Mở Thư viện</Link></Button></div> : <>
        {mode === "questions" && <p className="research-help">So sánh từng phát hiện cùng phương pháp và bối cảnh; không mặc định khác biệt là mâu thuẫn. Một bài có thể liên quan nhiều RQ. Các nhóm dưới đây thuộc trang bài báo hiện tại.</p>}
        {groups.map(group => <section key={group.id} className="evidence-rq-group">{group.title && <h3>{group.title}<span>{group.papers.length} bài báo</span></h3>}<div className="evidence-table-scroll" role="region" aria-label={group.title || "Bảng so sánh bài báo"} tabIndex={0}><table className="evidence-table"><caption className="sr-only">So sánh các công trình, mở từng bài để xem trích xuất và nguồn</caption><thead><tr>{["Bài báo", "Research Question liên quan", "Phương pháp nghiên cứu", "Phát hiện chính", "Hạn chế", "Trạng thái kiểm chứng"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{group.papers.map(paper => {
          const key = `${group.id}:${paper.paperId}`, open = expanded === key, preview = paper.entries[0];
          return <Fragment key={paper.paperId}><tr data-paper-id={paper.paperId} className={!paper.eligible ? "evidence-source-ineligible" : undefined}>
            <th scope="row"><button type="button" className="evidence-paper-toggle" aria-expanded={open} onClick={() => void change(() => setExpanded(open ? null : key))}>{open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}<span>{paper.title}</span></button><p className="evidence-meta">{paper.publicationYear ?? "Chưa rõ năm"} · {paper.extractionCount} bản trích xuất</p>{preview && <p className="evidence-meta">Đang xem 1 bản riêng · v{preview.version}{paper.extractionCount > 1 ? ` · +${paper.extractionCount - 1} bản trong chi tiết` : ""}</p>}{!paper.eligible && <p className="evidence-warning">{paper.eligibilityReason}</p>}</th>
            <td>{paper.questions.length ? <ul className="evidence-rq-list">{paper.questions.map(question => <li key={question.id}>{question.text}</li>)}</ul> : <span className="evidence-missing">Chưa liên kết RQ</span>}</td>
            <td><CompactText value={preview?.methodology} /></td><td><CompactText value={preview?.claim} /></td><td><CompactText value={preview?.limitations} /></td>
            <td>{preview ? <><VerificationBadge status={preview.verificationStatus} /><p className="evidence-meta">{preview.origin === "AI_SUGGESTED" ? "Nguồn gốc: AI gợi ý" : "Trích xuất của thành viên"}</p>{preview.sourceScope === "ABSTRACT" && <p className="evidence-scope">Chỉ dựa trên tóm tắt</p>}{paper.verifiedCount > 0 && <p className="evidence-meta">{paper.verifiedCount}/{paper.extractionCount} bản đã đối chiếu</p>}</> : <span className="evidence-missing">Chưa có trích xuất</span>}</td>
          </tr>{open && <tr className="evidence-expanded"><td colSpan={6}><PaperExtractions projectId={projectId} paper={paper} readOnly={readOnly} onEdit={edit} /></td></tr>}</Fragment>;
        })}</tbody></table></div></section>)}
        <div className="research-pagination" aria-label="Phân trang bài báo"><span>{workspace.data?.total} bài báo · Trang {page}</span><Button variant="ghost" disabled={page === 1} onClick={() => void change(() => { setPage(value => value - 1); setExpanded(null); })}>Trang trước</Button><Button variant="ghost" disabled={!workspace.data?.hasNext} onClick={() => void change(() => { setPage(value => value + 1); setExpanded(null); })}>Trang sau</Button></div>
      </>}
    </>}
  </section>;
}
function CompactText({ value }: { value?: string }) { return value ? <p className="evidence-cell-text">{value}</p> : <span className="evidence-missing">Chưa ghi nhận</span>; }
function PaperExtractions({ projectId, paper, readOnly, onEdit }: { projectId: string; paper: ResearchSynthesisPaper; readOnly: boolean; onEdit: (item?: ProjectEvidence, paperId?: string) => void }) {
  const [page, setPage] = useState(1);
  const data = useResearchResource(projectId, ["paper-extractions", paper.paperId, page], () => researchApi.evidence(projectId, { paperId: paper.paperId, page, pageSize: 10 }));
  return <div className="evidence-paper-details"><header><div><h4>Trích xuất của bài báo</h4><p className="research-help">Mỗi bản có nhận định, nguồn gốc và lịch sử riêng.</p></div><div className="research-actions"><Button variant="ghost" size="sm" asChild><Link to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=library&source=${encodeURIComponent(paper.paperId)}`}>Mở nguồn trong Thư viện</Link></Button>{!readOnly && paper.eligible && <Button variant="outline" size="sm" onClick={() => onEdit(undefined, paper.paperId)}>Thêm trích xuất cho bài này</Button>}</div></header>
    {data.isLoading ? <WorkspaceLoading /> : data.isError ? <WorkspaceError error={data.error} retry={() => void data.refetch()} /> : !data.data?.items.length ? <p className="research-help">Chưa có trích xuất. Bắt đầu với một phát hiện có thể đối chiếu từ nguồn.</p> : data.data.items.map(item => <details className="evidence-record" key={item.id}><summary><span><span className="evidence-meta">v{item.version} · {item.origin === "AI_SUGGESTED" ? "AI gợi ý" : "Thành viên"}</span><span className="evidence-record-claim">{item.claim}</span></span><VerificationBadge status={item.verificationStatus} /></summary><EvidenceDetail projectId={projectId} item={item} readOnly={readOnly} onEdit={() => onEdit(item)} /></details>)}
    {(page > 1 || data.data?.hasNext) && <div className="research-pagination"><Button variant="ghost" disabled={page === 1} onClick={async () => { if (await canLeaveWorkspace()) setPage(value => value - 1); }}>Trích xuất trước</Button><span>{page}</span><Button variant="ghost" disabled={!data.data?.hasNext} onClick={async () => { if (await canLeaveWorkspace()) setPage(value => value + 1); }}>Trích xuất sau</Button></div>}
  </div>;
}
