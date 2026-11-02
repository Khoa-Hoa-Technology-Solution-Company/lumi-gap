import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ScreeningPaperRow } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { WorkspaceLoading, canLeaveWorkspace } from "./workspace-common";
import { ScreeningError, ScreeningPager, ScreeningStatus, screeningProgressLabel, useScreeningCommand } from "./screening-common";
import { ScreeningSettingsForm } from "./screening-management";
import { ScreeningAnalytics } from "./screening-analytics";
import "../screening.css";

/** Protocol and oversight only. Personal reviews use the shared paper reading workspace. */
export function ScreeningWorkspace({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1), [showAnalytics, setShowAnalytics] = useState(false);
  const data = useResearchResource(projectId, ["screening-oversight", page], () => screeningApi.board(projectId, { page, pageSize: 20 }), true, () => !readOnly, 15000);
  const board = data.data;
  const openPaper = async (paperId: string) => {
    if (!await canLeaveWorkspace()) return;
    const next = new URLSearchParams(params); next.set("view", "library"); next.set("source", paperId); next.delete("paper"); setParams(next);
  };
  return <section className="screening-workspace" data-no-i18n>
    <header className="research-heading"><div><h2>Quy trình đánh giá</h2><p>Quy tắc áp dụng cho từng giai đoạn, tiến độ và các trường hợp cần xử lý.</p></div></header>
    {data.isError && <ScreeningError error={data.error} retry={() => void data.refetch()} />}
    {data.isLoading ? <WorkspaceLoading /> : board && <>
      <section aria-label="Quy tắc hiện tại" className="space-y-2 mb-6">
        <h3 className="font-semibold">{board.settings.reviewMode === "INDEPENDENT" ? "Hai đánh giá độc lập mỗi giai đoạn" : board.settings.reviewMode === "SIMPLE" ? "Ngoại lệ đã cấu hình: một người đánh giá" : "Quy trình cộng tác lịch sử"}</h3>
        <p>Nhận bài là giữ chỗ, chưa phải gửi phiếu. Hai chỗ đã có người nhận thì bài rời hàng đợi, vẫn có trong Thư viện.</p>
        <p>Giữ chỗ 24 giờ, gia hạn thủ công thêm 24 giờ khi còn hạn. Phân công cũ không có hạn được giữ nguyên. Hiện chưa giới hạn số bài mỗi người; toàn văn vẫn theo chính sách 24 giờ hiện có.</p>
        <p>Phiếu được ẩn đến khi đủ người gửi. Hai phiếu thống nhất tự áp dụng kết quả của giai đoạn. Khi bất đồng, hai reviewer trao đổi và tự sửa phiếu có lưu lịch sử; nếu vẫn chưa thống nhất, một người có thể mở hồ sơ mời phân xử độc lập.</p>
        <p>Qua vòng tóm tắt chưa đồng nghĩa được chọn toàn văn nếu quy trình còn giai đoạn toàn văn.</p>
      </section>
      <div className="screening-progress" aria-label="Tiến độ đánh giá dự án">
        <label>Có ít nhất một phiếu đã gửi: {board.progress.reviewed}/{board.progress.total}<progress value={board.progress.reviewed} max={Math.max(1, board.progress.total)} /></label>
        <label>Đã có kết quả giai đoạn hiện tại: {board.progress.finalized}/{board.progress.total}<progress value={board.progress.finalized} max={Math.max(1, board.progress.total)} /></label>
      </div>
      {board.progress.legacy > 0 && <p role="status">{board.progress.legacy} bài có dữ liệu lịch sử cần đối chiếu, chưa được coi là kết quả mới.</p>}
      {board.canManage && !readOnly && <details className="screening-settings"><summary>Cấu hình cho vòng mới · v{board.settings.version}</summary><ScreeningSettingsForm projectId={projectId} settings={board.settings} adjudicatorOptions={board.adjudicatorOptions} /></details>}
      <details className="mt-4" onToggle={e => setShowAnalytics(e.currentTarget.open)}><summary>Thống kê độ đồng ý</summary>{showAnalytics && <ScreeningAnalytics projectId={projectId} />}</details>
      <section className="mt-6" aria-label="Theo dõi các giai đoạn">
        <h3 className="font-semibold mb-3">Theo dõi bài báo</h3>
        {!board.items.length && <p>Chưa có bài trong dự án.</p>}
        {board.items.map(p => <article key={p.paperId} className="screening-paper flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1"><strong>{p.title}</strong>
            {p.round ? <><p>{p.round.phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề và tóm tắt"} · {screeningProgressLabel(p.round)}</p><ScreeningStatus status={p.round.status} round={p.round} />{p.round.finalizerAssigned && <p>Người phân xử: {p.round.finalizer.name}</p>}</> : <p>{p.legacyProvenance ? "Phân loại lịch sử, chưa có vòng hiện tại" : "Chưa bắt đầu"}</p>}
            {p.round?.legacyOutcome && <p>Kết quả lịch sử theo quy tắc của vòng cũ.</p>}
            {p.round?.legacyNeedsAudit && <LegacyScreeningRepair projectId={projectId} paper={p} phase={board.settings.stages?.[0] ?? "TITLE_ABSTRACT"} canManage={board.canManage && !readOnly} />}
          </div>
          <Button size="sm" variant="outline" onClick={() => void openPaper(p.paperId)}>Mở bài trong Thư viện</Button>
        </article>)}
        <ScreeningPager page={page} total={board.total} hasNext={board.hasNext} onPage={setPage} />
      </section>
    </>}
  </section>;
}

function LegacyScreeningRepair({ projectId, paper, phase, canManage }: { projectId: string; paper: ScreeningPaperRow; phase: "TITLE_ABSTRACT" | "FULL_TEXT"; canManage: boolean }) {
  const [confirmed, setConfirmed] = useState(false), command = useScreeningCommand(projectId);
  return <div className="space-y-2 mt-2"><p role="status">Cần rà soát dữ liệu cũ. Phân công và phiếu cũ được giữ; vòng này không nhận thêm phiếu.</p>
    {canManage && <><label className="screening-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Tạo vòng mới với quy tắc hiện tại, giữ nguyên lịch sử cũ.</label><Button size="sm" variant="outline" disabled={!confirmed || command.isPending} onClick={() => void command.run({ paperId: paper.paperId, phase, action: "legacy-reopen" }, clientKey => screeningApi.start(projectId, { paperIds: [paper.paperId], phase, confirmRescreen: true, clientKey }))}>Mở vòng mới đã xác nhận</Button><ScreeningError error={command.error} /></>}
  </div>;
}
