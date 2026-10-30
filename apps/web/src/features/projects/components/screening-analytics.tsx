import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { ScreeningError, stateLabels } from "./screening-common";
import { WorkspaceLoading } from "./workspace-common";
const percent = (n: number | null) => n === null ? "Chưa có dữ liệu" : `${n.toFixed(1)}%`;
const kappaReasons = { NO_PAIRS: "Chưa có cặp phiếu độc lập hoàn chỉnh.", MULTI_RATER: "Cohen’s Kappa không áp dụng khi có hơn hai người đánh giá.", INCONSISTENT_PAIRS: "Các bài không dùng cùng một cặp người đánh giá; không gộp các cặp khác nhau.", DEGENERATE: "Phân bố phiếu làm mẫu số bằng 0, Kappa không xác định.", OK: "Tính trên cùng một cặp người đánh giá; Chưa chắc chắn là nhóm quyết định thứ ba." };
export function ScreeningAnalytics({ projectId }: { projectId: string }) {
  const query = useResearchResource(projectId, ["screening-analytics"], () => screeningApi.analytics(projectId));
  if (query.isLoading) return <WorkspaceLoading />;
  if (query.isError) return <ScreeningError error={query.error} retry={() => void query.refetch()} />;
  const m = query.data; if (!m) return null;
  return <section className="screening-analytics"><h3>Thống kê đánh giá</h3><p>{m.evaluatedPapers}/{m.totalPapers} bài đã bắt đầu vòng · {m.fullyParticipated} bài đủ tất cả phiếu. {m.reviewedPapers} bài đã có đánh giá · {m.finalizedPapers} bài đã có quyết định cuối.</p><dl className="screening-metrics"><div><dt>Hoàn thành phiếu</dt><dd>{percent(m.completionRate)}</dd><small>{m.submittedReviews}/{m.assignedReviews} phiếu · {m.pendingReviews} đang chờ</small></div><div><dt>Đồng ý cùng một lựa chọn</dt><dd>{percent(m.agreementRate)}</dd><small>{m.agreements}/{m.fullyReviewed} bài đủ phiếu độc lập</small></div><div><dt>Cần thống nhất theo quy tắc</dt><dd>{percent(m.conflictRate)}</dd><small>{m.unresolved} chưa xử lý · {m.resolved} đã phân xử</small></div><div><dt>Cohen’s Kappa</dt><dd>{m.kappa.value === null ? "Không đủ dữ liệu" : m.kappa.value.toFixed(3)}</dd><small>{kappaReasons[m.kappa.reason]}</small></div></dl>
    <p>Tỷ lệ đồng ý chỉ dùng vòng đã công bố và đủ phiếu, không phải tỷ lệ bài phù hợp hay đánh giá chất lượng nghiên cứu. {m.excludedFromAgreement} vòng bị loại khỏi thống kê đồng ý do công bố sớm hoặc sửa phiếu sau công bố.</p>
    <p>κ = (Po − Pe) / (1 − Pe). Po là mức đồng ý quan sát; Pe là mức đồng ý kỳ vọng từ tỷ lệ lựa chọn của từng người.</p>
    <p>{m.legacyPapers} bài có phân loại lịch sử, chưa qua quy trình mới; chưa tính là đã gửi phiếu hoặc đã chốt.</p>
    <h4>Phân bố trạng thái đánh giá hiện tại</h4><ul className="screening-distribution">{Object.entries(m.distribution).map(([key, value]) => <li key={key}>{stateLabels[key as keyof typeof stateLabels]}: <strong>{value}</strong></li>)}</ul><p>Bài chưa mở vòng được tính là chưa xem xét. Phân loại lịch sử không được dùng tính Kappa.</p>
    <h4>Khối lượng theo thành viên</h4><div className="screening-table-wrap"><table><thead><tr><th>Thành viên</th><th>Phân công</th><th>Đã gửi</th><th>Quá hạn</th></tr></thead><tbody>{m.workload.map(w => <tr key={w.reviewerId}><td>{w.name}</td><td>{w.assigned}</td><td>{w.completed}</td><td>{w.overdue}</td></tr>)}</tbody></table></div>
    <h4>Lý do loại trong các vòng đủ phiếu độc lập</h4>{m.exclusionReasons.length ? <ul>{m.exclusionReasons.map(r => <li key={r.reason}>{r.reason}: {r.count} phiếu</li>)}</ul> : <p>Chưa có lý do loại được công bố.</p>}
  </section>;
}
