import { lazy, Suspense, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { SaveWorkspaceTask, WorkspaceLink, WorkspaceMilestone, WorkspaceTask, WorkspaceTaskStatus } from "@trend/shared-types";
import { ArrowLeft, Check, CheckCheck, ChevronRight, Flag, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";
import { canLeaveWorkspace, linkLabels, taskLabels, useUnsavedWorkspace, WorkspaceArtifactLink, WorkspaceArtifactPicker, WorkspaceComments, WorkspaceDate, WorkspaceEmpty, WorkspaceError, WorkspaceHeading, WorkspaceLoading, WorkspacePager, WorkspacePeoplePicker } from "./workspace-common";
import { taskPriorities, taskStatuses, taskToForm } from "./workspace-task-utils";
const TaskBoardView = lazy(() => import("./workspace-task-board").then(module => ({ default: module.TaskBoardView })));
import { WorkspaceTaskHistory } from "./workspace-task-history";
import "../research-tasks.css";

const newTask: SaveWorkspaceTask = { title: "", description: "", status: "TODO", blockedReason: "", assigneeId: null, milestoneId: null, dueAt: null, link: null, priority: "MEDIUM", parentTaskId: null, checklist: [] };
const dateValue = (value: string | null) => value?.slice(0, 10) ?? "";
const fromDate = (value: string) => value ? `${value}T00:00:00.000Z` : null;
export function WorkspaceTasksPanel({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const { t } = useI18n(); const [params, setParams] = useSearchParams(); const view = params.get("view"), selected = params.get("task");
  const changeView = async (value: string) => { if (!(await canLeaveWorkspace())) return; const next = new URLSearchParams(params); next.set("view", value); setParams(next, { replace: true }); };
  const select = (value: string | null, status?: WorkspaceTaskStatus, parent?: string) => { const next = new URLSearchParams(params); for (const key of ["task", "taskStatus", "parentTask", "linkKind", "linkId"]) next.delete(key); if (value) next.set("task", value); if (status) next.set("taskStatus", status); if (parent) next.set("parentTask", parent); setParams(next, { replace: true }); };
  const open = async (value: string, status?: WorkspaceTaskStatus, parent?: string) => { if ((await canLeaveWorkspace())) select(value, status, parent); };
  const close = async () => { if ((await canLeaveWorkspace())) select(null); };
  const initialStatus = taskStatuses.includes(params.get("taskStatus") as WorkspaceTaskStatus) ? params.get("taskStatus") as WorkspaceTaskStatus : "TODO";
  const initialLink = Object.hasOwn(linkLabels, params.get("linkKind") ?? "") && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(params.get("linkId") ?? "") ? { kind: params.get("linkKind") as WorkspaceLink["kind"], id: params.get("linkId")! } : null;
  return <div className="coord-tasks research-tasks" data-no-i18n>
    <WorkspaceHeading title={t("Team tasks")} description={t("Divide work and follow your research progress.")} action={!readOnly && <Button size="sm" onClick={() => open("new")}><Plus className="mr-2 h-4 w-4" />{t("Create task")}</Button>} />
    <div className="task-section-nav"><button type="button" aria-current={view !== "milestones" ? "page" : undefined} onClick={() => changeView("board")}>{t("Tasks")}</button><button type="button" aria-current={view === "milestones" ? "page" : undefined} onClick={() => changeView("milestones")}><Flag size={14} />{t("Milestones")}</button></div>
    {view === "milestones" ? <Milestones projectId={projectId} readOnly={readOnly} /> : <Suspense fallback={<WorkspaceLoading />}><TaskBoardView projectId={projectId} readOnly={readOnly} onSelect={open} mode={view === "list" ? "list" : "board"} onMode={changeView} /></Suspense>}
    {selected && <Sheet open onOpenChange={isOpen => { if (!isOpen) close(); }}><SheetContent className="research-task-drawer" closeLabel={t("Close task details")} data-no-i18n><header className="task-drawer-heading"><SheetTitle>{t(selected === "new" ? "New task" : "Task details")}</SheetTitle><SheetDescription>{t("Keep the next step clear for everyone.")}</SheetDescription></header><TaskDetail key={`${selected}:${params.get("parentTask") ?? ""}`} projectId={projectId} selected={selected} readOnly={readOnly} onClose={close} onSaved={id => select(id || null)} onSelect={open} initialStatus={initialStatus} parentTaskId={params.get("parentTask")} initialLink={initialLink} /></SheetContent></Sheet>}
  </div>;
}
function TaskDetail({ projectId, selected, readOnly, onClose, onSaved, onSelect, initialStatus, parentTaskId, initialLink }: { projectId: string; selected: string; readOnly: boolean; onClose: () => void; onSaved: (id: string) => void; onSelect: (id: string, status?: WorkspaceTaskStatus, parent?: string) => void; initialStatus: WorkspaceTaskStatus; parentTaskId: string | null; initialLink: WorkspaceLink | null }) {
  const { t } = useI18n(); const [page, setPage] = useState(1); const [confirmDelete, setConfirmDelete] = useState(false);
  const detail = useWorkspaceResource(projectId, "task", () => workspaceApi.task(projectId, selected, page), { selected, page }, selected !== "new");
  const remove = useWorkspaceCommand(projectId, () => workspaceApi.deleteTask(projectId, selected, detail.data!.task.version));
  if (selected !== "new" && detail.isLoading) return <WorkspaceLoading />;
  if (selected !== "new" && !detail.data) return <WorkspaceError error={detail.error} retry={() => void detail.refetch()} />;
  const task = detail.data?.task;
  readOnly = readOnly || Boolean(task?.deletedAt);
  return <div className="task-drawer-body"><Button size="sm" variant="ghost" onClick={onClose}><ArrowLeft className="mr-2 h-4 w-4" />{t("Back to tasks")}</Button>
    {task?.deletedAt && <p className="coord-share-notice" role="status">{t("This task was deleted. Its history is retained.")}</p>}
    <TaskEditor projectId={projectId} task={task} initialStatus={initialStatus} parentTaskId={parentTaskId} initialLink={initialLink} readOnly={readOnly} onRefresh={() => detail.refetch()} onSaved={onSaved} />
    {task && <><div className="task-provenance"><span>{t("Created by")} <strong>{task.creator.name}</strong> · <WorkspaceDate value={task.createdAt} /></span><span>{t("Updated")}: <WorkspaceDate value={task.updatedAt} /></span>{task.completedAt && <span>{t("Completed")}: <WorkspaceDate value={task.completedAt} />{task.completedBy ? ` · ${task.completedBy.name}` : ""}</span>}</div>
      <WorkspaceArtifactLink projectId={projectId} link={task.link} />
      {task.parentTaskId ? <button type="button" className="task-parent-link" onClick={() => onSelect(task.parentTaskId!)}><ArrowLeft size={14} />{t("Open parent task")}</button> : <TaskSubtasks projectId={projectId} task={task} readOnly={readOnly} onSelect={onSelect} />}
      <WorkspaceComments projectId={projectId} targetKind="TASK" targetId={task.id} readOnly={readOnly} />
      <details className="coord-history-panel"><summary>{t("Activity history")}</summary><WorkspaceTaskHistory items={detail.data?.history.items ?? []} /><WorkspacePager data={detail.data?.history} page={page} onPage={setPage} /></details>
      {!readOnly && detail.data?.canDelete && <div className="coord-delete-area">{confirmDelete ? <><p>{t("Delete this task? Its history will be kept.")}</p><Button size="sm" variant="destructive" disabled={remove.isPending} onClick={async () => { if (!(await canLeaveWorkspace())) return; try { await remove.mutateAsync(); onSaved(""); } catch { /* Error remains visible. */ } }}>{t("Confirm delete")}</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>{t("Cancel")}</Button></> : <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 className="mr-2 h-4 w-4" />{t("Delete task")}</Button>}{remove.error && <WorkspaceError error={remove.error} />}</div>}
    </>}
  </div>;
}
function TaskEditor({ projectId, task, readOnly, onSaved, initialStatus, parentTaskId, initialLink, onRefresh }: { projectId: string; task?: WorkspaceTask; readOnly: boolean; onSaved: (id: string) => void; initialStatus: WorkspaceTaskStatus; parentTaskId: string | null; initialLink: WorkspaceLink | null; onRefresh: () => Promise<unknown> }) {
  const { t } = useI18n(); const initial = task ? taskToForm(task) : { ...newTask, status: initialStatus, parentTaskId, link: initialLink };
  const [form, setForm] = useState<SaveWorkspaceTask>(initial); const [advanced, setAdvanced] = useState(Boolean(task || parentTaskId || initialLink || initialStatus === "BLOCKED"));
  const [milestonePage, setMilestonePage] = useState(1); const key = useRef(crypto.randomUUID()); const busy = useRef(false); const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState<SaveWorkspaceTask>(initial); const [expectedVersion, setExpectedVersion] = useState(task?.version);
  const milestones = useWorkspaceResource(projectId, "milestones", () => workspaceApi.milestones(projectId, milestonePage), milestonePage, advanced);
  const save = useWorkspaceCommand(projectId, (data: SaveWorkspaceTask) => workspaceApi.saveTask(projectId, { ...data, ...(task ? { expectedVersion } : { clientKey: key.current }) }, task?.id));
  const dirty = !saved && JSON.stringify(form) !== JSON.stringify(baseline); useUnsavedWorkspace(dirty);
  const field = <K extends keyof SaveWorkspaceTask>(name: K, value: SaveWorkspaceTask[K]) => { setSaved(false); setForm(previous => ({ ...previous, [name]: value })); };
  return <form className="task-editor" onSubmit={async e => { e.preventDefault(); if (busy.current || readOnly) return; busy.current = true; try { const result = await save.mutateAsync(form); setExpectedVersion(result.version); setBaseline(form); setSaved(true); onSaved(result.id); } catch { if (task) await onRefresh(); /* Keep unsaved form and original version. */ } finally { busy.current = false; } }}>
    {task && task.version !== expectedVersion && <div role="status" className="coord-share-notice"><p>{t("A newer version is available. Your draft has been kept.")}</p><Button type="button" size="sm" variant="outline" onClick={async () => { if (!dirty || (await canLeaveWorkspace())) { setForm(initial); setBaseline(initial); setExpectedVersion(task.version); setSaved(false); } }}>{t("Load latest version")}</Button></div>}
    <fieldset disabled={readOnly || save.isPending} className="task-edit-fields">
      <label className="task-title-field">{t("Task title")}<textarea rows={2} value={form.title} onChange={e => field("title", e.target.value)} maxLength={240} required autoFocus={!task} placeholder={t("What is the next research step?")} /></label>
      {!advanced && <button type="button" className="task-expand" onClick={() => setAdvanced(true)}><Plus size={14} />{t("Add description, assignee and details")}</button>}
      {advanced && <><div className="task-edit-grid"><div className="task-edit-main"><label>{t("Description")}<textarea rows={5} value={form.description} maxLength={10000} onChange={e => field("description", e.target.value)} placeholder={t("Describe the outcome, context or acceptance criteria…")} /></label>
        {form.status === "BLOCKED" && <label className="task-blocker-field">{t("What is blocking this task?")}<textarea rows={2} value={form.blockedReason} onChange={e => field("blockedReason", e.target.value)} maxLength={2000} required /></label>}
        <section className="task-checklist"><div><h3><CheckCheck size={15} />{t("Checklist")}</h3><span>{(form.checklist ?? []).filter(item => item.done).length}/{form.checklist?.length ?? 0}</span></div>
          {(form.checklist ?? []).map((item, index) => <div className="task-checklist-row" key={item.id}><input type="checkbox" aria-label={t("Complete checklist item {{number}}", { number: index + 1 })} checked={item.done} onChange={e => field("checklist", form.checklist!.map(row => row.id === item.id ? { ...row, done: e.target.checked } : row))} /><input aria-label={t("Checklist item {{number}}", { number: index + 1 })} value={item.text} required maxLength={500} onChange={e => field("checklist", form.checklist!.map(row => row.id === item.id ? { ...row, text: e.target.value } : row))} /><button type="button" aria-label={t("Remove checklist item {{number}}", { number: index + 1 })} onClick={() => field("checklist", form.checklist!.filter(row => row.id !== item.id))}><Trash2 size={14} /></button></div>)}
          <button type="button" className="task-expand" disabled={(form.checklist?.length ?? 0) >= 50} onClick={() => field("checklist", [...form.checklist ?? [], { id: crypto.randomUUID(), text: "", done: false }])}><Plus size={14} />{t("Add checklist item")}</button>
        </section>
        {!readOnly && <WorkspaceArtifactPicker projectId={projectId} value={form.link} onChange={value => field("link", value)} />}
      </div><aside className="task-properties"><h3>{t("Properties")}</h3><label>{t("Status")}<select value={form.status} onChange={e => field("status", e.target.value as SaveWorkspaceTask["status"])}>{Object.entries(taskLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label><label>{t("Priority")}<select value={form.priority ?? "MEDIUM"} onChange={e => field("priority", e.target.value as SaveWorkspaceTask["priority"])}>{Object.entries(taskPriorities).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        {!readOnly ? <WorkspacePeoplePicker projectId={projectId} value={form.assigneeId ? [form.assigneeId] : []} onChange={ids => field("assigneeId", ids[0] ?? null)} /> : <label>{t("Assignee")}<input value={task?.assignee?.name ?? t("Unassigned")} readOnly /></label>}
        <label>{t("Deadline, optional")}<input type="date" value={dateValue(form.dueAt)} onChange={e => field("dueAt", fromDate(e.target.value))} /><small>{t("Deadlines use the UTC calendar date.")}</small></label>
        <label>{t("Milestone, optional")}<select value={form.milestoneId ?? ""} onChange={e => field("milestoneId", e.target.value || null)}><option value="">{t("No milestone")}</option>{form.milestoneId && !milestones.data?.items.some(milestone => milestone.id === form.milestoneId) && <option value={form.milestoneId}>{t("Current milestone")}</option>}{milestones.data?.items.map(milestone => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></label><WorkspacePager data={milestones.data} page={milestonePage} onPage={setMilestonePage} />
        {form.parentTaskId && <button type="button" className="task-expand" onClick={() => field("parentTaskId", null)}>{t("Detach from parent task")}</button>}
      </aside></div></>}
    </fieldset>
    {save.error && <WorkspaceError error={save.error} />}{!readOnly && <div className="task-editor-actions"><span role="status">{dirty ? t("Unsaved changes") : saved ? t("Saved") : t("A clear next step helps the whole team.")}</span><Button disabled={save.isPending || !form.title.trim() || form.status === "BLOCKED" && !form.blockedReason.trim()}>{t(save.isPending ? "Saving…" : "Save task")}</Button></div>}
  </form>;
}
function TaskSubtasks({ projectId, task, readOnly, onSelect }: { projectId: string; task: WorkspaceTask; readOnly: boolean; onSelect: (id: string, status?: WorkspaceTaskStatus, parent?: string) => void }) {
  const { t } = useI18n(); const [page, setPage] = useState(1);
  const query = { parentTaskId: task.id, page };
  const subtasks = useWorkspaceResource(projectId, "subtasks", () => workspaceApi.tasks(projectId, query), query);
  return <section className="task-subtasks"><header><h3>{t("Subtasks")} <span>{task.completedSubtaskCount ?? 0}/{task.subtaskCount ?? 0}</span></h3>{!readOnly && task.status !== "DONE" && <Button size="sm" variant="ghost" onClick={() => onSelect("new", "TODO", task.id)}><Plus size={14} />{t("Add subtask")}</Button>}</header>
    {subtasks.isLoading ? <WorkspaceLoading /> : subtasks.isError ? <WorkspaceError error={subtasks.error} retry={() => void subtasks.refetch()} /> : <ul>{subtasks.data?.items.map(child => <li key={child.id}><button type="button" onClick={() => onSelect(child.id)}><span className="task-subtask-check" data-done={child.status === "DONE"}>{child.status === "DONE" && <Check size={12} />}</span><span><strong>{child.title}</strong><small>{child.assignee?.name ?? t("Unassigned")} · {t(taskLabels[child.status])}</small></span><ChevronRight size={14} /></button></li>)}</ul>}
    {subtasks.data?.total === 0 && <p className="coord-muted">{t("Split assignable work into subtasks. Keep small steps in the checklist.")}</p>}<WorkspacePager data={subtasks.data} page={page} onPage={setPage} />
  </section>;
}
function Milestones({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const { t } = useI18n(); const [page, setPage] = useState(1); const [editing, setEditing] = useState<WorkspaceMilestone | "new" | null>(null);
  const milestones = useWorkspaceResource(projectId, "milestones", () => workspaceApi.milestones(projectId, page), page);
  return <section><div className="coord-section-title"><p className="coord-muted">{t("Milestones set targets. Completing tasks does not automatically change the research stage.")}</p>{!readOnly && <Button size="sm" variant="outline" onClick={async () => { if ((await canLeaveWorkspace())) setEditing("new"); }}><Plus className="mr-2 h-4 w-4" />{t("New milestone")}</Button>}</div>
    {editing && <MilestoneEditor key={editing === "new" ? "new" : editing.id} projectId={projectId} milestone={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    {milestones.isLoading ? <WorkspaceLoading /> : milestones.isError ? <WorkspaceError error={milestones.error} retry={() => void milestones.refetch()} /> : !milestones.data?.items.length ? <WorkspaceEmpty title={t("Give the team a clear target")}><p>{t("Add a milestone such as finishing screening or preparing a proposal draft.")}</p></WorkspaceEmpty> : <ul className="coord-action-list">{milestones.data.items.map(milestone => <li key={milestone.id}><button type="button" disabled={readOnly} onClick={async () => { if ((await canLeaveWorkspace())) setEditing(milestone); }}><span><strong>{milestone.title}</strong><small>{t(milestone.status === "COMPLETE" ? "Completed" : "Planned")}{milestone.description ? ` · ${milestone.description}` : ""}</small></span><WorkspaceDate value={milestone.dueAt} /></button></li>)}</ul>}<WorkspacePager data={milestones.data} page={page} onPage={setPage} />
  </section>;
}
function MilestoneEditor({ projectId, milestone, onClose }: { projectId: string; milestone?: WorkspaceMilestone; onClose: () => void }) {
  const { t } = useI18n(); const initial = { title: milestone?.title ?? "", description: milestone?.description ?? "", dueAt: milestone?.dueAt ?? null, status: milestone?.status ?? "PLANNED" as const };
  const [form, setForm] = useState(initial); const [saved, setSaved] = useState(false); const busy = useRef(false);
  const save = useWorkspaceCommand(projectId, () => workspaceApi.saveMilestone(projectId, { ...form, ...(milestone ? { expectedVersion: milestone.version } : {}) }, milestone?.id));
  useUnsavedWorkspace(!saved && JSON.stringify(form) !== JSON.stringify(initial));
  return <form className="coord-editor" onSubmit={async e => { e.preventDefault(); if (busy.current) return; busy.current = true; try { await save.mutateAsync(); setSaved(true); onClose(); } catch { /* Keep the draft. */ } finally { busy.current = false; } }}><h3>{t(milestone ? "Edit milestone" : "New milestone")}</h3><fieldset disabled={save.isPending} className="coord-field-stack"><label>{t("Milestone title")}<input required maxLength={240} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label><label>{t("Description")}<textarea rows={3} maxLength={5000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label><div className="coord-form-pair"><label>{t("Deadline, optional")}<input type="date" value={dateValue(form.dueAt)} onChange={e => setForm({ ...form, dueAt: fromDate(e.target.value) })} /></label><label>{t("Status")}<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as typeof form.status })}><option value="PLANNED">{t("Planned")}</option><option value="COMPLETE">{t("Completed")}</option></select></label></div></fieldset>{save.error && <WorkspaceError error={save.error} />}<div className="coord-form-actions"><Button type="button" size="sm" variant="ghost" onClick={async () => { if ((await canLeaveWorkspace())) onClose(); }}>{t("Cancel")}</Button><Button disabled={save.isPending || !form.title.trim()}>{t("Save milestone")}</Button></div></form>;
}
