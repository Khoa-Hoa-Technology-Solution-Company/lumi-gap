import type { Prisma, ProjectDiscussion, ProjectDecision } from "../../generated/prisma/client.js";
import type { PlanThreadContext, SaveWorkspaceDiscussion, SaveWorkspaceDecision, WorkspaceDiscussion, WorkspaceDecision, WorkspaceDiscussionDetail, WorkspacePage, WorkspacePerson } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, workspacePeople, workspacePerson, assertWorkspaceAssignee, assertWorkspaceLink, assertWorkspaceRetry, expectWorkspaceVersion, workspaceEvent, workspaceNotify, workspaceRevision, type WorkspaceContext } from "./workspace-access.js";
import { notificationService } from "../notifications/notification.service.js";
import { canAccessProjectAsMentor } from "./academic-relationship-access.js";
import { workspaceHistory } from "./project-tasks.service.js";

type Page = { page: number; pageSize: number };
const paging = (query: Page) => ({ take: query.pageSize, skip: (query.page - 1) * query.pageSize });
export function discussionDto(row: ProjectDiscussion, people: Map<string, WorkspacePerson>, replies = 0): WorkspaceDiscussion {
  const context = row.context as { planSection?: PlanThreadContext };
  return { id: row.id, title: row.title, body: row.body, category: row.category as WorkspaceDiscussion["category"], status: row.status as WorkspaceDiscussion["status"], conclusion: row.conclusion, author: workspacePerson(people, row.authorId), link: row.targetId && row.targetKind && row.targetKind !== "PLAN_DRAFT" ? { kind: row.targetKind as NonNullable<WorkspaceDiscussion["link"]>["kind"], id: row.targetId } : null, mentorRelationshipId: row.mentorRelationshipId, version: row.version, replyCount: replies, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), ...(context.planSection ? { planContext: context.planSection } : {}) };
}
function decisionDto(row: ProjectDecision, people: Map<string, WorkspacePerson>): WorkspaceDecision {
  return { id: row.id, decision: row.decision, context: row.context, alternatives: row.alternatives, rationale: row.rationale, link: row.targetId && row.targetKind ? { kind: row.targetKind as NonNullable<WorkspaceDecision["link"]>["kind"], id: row.targetId } : null, threadId: row.threadId, recordedBy: workspacePerson(people, row.recordedById), version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
async function mentorThreadScope(context: WorkspaceContext): Promise<Prisma.ProjectDiscussionWhereInput[]> {
  const relations = await context.tx.mentorRelationship.findMany({ where: { projectId: context.project.id, mentorUserId: context.actorId, status: "ACTIVE" }, select: { id: true } });
  const shares = await context.tx.planShare.findMany({ where: { projectId: context.project.id, revokedAt: null, relationshipId: { in: relations.map(row => row.id) } }, select: { relationshipId: true, revisionId: true } });
  return [...shares.map(share => ({ mentorRelationshipId: share.relationshipId, targetKind: "PLAN_REVISION", targetId: share.revisionId })), { mentorRelationshipId: null, targetKind: "PLAN_REVISION", targetId: { in: shares.map(share => share.revisionId) }, context: { path: ["planSection", "section"], string_starts_with: "" } }, { mentorRelationshipId: { in: relations.map(r => r.id) }, targetKind: "MANUSCRIPT_SNAPSHOT" }];
}
async function requireDiscussion(context: WorkspaceContext, id: string) {
  const scopes = context.role ? undefined : await mentorThreadScope(context);
  const row = await context.tx.projectDiscussion.findFirst({ where: { id, projectId: context.project.id, ...(scopes ? { OR: scopes } : {}) } });
  if (!row) throw AppError.notFound("Discussion not found");
  return row;
}
async function checkDiscussionShare(context: WorkspaceContext, input: SaveWorkspaceDiscussion) {
  await assertWorkspaceLink(context, input.link);
  if (!input.mentorRelationshipId) return;
  if (context.role !== "OWNER") throw AppError.forbidden("Only the project owner can share a mentor discussion");
  if (input.category !== "MENTOR_QUESTION" || input.link?.kind !== "PLAN_REVISION") throw AppError.badRequest("Mentor discussions require a shared plan revision");
  const [share, relationship] = await Promise.all([
    context.tx.planShare.findFirst({ where: { projectId: context.project.id, relationshipId: input.mentorRelationshipId, revisionId: input.link.id, revokedAt: null } }),
    context.tx.mentorRelationship.findFirst({ where: { id: input.mentorRelationshipId, projectId: context.project.id, status: "ACTIVE" } }),
  ]);
  if (!share || !relationship || !await canAccessProjectAsMentor(context.project.id, relationship.mentorUserId, context.tx)) throw AppError.badRequest("Share this plan revision with the active verified mentor first");
}
export const projectDiscussionsService = {
  async list(projectId: string, actorId: string, query: Page & { q?: string; status?: string }): Promise<WorkspacePage<WorkspaceDiscussion>> {
    return withWorkspace(projectId, actorId, { mentor: true }, async context => {
      const scopes = context.role ? undefined : await mentorThreadScope(context);
      const where: Prisma.ProjectDiscussionWhereInput = { projectId: context.project.id, ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}), ...(query.status ? { status: query.status } : {}), ...(scopes ? { OR: scopes } : {}) };
      const [rows, total] = await Promise.all([context.tx.projectDiscussion.findMany({ where, ...paging(query), orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }), context.tx.projectDiscussion.count({ where })]);
      const [people, counts] = await Promise.all([workspacePeople(context.tx, rows.map(row => row.authorId)), context.tx.projectTeamMessage.groupBy({ by: ["threadId"], where: { threadId: { in: rows.map(row => row.id) }, isDeleted: false }, _count: true })]);
      return { items: rows.map(row => discussionDto(row, people, counts.find(count => count.threadId === row.id)?._count ?? 0)), ...query, total, hasNext: query.page * query.pageSize < total };
    });
  },
  async detail(projectId: string, actorId: string, id: string, query: Page): Promise<WorkspaceDiscussionDetail> {
    return withWorkspace(projectId, actorId, { mentor: true }, async context => {
      const thread = await requireDiscussion(context, id);
      const where = { projectId: context.project.id, threadId: id, isDeleted: false };
      const [rows, total] = await Promise.all([context.tx.projectTeamMessage.findMany({ where, ...paging(query), orderBy: [{ createdAt: "asc" }, { id: "asc" }] }), context.tx.projectTeamMessage.count({ where })]);
      const people = await workspacePeople(context.tx, [thread.authorId, ...rows.map(row => row.senderId)]);
      await context.tx.projectTeamMessageRead.createMany({ data: rows.map(row => ({ messageId: row.id, userId: context.actorId })), skipDuplicates: true });
      return { thread: discussionDto(thread, people, total), messages: { items: rows.map(row => ({ id: row.id, body: row.content, author: workspacePerson(people, row.senderId), replyToId: row.replyToId, createdAt: row.createdAt.toISOString() })), ...query, total, hasNext: query.page * query.pageSize < total }, canResolve: Boolean(context.role && context.project.status !== "ARCHIVED"), canReply: context.project.status !== "ARCHIVED" && thread.status === "OPEN", canEdit: Boolean(!(thread.context as { planSection?: unknown }).planSection && context.role && context.project.status !== "ARCHIVED" && (context.role === "OWNER" || thread.authorId === context.actorId)) };
    });
  },
  async save(projectId: string, actorId: string, input: SaveWorkspaceDiscussion & { clientKey?: string; expectedVersion?: number; mentions: string[] }, id?: string) {
    return withWorkspace(projectId, actorId, { write: true, accounts: input.mentions }, async context => {
      const previous = id ? await requireDiscussion(context, id) : input.clientKey ? await context.tx.projectDiscussion.findUnique({ where: { projectId_authorId_clientKey: { projectId: context.project.id, authorId: context.actorId, clientKey: input.clientKey } } }) : null;
      const creationInput = { title: input.title, body: input.body, category: input.category, link: input.link, mentorRelationshipId: input.mentorRelationshipId, mentions: [...new Set(input.mentions)].sort() };
      if (!id && previous) {
        await assertWorkspaceRetry(context, "DISCUSSION", previous.id, creationInput);
        return { id: previous.id, version: previous.version };
      }
      if (previous) {
        if ((previous.context as { planSection?: unknown }).planSection || previous.targetKind === "MANUSCRIPT_SNAPSHOT" || (previous.targetKind === "MANUSCRIPT" && Object.keys(previous.context as object).length)) throw AppError.conflict("Artifact comments retain their original context; reply or resolve the thread instead");
        expectWorkspaceVersion(previous.version, input.expectedVersion!);
        if (previous.authorId !== context.actorId && context.role !== "OWNER") throw AppError.forbidden("Only the author or project owner can edit a discussion");
      }
      await checkDiscussionShare(context, input);
      for (const userId of input.mentions) await assertWorkspaceAssignee(context, userId);
      const fields = { title: input.title, body: input.body, category: input.category, targetKind: input.link?.kind ?? null, targetId: input.link?.id ?? null, mentorRelationshipId: input.mentorRelationshipId };
      const row = previous ? await context.tx.projectDiscussion.update({ where: { id }, data: { ...fields, version: { increment: 1 } } }) : await context.tx.projectDiscussion.create({ data: { ...fields, projectId: context.project.id, authorId: context.actorId, clientKey: input.clientKey! } });
      await workspaceRevision(context, "DISCUSSION", row, previous ? undefined : creationInput);
      await workspaceEvent(context, previous ? "DISCUSSION_UPDATED" : "DISCUSSION_CREATED", "DISCUSSION", row.id);
      await workspaceNotify(context, input.mentions, "MENTION", row.id, row.version);
      if (row.mentorRelationshipId) {
        const relationship = await context.tx.mentorRelationship.findUniqueOrThrow({ where: { id: row.mentorRelationshipId } });
        await notificationService.create({ userId: relationship.mentorUserId, type: "PROJECT_WORKSPACE_MENTOR_QUESTION", title: "Research question for your feedback", message: "A research team requested your feedback on a shared plan revision.", targetKind: "project", targetId: context.project.id, eventKey: `WORKSPACE:MENTOR_QUESTION:${row.id}:${row.version}:${relationship.mentorUserId}`, emailStatus: "SKIPPED" }, context.tx);
      }
      return { id: row.id, version: row.version };
    });
  },
  async reply(projectId: string, actorId: string, id: string, input: { body: string; replyToId: string | null; clientKey: string; mentions: string[] }) {
    return withWorkspace(projectId, actorId, { write: true, mentor: true, accounts: input.mentions }, async context => {
      const thread = await requireDiscussion(context, id);
      if (thread.status !== "OPEN") throw AppError.conflict("Reopen this discussion before replying");
      if (!context.role && input.mentions.length) throw AppError.forbidden("Mentors cannot mention private project members");
      for (const userId of input.mentions) await assertWorkspaceAssignee(context, userId);
      if (input.replyToId && !await context.tx.projectTeamMessage.findFirst({ where: { id: input.replyToId, threadId: id, projectId: context.project.id, isDeleted: false } })) throw AppError.badRequest("Reply target does not belong to this discussion");
      const prior = await context.tx.projectTeamMessage.findUnique({ where: { projectId_senderId_clientKey: { projectId: context.project.id, senderId: context.actorId, clientKey: input.clientKey } } });
      if (prior) {
        if (prior.threadId !== id || prior.content !== input.body || prior.replyToId !== input.replyToId) throw AppError.conflict("This message key was already used");
        return { id: prior.id };
      }
      const message = await context.tx.projectTeamMessage.create({ data: { projectId: context.project.id, threadId: id, senderId: context.actorId, content: input.body, replyToId: input.replyToId, clientKey: input.clientKey } });
      await context.tx.projectTeamMessageRead.create({ data: { messageId: message.id, userId: context.actorId } });
      await context.tx.projectDiscussion.update({ where: { id }, data: { updatedAt: new Date() } });
      await workspaceEvent(context, context.role ? "DISCUSSION_REPLIED" : "MENTOR_THREAD_FEEDBACK", "DISCUSSION", id, { messageId: message.id });
      await workspaceNotify(context, input.mentions, "MENTION", message.id, 1);
      if (!context.role) await workspaceNotify(context, [context.project.ownerId], "MENTOR_FEEDBACK", message.id, 1);
      return { id: message.id };
    });
  },
  async resolve(projectId: string, actorId: string, id: string, input: { expectedVersion: number; status: "OPEN" | "RESOLVED"; conclusion: string }) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const previous = await requireDiscussion(context, id);
      expectWorkspaceVersion(previous.version, input.expectedVersion);
      if (input.status === "RESOLVED" && !input.conclusion.trim()) throw AppError.badRequest("Record a conclusion before resolving");
      const row = await context.tx.projectDiscussion.update({ where: { id }, data: { status: input.status, conclusion: input.conclusion, version: { increment: 1 } } });
      await workspaceRevision(context, "DISCUSSION", row);
      await workspaceEvent(context, input.status === "RESOLVED" ? "DISCUSSION_RESOLVED" : "DISCUSSION_REOPENED", "DISCUSSION", id);
      return { id, version: row.version };
    });
  },
  async decisions(projectId: string, actorId: string, query: Page & { q?: string }): Promise<WorkspacePage<WorkspaceDecision>> {
    return withWorkspace(projectId, actorId, {}, async context => {
      const where: Prisma.ProjectDecisionWhereInput = { projectId: context.project.id, ...(query.q ? { decision: { contains: query.q, mode: "insensitive" } } : {}) };
      const [rows, total] = await Promise.all([context.tx.projectDecision.findMany({ where, ...paging(query), orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }), context.tx.projectDecision.count({ where })]);
      const people = await workspacePeople(context.tx, rows.map(row => row.recordedById));
      return { items: rows.map(row => decisionDto(row, people)), ...query, total, hasNext: query.page * query.pageSize < total };
    });
  },
  async saveDecision(projectId: string, actorId: string, input: SaveWorkspaceDecision & { expectedVersion?: number }, id?: string) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const requestKey = !id && input.clientKey ? `decision-create:${context.actorId}:${input.clientKey}` : undefined;
      if (requestKey) {
        const receipt = await context.tx.projectActivity.findUnique({ where: { projectId_idempotencyKey: { projectId: context.project.id, idempotencyKey: requestKey } } });
        if (receipt?.entityId) {
          await assertWorkspaceRetry(context, "DECISION", receipt.entityId, input);
          const previous = await context.tx.projectDecision.findFirstOrThrow({ where: { id: receipt.entityId, projectId: context.project.id } });
          return { id: previous.id, version: previous.version };
        }
      }
      const previous = id ? await context.tx.projectDecision.findFirst({ where: { id, projectId: context.project.id } }) : null;
      if (id && !previous) throw AppError.notFound("Decision not found");
      if (previous) expectWorkspaceVersion(previous.version, input.expectedVersion!);
      await assertWorkspaceLink(context, input.link);
      if (input.threadId) await requireDiscussion(context, input.threadId);
      const fields = { decision: input.decision, context: input.context, alternatives: input.alternatives, rationale: input.rationale, targetKind: input.link?.kind ?? null, targetId: input.link?.id ?? null, threadId: input.threadId };
      const row = previous ? await context.tx.projectDecision.update({ where: { id }, data: { ...fields, version: { increment: 1 } } }) : await context.tx.projectDecision.create({ data: { ...fields, projectId: context.project.id, recordedById: context.actorId } });
      await workspaceRevision(context, "DECISION", row, previous ? undefined : input);
      await workspaceEvent(context, previous ? "DECISION_REVISED" : "DECISION_RECORDED", "DECISION", row.id, { version: row.version }, requestKey);
      return { id: row.id, version: row.version };
    });
  },
  async history(projectId: string, actorId: string, kind: "DECISION" | "DISCUSSION", id: string, query: Page) {
    return withWorkspace(projectId, actorId, { mentor: kind === "DISCUSSION" }, async context => {
      if (kind === "DISCUSSION") await requireDiscussion(context, id);
      else if (!await context.tx.projectDecision.findFirst({ where: { id, projectId: context.project.id } })) throw AppError.notFound("Decision not found");
      return workspaceHistory(context, kind, id, query);
    });
  },
};
