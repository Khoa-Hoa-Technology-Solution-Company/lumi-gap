import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { MoveWorkspaceTask, WorkspaceTask, WorkspaceTaskBoard, WorkspaceTaskPriority, WorkspaceTaskStatus } from "@trend/shared-types";
import { DragDropProvider, KeyboardSensor, PointerSensor, useDroppable } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { AlertCircle, CalendarDays, CheckCheck, CheckCircle2, Circle, CircleDashed, GripVertical, LayoutGrid, Link2, List, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
import { screeningApi } from "../api/screening.api";
import { useResearchResource } from "../hooks/use-project-research";
import { useScreeningClock } from "../hooks/use-screening-clock";
import { useAuthStore } from "@/stores/auth-store";
import { automaticWorkTask, automaticTaskStatuses, myWorkTasks, screeningWorkLink, sectionForTask, type MyWorkTask } from "../my-work-model";
import { ScreeningError } from "./screening-common";
import { ScreeningTeamTask, ScreeningTeamTaskDeadline, screeningTeamAction, withTaskReturn } from "./screening-team-task";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";
import { taskLabels, WorkspaceArtifactLink, WorkspaceEmpty, WorkspaceError, WorkspaceLoading, WorkspacePager, WorkspacePeoplePicker } from "./workspace-common";

import { calendarToday, taskPriorities, taskStatuses } from "./workspace-task-utils";
const icons = { TODO: CircleDashed, IN_PROGRESS: Circle, BLOCKED: AlertCircle, DONE: CheckCircle2 };
const taskSensors = [PointerSensor.configure({
  // Keep the handle for keyboard/touch access, and let pointer users grab the card.
  activatorElements: source => [source.element],
  preventActivation: (event, source) => {
    if (event.target instanceof Element && event.target.closest(".task-card-title")) return false;
    return PointerSensor.defaults.preventActivation?.(event, source) ?? false;
  },
}), KeyboardSensor];

export function TaskDueDate({ task }: { task: WorkspaceTask }) {
  const { t, language } = useI18n();
  if (task.status === "DONE") {
    if (task.completedAt) {
      return (
        <span className="task-due font-medium text-emerald-700 dark:text-emerald-300" title={new Date(task.completedAt).toLocaleString(language)}>
          <CheckCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
          <time dateTime={task.completedAt}>{new Intl.DateTimeFormat(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(task.completedAt))}</time>
        </span>
      );
    }
    return <span className="task-due"><CheckCheck size={13} />{t("Completed")}</span>;
  }
  if (!task.dueAt) return <span className="task-due">{t("No deadline")}</span>;
  const day = task.dueAt.slice(0, 10), today = calendarToday();
  const soon = day > today && Date.parse(day) - Date.parse(today) <= 3 * 86400000;
  return <span className="task-due" data-state={day < today ? "overdue" : day === today ? "today" : soon ? "soon" : undefined} title={t("Deadlines use the UTC calendar date.")}><CalendarDays size={13} /><time dateTime={day}>{day === today ? t("Due today") : new Intl.DateTimeFormat(language, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(day))}</time>{day < today && <span className="sr-only">{t("Overdue")}</span>}{soon && <span className="sr-only">{t("Due soon")}</span>}</span>;
}
function Person({ task }: { task: WorkspaceTask }) {
  const { t } = useI18n(); const name = task.assignee?.name ?? t("Unassigned");
  return <span className="task-person" title={name}><span className="task-avatar" aria-hidden="true" data-empty={!task.assignee}>{task.assignee ? name.trim().split(/\s+/).slice(-2).map(part => part[0]).join("").toLocaleUpperCase() : "–"}</span><span>{name}</span></span>;
}
export function TaskPriority({ priority }: { priority: WorkspaceTaskPriority }) {
  const { t } = useI18n(); return <span className="task-priority" data-priority={priority}><span aria-hidden="true">{priority === "URGENT" ? "!!" : priority === "HIGH" ? "↑" : priority === "LOW" ? "↓" : "="}</span>{t(taskPriorities[priority])}</span>;
}
type SelectTask = (id: string, status?: WorkspaceTaskStatus) => void;
export function TaskBoardView({ projectId, readOnly, onSelect, mode, onMode }: { projectId: string; readOnly: boolean; onSelect: SelectTask; mode: "board" | "list"; onMode: (mode: "board" | "list") => void }) {
  const [params, setParams] = useSearchParams(), location = useLocation();
  const [source, setSource] = useState(params.get("taskSource") ?? "ALL");
  const { t, language } = useI18n(); const [q, setQ] = useState(params.get("taskQ") ?? ""); const [draftQ, setDraftQ] = useState(q);
  const actorId = useAuthStore(state => state.user?.id);
  const screening = useResearchResource(projectId, ["screening-workspace-summary"], () => screeningApi.workspaceSummary(projectId), true, () => true, 15000);
  const now = useScreeningClock(screening.data, screening.refetch);
  const [mine, setMine] = useState(params.get("taskMine") === "1"), [unassigned, setUnassigned] = useState(params.get("taskUnassigned") === "1"), [overdue, setOverdue] = useState(params.get("taskOverdue") === "1");
  const [priority, setPriority] = useState(params.get("taskPriority") ?? ""), [status, setStatus] = useState(params.get("taskStatus") ?? ""), [milestone, setMilestone] = useState(params.get("taskMilestone") ?? "");
  const [assignee, setAssignee] = useState<string[]>(params.get("taskAssignee") ? [params.get("taskAssignee")!] : []), [sort, setSort] = useState(params.get("taskSort") ?? "manual"), [page, setPage] = useState(1);
  const [doneDays, setDoneDays] = useState<number | "all">(() => {
    const val = params.get("taskDoneDays");
    return val === "all" ? "all" : val && !isNaN(Number(val)) ? Number(val) : 14;
  });
  const [completedWindow, setCompletedWindow] = useState<string>(params.get("taskCompletedWindow") ?? "");
  const completedSince = completedWindow ? new Date(Date.now() - Number(completedWindow) * 86400000).toISOString() : undefined;

  useEffect(() => { setParams(previous => {
    const next = new URLSearchParams(previous);
    const values = { taskQ: q, taskSource: source === "ALL" ? "" : source, taskMine: mine ? "1" : "", taskUnassigned: unassigned ? "1" : "", taskOverdue: overdue ? "1" : "", taskPriority: priority, taskStatus: status, taskMilestone: milestone, taskAssignee: assignee[0] ?? "", taskSort: sort === "manual" ? "" : sort, taskDoneDays: doneDays === 14 ? "" : String(doneDays), taskCompletedWindow: completedWindow };
    for (const [key, value] of Object.entries(values)) value ? next.set(key, value) : next.delete(key);
    return next;
  }, { replace: true }); }, [q, source, mine, unassigned, overdue, priority, status, milestone, assignee, sort, doneDays, completedWindow, setParams]);
  const [pages, setPages] = useState([1, 1, 1, 1]);
  const resetPages = () => { setPage(1); setPages([1, 1, 1, 1]); };
  const query = { q, mine: mine ? "1" : undefined, unassigned: unassigned ? "1" : undefined, overdue: overdue ? "1" : undefined, assigneeId: assignee[0], priority: priority || undefined, milestoneId: milestone || undefined };
  const boardQuery = { ...query, sort: "manual", pageSize: 20, todoPage: pages[0], progressPage: pages[1], blockedPage: pages[2], donePage: pages[3] };
  const listQuery = { ...query, sort, status: status || undefined, page, completedSince };
  const board = useWorkspaceResource(projectId, "task-board", () => workspaceApi.taskBoard(projectId, boardQuery), boardQuery, mode === "board");
  const tasks = useWorkspaceResource(projectId, "tasks", () => workspaceApi.tasks(projectId, listQuery), listQuery, mode === "list" && source !== "SCREENING");
  const screeningListQuery = { page, pageSize: 20, status: status || undefined, sort, q: q || undefined, completedSince };
  const screeningPage = useResearchResource(projectId, ["screening-automatic-tasks-page", page, status, sort, q, completedSince], () => screeningApi.automaticTasksPage(projectId, screeningListQuery), mode === "list" && source !== "MANUAL", () => true, 15000);
  const [milestonePage, setMilestonePage] = useState(1);
  const milestones = useWorkspaceResource(projectId, "milestones", () => workspaceApi.milestones(projectId, milestonePage), milestonePage);
  const [optimistic, setOptimistic] = useState<WorkspaceTaskBoard | null>(null);
  const [blocked, setBlocked] = useState<{ task: WorkspaceTask; status: WorkspaceTaskStatus; beforeId: string | null } | null>(null), [reason, setReason] = useState("");
  const moveKey = useRef(crypto.randomUUID()); const busy = useRef(false);
  const move = useWorkspaceCommand(projectId, ({ taskId, data }: { taskId: string; data: MoveWorkspaceTask }) => workspaceApi.moveTask(projectId, taskId, data));
  const rawCurrent = optimistic ?? board.data;
  const current = source !== "SCREENING" || !rawCurrent ? rawCurrent : { ...rawCurrent, columns: Object.fromEntries(taskStatuses.map(key => [key, { ...rawCurrent.columns[key], items: [], total: 0, hasNext: false }])) as unknown as WorkspaceTaskBoard["columns"] };
  const manualRows = source === "SCREENING" ? [] : tasks.data?.items ?? [];
  const doMove = async (task: WorkspaceTask, nextStatus: WorkspaceTaskStatus, beforeId: string | null, blockedReason = task.blockedReason) => {
    if (!board.data || busy.current || readOnly) return;
    if (nextStatus === "BLOCKED" && !blockedReason.trim()) { setBlocked({ task, status: nextStatus, beforeId }); setReason(""); return; }
    busy.current = true;
    const next = structuredClone(board.data);
    next.columns[task.status].items = next.columns[task.status].items.filter(item => item.id !== task.id);
    const destination = next.columns[nextStatus]; const index = beforeId ? destination.items.findIndex(item => item.id === beforeId) : destination.items.length;
    destination.items.splice(index < 0 ? destination.items.length : index, 0, { ...task, status: nextStatus, blockedReason: nextStatus === "BLOCKED" ? blockedReason : "", completedAt: nextStatus === "DONE" ? (task.status === "DONE" && task.completedAt ? task.completedAt : new Date().toISOString()) : null });
    if (task.status !== nextStatus) { next.columns[task.status].total--; destination.total++; }
    setOptimistic(next);
    try { await move.mutateAsync({ taskId: task.id, data: { expectedVersion: task.version, expectedBoardVersion: board.data.boardVersion, status: nextStatus, beforeId, blockedReason, clientKey: moveKey.current } }); moveKey.current = crypto.randomUUID(); setBlocked(null); setReason(""); }
    catch { await board.refetch(); moveKey.current = crypto.randomUUID(); }
    finally { setOptimistic(null); busy.current = false; }
  };
  const filtered = Boolean(q || mine || unassigned || overdue || priority || milestone || assignee.length || status || source !== "ALL" || completedWindow);
  const automaticRows = screening.data?.automaticTasks;
  const screeningTasks = (source === "MANUAL" ? [] : automaticRows ? automaticRows.map(automaticWorkTask) : screening.data ? myWorkTasks(screening.data, readOnly, now) : []).filter(task => {
    if (unassigned || priority || milestone || assignee[0] && assignee[0] !== (task.obligation?.assigneeId ?? actorId) || mode === "list" && status && status !== (task.obligation?.status ?? "TODO")) return false;
    if (task.obligation && !task.obligation.endedAt && task.deadline && Date.parse(task.deadline) <= now) return false;
    if (overdue && (!task.deadline || new Date(task.deadline).getTime() >= now)) return false;
    if (completedSince && task.obligation?.endedAt && Date.parse(task.obligation.endedAt) < Date.parse(completedSince)) return false;
    return !q || `${task.title} ${task.label}`.toLocaleLowerCase().includes(q.toLocaleLowerCase());
  });
  const history = screeningTasks.filter(task => task.obligation && ["EXPIRED", "CANCELLED", "REPLACED"].includes(task.obligation.status));
  const boardTasks = screeningTasks.filter(task => !history.includes(task));
  const listScreeningRows = (source === "MANUAL" ? [] : screeningPage.data?.items ? screeningPage.data.items.map(automaticWorkTask) : boardTasks).filter(task => {
    if (unassigned || priority || milestone || assignee[0] && assignee[0] !== (task.obligation?.assigneeId ?? actorId) || (status && status !== (task.obligation?.status ?? "TODO"))) return false;
    if (task.obligation && !task.obligation.endedAt && task.deadline && Date.parse(task.deadline) <= now) return false;
    if (overdue && (!task.deadline || new Date(task.deadline).getTime() >= now)) return false;
    if (completedSince && task.obligation?.endedAt && Date.parse(task.obligation.endedAt) < Date.parse(completedSince)) return false;
    return !q || `${task.title} ${task.label}`.toLocaleLowerCase().includes(q.toLocaleLowerCase());
  });
  const manualTotal = source === "SCREENING" ? 0 : tasks.data?.total ?? 0;
  const screeningTotal = source === "MANUAL" ? 0 : screeningPage.data?.total ?? (screening.data?.automaticDoneTotal ?? boardTasks.length);
  const total = (mode === "board"
    ? (current ? taskStatuses.reduce((n, key) => n + current.columns[key].total, 0) : 0) + (status === "DONE" ? (screening.data?.automaticDoneTotal ?? boardTasks.length) : boardTasks.length)
    : manualTotal + screeningTotal);

  const handleViewAllCompleted = () => {
    setStatus("DONE");
    setSort("completed");
    setPage(1);
    onMode("list");
  };

  return <section className="research-task-workspace" aria-label={t("Team tasks")}>
    <div className="task-toolbar"><div className="task-view-switch" aria-label={t("Task views")}>{(["board", "list"] as const).map(value => { const Icon = value === "board" ? LayoutGrid : List; return <button type="button" key={value} aria-pressed={mode === value} onClick={() => onMode(value)}><Icon size={15} />{t(value === "board" ? "Board" : "List")}</button>; })}</div>
      <form className="task-search" onSubmit={event => { event.preventDefault(); setQ(draftQ.trim()); resetPages(); }}><Search size={16} aria-hidden="true" /><input type="search" aria-label={t("Search tasks")} placeholder={t("Search tasks…")} value={draftQ} maxLength={200} onChange={event => { setDraftQ(event.target.value); if (!event.target.value) { setQ(""); resetPages(); } }} /><button type="submit" aria-label={t("Search")}><span>↵</span></button></form>
      <span className="task-result-count" role="status">{t("{{count}} tasks", { count: total })}</span>
    </div>
    <div className="task-filter-bar"><button type="button" className="task-filter-chip" aria-pressed={mine} onClick={() => { setMine(!mine); setUnassigned(false); setAssignee([]); resetPages(); }}>{t("My tasks")}</button><button type="button" className="task-filter-chip" aria-pressed={unassigned} onClick={() => { setUnassigned(!unassigned); setMine(false); setAssignee([]); resetPages(); }}>{t("Unassigned")}</button><button type="button" className="task-filter-chip" aria-pressed={overdue} onClick={() => { setOverdue(!overdue); resetPages(); }}><CalendarDays size={13} />{t("Overdue")}</button>
      <details className="coord-filter-popover task-filters"><summary><SlidersHorizontal size={14} />{t("Filters")}{Boolean(priority || milestone || assignee.length || completedWindow) && <span className="task-active-dot" />}</summary><div className="task-filter-fields"><label>Nguồn công việc<select aria-label="Nguồn công việc" value={source} onChange={e => { setSource(e.target.value); resetPages(); }}><option value="ALL">Tất cả nguồn</option><option value="MANUAL">Task thủ công</option><option value="SCREENING">Paper Screening</option></select></label><label>{t("Completed time")}<select value={completedWindow} onChange={e => { setCompletedWindow(e.target.value); resetPages(); }}><option value="">{t("All time")}</option><option value="7">{t("Last 7 days")}</option><option value="14">{t("Last 14 days (default)")}</option><option value="30">{t("Last 30 days")}</option></select></label><label>{t("Priority")}<select value={priority} onChange={e => { setPriority(e.target.value); resetPages(); }}><option value="">{t("All priorities")}</option>{Object.entries(taskPriorities).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><WorkspacePeoplePicker projectId={projectId} value={assignee} onChange={ids => { setAssignee(ids); setMine(false); setUnassigned(false); resetPages(); }} /><label>{t("Milestone, optional")}<select value={milestone} onChange={e => { setMilestone(e.target.value); resetPages(); }}><option value="">{t("All milestones")}</option>{milestones.data?.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><WorkspacePager data={milestones.data} page={milestonePage} onPage={setMilestonePage} /></div></details>
      {mode === "list" && <><select aria-label={t("Task status")} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">{t("All statuses")}</option>{taskStatuses.map(value => <option key={value} value={value}>{t(taskLabels[value])}</option>)}</select><select aria-label={t("Sort tasks")} value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>{Object.entries({ manual: "Board order", completed: "Recently completed", completed_asc: "Oldest completed", due: "Deadline", priority: "Priority", title: "Title", updated: "Recently updated" }).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></>}
      {filtered && <button type="button" className="task-reset" onClick={() => { setQ(""); setDraftQ(""); setMine(false); setUnassigned(false); setOverdue(false); setPriority(""); setMilestone(""); setAssignee([]); setStatus(""); setSource("ALL"); setCompletedWindow(""); resetPages(); }}><X size={13} />{t("Reset")}</button>}
    </div>
    {move.error && !blocked && <WorkspaceError error={move.error} />}
    {screening.isError && <ScreeningError error={screening.error} retry={() => void screening.refetch()} />}
    <Dialog open={Boolean(blocked)} onOpenChange={open => { if (!open && !busy.current) setBlocked(null); }}><DialogContent closeLabel={t("Close")} data-no-i18n><DialogHeader><DialogTitle>{t("What is blocking this task?")}</DialogTitle><DialogDescription>{blocked?.task.title}</DialogDescription></DialogHeader>
      {blocked && <form className="task-blocker-dialog" onSubmit={e => { e.preventDefault(); if (reason.trim()) void doMove(blocked.task, blocked.status, blocked.beforeId, reason.trim()); }}><label className="sr-only" htmlFor="task-blocker-reason">{t("What is blocking this task?")}</label><textarea id="task-blocker-reason" className="project-form-textarea" autoFocus required rows={4} maxLength={2000} disabled={move.isPending} value={reason} onChange={e => setReason(e.target.value)} />{move.error && <WorkspaceError error={move.error} />}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={move.isPending} onClick={() => setBlocked(null)}>{t("Cancel")}</Button><Button type="submit" disabled={!reason.trim() || move.isPending}>{t(move.isPending ? "Saving…" : "Mark as blocked")}</Button></div></form>}
    </DialogContent></Dialog>
    {mode === "board" ? board.isLoading ? <WorkspaceLoading /> : board.isError || !current ? <WorkspaceError error={board.error} retry={() => void board.refetch()} /> : <>
      <DragDropProvider sensors={taskSensors} onDragOver={event => {
        const { source, target } = event.operation;
        // React owns transfers between column parents. Let dnd-kit preview only
        // reorders within a column so its DOM moves cannot race React removal.
        if (isSortable(source) && isSortable(target) && source.initialGroup !== target.group) event.preventDefault();
      }} onDragEnd={event => {
        if (event.canceled || !event.operation.source || !event.operation.target || busy.current) return;
        const source = event.operation.source, target = event.operation.target;
        const task = taskStatuses.flatMap(key => current.columns[key].items).find(item => item.id === String(source.id));
        if (!task || !isSortable(source)) return;
        const status = (target.type === "column" ? target.id : isSortable(target) ? target.group : source.group) as WorkspaceTaskStatus;
        if (!taskStatuses.includes(status)) return;
        const rows = current.columns[status].items.filter(item => item.id !== task.id);
        const index = source.group === status ? source.index : isSortable(target) ? target.index : rows.length;
        const beforeId = target.type === "column" ? null : rows[index]?.id ?? null;
        if (status === task.status && source.initialIndex === source.index && target.type !== "column") return;
        void doMove(task, status, beforeId);
      }}><div className="task-board" aria-label={t("Research Kanban board")} aria-busy={move.isPending}>
        {taskStatuses.map((status, i) => <TaskColumn key={status} status={status} column={current.columns[status]} readOnly={readOnly || move.isPending} onSelect={onSelect} onPage={next => setPages(old => old.map((value, index) => index === i ? next : value))} onMove={(task, status) => void doMove(task, status, null)}
          screeningTasks={boardTasks.filter(task => (task.obligation?.status ?? "TODO") === status)} screeningDoneTotal={status === "DONE" ? screening.data?.automaticDoneTotal : undefined} projectId={projectId} onViewAllCompleted={status === "DONE" ? handleViewAllCompleted : undefined} doneDays={doneDays} onDoneDaysChange={setDoneDays} />)}
      </div></DragDropProvider><p className="task-board-help"><GripVertical size={13} />{t("Drag cards between columns or use the status menu.")}</p>
    </> : (tasks.isLoading || screeningPage.isLoading) ? <WorkspaceLoading /> : tasks.isError ? <WorkspaceError error={tasks.error} retry={() => void tasks.refetch()} /> : screeningPage.isError ? <ScreeningError error={screeningPage.error} retry={() => void screeningPage.refetch()} /> : !manualRows.length && !listScreeningRows.length ? <WorkspaceEmpty title={t(filtered ? "No matching tasks" : "Plan the next research step")}><p>{t("Create a task for a concrete action, such as reading a paper or comparing research methods.")}</p>{!readOnly && <Button onClick={() => onSelect("new")}>{t("Create the first task")}</Button>}</WorkspaceEmpty> : <>
      {status === "DONE" && <div className="task-completed-history-banner"><div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /><span className="font-semibold text-sm">{t("Completed history")}</span><span className="text-xs text-muted-foreground font-medium">({total} {t("tasks")})</span></div><Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onMode("board")}><LayoutGrid size={13} className="mr-1.5" />{t("Back to Kanban board")}</Button></div>}
      <div className="coord-table-wrap task-list"><table className="coord-table"><thead><tr>{[status === "DONE" ? "Task" : "Task", "Assignee", "Status", status === "DONE" ? "Completed At" : "Priority", status === "DONE" ? "Priority" : "Deadline", "Milestones", "Linked research artifact"].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{listScreeningRows.map(task => <tr key={`screening:${task.obligation?.id ?? task.roundId}`} data-screening-round={task.roundId}>
      <td><Link className="task-list-title" to={withTaskReturn(screeningWorkLink(projectId, task, sectionForTask(task)), task, location.pathname + location.search)}>{task.title}</Link><small className="task-screening-kind">{task.label}</small></td>
      <td>Bạn</td><td><span className="task-status-label" data-status={task.obligation?.status ?? "TODO"}>{task.obligation ? automaticTaskStatuses[task.obligation.status] : t(taskLabels.TODO)}</span></td>
      {status === "DONE" ? <><td>{task.obligation?.endedAt ? <span className="task-due font-medium text-emerald-700 dark:text-emerald-300"><CheckCheck size={12} className="inline mr-1 text-emerald-600 dark:text-emerald-400" />{new Intl.DateTimeFormat(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(task.obligation.endedAt))}</span> : "–"}</td><td>–</td></> : <><td>–</td><td><ScreeningTeamTaskDeadline task={task} /></td></>}
      <td>–</td>
      <td><Link className="text-sm text-primary underline underline-offset-4" to={withTaskReturn(screeningWorkLink(projectId, task, sectionForTask(task)), task, location.pathname + location.search)}>{screeningTeamAction(task)}</Link></td>
    </tr>)}{manualRows.map(task => <tr key={task.id}><td><button className="task-list-title" type="button" onClick={() => onSelect(task.id)}>{task.title}</button>{task.status === "BLOCKED" && <small className="task-blocked-reason">{task.blockedReason}</small>}</td><td><Person task={task} /></td><td><span className="task-status-label" data-status={task.status}>{t(taskLabels[task.status])}</span></td>
      {status === "DONE" ? <><td>{task.completedAt ? <span className="task-due font-medium text-emerald-700 dark:text-emerald-300" title={new Date(task.completedAt).toLocaleString(language)}><CheckCheck size={12} className="inline mr-1 text-emerald-600 dark:text-emerald-400" />{new Intl.DateTimeFormat(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(task.completedAt))}</span> : "–"}</td><td><TaskPriority priority={task.priority} /></td></> : <><td><TaskPriority priority={task.priority} /></td><td><TaskDueDate task={task} /></td></>}
      <td>{milestones.data?.items.find(item => item.id === task.milestoneId)?.title ?? (task.milestoneId ? t("Milestone") : "–")}</td><td><WorkspaceArtifactLink projectId={projectId} link={task.link} /></td></tr>)}</tbody></table></div>
      <WorkspacePager
        data={source === "SCREENING" ? screeningPage.data : source === "MANUAL" ? tasks.data : { total, hasNext: Boolean(tasks.data?.hasNext || screeningPage.data?.hasNext) }}
        page={page}
        onPage={setPage}
      />
    </>}
    {history.length > 0 && <details className="coord-history-panel"><summary>Lịch sử Task tự động ({history.length})</summary><ul className="space-y-3 pt-3">{history.map(task => <li key={task.obligation!.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3 text-sm"><div className="min-w-0"><p className="font-medium break-words">{task.title}</p><p className="text-muted-foreground">{task.label} · {automaticTaskStatuses[task.obligation!.status]} · {task.description}</p></div><Link className="text-primary underline" to={withTaskReturn(screeningWorkLink(projectId, task, sectionForTask(task)), task, location.pathname + location.search)}>Xem trạng thái</Link></li>)}</ul></details>}
  </section>;
}
function TaskColumn({ status, column, readOnly, onSelect, onPage, onMove, screeningTasks, screeningDoneTotal, projectId, onViewAllCompleted, doneDays = 14, onDoneDaysChange }: {
  status: WorkspaceTaskStatus; column: WorkspaceTaskBoard["columns"][WorkspaceTaskStatus]; readOnly: boolean; onSelect: SelectTask; onPage: (page: number) => void; onMove: (task: WorkspaceTask, status: WorkspaceTaskStatus) => void; screeningTasks: MyWorkTask[]; screeningDoneTotal?: number; projectId: string; onViewAllCompleted?: () => void; doneDays?: number | "all"; onDoneDaysChange?: (days: number | "all") => void;
}) {
  const { t } = useI18n(); const Icon = icons[status];
  const { ref, isDropTarget } = useDroppable({ id: status, type: "column", accept: "task", disabled: readOnly, collisionPriority: 1 });
  const isDone = status === "DONE";
  const doneScreeningCount = isDone ? (screeningDoneTotal ?? screeningTasks.length) : screeningTasks.length;
  const totalCompleted = column.total + doneScreeningCount;

  type DoneCardItem =
    | { type: "screening"; task: MyWorkTask; time: number; id: string }
    | { type: "manual"; task: WorkspaceTask; time: number; index: number; id: string };

  let combinedDone: DoneCardItem[] = [];
  if (isDone) {
    const nowMs = Date.now();
    const windowMs = doneDays === "all" ? Infinity : (typeof doneDays === "number" ? doneDays : 14) * 86400000;
    const cutoffMs = doneDays === "all" ? 0 : nowMs - windowMs;

    // 1. Up to 5 most recent screening DONE tasks (ordered by endedAt desc, secondary by ID)
    const recentScreening = [...screeningTasks]
      .sort((a, b) => {
        const timeA = a.obligation?.endedAt ? Date.parse(a.obligation.endedAt) : 0;
        const timeB = b.obligation?.endedAt ? Date.parse(b.obligation.endedAt) : 0;
        return timeB - timeA || (b.obligation?.id ?? "").localeCompare(a.obligation?.id ?? "");
      })
      .slice(0, 5);

    // 2. Up to 5 most recent manual DONE tasks (ordered by completedAt desc, secondary by ID)
    const recentManual = [...column.items]
      .sort((a, b) => {
        const timeA = a.completedAt ? Date.parse(a.completedAt) : 0;
        const timeB = b.completedAt ? Date.parse(b.completedAt) : 0;
        return timeB - timeA || b.id.localeCompare(a.id);
      })
      .slice(0, 5);

    // 3. Merge candidates (at most 10) across both sources
    // Note: Legacy records without completed timestamps fall back to 0 (epoch)
    // so they are never falsely misrepresented as completed within the 14-day preview.
    const allDone: DoneCardItem[] = [
      ...recentScreening.map(task => ({
        type: "screening" as const,
        task,
        time: task.obligation?.endedAt ? Date.parse(task.obligation.endedAt) : 0,
        id: task.obligation?.id ?? task.roundId,
      })),
      ...recentManual.map((task, index) => ({
        type: "manual" as const,
        task,
        index,
        time: task.completedAt ? Date.parse(task.completedAt) : 0,
        id: task.id,
      })),
    ];

    // 4. Filter by preview window (14 days by default)
    const inWindow = allDone.filter(item => cutoffMs === 0 || item.time >= cutoffMs);
    // Sort descending by completion timestamp, with stable secondary sort by unique ID
    inWindow.sort((a, b) => (b.time - a.time) || b.id.localeCompare(a.id));
    // 5. Take top 5
    combinedDone = inWindow.slice(0, 5);
  }

  return <section ref={ref} className="task-column" data-status={status} data-over={isDropTarget} aria-label={t(taskLabels[status])}>
    <header>
      <span className="task-column-name">
        <Icon size={15} />
        <h3>{t(taskLabels[status])}</h3>
        <span
          className="task-column-count"
          title={isDone && column.total > 0 && doneScreeningCount > 0 ? `${column.total} ${t("project tasks")} · ${doneScreeningCount} ${t("my screening tasks")}` : undefined}
        >
          {totalCompleted}
        </span>
      </span>
      {isDone ? (
        <div className="task-done-window-picker">
          <select
            aria-label={t("Completed time")}
            value={doneDays}
            onChange={e => onDoneDaysChange?.(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="task-done-window-select"
          >
            <option value={14}>14 ngày</option>
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
            <option value="all">{t("All time")}</option>
          </select>
        </div>
      ) : (
        !readOnly && <button type="button" className="task-column-add" aria-label={t("Add task to {{status}}", { status: t(taskLabels[status]) })} onClick={() => onSelect("new", status)}><Plus size={16} /></button>
      )}
    </header>
    <div className="task-column-items">
      {isDone ? (
        <>
          {combinedDone.map(item =>
            item.type === "screening" ? (
              <ScreeningTeamTask key={item.task.obligation?.id ?? item.task.roundId} projectId={projectId} task={item.task} />
            ) : (
              <TaskCard key={item.task.id} task={item.task} index={item.index} readOnly={readOnly} onSelect={onSelect} onMove={onMove} />
            )
          )}
          {!combinedDone.length && (
            <div className="task-column-empty">
              <Icon size={25} strokeWidth={1.2} />
              <p>{t(totalCompleted > 0 ? "No recently completed tasks" : "Progress starts here")}</p>
              <small>{t(totalCompleted > 0 ? "{{count}} previously completed tasks are retained in history." : "Move a task here as research progresses.", { count: totalCompleted })}</small>
              {totalCompleted > 0 && onViewAllCompleted && (
                <Button type="button" variant="outline" size="sm" className="mt-2 text-xs h-7" onClick={onViewAllCompleted}>
                  <List size={12} className="mr-1.5" />
                  {t("View all completed tasks")}
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {screeningTasks.map(task => <ScreeningTeamTask key={task.obligation?.id ?? task.roundId} projectId={projectId} task={task} />)}
          {column.items.map((task, index) => <TaskCard key={task.id} task={task} index={index} readOnly={readOnly} onSelect={onSelect} onMove={onMove} />)}
          {!column.items.length && !screeningTasks.length && (
            <div className="task-column-empty">
              <Icon size={25} strokeWidth={1.2} />
              <p>{t(status === "TODO" ? "Start with the next small step" : status === "IN_PROGRESS" ? "Ready when the team is" : "A clear path ahead")}</p>
              <small>{t(status === "BLOCKED" ? "Work that needs help appears here." : "Move a task here as research progresses.")}</small>
            </div>
          )}
        </>
      )}
    </div>
    {isDone ? (
      totalCompleted > 0 && (
        <div className="task-done-column-footer">
          <small className="task-page-count">
            {t("Showing {{shown}} of {{total}} completed tasks", { shown: combinedDone.length, total: totalCompleted })}
          </small>
          {column.total > 0 && doneScreeningCount > 0 && (
            <small className="task-done-breakdown text-[11px] text-muted-foreground text-center block">
              ({column.total} {t("project tasks")} · {doneScreeningCount} {t("my screening tasks")})
            </small>
          )}
          {onViewAllCompleted && (
            <button type="button" className="task-view-all-completed-btn" onClick={onViewAllCompleted}>
              <List size={13} />
              <span>{t("View all completed tasks")}</span>
            </button>
          )}
        </div>
      )
    ) : (
      <>
        {!readOnly && <button className="task-quick-add" type="button" onClick={() => onSelect("new", status)}><Plus size={15} />{t("Add task")}</button>}
        {column.hasNext || column.page > 1 ? (
          <>
            <small className="task-page-count">{t("{{shown}} of {{total}} tasks", { shown: column.items.length + screeningTasks.length, total: column.total + screeningTasks.length })}</small>
            <WorkspacePager data={column} page={column.page} onPage={onPage} />
          </>
        ) : null}
      </>
    )}
  </section>;
}
function TaskCard({ task, index, readOnly, onSelect, onMove }: { task: WorkspaceTask; index: number; readOnly: boolean; onSelect: SelectTask; onMove: (task: WorkspaceTask, status: WorkspaceTaskStatus) => void }) {
  const { t } = useI18n(); const { ref, handleRef, isDragSource, isDropTarget } = useSortable({ id: task.id, index, group: task.status, type: "task", accept: "task", collisionPriority: 2, disabled: readOnly, transition: { duration: 170 } });
  const subtaskCount = task.subtaskCount ?? 0, done = task.completedSubtaskCount ?? 0;
  const isDone = task.status === "DONE";
  return <article ref={ref} className="task-card" data-task-id={task.id} data-status={task.status} data-dragging={isDragSource} data-over={isDropTarget && !isDragSource} data-readonly={readOnly}>
    <div className="task-card-top">
      {isDone ? (
        <span className="task-done-badge">
          <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{t("Completed")}</span>
        </span>
      ) : (
        <TaskPriority priority={task.priority ?? "MEDIUM"} />
      )}
      <button ref={handleRef} type="button" disabled={readOnly} className="task-drag-handle" aria-label={t("Move task: {{title}}", { title: task.title })}><GripVertical size={16} /></button>
    </div>
    <button type="button" className="task-card-title" onClick={() => onSelect(task.id)}>{task.title}</button>
    {task.status === "BLOCKED" && <p className="task-blocked-reason"><AlertCircle size={13} />{task.blockedReason}</p>}
    {(subtaskCount > 0 || task.link || task.parentTaskId) && <div className="task-card-context">{subtaskCount > 0 && <span title={t("Subtasks")}><CheckCheck size={13} />{done}/{subtaskCount}</span>}{task.parentTaskId && <span>{t("Subtask")}</span>}{task.link && <span title={t("Linked research artifact")}><Link2 size={13} />{t("Research link")}</span>}</div>}
    <div className="task-card-footer"><TaskDueDate task={task} /><Person task={task} /></div>
    {!readOnly && <select className="task-card-status" aria-label={t("Status for {{title}}", { title: task.title })} value={task.status} onChange={e => onMove(task, e.target.value as WorkspaceTaskStatus)}>{taskStatuses.map(value => <option key={value} value={value}>{t(taskLabels[value])}</option>)}</select>}
  </article>;
}
