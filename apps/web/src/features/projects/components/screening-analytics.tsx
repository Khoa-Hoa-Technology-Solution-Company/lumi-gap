import { BarChart3, CheckCircle2, AlertTriangle, Users, BookOpen, Scale, Info } from "lucide-react";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { ScreeningError, stateLabels } from "./screening-common";
import { WorkspaceLoading } from "./workspace-common";
import { Badge } from "@/components/ui/badge";

const percent = (n: number | null) => n === null ? "Chưa có dữ liệu" : `${n.toFixed(1)}%`;
const kappaReasons = {
  NO_PAIRS: "Chưa có cặp phiếu độc lập hoàn chỉnh.",
  MULTI_RATER: "Cohen’s Kappa không áp dụng khi có hơn hai người đánh giá.",
  INCONSISTENT_PAIRS: "Các bài không dùng cùng một cặp người đánh giá; không gộp các cặp khác nhau.",
  DEGENERATE: "Phân bố phiếu làm mẫu số bằng 0, Kappa không xác định.",
  OK: "Tính trên cùng một cặp người đánh giá độc lập."
};

export function ScreeningAnalytics({ projectId }: { projectId: string }) {
  const query = useResearchResource(projectId, ["screening-analytics"], () => screeningApi.analytics(projectId));
  if (query.isLoading) return <WorkspaceLoading />;
  if (query.isError) return <ScreeningError error={query.error} retry={() => void query.refetch()} />;
  const m = query.data;
  if (!m) return null;

  return (
    <section className="screening-analytics space-y-6" data-no-i18n>
      {/* Overview Header Banner */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-1">
              <BarChart3 size={15} />
              <span>Chỉ số sàng lọc học thuật</span>
            </div>
            <h3 className="text-xl font-bold tracking-tight text-foreground">Thống kê tiến độ & Độ tin cậy</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Tổng hợp tiến độ đánh giá, mức độ đồng thuận giữa các reviewer và chỉ số Cohen’s Kappa.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              {m.evaluatedPapers} / {m.totalPapers} bài đã bắt đầu
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              {m.finalizedPapers} bài đã chốt quyết định
            </span>
          </div>
        </div>

        {/* 4 Key Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {/* 1. Completion Rate */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Hoàn thành phiếu</span>
              <CheckCircle2 size={15} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {percent(m.completionRate)}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {m.submittedReviews}/{m.assignedReviews} phiếu đã gửi · {m.pendingReviews} đang chờ
            </p>
          </div>

          {/* 2. Agreement Rate */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Tỷ lệ đồng thuận</span>
              <Users size={15} className="text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {percent(m.agreementRate)}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {m.agreements}/{m.fullyReviewed} bài đủ phiếu độc lập
            </p>
          </div>

          {/* 3. Conflict Rate */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Cần thống nhất</span>
              <AlertTriangle size={15} className="text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {percent(m.conflictRate)}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {m.unresolved} chưa xử lý · {m.resolved} đã phân xử
            </p>
          </div>

          {/* 4. Cohen's Kappa */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span>Cohen’s Kappa (κ)</span>
              <Scale size={15} className="text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {m.kappa.value === null ? "Chưa đủ dữ liệu" : m.kappa.value.toFixed(3)}
            </div>
            <p className="text-xs text-muted-foreground leading-snug truncate" title={kappaReasons[m.kappa.reason]}>
              {kappaReasons[m.kappa.reason]}
            </p>
          </div>
        </div>
      </div>

      {m.publishedSelection && <section className="min-w-0 space-y-3 rounded-lg border p-4" aria-label="Kết quả sàng lọc đã công bố">
        <h4 className="font-semibold">Kết quả đã công bố</h4>
        <p className="text-sm text-muted-foreground">Mỗi bài tính một lần theo giai đoạn quyết định hiện hành. {m.rescreeningPapers ?? 0} bài đang đánh giá lại vẫn giữ kết quả trước đến khi vòng mới chốt.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Giai đoạn</th><th className="p-2">Đã chọn</th><th className="p-2">Loại theo tiêu chí</th><th className="p-2">Không đạt đồng thuận</th></tr></thead><tbody>{(["TITLE_ABSTRACT", "FULL_TEXT"] as const).map(phase => <tr key={phase} className="border-t"><th className="p-2 font-normal">{phase === "FULL_TEXT" ? "Toàn văn" : "Tiêu đề và tóm tắt"}</th><td className="p-2">{m.publishedSelection![phase].included}</td><td className="p-2">{m.publishedSelection![phase].excludedByCriteria}</td><td className="p-2">{m.publishedSelection![phase].closedUnresolved}</td></tr>)}</tbody></table></div>
        <p className="text-xs text-muted-foreground">Không đạt đồng thuận là chính sách xử lý của nhóm, cần trình bày riêng khi báo cáo quy trình lựa chọn nghiên cứu.</p>
      </section>}
      {/* Grid: Distribution & Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Status Distribution */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-primary" />
            <h4 className="text-base font-bold text-foreground">Phân bố trạng thái đánh giá</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {Object.entries(m.distribution).map(([key, value]) => (
              <div key={key} className="p-3 rounded-lg border border-border/60 bg-muted/20 flex flex-col justify-between">
                <span className="text-xs text-muted-foreground font-medium truncate" title={stateLabels[key as keyof typeof stateLabels]}>
                  {stateLabels[key as keyof typeof stateLabels] || key}
                </span>
                <span className="text-lg font-bold text-foreground mt-1">{value} bài</span>
              </div>
            ))}
          </div>
          {m.legacyPapers > 0 && (
            <p className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg">
              Có {m.legacyPapers} bài mang phân loại lịch sử chưa qua quy trình sàng lọc độc lập mới.
            </p>
          )}
        </div>

        {/* Workload by Reviewer */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <h4 className="text-base font-bold text-foreground">Khối lượng đánh giá theo thành viên</h4>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Thành viên</th>
                  <th className="py-2.5 px-3 text-center">Phân công</th>
                  <th className="py-2.5 px-3 text-center">Đã gửi</th>
                  <th className="py-2.5 px-3 text-center">Quá hạn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {m.workload.map(w => (
                  <tr key={w.reviewerId} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-foreground">{w.name}</td>
                    <td className="py-2.5 px-3 text-center text-muted-foreground">{w.assigned}</td>
                    <td className="py-2.5 px-3 text-center font-semibold text-emerald-600">{w.completed}</td>
                    <td className="py-2.5 px-3 text-center">
                      {w.overdue > 0 ? (
                        <span className="text-destructive font-bold">{w.overdue}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PRISMA Summary & Re-screening Integrity Notice */}
      {m.prismaSummary && (
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-base font-bold text-foreground">Tổng hợp PRISMA theo kết quả hiệu lực</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mỗi bài báo chỉ được tính 1 lần theo kết quả đã chốt gần nhất, không đếm trùng qua nhiều vòng đánh giá lại.
              </p>
            </div>
            {(m.rescreeningPapers ?? m.prismaSummary.rescreeningInProgress) > 0 && (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs">
                {m.rescreeningPapers ?? m.prismaSummary.rescreeningInProgress} bài đang đánh giá lại
              </Badge>
            )}
          </div>

          {(m.rescreeningPapers ?? m.prismaSummary.rescreeningInProgress) > 0 && (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <p className="leading-relaxed">
                Hiện có <strong>{m.rescreeningPapers ?? m.prismaSummary.rescreeningInProgress} bài báo</strong> đang trong vòng đánh giá lại chưa hoàn tất. Số liệu bên dưới vẫn giữ kết quả đã chốt trước đó cho đến khi cả hai reviewer hoàn tất vòng mới.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl border border-border/70 bg-muted/20">
              <div className="text-xs text-muted-foreground">Nhận diện (Identified)</div>
              <div className="text-xl font-bold text-foreground mt-1">{m.prismaSummary.identified}</div>
            </div>
            <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Đã chọn (Included)</div>
              <div className="text-xl font-bold text-foreground mt-1">{m.prismaSummary.included}</div>
            </div>
            <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/5">
              <div className="text-xs text-rose-700 dark:text-rose-400 font-medium">Đã loại theo tiêu chí</div>
              <div className="text-xl font-bold text-foreground mt-1">{m.prismaSummary.excluded}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Tóm tắt: {m.prismaSummary.excludedByStage.TITLE_ABSTRACT.count} · Toàn văn: {m.prismaSummary.excludedByStage.FULL_TEXT.count}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div className="text-xs text-amber-800 dark:text-amber-300 font-medium">Không đạt đồng thuận</div>
              <div className="text-xl font-bold text-foreground mt-1">{m.prismaSummary.closedUnresolved}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Tách biệt với Loại theo tiêu chí</div>
            </div>
            <div className="p-3 rounded-xl border border-border/70 bg-muted/20">
              <div className="text-xs text-muted-foreground">Đang xử lý / Chưa chốt</div>
              <div className="text-xl font-bold text-foreground mt-1">{m.prismaSummary.pending}</div>
            </div>
          </div>
        </div>
      )}

      {/* Exclusion Reasons */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-3">
        <h4 className="text-base font-bold text-foreground">Lý do loại trong các vòng đủ phiếu độc lập</h4>
        {m.exclusionReasons.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {m.exclusionReasons.map(r => (
              <Badge key={r.reason} variant="outline" className="py-1 px-3 text-xs gap-1.5 border-border/80 bg-muted/20">
                <span className="font-semibold text-foreground">{r.reason}:</span>
                <span className="text-primary font-bold">{r.count} phiếu</span>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Chưa có lý do loại nào được ghi nhận trong các vòng đã hoàn thành.</p>
        )}
      </div>

      {/* Scientific Notes Collapsible */}
      <details className="rounded-xl border border-border/70 bg-muted/10 p-4 text-xs text-muted-foreground space-y-2">
        <summary className="font-semibold text-foreground cursor-pointer flex items-center gap-1.5">
          <Info size={13} className="text-primary" />
          <span>Ghi chú phương pháp tính & Chuẩn khoa học</span>
        </summary>
        <p className="mt-2 leading-relaxed">
          Tỷ lệ đồng thuận chỉ tính trên các vòng đã công bố và có đủ phiếu đánh giá độc lập. Không thể hiện chất lượng hay số lượng bài phù hợp.
        </p>
        <p className="leading-relaxed font-mono text-[11px]">
          Cohen’s Kappa: κ = (Po − Pe) / (1 − Pe), trong đó Po là mức đồng thuận quan sát và Pe là mức đồng thuận kỳ vọng ngẫu nhiên.
        </p>
      </details>
    </section>
  );
}
