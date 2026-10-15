import type { WorkspaceRevision } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { linkLabels, taskLabels } from "./workspace-common";
import { taskPriorities } from "./workspace-task-utils";

const labels: Record<string, string> = { title: "Task title", description: "Description", status: "Status", priority: "Priority", blockedReason: "What is blocking this task?", assigneeId: "Assignee", dueAt: "Deadline", milestoneId: "Milestones", parentTaskId: "Subtasks", checklist: "Checklist", targetKind: "Linked research artifact", targetId: "Linked research artifact", sortOrder: "Board order", deletedAt: "Delete task" };
type Change = { field: string; before: unknown; after: unknown };
export function WorkspaceTaskHistory({ items }: { items: WorkspaceRevision[] }) {
  const { t, language } = useI18n();
  const value = (field: string, item: unknown): string => {
    if (item === null || item === undefined || item === "") return "–";
    if (field === "status") return t(taskLabels[String(item) as keyof typeof taskLabels] ?? String(item));
    if (field === "priority") return t(taskPriorities[String(item) as keyof typeof taskPriorities] ?? String(item));
    if (field === "targetKind") return t(linkLabels[String(item) as keyof typeof linkLabels] ?? "Linked research artifact");
    if (field === "dueAt") return String(item).slice(0, 10);
    if (field === "checklist" && Array.isArray(item)) return item.map(row => `${row.done ? "✓" : "○"} ${row.text}`).join("\n") || "–";
    return String(item);
  };
  return <ol className="task-history-timeline">{items.map(item => {
    const changes = Array.isArray(item.snapshot.changes) ? item.snapshot.changes as Change[] : [];
    // Relationship IDs stay in the retained snapshot, while the timeline describes their actual change.
    const visible = changes.filter(change => !["targetId", "milestoneId", "parentTaskId", "deletedAt"].includes(change.field));
    return <li key={item.id}><header><strong>{item.actor.name}</strong><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></header><p>{t(item.version === 1 ? "Task created" : "Task updated")} <span>· {t("Version {{version}}", { version: item.version })}</span></p>
      {visible.length > 0 && <dl>{visible.map(change => <div key={change.field}><dt>{t(labels[change.field] ?? "Task updated")}</dt><dd><del>{value(change.field, change.before)}</del><span aria-hidden="true"> → </span><span>{value(change.field, change.after)}</span></dd></div>)}</dl>}
      {changes.some(change => change.field === "targetId") && <p>{t("Research link changed")}</p>}
      {changes.some(change => change.field === "milestoneId") && <p>{t("Milestone changed")}</p>}
      {changes.some(change => change.field === "parentTaskId") && <p>{t("Parent task changed")}</p>}
      {changes.some(change => change.field === "deletedAt" && change.after) && <p>{t("This task was deleted. Its history is retained.")}</p>}
      {!visible.length && typeof item.snapshot.blockedReason === "string" && item.snapshot.blockedReason && <p>{item.snapshot.blockedReason}</p>}
    </li>;
  })}</ol>;
}
