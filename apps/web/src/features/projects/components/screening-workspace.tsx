import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ScreeningPhase } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { WorkspaceLoading, canLeaveWorkspace } from "./workspace-common";
import { screeningMetadataWarning, ScreeningError, ScreeningPager, ScreeningStatus, stateLabels, useScreeningCommand } from "./screening-common";
import { ScreeningSettingsForm, ScreeningAssignmentDialog } from "./screening-management";
import { ScreeningPaperDetail } from "./screening-round";
import { ScreeningAnalytics } from "./screening-analytics";
import "../screening.css";
const filters = { ALL: "Tất cả bài", MINE: "Phiếu của tôi", PENDING: "Đang chờ tôi", COMPLETED: "Tôi đã gửi", OVERDUE: "Tôi quá hạn", CONFLICT: "Cần thống nhất" };
export function ScreeningWorkspace({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(""), [q, setQ] = useState(""), [page, setPage] = useState(1), [filter, setFilter] = useState("ALL"), [selected, setSelected] = useState<string[]>([]), [assigning, setAssigning] = useState<string[] | null>(null);
  const [status, setStatus] = useState(""), [proposerId, setProposerId] = useState(""), [reviewerId, setReviewerId] = useState("");
  const [phase, setPhase] = useState<ScreeningPhase>("TITLE_ABSTRACT"), [confirmed, setConfirmed] = useState(false), [showAnalytics, setShowAnalytics] = useState(false);
  const data = useResearchResource(projectId, ["screening-board", q, page, filter, status, proposerId, reviewerId], () => screeningApi.board(projectId, { q, page, filter, pageSize: 20, ...(status ? { status } : {}), ...(proposerId ? { proposerId } : {}), ...(reviewerId ? { reviewerId } : {}) }), !showAnalytics, b => !readOnly && Boolean(b), 10000);
  const command = useScreeningCommand(projectId), board = data.data;
  const sourceId = params.get("source");
  const localFocus = board?.items.find(p => p.paperId === sourceId);
  const source = useResearchResource(projectId, ["screening-source", sourceId], () => screeningApi.board(projectId, { source: sourceId!, page: 1, pageSize: 1 }), Boolean(sourceId && board && !localFocus));
  const focused = localFocus ?? source.data?.items[0];
  const change = async (run: () => void) => { if (await canLeaveWorkspace()) run(); };
  const focus = (id: string | null) => void change(() => { const next = new URLSearchParams(params); if (id) next.set("source", id); else next.delete("source"); setParams(next, { replace: true }); });
  const roundIds = board?.items.filter(p => selected.includes(p.paperId) && p.round).map(p => p.round!.id) ?? [];
  const legacyLabel = (value: string) => value === "INCLUDED" ? "Phù hợp" : value === "EXCLUDED" ? "Không phù hợp" : "Đang xem xét";
  return <section className="screening-workspace" data-no-i18n>
    <header className="research-heading"><div><h2>Đánh giá bài báo</h2><p>Đề xuất bài → gửi phiếu → thống nhất nếu có bất đồng → người phụ trách chốt kết quả. Phù hợp chỉ thể hiện bài nằm trong phạm vi dự án.</p></div><Button variant="outline" onClick={() => void change(() => setShowAnalytics(v => !v))}>{showAnalytics ? "Về danh sách bài" : "Thống kê đánh giá"}</Button></header>
    {showAnalytics ? <ScreeningAnalytics projectId={projectId} /> : <>
      <form className="screening-toolbar" onSubmit={e => { e.preventDefault(); void change(() => { setQ(search); setPage(1); setSelected([]); }); }}><Input type="search" aria-label="Tìm bài báo theo tiêu đề hoặc DOI" placeholder="Tìm theo tiêu đề hoặc DOI" value={search} onChange={e => setSearch(e.target.value)} /><Button variant="outline">Tìm kiếm</Button><label><span className="sr-only">Lọc phiếu</span><select value={filter} onChange={e => { const next = e.target.value; void change(() => { setFilter(next); setPage(1); setSelected([]); }); }}>{Object.entries(filters).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span className="sr-only">Trạng thái bài</span><select aria-label="Trạng thái bài" value={status} onChange={e => { const value = e.target.value; void change(() => { setStatus(value); setPage(1); setSelected([]); }); }}><option value="">Mọi trạng thái</option>{Object.entries(stateLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span className="sr-only">Người đề xuất</span><select aria-label="Người đề xuất" value={proposerId} onChange={e => { const value = e.target.value; void change(() => { setProposerId(value); setPage(1); setSelected([]); }); }}><option value="">Mọi người đề xuất</option>{board?.filters.proposers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label><span className="sr-only">Reviewer</span><select aria-label="Reviewer" value={reviewerId} onChange={e => { const value = e.target.value; void change(() => { setReviewerId(value); setPage(1); setSelected([]); }); }}><option value="">Mọi reviewer</option>{board?.filters.reviewers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></form>
      {data.isError && <ScreeningError error={data.error} retry={() => void data.refetch()} />}
      {data.isLoading ? <WorkspaceLoading /> : board && <>
        <div className="screening-progress" aria-label="Tiến độ đánh giá dự án"><label>Đã có đánh giá: {board.progress.reviewed}/{board.progress.total} bài<progress value={board.progress.reviewed} max={Math.max(1, board.progress.total)} /></label><label>Đã có quyết định cuối: {board.progress.finalized}/{board.progress.total} bài<progress value={board.progress.finalized} max={Math.max(1, board.progress.total)} /></label></div>
        {board.progress.legacy > 0 && <p className="screening-notice" role="status">{board.progress.legacy} bài có phân loại lịch sử, chưa được xác nhận bằng quy trình đánh giá mới. Các bài này chưa tính vào số bài đã đánh giá hoặc đã chốt. Trạng thái cũ vẫn được giữ để đối chiếu.</p>}
        <p className="screening-notice">Phiếu của tôi: {board.myProgress.assigned} phân công · {board.myProgress.completed} đã gửi · {board.myProgress.pending} đang chờ · {board.myProgress.overdue} quá hạn. Hoàn thành {board.myProgress.assigned ? Math.round(100 * board.myProgress.completed / board.myProgress.assigned) : 0}%.</p>
        {sourceId && !localFocus && source.isLoading && <p role="status">Đang mở bài được liên kết…</p>}
        {source.isError && <ScreeningError error={source.error} retry={() => void source.refetch()} />}
        {sourceId && !focused && source.isSuccess && <p role="status">Bài được liên kết không còn trong dự án.</p>}
        {board.canManage && !readOnly && <details className="screening-settings"><summary>Cấu hình sàng lọc · v{board.settings.version}</summary><ScreeningSettingsForm projectId={projectId} settings={board.settings} /></details>}
        {board.canManage && !readOnly && <details className="screening-bulk" open={selected.length > 0 || undefined}><summary>Bắt đầu vòng và phân công</summary><label className="screening-check"><input type="checkbox" checked={board.items.length > 0 && selected.length === board.items.length} onChange={e => setSelected(e.target.checked ? board.items.map(p => p.paperId) : [])} />Chọn trang này ({selected.length})</label>
          <label>Giai đoạn<select value={phase} onChange={e => setPhase(e.target.value as ScreeningPhase)}><option value="TITLE_ABSTRACT">Tiêu đề và tóm tắt</option><option value="FULL_TEXT">Toàn văn</option></select></label>
          <label className="screening-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Xác nhận mở vòng mới; kết quả cũ được giữ và trạng thái hiện tại sẽ tính lại.</label>
          <div className="screening-actions"><Button disabled={!selected.length || !confirmed || command.isPending} onClick={async () => { const payload = { paperIds: selected, phase, confirmRescreen: confirmed }; if (await command.run(payload, clientKey => screeningApi.start(projectId, { ...payload, clientKey }))) { setConfirmed(false); } }}>Bắt đầu vòng cho bài đã chọn</Button><Button variant="outline" disabled={!roundIds.length || command.isPending} onClick={() => void change(() => setAssigning(roundIds))}>Phân công {roundIds.length} vòng</Button></div><ScreeningError error={command.error} /></details>}
        <div className="screening-columns" data-focused={Boolean(focused)}><div className="screening-paper-list">
          {!board.items.length && <p className="research-empty">Chưa có bài phù hợp với bộ lọc. Thêm bài trong Thư viện hoặc đổi bộ lọc để bắt đầu.</p>}
          {board.items.map(p => <article key={p.paperId} className="screening-paper" data-selected={focused?.paperId === p.paperId}>
            {board.canManage && !readOnly && <input type="checkbox" aria-label={`Chọn bài ${p.title}`} checked={selected.includes(p.paperId)} onChange={e => setSelected(old => e.target.checked ? [...old, p.paperId] : old.filter(id => id !== p.paperId))} />}
            <button className="screening-paper-open" onClick={() => focus(p.paperId)}><strong>{p.title}</strong>{screeningMetadataWarning(p) && <span>Cần kiểm tra metadata</span>}<span>Đề xuất: {p.proposer?.name ?? "Không có thông tin lịch sử"} · {new Date(p.proposedAt).toLocaleDateString("vi-VN")}</span><ScreeningStatus status={p.round?.status ?? "NOT_REVIEWED"} />{p.round ? <><span>Người chốt: {p.round.finalizer.name}</span><span>{p.round.completed}/{p.round.assigned} phiếu · cần {p.round.settings.requiredReviewers} người</span><progress value={p.round.completed} max={Math.max(p.round.assigned, p.round.settings.requiredReviewers)} aria-label="Tiến độ bài" /></> : <span>{p.legacyProvenance ? `Phân loại lịch sử: ${legacyLabel(p.legacyStatus)} · chưa mở vòng mới` : "Chưa có phân công"}</span>}</button>
          </article>)}
          <ScreeningPager page={page} total={board.total} hasNext={board.hasNext} onPage={p => void change(() => { setPage(p); setSelected([]); })} />
        </div>{focused && <div><Button variant="ghost" size="sm" onClick={() => focus(null)}>Đóng chi tiết</Button><ScreeningPaperDetail key={focused.paperId} projectId={projectId} paper={focused} people={board.people} readOnly={readOnly} /></div>}</div>
        {assigning && <ScreeningAssignmentDialog projectId={projectId} board={board} roundIds={assigning} onClose={() => setAssigning(null)} />}
      </>}
    </>}
  </section>;
}
