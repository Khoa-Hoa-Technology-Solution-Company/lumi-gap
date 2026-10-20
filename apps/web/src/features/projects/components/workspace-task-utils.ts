import type { WorkspaceTask, WorkspaceTaskPriority, WorkspaceTaskStatus } from "@trend/shared-types";

export const taskStatuses: WorkspaceTaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
export const taskPriorities: Record<WorkspaceTaskPriority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
export const calendarToday = () => new Date().toISOString().slice(0, 10);
export const taskToForm = (task: WorkspaceTask) => ({ title: task.title, description: task.description, status: task.status, blockedReason: task.blockedReason, assigneeId: task.assignee?.id ?? null, milestoneId: task.milestoneId, dueAt: task.dueAt, link: task.link, priority: task.priority ?? "MEDIUM", parentTaskId: task.parentTaskId ?? null, checklist: task.checklist ?? [] });
