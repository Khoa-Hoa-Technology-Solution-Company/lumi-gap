import type { z } from "zod";
import { AppError } from "../../common/exceptions/app-error.js";
import { authorizedPlanRevision } from "./project-plan.service.js";
import { discussionDto } from "./project-discussions.service.js";
import { planThreadSchema, planThreadsQuerySchema } from "./dto/project-workspace.schema.js";
import { assertWorkspaceAssignee, assertWorkspaceRetry, jsonSnapshot, withWorkspace, workspaceEvent, workspaceNotify, workspacePeople, workspaceRevision, type WorkspaceContext } from "./workspace-access.js";

async function anchor(context: WorkspaceContext, revisionId?: string) {
  const plan = await context.tx.researchPlan.findUniqueOrThrow({ where: { projectId: context.project.id } });
  if (!revisionId && !context.role) throw AppError.notFound("Share a plan version before requesting mentor feedback");
  const revision = revisionId ? await authorizedPlanRevision(context, revisionId) : null;
  return { targetId: revision?.id ?? plan.id, targetKind: revision ? "PLAN_REVISION" : "PLAN_DRAFT", version: revision?.version ?? plan.version };
}
export const projectPlanFeedbackService = {
  async list(projectId: string, actorId: string, query: z.infer<typeof planThreadsQuerySchema>) {
    return withWorkspace(projectId, actorId, { mentor: true }, async context => {
      const target = await anchor(context, query.revisionId);
      const where = { projectId: context.project.id, targetKind: target.targetKind, targetId: target.targetId, context: { path: ["planSection", "section"], equals: query.section } };
      const [rows, total] = await Promise.all([context.tx.projectDiscussion.findMany({ where, take: query.pageSize, skip: (query.page - 1) * query.pageSize, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }), context.tx.projectDiscussion.count({ where })]);
      const [people, counts] = await Promise.all([workspacePeople(context.tx, rows.map(row => row.authorId)), context.tx.projectTeamMessage.groupBy({ by: ["threadId"], where: { threadId: { in: rows.map(row => row.id) }, isDeleted: false }, _count: true })]);
      return { items: rows.map(row => discussionDto(row, people, counts.find(count => count.threadId === row.id)?._count ?? 0)), ...query, total, hasNext: query.page * query.pageSize < total };
    });
  },
  async create(projectId: string, actorId: string, raw: z.infer<typeof planThreadSchema>) {
    const input = planThreadSchema.parse(raw);
    return withWorkspace(projectId, actorId, { write: true, mentor: true, accounts: input.mentions }, async context => {
      const target = await anchor(context, input.revisionId);
      if (!context.role && input.mentions.length) throw AppError.forbidden("Mentors cannot mention private project members");
      for (const id of input.mentions) await assertWorkspaceAssignee(context, id);
      const creationInput = { ...input, mentions: [...new Set(input.mentions)].sort() };
      const previous = await context.tx.projectDiscussion.findUnique({ where: { projectId_authorId_clientKey: { projectId: context.project.id, authorId: context.actorId, clientKey: input.clientKey } } });
      if (previous) { await assertWorkspaceRetry(context, "DISCUSSION", previous.id, creationInput); return { id: previous.id, version: previous.version }; }
      const planSection = { section: input.section, revisionId: input.revisionId ?? null, draftVersion: target.version };
      const row = await context.tx.projectDiscussion.create({ data: { projectId: context.project.id, targetKind: target.targetKind, targetId: target.targetId, authorId: context.actorId, clientKey: input.clientKey, title: `Research plan: ${input.section}`, category: "GENERAL", body: input.body, context: jsonSnapshot({ planSection }) } });
      await workspaceRevision(context, "DISCUSSION", row, creationInput);
      await workspaceEvent(context, context.role ? "PLAN_SECTION_COMMENTED" : "MENTOR_PLAN_FEEDBACK", "DISCUSSION", row.id, { section: input.section, revisionId: input.revisionId ?? null, draftVersion: target.version });
      await workspaceNotify(context, input.mentions, "MENTION", row.id, row.version);
      if (!context.role) await workspaceNotify(context, [context.project.ownerId], "MENTOR_FEEDBACK", row.id, row.version);
      return { id: row.id, version: row.version };
    });
  },
};
