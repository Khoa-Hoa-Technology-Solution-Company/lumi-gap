import { useRef, useState } from "react";
import type { MoveWorkspaceTask, WorkspaceTask, WorkspaceTaskBoard, WorkspaceTaskPriority, WorkspaceTaskStatus } from "@trend/shared-types";
import { DragDropProvider, KeyboardSensor, PointerSensor, useDroppable } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { AlertCircle, CalendarDays, CheckCheck, CheckCircle2, Circle, CircleDashed, GripVertical, LayoutGrid, Link2, List, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
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
  if (task.status === "DONE") return <span className="task-due"><CheckCheck size={13} />{t("Completed")}</span>;
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
  const { t } = useI18n(); const [q, setQ] = useState(""); const [draftQ, setDraftQ] = useState("");
  const [mine, setMine] = useState(false), [unassigned, setUnassigned] = useState(false), [overdue, setOverdue] = useState(false);
  const [priority, setPriority] = useState(""), [status, setStatus] = useState(""), [milestone, setMilestone] = useState("");
  const [assignee, setAssignee] = useState<string[]>([]), [sort, setSort] = useState("manual"), [page, setPage] = useState(1);
  const [pages, setPages] = useState([1, 1, 1, 1]);
  const resetPages = () => { setPage(1); setPages([1, 1, 1, 1]); };
  const query = { q, mine: mine ? "1" : undefined, unassigned: unassigned ? "1" : undefined, overdue: overdue ? "1" : undefined, assigneeId: assignee[0], priority: priority || undefined, milestoneId: milestone || undefined };
  const boardQuery = { ...query, sort: "manual", pageSize: 20, todoPage: pages[0], progressPage: pages[1], blockedPage: pages[2], donePage: pages[3] };
  const listQuery = { ...query, sort, status: status || undefined, page };
  const board = useWorkspaceResource(projectId, "task-board", () => workspaceApi.taskBoard(projectId, boardQuery), boardQuery, mode === "board");
  const tasks = useWorkspaceResource(projectId, "tasks", () => workspaceApi.tasks(projectId, listQuery), listQuery, mode === "list");
  const [milestonePage, setMilestonePage] = useState(1);
  const milestones = useWorkspaceResource(projectId, "milestones", () => workspaceApi.milestones(projectId, milestonePage), milestonePage);
  const [optimistic, setOptimistic] = useState<WorkspaceTaskBoard | null>(null);
  const [blocked, setBlocked] = useState<{ task: WorkspaceTask; status: WorkspaceTaskStatus; beforeId: string | null } | null>(null), [reason, setReason] = useState("");
  const moveKey = useRef(crypto.randomUUID()); const busy = useRef(false);
  const move = useWorkspaceCommand(projectId, ({ taskId, data }: { taskId: string; data: MoveWorkspaceTask }) => workspaceApi.moveTask(projectId, taskId, data));
  const current = optimistic ?? board.data;
  const doMove = async (task: WorkspaceTask, nextStatus: WorkspaceTaskStatus, beforeId: string | null, blockedReason = task.blockedReason) => {
    if (!board.data || busy.current || readOnly) return;
    if (nextStatus === "BLOCKED" && !blockedReason.trim()) { setBlocked({ task, status: nextStatus, beforeId }); setReason(""); return; }
    busy.current = true; setBlocked(null);
    const next = structuredClone(board.data);
    next.columns[task.status].items = next.columns[task.status].items.filter(item => item.id !== task.id);
    const destination = next.columns[nextStatus]; const index = beforeId ? destination.items.findIndex(item => item.id === beforeId) : destination.items.length;
    destination.items.splice(index < 0 ? destination.items.length : index, 0, { ...task, status: nextStatus, blockedReason: nextStatus === "BLOCKED" ? blockedReason : "" });
    if (task.status !== nextStatus) { next.columns[task.status].total--; destination.total++; }
    setOptimistic(next);
    try { await move.mutateAsync({ taskId: task.id, data: { expectedVersion: task.version, expectedBoardVersion: board.data.boardVersion, status: nextStatus, beforeId, blockedReason, clientKey: moveKey.current } }); moveKey.current = crypto.randomUUID(); }
    catch { await board.refetch(); moveKey.current = crypto.randomUUID(); }
    finally { setOptimistic(null); busy.current = false; }
  };
  const filtered = Boolean(q || mine || unassigned || overdue || priority || milestone || assignee.length || status);
  const total = mode === "board" ? current ? taskStatuses.reduce((n, key) => n + current.columns[key].total, 0) : 0 : tasks.data?.total ?? 0;
  return <section className="research-task-workspace" aria-label={t("Team tasks")}>
    <div className="task-toolbar"><div className="task-view-switch" aria-label={t("Task views")}>{(["board", "list"] as const).map(value => { const Icon = value === "board" ? LayoutGrid : List; return <button type="button" key={value} aria-pressed={mode === value} onClick={() => onMode(value)}><Icon size={15} />{t(value === "board" ? "Board" : "List")}</button>; })}</div>
      <form className="task-search" onSubmit={event => { event.preventDefault(); setQ(draftQ.trim()); resetPages(); }}><Search size={16} aria-hidden="true" /><input type="search" aria-label={t("Search tasks")} placeholder={t("Search tasks…")} value={draftQ} maxLength={200} onChange={event => { setDraftQ(event.target.value); if (!event.target.value) { setQ(""); resetPages(); } }} /><button type="submit" aria-label={t("Search")}><span>↵</span></button></form>
      <span className="task-result-count" role="status">{t("{{count}} tasks", { count: total })}</span>
    </div>
    <div className="task-filter-bar"><button type="button" className="task-filter-chip" aria-pressed={mine} onClick={() => { setMine(!mine); setUnassigned(false); setAssignee([]); resetPages(); }}>{t("My tasks")}</button><button type="button" className="task-filter-chip" aria-pressed={unassigned} onClick={() => { setUnassigned(!unassigned); setMine(false); setAssignee([]); resetPages(); }}>{t("Unassigned")}</button><button type="button" className="task-filter-chip" aria-pressed={overdue} onClick={() => { setOverdue(!overdue); resetPages(); }}><CalendarDays size={13} />{t("Overdue")}</button>
      <details className="coord-filter-popover task-filters"><summary><SlidersHorizontal size={14} />{t("Filters")}{Boolean(priority || milestone || assignee.length) && <span className="task-active-dot" />}</summary><div className="task-filter-fields"><label>{t("Priority")}<select value={priority} onChange={e => { setPriority(e.target.value); resetPages(); }}><option value="">{t("All priorities")}</option>{Object.entries(taskPriorities).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><WorkspacePeoplePicker projectId={projectId} value={assignee} onChange={ids => { setAssignee(ids); setMine(false); setUnassigned(false); resetPages(); }} /><label>{t("Milestone, optional")}<select value={milestone} onChange={e => { setMilestone(e.target.value); resetPages(); }}><option value="">{t("All milestones")}</option>{milestones.data?.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><WorkspacePager data={milestones.data} page={milestonePage} onPage={setMilestonePage} /></div></details>
      {mode === "list" && <><select aria-label={t("Task status")} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">{t("All statuses")}</option>{taskStatuses.map(value => <option key={value} value={value}>{t(taskLabels[value])}</option>)}</select><select aria-label={t("Sort tasks")} value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>{Object.entries({ manual: "Board order", due: "Deadline", priority: "Priority", title: "Title", updated: "Recently updated" }).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></>}
      {filtered && <button type="button" className="task-reset" onClick={() => { setQ(""); setDraftQ(""); setMine(false); setUnassigned(false); setOverdue(false); setPriority(""); setMilestone(""); setAssignee([]); setStatus(""); resetPages(); }}><X size={13} />{t("Reset")}</button>}
    </div>
    {move.error && <WorkspaceError error={move.error} />}
    {blocked && <form className="task-blocker-form" onSubmit={e => { e.preventDefault(); void doMove(blocked.task, blocked.status, blocked.beforeId, reason); }}><label>{t("What is blocking this task?")}<textarea autoFocus required rows={2} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label><div><Button size="sm" disabled={!reason.trim()}>{t("Mark as blocked")}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setBlocked(null)}>{t("Cancel")}</Button></div></form>}
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
        {taskStatuses.map((status, i) => <TaskColumn key={status} status={status} column={current.columns[status]} readOnly={readOnly || move.isPending} onSelect={onSelect} onPage={next => setPages(old => old.map((value, index) => index === i ? next : value))} onMove={(task, status) => void doMove(task, status, null)} />)}
      </div></DragDropProvider><p className="task-board-help"><GripVertical size={13} />{t("Drag cards between columns or use the status menu.")}</p>
    </> : tasks.isLoading ? <WorkspaceLoading /> : tasks.isError ? <WorkspaceError error={tasks.error} retry={() => void tasks.refetch()} /> : !tasks.data?.items.length ? <WorkspaceEmpty title={t(filtered ? "No matching tasks" : "Plan the next research step")}><p>{t("Create a task for a concrete action, such as reading a paper or comparing research methods.")}</p>{!readOnly && <Button onClick={() => onSelect("new")}>{t("Create the first task")}</Button>}</WorkspaceEmpty> : <><div className="coord-table-wrap task-list"><table className="coord-table"><thead><tr>{["Task", "Assignee", "Status", "Priority", "Deadline", "Milestones", "Linked research artifact"].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{tasks.data.items.map(task => <tr key={task.id}><td><button className="task-list-title" type="button" onClick={() => onSelect(task.id)}>{task.title}</button>{task.status === "BLOCKED" && <small className="task-blocked-reason">{task.blockedReason}</small>}</td><td><Person task={task} /></td><td><span className="task-status-label" data-status={task.status}>{t(taskLabels[task.status])}</span></td><td><TaskPriority priority={task.priority} /></td><td><TaskDueDate task={task} /></td><td>{milestones.data?.items.find(item => item.id === task.milestoneId)?.title ?? (task.milestoneId ? t("Milestone") : "–")}</td><td><WorkspaceArtifactLink projectId={projectId} link={task.link} /></td></tr>)}</tbody></table></div><WorkspacePager data={tasks.data} page={page} onPage={setPage} /></>}
  </section>;
}
function TaskColumn({ status, column, readOnly, onSelect, onPage, onMove }: { status: WorkspaceTaskStatus; column: WorkspaceTaskBoard["columns"][WorkspaceTaskStatus]; readOnly: boolean; onSelect: SelectTask; onPage: (page: number) => void; onMove: (task: WorkspaceTask, status: WorkspaceTaskStatus) => void }) {
  const { t } = useI18n(); const Icon = icons[status];
  const { ref, isDropTarget } = useDroppable({ id: status, type: "column", accept: "task", disabled: readOnly, collisionPriority: 1 });
  return <section ref={ref} className="task-column" data-status={status} data-over={isDropTarget} aria-label={t(taskLabels[status])}>
    <header><span className="task-column-name"><Icon size={15} /><h3>{t(taskLabels[status])}</h3><span className="task-column-count">{column.total}</span></span>{!readOnly && <button type="button" className="task-column-add" aria-label={t("Add task to {{status}}", { status: t(taskLabels[status]) })} onClick={() => onSelect("new", status)}><Plus size={16} /></button>}</header>
    <div className="task-column-items">{column.items.map((task, index) => <TaskCard key={task.id} task={task} index={index} readOnly={readOnly} onSelect={onSelect} onMove={onMove} />)}{!column.items.length && <div className="task-column-empty"><Icon size={25} strokeWidth={1.2} /><p>{t(status === "TODO" ? "Start with the next small step" : status === "IN_PROGRESS" ? "Ready when the team is" : status === "BLOCKED" ? "A clear path ahead" : "Progress starts here")}</p><small>{t(status === "BLOCKED" ? "Work that needs help appears here." : "Move a task here as research progresses.")}</small></div>}</div>
    {!readOnly && <button className="task-quick-add" type="button" onClick={() => onSelect("new", status)}><Plus size={15} />{t("Add task")}</button>}
    {column.hasNext || column.page > 1 ? <><small className="task-page-count">{t("{{shown}} of {{total}} tasks", { shown: column.items.length, total: column.total })}</small><WorkspacePager data={column} page={column.page} onPage={onPage} /></> : null}
  </section>;
}
function TaskCard({ task, index, readOnly, onSelect, onMove }: { task: WorkspaceTask; index: number; readOnly: boolean; onSelect: SelectTask; onMove: (task: WorkspaceTask, status: WorkspaceTaskStatus) => void }) {
  const { t } = useI18n(); const { ref, handleRef, isDragSource, isDropTarget } = useSortable({ id: task.id, index, group: task.status, type: "task", accept: "task", collisionPriority: 2, disabled: readOnly, transition: { duration: 170 } });
  const subtaskCount = task.subtaskCount ?? 0, done = task.completedSubtaskCount ?? 0;
  return <article ref={ref} className="task-card" data-task-id={task.id} data-dragging={isDragSource} data-over={isDropTarget && !isDragSource} data-readonly={readOnly}>
    <div className="task-card-top"><TaskPriority priority={task.priority ?? "MEDIUM"} /><button ref={handleRef} type="button" disabled={readOnly} className="task-drag-handle" aria-label={t("Move task: {{title}}", { title: task.title })}><GripVertical size={16} /></button></div>
    <button type="button" className="task-card-title" onClick={() => onSelect(task.id)}>{task.title}</button>
    {task.status === "BLOCKED" && <p className="task-blocked-reason"><AlertCircle size={13} />{task.blockedReason}</p>}
    {(subtaskCount > 0 || task.link || task.parentTaskId) && <div className="task-card-context">{subtaskCount > 0 && <span title={t("Subtasks")}><CheckCheck size={13} />{done}/{subtaskCount}</span>}{task.parentTaskId && <span>{t("Subtask")}</span>}{task.link && <span title={t("Linked research artifact")}><Link2 size={13} />{t("Research link")}</span>}</div>}
    <div className="task-card-footer"><TaskDueDate task={task} /><Person task={task} /></div>
    {!readOnly && <select className="task-card-status" aria-label={t("Status for {{title}}", { title: task.title })} value={task.status} onChange={e => onMove(task, e.target.value as WorkspaceTaskStatus)}>{taskStatuses.map(value => <option key={value} value={value}>{t(taskLabels[value])}</option>)}</select>}
  </article>;
}
