import { useId, useState } from "react";
import { ArrowRight, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import type { ScreeningEvaluationStatus, ScreeningClaimNextResult } from "@trend/shared-types";
import { useResearchResource } from "../hooks/use-project-research";
import { screeningApi } from "../api/screening.api";
import { useScreeningCommand, ScreeningError } from "./screening-common";
import { WorkspaceLoading } from "./workspace-common";
import { ScreeningAdjudicationDialog } from "./screening-adjudication";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evaluationStatusLabels, myWorkTasks, personalEvaluations, groupPersonalEvaluations, workPaperFor, workPaperStatus, sectionForTask, type MyWorkTask } from "../my-work-model";
import { EvaluationMetadata, EvaluationSummary, EvaluationPaperCard, ScreeningTaskCard, WorkPaperCard } from "./screening-paper-card";
import { useScreeningClock } from "../hooks/use-screening-clock";

export function MyWorkView({ projectId, readOnly, onOpenPaper, onSwitchView }: {
  projectId: string; readOnly: boolean; canManage?: boolean;
  onOpenPaper: (paperId: string, context?: { roundId: string; section: string }) => void; onSwitchView: (view: string) => void; onAddPaper?: () => void;
}) {
  const summaryQuery = useResearchResource(projectId, ["screening-workspace-summary"], () => screeningApi.workspaceSummary(projectId), true, () => true, 30000);
  const summary = summaryQuery.data;
  const now = useScreeningClock(summary, summaryQuery.refetch);
  const command = useScreeningCommand(projectId);
  const id = useId();
  const [activeTab, setActiveTab] = useState<"TODO" | "REVIEWED" | "ACCEPTED">("TODO");
  const [statusFilter, setStatusFilter] = useState<ScreeningEvaluationStatus | "ALL">("ALL");
  const [taskFilter, setTaskFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [adjudication, setAdjudication] = useState<{ roundId: string; section: string } | null>(null);
  const handleClaimNext = async () => {
    try {
      let claimed: ScreeningClaimNextResult | undefined;
      const ok = await command.run({ action: "claim-next" }, async clientKey => {
        claimed = await screeningApi.claimNext(projectId, { clientKey });
        return claimed;
      });

      if (ok && claimed?.paperId && claimed.roundId) {
        toast.success("Đã nhận bài thành công! Giữ suất đánh giá trong 24 giờ.");
        onOpenPaper(claimed.paperId, { roundId: claimed.roundId, section: "review" });
      } else if (ok) {
        toast.info("Không có bài báo nào đủ điều kiện trong hàng đợi hiện tại.");
      } else {
        await summaryQuery.refetch();
        toast.error("Chưa thể nhận bài. Hàng đợi đã được cập nhật, bạn hãy thử lại.");
      }
    } catch {
      toast.error("Không thể nhận bài. Vui lòng thử lại.");
    }
  };

  if (summaryQuery.isLoading) return <WorkspaceLoading />;
  if (summaryQuery.isError) return <ScreeningError error={summaryQuery.error} retry={() => void summaryQuery.refetch()} />;
  if (!summary) return null;
  const tasks = myWorkTasks(summary, readOnly, now);
  const evaluations = groupPersonalEvaluations(personalEvaluations(summary));
  const q = searchQuery.trim().toLocaleLowerCase();
  const matches = (title: string) => !q || title.toLocaleLowerCase().includes(q);

  const isClarification = (task: MyWorkTask) => {
    const paper = workPaperFor(summary, task);
    return paper.classification === "NEEDS_CLARIFICATION" || paper.classification === "NEEDS_MORE_INFORMATION" || paper.status === "NEEDS_MORE_INFO" && !paper.caseStatus;
  };
  const todoCategories = [
    { value: "ALL", label: "Tất cả", match: () => true },
    { value: "STATEMENT", label: "Gửi quan điểm", match: (t: MyWorkTask) => t.kind === "STATEMENT" },
    { value: "REVIEW", label: "Chưa gửi phiếu", match: (t: MyWorkTask) => t.kind === "REVIEW" },
    { value: "CLARIFICATION", label: "Làm rõ đánh giá", match: (t: MyWorkTask) => t.kind === "DISCUSSION" && isClarification(t) },
    { value: "DISCUSSION", label: "Bất đồng", match: (t: MyWorkTask) => (t.kind === "DISCUSSION" || t.kind === "CONSENSUS") && !isClarification(t) },
    { value: "INFORMATION", label: "Cần bổ sung tài liệu", match: (t: MyWorkTask) => t.kind === "FULLTEXT" || t.kind === "INFORMATION" },
    { value: "ADJUDICATION", label: "Nhiệm vụ phân xử", match: (t: MyWorkTask) => t.kind === "ADJUDICATION" || t.kind === "COORDINATION" },
  ].map(cat => ({
    ...cat,
    count: cat.value === "ALL" ? tasks.length : tasks.filter(cat.match).length,
  }));

  const activeTodoCategory = todoCategories.find(c => c.value === taskFilter) ?? todoCategories[0]!;
  const filteredTasks = tasks.filter(t => matches(t.title) && activeTodoCategory.match(t));
  const filteredEvaluations = evaluations.filter(([e]) => matches(e!.title) && (statusFilter === "ALL" || e!.groupStatus === statusFilter));
  const acceptedPapers = summary.acceptedPapers ?? [];
  const filteredAccepted = acceptedPapers.filter(p => matches(p.title));
  const tabs = [{ value: "TODO", label: "Cần xử lý", count: tasks.length }, { value: "REVIEWED", label: "Đã đánh giá", count: evaluations.length }, { value: "ACCEPTED", label: "Bài được chấp nhận", count: acceptedPapers.length }] as const;
  return <div className="space-y-5 min-w-0">
    <div role="tablist" aria-label="Việc của tôi" className="flex gap-3 overflow-x-auto border-b border-border sm:gap-5">
      {tabs.map(tab => <button key={tab.value} type="button" role="tab" id={`${id}-${tab.value}`} aria-controls={`${id}-panel`} aria-selected={activeTab === tab.value} tabIndex={activeTab === tab.value ? 0 : -1}
        onClick={() => setActiveTab(tab.value)} onKeyDown={e => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const index = tabs.findIndex(t => t.value === tab.value);
          const next = tabs[e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]!.value;
          setActiveTab(next); document.getElementById(`${id}-${next}`)?.focus();
        }} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap border-b-2 py-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-2 sm:px-1 sm:text-sm ${activeTab === tab.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
        {tab.label}<span className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums font-semibold ${
          tab.value === "ACCEPTED" && tab.count > 0
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
            : tab.value === "TODO" && tab.count > 0
            ? "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300"
            : "bg-muted text-muted-foreground"
        }`}>{tab.count}</span>
      </button>)}
    </div>
    <div className="screening-my-work-toolbar">
      <p>{activeTab === "TODO" ? `${tasks.length} việc đang chờ bạn xử lý` : activeTab === "ACCEPTED" ? "Các bài được nhóm chấp nhận để phân tích." : "Phiếu của bạn và kết quả hiện tại của nhóm."}</p>
      <div className="screening-my-work-controls">
        {activeTab === "REVIEWED" && <select aria-label="Trạng thái kết quả nhóm" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="ALL">Tất cả trạng thái</option>{Object.entries(evaluationStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>}
        <div className="screening-my-work-search"><Search size={15} aria-hidden="true"  />
          <Input aria-label="Tìm bài báo" placeholder="Tìm theo tên bài báo…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-9 pl-9" />
        </div>
      </div>
    </div>
    {activeTab === "TODO" && (taskFilter !== "ALL" || todoCategories.filter(c => c.value !== "ALL" && c.count > 0).length > 1) && (
      <div className="screening-my-work-filters" role="group" aria-label="Lọc việc cần xử lý">
        {todoCategories.filter(c => c.value === "ALL" || c.count > 0 || c.value === taskFilter).map(cat => (
          <button key={cat.value} type="button" aria-pressed={taskFilter === cat.value} onClick={() => setTaskFilter(cat.value)}>
            {cat.label}<span>{cat.count}</span>
          </button>
        ))}
      </div>
    )}

    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${activeTab}`} className="min-w-0">
      {activeTab === "TODO" ? <section aria-label="Cần tôi giải quyết" className="space-y-3">
        {filteredTasks.map(task => <ScreeningTaskCard key={task.roundId} projectId={projectId} summary={summary} task={task} now={now} readOnly={readOnly}
          onOpen={() => ["STATEMENT", "ADJUDICATION", "COORDINATION"].includes(task.kind) ? setAdjudication({ roundId: task.roundId, section: sectionForTask(task) }) : onOpenPaper(task.paperId, { roundId: task.roundId, section: sectionForTask(task) })} />)}
        {filteredTasks.length === 0 && <div className="py-10 text-center">
          <FileText size={28} aria-hidden="true" className="mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{q || taskFilter !== "ALL" ? "Không tìm thấy bài phù hợp" : "Bạn không còn việc cần xử lý"}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{q || taskFilter !== "ALL" ? "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." : "Các phiếu đã gửi và tiến độ của nhóm nằm trong mục Đã đánh giá."}</p>
        </div>}
        {!readOnly && !q && <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
          <p className="text-muted-foreground">{summary.eligibleQueueCount > 0 ? `Có ${summary.eligibleQueueCount} bài báo đang chờ người đánh giá.` : "Hiện chưa có suất đánh giá phù hợp."}</p>
          {summary.eligibleQueueCount > 0 ? <Button size="sm" variant="outline" onClick={() => void handleClaimNext()} disabled={command.isPending}>Nhận bài tiếp theo</Button> : <Button size="sm" variant="outline" onClick={() => onSwitchView("library")}>Mở Thư viện</Button>}
        </div>}
      </section> : activeTab === "ACCEPTED" ? <section aria-label="Các bài được chấp nhận" className="space-y-3">
        {filteredAccepted.map(item => {
          const own = summary.myEvaluations?.find(e => e.roundId === item.roundId);
          const paper = workPaperFor(summary, { ...item, status: "INCLUDED", acceptedForAnalysis: true });
          const open = () => onOpenPaper(item.paperId, { roundId: item.roundId, section: "history" });
          return <WorkPaperCard key={item.paperId} paper={paper} status={workPaperStatus(paper, own)} onOpen={open}
            actions={<Button size="sm" variant="outline" onClick={open}>Xem bài báo<ArrowRight size={14} className="ml-2" /></Button>}>
            {own ? <EvaluationSummary item={own} paper={paper} /> : item.resolverName && <p className="text-xs text-muted-foreground">Người phân xử: {item.resolverName}</p>}
            <p className="text-xs text-muted-foreground">Nhóm chấp nhận bài ngày {new Date(item.acceptedAt).toLocaleDateString("vi-VN")}</p>
          </WorkPaperCard>;
        })}
        {!filteredAccepted.length && <div className="py-10 text-center"><FileText size={28} aria-hidden="true" className="mx-auto mb-3 text-muted-foreground" /><h3 className="text-sm font-semibold">{q ? "Không tìm thấy bài phù hợp" : "Chưa có bài được chấp nhận"}</h3><p className="mt-1 text-sm text-muted-foreground">{q ? "Thử tìm bằng từ khóa khác." : "Bài sẽ xuất hiện khi hai reviewer cùng chọn Phù hợp hoặc có kết luận phân xử chấp nhận."}</p></div>}
      </section> : <section aria-label="Các bài đã đánh giá" className="space-y-3">
        {filteredEvaluations.map(([item, ...history]) => <EvaluationPaperCard key={item!.paperId} summary={summary} item={item!} onOpen={() => onOpenPaper(item!.paperId, { roundId: item!.roundId, section: "history" })}>
          {history.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Các vòng đã đánh giá trước ({history.length})</summary><div className="space-y-3 pt-3">{history.map(e => <div key={e.roundId} className="space-y-2"><EvaluationMetadata item={e} /><EvaluationSummary item={e} paper={workPaperFor(summary, e)} /><Button size="sm" variant="link" onClick={() => onOpenPaper(e.paperId, { roundId: e.roundId, section: "history" })}>Xem vòng này</Button></div>)}</div></details>}
        </EvaluationPaperCard>)}
        {filteredEvaluations.length === 0 && <div className="py-10 text-center"><FileText size={28} aria-hidden="true" className="mx-auto mb-3 text-muted-foreground" /><h3 className="text-sm font-semibold">{evaluations.length ? "Không tìm thấy bài phù hợp" : "Bạn chưa gửi phiếu đánh giá nào"}</h3><p className="mt-1 text-sm text-muted-foreground">{evaluations.length ? "Thử thay đổi bộ lọc hoặc từ khóa." : "Sau khi gửi phiếu, bạn có thể xem lại đánh giá và theo dõi kết quả tại đây."}</p></div>}
      </section>}
    </div>
    {adjudication && <ScreeningAdjudicationDialog projectId={projectId} roundId={adjudication.roundId} focusSection={adjudication.section} open onClose={() => { setAdjudication(null); void summaryQuery.refetch(); }} />}
  </div>;
}
