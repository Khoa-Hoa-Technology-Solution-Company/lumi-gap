import type { Prisma, ProjectTask } from "../../generated/prisma/client.js";
import type { SaveWorkspaceTask, WorkspaceTask, WorkspacePerson, WorkspacePage, WorkspaceMilestone, WorkspaceComment, WorkspaceRevision, WorkspaceTaskDetail } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, workspacePeople, workspacePerson, assertWorkspaceAssignee, assertWorkspaceLink, assertWorkspaceRetry, expectWorkspaceVersion, workspaceEvent, workspaceNotify, workspaceRevision, type WorkspaceContext } from "./workspace-access.js";
import { authorizedPlanRevision } from "./project-plan.service.js";

type Page = { page: number; pageSize: number };
const pageOf = <T>(items: T[], total: number, query: Page): WorkspacePage<T> => ({ items, total, ...query, hasNext: query.page * query.pageSize < total });
const paging = (query: Page) => ({ take: query.pageSize, skip: (query.page - 1) * query.pageSize });
export function workspaceTaskDto(row: ProjectTask, people: Map<string, WorkspacePerson>): WorkspaceTask {
  return { id: row.id, title: row.title, description: row.description, status: row.status as WorkspaceTask["status"], blockedReason: row.blockedReason, assignee: row.assigneeId ? workspacePerson(people, row.assigneeId) : null, creator: workspacePerson(people, row.createdById), milestoneId: row.milestoneId, dueAt: row.dueAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null, link: row.targetKind && row.targetId ? { kind: row.targetKind as NonNullable<WorkspaceTask["link"]>["kind"], id: row.targetId } : null, version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function milestoneDto(row: { id: string; title: string; description: string; dueAt: Date | null; status: string; version: number }): WorkspaceMilestone {
  return { id: row.id, title: row.title, description: row.description, dueAt: row.dueAt?.toISOString() ?? null, status: row.status as WorkspaceMilestone["status"], version: row.version };
}
async function requireTask(context: WorkspaceContext, id: string) {
  const row = await context.tx.projectTask.findFirst({ where: { id, projectId: context.project.id, deletedAt: null } });
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
export const projectTasksService = {
  async list(projectId: string, actorId: string, query: Page & { q?: string; status?: string; mine?: string; assigneeId?: string }): Promise<WorkspacePage<WorkspaceTask>> {
    return withWorkspace(projectId, actorId, {}, async context => {
      const where: Prisma.ProjectTaskWhereInput = { projectId: context.project.id, deletedAt: null, ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}), ...(query.status ? { status: query.status } : {}), ...(query.mine === "1" ? { assigneeId: context.actorId } : query.assigneeId ? { assigneeId: query.assigneeId } : {}) };
      const [rows, total] = await Promise.all([context.tx.projectTask.findMany({ where, ...paging(query), orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), context.tx.projectTask.count({ where })]);
      const people = await workspacePeople(context.tx, rows.flatMap(row => [row.createdById, ...(row.assigneeId ? [row.assigneeId] : [])]));
      return pageOf(rows.map(row => workspaceTaskDto(row, people)), total, query);
    });
  },
  async detail(projectId: string, actorId: string, id: string, query: Page): Promise<WorkspaceTaskDetail> {
    return withWorkspace(projectId, actorId, {}, async context => {
      const task = await requireTask(context, id);
      const [people, comments, history] = await Promise.all([workspacePeople(context.tx, [task.createdById, ...(task.assigneeId ? [task.assigneeId] : [])]), commentsFor(context, "TASK", id, query), workspaceHistory(context, "TASK", id, query)]);
      return { task: workspaceTaskDto(task, people), canDelete: context.project.status !== "ARCHIVED" && (context.role === "OWNER" || task.createdById === context.actorId), comments, history };
    });
  },
  async save(projectId: string, actorId: string, input: SaveWorkspaceTask & { clientKey?: string; expectedVersion?: number }, id?: string) {
    return withWorkspace(projectId, actorId, { write: true, accounts: input.assigneeId ? [input.assigneeId] : [] }, async context => {
      const previous = id ? await requireTask(context, id) : input.clientKey ? await context.tx.projectTask.findUnique({ where: { projectId_createdById_clientKey: { projectId: context.project.id, createdById: context.actorId, clientKey: input.clientKey } } }) : null;
      const creationInput = { title: input.title, description: input.description, status: input.status, blockedReason: input.blockedReason, assigneeId: input.assigneeId, milestoneId: input.milestoneId, dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null, link: input.link };
      if (!id && previous) {
        await assertWorkspaceRetry(context, "TASK", previous.id, creationInput);
        if (previous.deletedAt) throw AppError.conflict("This task was deleted. Use a new request key to create another task");
        return { id: previous.id, version: previous.version };
      }
      if (previous) expectWorkspaceVersion(previous.version, input.expectedVersion!);
      await assertWorkspaceAssignee(context, input.assigneeId);
      await assertWorkspaceLink(context, input.link);
      if (input.status === "BLOCKED" && !input.blockedReason.trim()) throw AppError.badRequest("Explain what is blocking this task");
      if (input.milestoneId && !await context.tx.projectMilestone.findFirst({ where: { id: input.milestoneId, projectId: context.project.id } })) throw AppError.badRequest("Milestone does not belong to this project");
      const fields = { title: input.title, description: input.description, status: input.status, blockedReason: input.blockedReason, assigneeId: input.assigneeId, milestoneId: input.milestoneId, dueAt: input.dueAt ? new Date(input.dueAt) : null, completedAt: input.status === "DONE" ? previous?.completedAt ?? new Date() : null, targetKind: input.link?.kind ?? null, targetId: input.link?.id ?? null };
      const row = previous ? await context.tx.projectTask.update({ where: { id: previous.id }, data: { ...fields, version: { increment: 1 } } }) : await context.tx.projectTask.create({ data: { ...fields, projectId: context.project.id, createdById: context.actorId, clientKey: input.clientKey! } });
      await workspaceRevision(context, "TASK", row, previous ? undefined : creationInput);
      await workspaceEvent(context, !previous ? "TASK_CREATED" : previous.status !== row.status ? "TASK_STATUS_CHANGED" : "TASK_UPDATED", "TASK", row.id, { version: row.version, status: row.status });
      if (row.status === "DONE" && previous?.status !== "DONE") await workspaceEvent(context, "TASK_COMPLETED", "TASK", row.id, { version: row.version });
      if (row.assigneeId && row.assigneeId !== previous?.assigneeId) await workspaceNotify(context, [row.assigneeId], "ASSIGNMENT", row.id, row.version);
      return { id: row.id, version: row.version };
    });
  },
  async remove(projectId: string, actorId: string, id: string, expectedVersion: number) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const previous = await requireTask(context, id);
      if (context.role !== "OWNER" && previous.createdById !== context.actorId) throw AppError.forbidden("Only the task creator or project owner can delete this task");
      expectWorkspaceVersion(previous.version, expectedVersion);
      const row = await context.tx.projectTask.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await workspaceRevision(context, "TASK", row);
      await workspaceEvent(context, "TASK_DELETED", "TASK", id);
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
  async saveMilestone(projectId: string, actorId: string, input: Omit<WorkspaceMilestone, "id" | "version"> & { expectedVersion?: number }, id?: string) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const previous = id ? await context.tx.projectMilestone.findFirst({ where: { id, projectId: context.project.id } }) : null;
      if (id && !previous) throw AppError.notFound("Milestone not found");
      if (previous) expectWorkspaceVersion(previous.version, input.expectedVersion!);
      const fields = { title: input.title, description: input.description, dueAt: input.dueAt ? new Date(input.dueAt) : null, status: input.status };
      const row = previous ? await context.tx.projectMilestone.update({ where: { id }, data: { ...fields, version: { increment: 1 } } }) : await context.tx.projectMilestone.create({ data: { ...fields, projectId: context.project.id, createdById: context.actorId } });
      await workspaceRevision(context, "MILESTONE", row);
      await workspaceEvent(context, previous ? "MILESTONE_UPDATED" : "MILESTONE_CREATED", "MILESTONE", row.id);
      if (previous && previous.dueAt?.toISOString() !== row.dueAt?.toISOString()) {
        const tasks = await context.tx.projectTask.findMany({ where: { projectId: context.project.id, milestoneId: row.id, deletedAt: null, status: { not: "DONE" }, assigneeId: { not: null } }, distinct: ["assigneeId"], select: { assigneeId: true } });
        await workspaceNotify(context, tasks.flatMap(task => task.assigneeId ? [task.assigneeId] : []), "MILESTONE", row.id, row.version);
      }
      return milestoneDto(row);
    });
  },
  async comments(projectId: string, actorId: string, targetKind: "TASK" | "PLAN_REVISION", targetId: string, query: Page) {
    return withWorkspace(projectId, actorId, { mentor: targetKind === "PLAN_REVISION" }, async context => {
      if (targetKind === "TASK") await requireTask(context, targetId); else await authorizedPlanRevision(context, targetId);
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
