import { useId } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { groupPersonalEvaluations, matchesEvaluationHistory, myWorkTasks, personalEvaluations, screeningTaskGroup, screeningWorkLink, sectionForTask, workPaperFor, type EvaluationHistoryFilter, type MyWorkTask } from "../my-work-model";
import { EvaluationMetadata, EvaluationSummary, EvaluationPaperCard, ScreeningTaskCard } from "./screening-paper-card";
import { useScreeningClock } from "../hooks/use-screening-clock";
import { ScreeningError } from "./screening-common";
import { ScreeningAdjudicationDialog } from "./screening-adjudication";
import { canLeaveWorkspace, WorkspaceLoading } from "./workspace-common";
import "../project-research.css";

const groups = [
  { key: "REVIEW", title: "Đang đánh giá", empty: "Bạn không giữ bài nào chưa gửi phiếu." },
  { key: "RESOLUTION", title: "Cần giải quyết", empty: "Không có bất đồng hoặc ý kiến đang chờ bạn." },
  { key: "ADJUDICATION", title: "Cần tôi phân xử", empty: "Bạn chưa có hồ sơ phân xử cần kết luận." },
] as const;

/** A projection of screening work, never manually created ProjectTask records. */
export function ScreeningTasksPanel({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const id = useId();
  const query = useResearchResource(projectId, ["screening-workspace-summary"], () => screeningApi.workspaceSummary(projectId), true, () => true, 15000);
  const now = useScreeningClock(query.data, query.refetch);
  const reviewed = params.get("screeningTab") === "reviewed";
  const rawFilter = params.get("screeningHistory");
  const filter: EvaluationHistoryFilter = rawFilter === "PENDING" || rawFilter === "DECIDED" ? rawFilter : "ALL";
  const change = async (values: Record<string, string | null>) => {
    if (!await canLeaveWorkspace()) return;
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) { if (value === null) next.delete(key); else next.set(key, value); }
    setParams(next);
  };
  const tasks = query.data ? myWorkTasks(query.data, readOnly, now) : [];
  const evaluations = query.data ? groupPersonalEvaluations(personalEvaluations(query.data)) : [];
  const selectedRound = params.get("screeningRound");
  const focusSection = params.get("screeningSection") ?? undefined;
  const tabs = [{ key: "pending", label: "Cần xử lý", count: tasks.length }, { key: "reviewed", label: "Đã đánh giá", count: evaluations.length }];
  const taskLink = (task: MyWorkTask) => screeningWorkLink(projectId, task, sectionForTask(task));
  return <section className="min-w-0 space-y-5" aria-label="Đánh giá tài liệu" data-no-i18n>
    <div role="tablist" aria-label="Công việc đánh giá tài liệu" className="flex gap-5 border-b">
      {tabs.map((tab, index) => <button type="button" role="tab" key={tab.key} id={`${id}-${tab.key}`} aria-controls={`${id}-panel`} aria-selected={reviewed === (index === 1)} tabIndex={reviewed === (index === 1) ? 0 : -1}
        onClick={() => void change({ screeningTab: tab.key })}
        onKeyDown={e => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return; e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? 1 : 1 - index; void change({ screeningTab: tabs[next]!.key }).then(() => document.getElementById(`${id}-${tabs[next]!.key}`)?.focus()); }}
        className={`flex items-center gap-2 border-b-2 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${reviewed === (index === 1) ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
        {tab.label}{query.data && <span className="text-xs tabular-nums text-muted-foreground">{tab.count}</span>}
      </button>)}
    </div>
    {query.isLoading ? <WorkspaceLoading /> : query.isError ? <ScreeningError error={query.error} retry={() => void query.refetch()} /> : query.data && <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${reviewed ? "reviewed" : "pending"}`}>
      {!reviewed ? <div className="space-y-7">
        {groups.map(group => {
          const items = tasks.filter(task => screeningTaskGroup(task) === group.key);
          return <section aria-label={group.title} key={group.key}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">{group.title}<span className="text-xs font-normal tabular-nums text-muted-foreground">{items.length}</span></h3>
            {items.length ? <ul className="space-y-3">{items.map(task => <li key={task.roundId} className="min-w-0">
              <ScreeningTaskCard projectId={projectId} summary={query.data!} task={task} now={now} readOnly={readOnly} href={taskLink(task)} onOpen={() => navigate(taskLink(task))} />
            </li>)}</ul> : <p className="py-2 text-sm text-muted-foreground">{group.empty}</p>}
          </section>;
        })}
        {!tasks.length && <p role="status" className="text-sm text-muted-foreground">Bạn đã hoàn thành phần việc hiện tại. Theo dõi bài đã gửi phiếu trong Đã đánh giá.</p>}
        <Link className="inline-block text-sm text-primary underline underline-offset-4" to={`/projects/${encodeURIComponent(projectId)}?tab=papers&view=queue`}>Mở Hàng đợi đánh giá</Link>
      </div> : <div className="space-y-4">
        <label className="flex flex-wrap items-center gap-2 text-sm">Kết quả của nhóm
          <select aria-label="Lọc lịch sử đánh giá" className="rounded-md border bg-background px-3 py-2" value={filter} onChange={e => void change({ screeningHistory: e.target.value })}>
            <option value="ALL">Toàn bộ lịch sử</option><option value="PENDING">Chưa có kết quả</option><option value="DECIDED">Đã có kết quả</option>
          </select>
        </label>
        {evaluations.filter(([latest]) => latest && matchesEvaluationHistory(latest, filter)).map(([latest, ...history]) => {
          const item = latest!;
          const href = screeningWorkLink(projectId, item, "history");
          return <EvaluationPaperCard key={item.paperId} summary={query.data!} item={item} href={href} onOpen={() => void canLeaveWorkspace().then(ok => { if (ok) navigate(href); })}
            actions={<><Button size="sm" variant="outline" asChild><Link to={href}>Xem bài và kết quả<ArrowRight size={13} className="ml-2" aria-hidden="true" /></Link></Button>{item.isAdjudicated || item.groupStatus === "ADJUDICATING" ? <Button size="sm" variant="ghost" asChild><Link to={screeningWorkLink(projectId, item, "decision")}>Hồ sơ phân xử</Link></Button> : null}</>}>
            {history.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Các vòng trước ({history.length})</summary><div className="space-y-4 pt-3">{history.map(previous => <div key={previous.roundId} className="space-y-2"><EvaluationMetadata item={previous} /><EvaluationSummary item={previous} paper={workPaperFor(query.data!, previous)} /><Link className="text-primary underline" to={screeningWorkLink(projectId, previous, "history")}>Xem vòng này</Link></div>)}</div></details>}
          </EvaluationPaperCard>;
        })}
        {!evaluations.some(([latest]) => latest && matchesEvaluationHistory(latest, filter)) && <p role="status" className="py-6 text-sm text-muted-foreground">{evaluations.length ? "Không có bài phù hợp với bộ lọc này." : "Chưa có phiếu đã gửi. Bài bạn đánh giá sẽ xuất hiện ở đây cùng kết quả của nhóm."}</p>}
      </div>}
    </div>}
    {selectedRound && <ScreeningAdjudicationDialog key={selectedRound} projectId={projectId} roundId={selectedRound} focusSection={focusSection} open onClose={() => void change({ screeningRound: null, screeningPaper: null, screeningSection: null })} />}
  </section>;
}
