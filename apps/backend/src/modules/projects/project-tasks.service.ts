import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import { taskQuerySchema, taskBoardQuerySchema } from "./dto/project-workspace.schema.js";
import type { Prisma, ProjectTask } from "../../generated/prisma/client.js";
import type { MoveWorkspaceTask, SaveWorkspaceTask, TaskChecklistItem, WorkspaceTaskBoard, WorkspaceTaskStatus, WorkspaceTask, WorkspacePerson, WorkspacePage, WorkspaceMilestone, WorkspaceComment, WorkspaceRevision, WorkspaceTaskDetail } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, workspacePeople, workspacePerson, assertWorkspaceAssignee, assertWorkspaceLink, assertWorkspaceRetry, expectWorkspaceVersion, workspaceEvent, workspaceNotify, workspaceRevision, type WorkspaceContext } from "./workspace-access.js";
import { authorizedPlanRevision } from "./project-plan.service.js";

type Page = { page: number; pageSize: number };
const pageOf = <T>(items: T[], total: number, query: Page): WorkspacePage<T> => ({ items, total, page: query.page, pageSize: query.pageSize, hasNext: query.page * query.pageSize < total });
const paging = (query: Page) => ({ take: query.pageSize, skip: (query.page - 1) * query.pageSize });
export function workspaceTaskDto(row: ProjectTask, people: Map<string, WorkspacePerson>): WorkspaceTask {
  return { deletedAt: row.deletedAt?.toISOString() ?? null, priority: row.priority, sortOrder: row.sortOrder, parentTaskId: row.parentTaskId, checklist: row.checklist as unknown as TaskChecklistItem[], completedBy: row.completedById ? workspacePerson(people, row.completedById) : null, subtaskCount: 0, completedSubtaskCount: 0, id: row.id, title: row.title, description: row.description, status: row.status as WorkspaceTask["status"], blockedReason: row.blockedReason, assignee: row.assigneeId ? workspacePerson(people, row.assigneeId) : null, creator: workspacePerson(people, row.createdById), milestoneId: row.milestoneId, dueAt: row.dueAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null, link: row.targetKind && row.targetId ? { kind: row.targetKind as NonNullable<WorkspaceTask["link"]>["kind"], id: row.targetId } : null, version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function milestoneDto(row: { id: string; title: string; description: string; dueAt: Date | null; status: string; version: number }): WorkspaceMilestone {
  return { id: row.id, title: row.title, description: row.description, dueAt: row.dueAt?.toISOString() ?? null, status: row.status as WorkspaceMilestone["status"], version: row.version };
}
async function requireTask(context: WorkspaceContext, id: string, includeDeleted = false) {
  const row = await context.tx.projectTask.findFirst({ where: { id, projectId: context.project.id, ...(!includeDeleted ? { deletedAt: null } : {}) } });
  if (!row) throw AppError.notFound("Task not found");
  return row;
}
async function commentsFor(context: WorkspaceContext, targetKind: string, targetId: string, query: Page): Promise<WorkspacePage<WorkspaceComment>> {
  const where = { projectId: context.project.id, targetKind, targetId };
  const [rows, total] = await Promise.all([context.tx.projectWorkspaceComment.findMany({ where, ...paging(query), orderBy: [{ createdAt: "asc" }, { id: "asc" }] }), context.tx.projectWorkspaceComment.count({ where })]);
  const people = await workspacePeople(context.tx, rows.map(row => row.authorId));
  return pageOf(rows.map(row => ({ id: row.id, body: row.body, author: workspacePerson(people, row.authorId), createdAt: row.createdAt.toISOString() })), total, query);
}
export async function workspaceHistory(context: WorkspaceContext, entityKind: string, entityId: string, query: Page): Promise<WorkspacePage<WorkspaceRevision>> {
  const where = { projectId: context.project.id, entityKind, entityId };
  const [rows, total] = await Promise.all([context.tx.projectWorkspaceRevision.findMany({ where, ...paging(query), orderBy: { version: "desc" } }), context.tx.projectWorkspaceRevision.count({ where })]);
  const people = await workspacePeople(context.tx, rows.map(row => row.actorId));
  return pageOf(rows.map(row => ({ id: row.id, version: row.version, snapshot: row.snapshot as Record<string, unknown>, actor: workspacePerson(people, row.actorId), createdAt: row.createdAt.toISOString() })), total, query);
}
type TaskQuery = Partial<z.infer<typeof taskQuerySchema>> & Page;
const taskStatuses: WorkspaceTaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
function taskWhere(context: WorkspaceContext, query: TaskQuery): Prisma.ProjectTaskWhereInput {
  return { projectId: context.project.id, deletedAt: null,
    ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
    ...(query.status ? { status: query.status } : {}), ...(query.priority ? { priority: query.priority } : {}),
    ...(query.milestoneId ? { milestoneId: query.milestoneId } : {}), ...(query.parentTaskId ? { parentTaskId: query.parentTaskId } : {}),
    ...(query.mine === "1" ? { assigneeId: context.actorId } : query.unassigned === "1" ? { assigneeId: null } : query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    ...(query.overdue === "1" ? { AND: [{ status: { not: "DONE" } }, { dueAt: { lt: new Date(new Date().toISOString().slice(0, 10)) } }] } : {}),
  };
}
export async function taskDtos(context: WorkspaceContext, rows: ProjectTask[]): Promise<WorkspaceTask[]> {
  const [people, children] = await Promise.all([
    workspacePeople(context.tx, rows.flatMap(row => [row.createdById, ...[row.assigneeId, row.completedById].filter((id): id is string => Boolean(id))])),
    context.tx.projectTask.groupBy({ by: ["parentTaskId", "status"], where: { projectId: context.project.id, deletedAt: null, parentTaskId: { in: rows.map(row => row.id) } }, _count: true }),
  ]);
  return rows.map(row => ({ ...workspaceTaskDto(row, people), subtaskCount: children.filter(child => child.parentTaskId === row.id).reduce((n, child) => n + child._count, 0), completedSubtaskCount: children.filter(child => child.parentTaskId === row.id && child.status === "DONE").reduce((n, child) => n + child._count, 0) }));
}
async function taskPage(context: WorkspaceContext, query: TaskQuery) {
  const where = taskWhere(context, query);
  const order: Prisma.ProjectTaskOrderByWithRelationInput[] = query.sort === "due" ? [{ dueAt: { sort: "asc", nulls: "last" } }] : query.sort === "priority" ? [{ priority: "desc" }] : query.sort === "title" ? [{ title: "asc" }] : query.sort === "updated" ? [{ updatedAt: "desc" }] : [{ sortOrder: "asc" }];
  const [rows, total] = await Promise.all([context.tx.projectTask.findMany({ where, ...paging(query), orderBy: [...order, { id: "asc" }] }), context.tx.projectTask.count({ where })]);
  return pageOf(await taskDtos(context, rows), total, query);
}
const bumpBoard = (context: WorkspaceContext) => context.tx.project.update({ where: { id: context.project.id }, data: { taskBoardVersion: { increment: 1 } } });
async function assertTaskProgress(context: WorkspaceContext, previous: ProjectTask | null, status: string, parentTaskId: string | null, blockedReason: string) {
  if (status === "BLOCKED" && !blockedReason.trim()) throw AppError.badRequest("Explain what is blocking this task");
  if (parentTaskId) {
    const parent = await requireTask(context, parentTaskId);
    if (parent.id === previous?.id || parent.parentTaskId) throw new AppError(400, "TASK_PARENT_INVALID", "Subtasks support exactly one level");
    if (previous && await context.tx.projectTask.count({ where: { parentTaskId: previous.id, deletedAt: null } })) throw new AppError(400, "TASK_PARENT_INVALID", "A parent task cannot become a subtask");
    if (parent.status === "DONE" && status !== "DONE") throw new AppError(409, "TASK_PARENT_DONE", "Reopen the parent before adding or reopening unfinished work");
  }
  if (status === "DONE" && previous && await context.tx.projectTask.count({ where: { projectId: context.project.id, parentTaskId: previous.id, deletedAt: null, status: { not: "DONE" } } })) throw new AppError(409, "TASK_SUBTASKS_OPEN", "Complete all subtasks before completing the parent");
}
async function taskChangeEvents(context: WorkspaceContext, row: ProjectTask, previous: ProjectTask | null) {
  await workspaceEvent(context, !previous ? "TASK_CREATED" : previous.status !== row.status ? "TASK_STATUS_CHANGED" : "TASK_UPDATED", "TASK", row.id, { version: row.version, status: row.status, previousStatus: previous?.status ?? null });
  if (row.status === "DONE" && previous?.status !== "DONE") await workspaceEvent(context, "TASK_COMPLETED", "TASK", row.id, { version: row.version, parentTaskId: row.parentTaskId, assigneeId: row.assigneeId });
  if (previous && (row.targetKind !== previous.targetKind || row.targetId !== previous.targetId) && row.targetId) await workspaceEvent(context, "TASK_ARTIFACT_LINKED", "TASK", row.id, { version: row.version });
  if (row.assigneeId !== previous?.assigneeId) {
    if (row.assigneeId) await workspaceNotify(context, [row.assigneeId], "ASSIGNMENT", row.id, row.version);
    if (previous?.assigneeId) await workspaceNotify(context, [previous.assigneeId], "REASSIGNMENT", row.id, row.version);
  }
  if (previous && row.status !== previous.status && (row.status === "BLOCKED" || previous.status === "BLOCKED")) await workspaceNotify(context, [row.assigneeId, row.createdById].filter((id): id is string => Boolean(id)), row.status === "BLOCKED" ? "TASK_BLOCKED" : "TASK_UNBLOCKED", row.id, row.version);
  if (previous && row.dueAt?.toISOString() !== previous.dueAt?.toISOString() && row.assigneeId) await workspaceNotify(context, [row.assigneeId], "TASK_DEADLINE", row.id, row.version);
}
async function taskRevision(context: WorkspaceContext, row: ProjectTask, previous: ProjectTask | null, creationInput?: unknown, updateInput?: unknown) {
  const fields = ["title", "description", "status", "priority", "blockedReason", "assigneeId", "dueAt", "milestoneId", "parentTaskId", "checklist", "targetKind", "targetId", "sortOrder", "deletedAt"] as const;
  const people = await workspacePeople(context.tx, [row.assigneeId, previous?.assigneeId].filter((id): id is string => Boolean(id)));
  const display = (field: typeof fields[number], value: unknown) => field === "assigneeId" ? value ? workspacePerson(people, String(value)).name : null : value instanceof Date ? value.toISOString() : value;
  const changes = previous ? fields.filter(field => !isDeepStrictEqual(previous[field], row[field])).map(field => ({ field, before: display(field, previous[field]), after: display(field, row[field]) })) : [];
  await workspaceRevision(context, "TASK", { ...row, changes, ...(updateInput ? { updateInput } : {}) }, creationInput);
}
export const projectTasksService = {
  async list(projectId: string, actorId: string, query: TaskQuery): Promise<WorkspacePage<WorkspaceTask>> {
    return withWorkspace(projectId, actorId, {}, context => taskPage(context, query));
  },
  async board(projectId: string, actorId: string, query: z.infer<typeof taskBoardQuerySchema>): Promise<WorkspaceTaskBoard> {
    return withWorkspace(projectId, actorId, {}, async context => {
      const pages = [query.todoPage, query.progressPage, query.blockedPage, query.donePage];
      const columns = await Promise.all(taskStatuses.map((status, index) => taskPage(context, { ...query, status, page: pages[index]! })));
      return { boardVersion: context.project.taskBoardVersion, columns: Object.fromEntries(taskStatuses.map((status, i) => [status, columns[i]])) as WorkspaceTaskBoard["columns"] };
    });
  },
  async detail(projectId: string, actorId: string, id: string, query: Page): Promise<WorkspaceTaskDetail> {
    return withWorkspace(projectId, actorId, {}, async context => {
      const task = await requireTask(context, id, true);
      const [tasks, comments, history] = await Promise.all([taskDtos(context, [task]), commentsFor(context, "TASK", id, query), workspaceHistory(context, "TASK", id, query)]);
      return { task: tasks[0]!, canDelete: !task.deletedAt && context.project.status !== "ARCHIVED" && (context.role === "OWNER" || task.createdById === context.actorId), comments, history };
    });
  },
  async save(projectId: string, actorId: string, input: SaveWorkspaceTask & { clientKey?: string; expectedVersion?: number }, id?: string) {
    return withWorkspace(projectId, actorId, { write: true, accounts: input.assigneeId ? [input.assigneeId] : [] }, async context => {
      const previous = id ? await requireTask(context, id) : input.clientKey ? await context.tx.projectTask.findUnique({ where: { projectId_createdById_clientKey: { projectId: context.project.id, createdById: context.actorId, clientKey: input.clientKey } } }) : null;
      // Keep legacy create retry payloads byte-for-byte compatible when new optional fields are absent.
      const creationInput = { title: input.title, description: input.description, status: input.status, blockedReason: input.blockedReason, assigneeId: input.assigneeId, milestoneId: input.milestoneId, dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null, link: input.link, ...(input.priority !== undefined ? { priority: input.priority } : {}), ...(input.parentTaskId !== undefined ? { parentTaskId: input.parentTaskId } : {}), ...(input.checklist !== undefined ? { checklist: input.checklist } : {}) };
      if (!id && previous) {
        await assertWorkspaceRetry(context, "TASK", previous.id, creationInput);
        if (previous.deletedAt) throw AppError.conflict("This task was deleted. Use a new request key to create another task");
        return { id: previous.id, version: previous.version };
      }
      if (previous) {
        if (previous.version !== input.expectedVersion) {
          const retry = await context.tx.projectWorkspaceRevision.findFirst({ where: { entityKind: "TASK", entityId: previous.id, version: (input.expectedVersion ?? 0) + 1, actorId: context.actorId } });
          if (retry && isDeepStrictEqual((retry.snapshot as { updateInput?: unknown }).updateInput, creationInput)) return { id: previous.id, version: retry.version };
        }
        expectWorkspaceVersion(previous.version, input.expectedVersion!);
      }
      if (!previous || previous.assigneeId !== input.assigneeId) await assertWorkspaceAssignee(context, input.assigneeId);
      await assertWorkspaceLink(context, input.link);
      const parentTaskId = input.parentTaskId === undefined ? previous?.parentTaskId ?? null : input.parentTaskId;
      await assertTaskProgress(context, previous, input.status, parentTaskId, input.blockedReason);
      if (input.milestoneId && !await context.tx.projectMilestone.findFirst({ where: { id: input.milestoneId, projectId: context.project.id } })) throw AppError.badRequest("Milestone does not belong to this project");
      const end = !previous || previous.status !== input.status ? await context.tx.projectTask.aggregate({ where: { projectId: context.project.id, status: input.status, deletedAt: null }, _max: { sortOrder: true } }) : null;
      const fields = { title: input.title, description: input.description, status: input.status, blockedReason: input.status === "BLOCKED" ? input.blockedReason.trim() : "", assigneeId: input.assigneeId, milestoneId: input.milestoneId, priority: input.priority ?? previous?.priority ?? "MEDIUM", parentTaskId, checklist: input.checklist ?? previous?.checklist ?? [], dueAt: input.dueAt ? new Date(input.dueAt.slice(0, 10)) : null, completedAt: input.status === "DONE" ? previous?.completedAt ?? new Date() : null, completedById: input.status === "DONE" ? previous?.status === "DONE" ? previous.completedById : context.actorId : null, targetKind: input.link?.kind ?? null, targetId: input.link?.id ?? null, sortOrder: end ? (end._max.sortOrder ?? -1) + 1 : previous!.sortOrder };
      const row = previous ? await context.tx.projectTask.update({ where: { id: previous.id }, data: { ...fields, checklist: fields.checklist as Prisma.InputJsonValue, version: { increment: 1 } } }) : await context.tx.projectTask.create({ data: { ...fields, checklist: fields.checklist as Prisma.InputJsonValue, projectId: context.project.id, createdById: context.actorId, clientKey: input.clientKey! } });
      await taskRevision(context, row, previous, previous ? undefined : creationInput, previous ? creationInput : undefined);
      await bumpBoard(context);
      await taskChangeEvents(context, row, previous);
      return { id: row.id, version: row.version };
    });
  },
  async move(projectId: string, actorId: string, id: string, input: MoveWorkspaceTask) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const previous = await requireTask(context, id);
      const key = `TASK_MOVE:${context.actorId}:${input.clientKey}`;
      const retry = await context.tx.projectActivity.findFirst({ where: { projectId: context.project.id, idempotencyKey: key } });
      if (retry) {
        if (retry.entityId !== id || !isDeepStrictEqual(retry.metadata, input)) throw AppError.conflict("Request key already used");
        return { id, version: previous.version, boardVersion: context.project.taskBoardVersion };
      }
      expectWorkspaceVersion(previous.version, input.expectedVersion);
      if (context.project.taskBoardVersion !== input.expectedBoardVersion) throw new AppError(409, "TASK_BOARD_CHANGED", "The board changed. Refresh before moving this task");
      await assertTaskProgress(context, previous, input.status, previous.parentTaskId, input.blockedReason);
      const before = input.beforeId ? await requireTask(context, input.beforeId) : null;
      if (before && (before.id === id || before.status !== input.status)) throw AppError.badRequest("Invalid ordering target");
      const end = await context.tx.projectTask.aggregate({ where: { projectId: context.project.id, status: input.status, deletedAt: null }, _max: { sortOrder: true } });
      // Insert before the authoritative target. Gaps are harmless and preserve stable order.
      const sortOrder = before ? before.sortOrder : (end._max.sortOrder ?? -1) + 1;
      await context.tx.projectTask.updateMany({ where: { projectId: context.project.id, status: input.status, deletedAt: null, id: { not: id }, sortOrder: { gte: sortOrder } }, data: { sortOrder: { increment: 1 } } });
      const row = await context.tx.projectTask.update({ where: { id }, data: { status: input.status, sortOrder, blockedReason: input.status === "BLOCKED" ? input.blockedReason.trim() : "", completedAt: input.status === "DONE" ? previous.completedAt ?? new Date() : null, completedById: input.status === "DONE" ? previous.status === "DONE" ? previous.completedById : context.actorId : null, version: { increment: 1 } } });
      await taskRevision(context, row, previous);
      await taskChangeEvents(context, row, previous);
      await workspaceEvent(context, "TASK_REORDERED", "TASK", id, { ...input }, key);
      const project = await bumpBoard(context);
      return { id, version: row.version, boardVersion: project.taskBoardVersion };
    });
  },
  async remove(projectId: string, actorId: string, id: string, expectedVersion: number) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const previous = await requireTask(context, id);
      if (context.role !== "OWNER" && previous.createdById !== context.actorId) throw AppError.forbidden("Only the task creator or project owner can delete this task");
      expectWorkspaceVersion(previous.version, expectedVersion);
      if (await context.tx.projectTask.count({ where: { parentTaskId: id, deletedAt: null } })) throw new AppError(409, "TASK_HAS_SUBTASKS", "Delete or detach subtasks first");
      const row = await context.tx.projectTask.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await taskRevision(context, row, previous);
      await workspaceEvent(context, "TASK_DELETED", "TASK", id);
      await bumpBoard(context);
      return { id };
    });
  },
  async milestones(projectId: string, actorId: string, query: Page): Promise<WorkspacePage<WorkspaceMilestone>> {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project }) => {
      const where = { projectId: project.id };
      const [rows, total] = await Promise.all([tx.projectMilestone.findMany({ where, ...paging(query), orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }] }), tx.projectMilestone.count({ where })]);
      return pageOf(rows.map(milestoneDto), total, query);
    });
  },
  async saveMilestone(projectId: string, actorId: string, input: Omit<WorkspaceMilestone, "id" | "version"> & { expectedVersion?: number; clientKey?: string }, id?: string) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const creationInput = { title: input.title, description: input.description, dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null, status: input.status };
      const requestKey = !id && input.clientKey ? `MILESTONE_CREATE:${context.actorId}:${input.clientKey}` : undefined;
      if (requestKey) {
        const receipt = await context.tx.projectActivity.findFirst({ where: { projectId: context.project.id, idempotencyKey: requestKey } });
        if (receipt?.entityId) {
          await assertWorkspaceRetry(context, "MILESTONE", receipt.entityId, creationInput);
          const existing = await context.tx.projectMilestone.findFirst({ where: { id: receipt.entityId, projectId: context.project.id } });
          if (!existing) throw AppError.conflict("This milestone was removed");
          return milestoneDto(existing);
        }
      }
      const previous = id ? await context.tx.projectMilestone.findFirst({ where: { id, projectId: context.project.id } }) : null;
      if (id && !previous) throw AppError.notFound("Milestone not found");
      if (previous) expectWorkspaceVersion(previous.version, input.expectedVersion!);
      const fields = { title: input.title, description: input.description, dueAt: input.dueAt ? new Date(input.dueAt) : null, status: input.status };
      const row = previous ? await context.tx.projectMilestone.update({ where: { id }, data: { ...fields, version: { increment: 1 } } }) : await context.tx.projectMilestone.create({ data: { ...fields, projectId: context.project.id, createdById: context.actorId } });
      await workspaceRevision(context, "MILESTONE", row, previous ? undefined : creationInput);
      await workspaceEvent(context, previous ? "MILESTONE_UPDATED" : "MILESTONE_CREATED", "MILESTONE", row.id, {}, requestKey);
      if (previous && previous.dueAt?.toISOString() !== row.dueAt?.toISOString()) {
        const tasks = await context.tx.projectTask.findMany({ where: { projectId: context.project.id, milestoneId: row.id, deletedAt: null, status: { not: "DONE" }, assigneeId: { not: null } }, distinct: ["assigneeId"], select: { assigneeId: true } });
        await workspaceNotify(context, tasks.flatMap(task => task.assigneeId ? [task.assigneeId] : []), "MILESTONE", row.id, row.version);
      }
      return milestoneDto(row);
    });
  },
  async comments(projectId: string, actorId: string, targetKind: "TASK" | "PLAN_REVISION", targetId: string, query: Page) {
    return withWorkspace(projectId, actorId, { mentor: targetKind === "PLAN_REVISION" }, async context => {
      if (targetKind === "TASK") await requireTask(context, targetId, true); else await authorizedPlanRevision(context, targetId);
      return commentsFor(context, targetKind, targetId, query);
    });
  },
  async addComment(projectId: string, actorId: string, input: { targetKind: "TASK" | "PLAN_REVISION"; targetId: string; body: string; clientKey: string; mentions: string[] }) {
    return withWorkspace(projectId, actorId, { write: true, mentor: input.targetKind === "PLAN_REVISION", accounts: input.mentions }, async context => {
      if (input.targetKind === "TASK") await requireTask(context, input.targetId); else await authorizedPlanRevision(context, input.targetId);
      if (!context.role && input.mentions.length) throw AppError.forbidden("Mentors cannot address private project members through this endpoint");
      for (const id of input.mentions) await assertWorkspaceAssignee(context, id);
      const previous = await context.tx.projectWorkspaceComment.findUnique({ where: { projectId_authorId_clientKey: { projectId: context.project.id, authorId: context.actorId, clientKey: input.clientKey } } });
      if (previous) {
        if (previous.targetId !== input.targetId || previous.targetKind !== input.targetKind || previous.body !== input.body) throw AppError.conflict("This comment key was already used");
        return { id: previous.id };
      }
      const row = await context.tx.projectWorkspaceComment.create({ data: { projectId: context.project.id, authorId: context.actorId, targetKind: input.targetKind, targetId: input.targetId, body: input.body, clientKey: input.clientKey } });
      await workspaceEvent(context, context.role ? "WORKSPACE_COMMENT_ADDED" : "MENTOR_PLAN_FEEDBACK", input.targetKind, input.targetId, { commentId: row.id });
      await workspaceNotify(context, input.mentions, "MENTION", row.id, 1);
      if (!context.role) await workspaceNotify(context, [context.project.ownerId], "MENTOR_FEEDBACK", row.id, 1);
      return { id: row.id };
    });
  },
};
