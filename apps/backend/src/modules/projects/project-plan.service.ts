import type { PlanQuestion, PlanShareSummary, ResearchPlanContent, ResearchPlanRevision, ResearchPlanView, SaveResearchPlan, WorkspacePage } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { canAccessProjectAsMentor } from "./academic-relationship-access.js";
import { planContent, recordPlanSnapshot } from "./plan-history.js";
import { assertWorkspaceLink, expectWorkspaceVersion, jsonSnapshot, withWorkspace, workspaceEvent, workspacePeople, workspacePerson, type WorkspaceContext } from "./workspace-access.js";
import { notificationService } from "../notifications/notification.service.js";

export async function authorizedPlanRevision(context: WorkspaceContext, revisionId: string) {
  const revision = await context.tx.planRevision.findFirst({ where: { id: revisionId, projectId: context.project.id } });
  if (!revision) throw AppError.notFound("Plan revision not found");
  if (!context.role) {
    const relations = await context.tx.mentorRelationship.findMany({ where: { projectId: context.project.id, mentorUserId: context.actorId, status: "ACTIVE" }, select: { id: true } });
    const share = await context.tx.planShare.findFirst({ where: { projectId: context.project.id, revisionId, relationshipId: { in: relations.map(row => row.id) }, revokedAt: null } });
    if (!share || !await canAccessProjectAsMentor(context.project.id, context.actorId, context.tx)) throw AppError.notFound("Plan revision not found");
  }
  return revision;
}

export async function validatePlanQuestions(context: WorkspaceContext, before: ResearchPlanContent, questions: PlanQuestion[]) {
  const { tx, project } = context;
  const retainedIds = new Set(questions.map(question => question.id));
  const removedIds = before.questions.filter(question => !retainedIds.has(question.id)).map(question => question.id);
  if (removedIds.length) {
    const where = { projectId: project.id, targetKind: "QUESTION", targetId: { in: removedIds } };
    const linked = await Promise.all([tx.projectTask.count({ where }), tx.projectDiscussion.count({ where }), tx.projectDecision.count({ where })]);
    if (linked.some(Boolean)) throw new AppError(409, "QUESTION_IN_USE", "This question is linked to research work. Keep it in the plan or update its links before removing it.");
  }
  for (const question of questions) {
    if (question.sourceGapId) await assertWorkspaceLink(context, { kind: "GAP", id: question.sourceGapId });
    if (question.sourceGapVersion) {
      const snapshot = await tx.projectWorkspaceRevision.findFirst({ where: { projectId: project.id, entityKind: "GAP", entityId: question.sourceGapId ?? "", version: question.sourceGapVersion } });
      if (!snapshot) throw AppError.badRequest("The question's source gap revision is unavailable");
      const manifest = (snapshot.snapshot as { evidenceManifest?: Array<{ evidenceRevisionId?: string }> }).evidenceManifest ?? [];
      if (question.sourceEvidenceRevisionIds?.some(id => !manifest.some(link => link.evidenceRevisionId === id))) throw AppError.badRequest("Question evidence revisions must belong to its source gap packet");
    } else if (question.sourceEvidenceRevisionIds?.length) throw AppError.badRequest("Pin a source gap revision before linking evidence revisions");
    if (question.evidenceIds?.length) {
      if (!question.sourceGapId) throw AppError.badRequest("Choose a source gap before linking its evidence");
      const count = await tx.gapEvidenceRecord.count({ where: { id: { in: question.evidenceIds }, gapId: question.sourceGapId } });
      if (count !== new Set(question.evidenceIds).size) throw AppError.badRequest("Question evidence must belong to its source gap in this project");
    }
  }
}

export const projectPlanService = {
  async get(projectId: string, actorId: string, revisionId?: string): Promise<ResearchPlanView> {
    return withWorkspace(projectId, actorId, { mentor: true }, async context => {
      const { tx, project, role } = context;
      const plan = await tx.researchPlan.findUniqueOrThrow({ where: { projectId: project.id } });
      let selected = revisionId;
      if (!role && !selected) {
        const relations = await tx.mentorRelationship.findMany({ where: { projectId: project.id, mentorUserId: context.actorId, status: "ACTIVE" }, select: { id: true } });
        const share = await tx.planShare.findFirst({ where: { projectId: project.id, relationshipId: { in: relations.map(row => row.id) }, revokedAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        if (!share) throw AppError.notFound("No research plan has been shared with you");
        selected = share.revisionId;
      }
      const revision = selected ? await authorizedPlanRevision(context, selected) : await tx.planRevision.findUnique({ where: { planId_version: { planId: plan.id, version: plan.version } } });
      return { projectId: project.id, projectTitle: project.title, version: revision?.version ?? plan.version, content: selected && revision ? revision.snapshot as unknown as ResearchPlanContent : planContent(plan, project), currentRevisionId: revision?.id ?? null, canEdit: Boolean(role && !selected && project.status !== "ARCHIVED"), canShare: role === "OWNER" && project.status !== "ARCHIVED", archived: project.status === "ARCHIVED", access: role ? "TEAM" : "MENTOR" };
    });
  },
  async save(projectId: string, actorId: string, input: SaveResearchPlan): Promise<{ version: number; revisionId: string }> {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const { tx, project } = context;
      const plan = await tx.researchPlan.findUniqueOrThrow({ where: { projectId: project.id } });
      expectWorkspaceVersion(plan.version, input.expectedVersion);
      const before = planContent(plan, project);
      await validatePlanQuestions(context, before, input.questions);
      await recordPlanSnapshot(tx, project.id, null, null);
      const { expectedVersion: _version, changeSummary, inclusionCriteria, exclusionCriteria, ...fields } = input;
      const nextContent = { ...fields, inclusionCriteria, exclusionCriteria };
      if ((Object.keys(before) as Array<keyof ResearchPlanContent>).every(key => JSON.stringify(before[key]) === JSON.stringify(nextContent[key]))) {
        const current = await recordPlanSnapshot(tx, project.id, context.actorId, changeSummary || null);
        return { version: current.version, revisionId: current.id };
      }
      await tx.researchPlan.update({ where: { id: plan.id }, data: { ...fields, questions: jsonSnapshot(fields.questions), updatedById: context.actorId, version: { increment: 1 } } });
      await tx.project.update({ where: { id: project.id }, data: { inclusionCriteria, exclusionCriteria, version: { increment: 1 } } });
      const revision = await recordPlanSnapshot(tx, project.id, context.actorId, changeSummary || null);
      await workspaceEvent(context, "PLAN_UPDATED", "PLAN_REVISION", revision.id, { version: revision.version });
      return { version: revision.version, revisionId: revision.id };
    });
  },
  async revisions(projectId: string, actorId: string, query: { page: number; pageSize: number }): Promise<WorkspacePage<ResearchPlanRevision>> {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project }) => {
      const where = { projectId: project.id };
      const [rows, total] = await Promise.all([tx.planRevision.findMany({ where, orderBy: [{ version: "desc" }], take: query.pageSize, skip: (query.page - 1) * query.pageSize }), tx.planRevision.count({ where })]);
      const people = await workspacePeople(tx, rows.flatMap(row => row.changedById ? [row.changedById] : []));
      const comments = await tx.projectDiscussion.groupBy({ by: ["targetId"], where: { projectId: project.id, targetKind: "PLAN_REVISION", targetId: { in: rows.map(row => row.id) } }, _count: true });
      return { items: rows.map(row => ({ id: row.id, version: row.version, content: row.snapshot as unknown as ResearchPlanContent, changedBy: row.changedById ? workspacePerson(people, row.changedById) : null, changeSummary: row.changeSummary, createdAt: row.createdAt.toISOString(), feedbackCount: comments.find(count => count.targetId === row.id)?._count ?? 0 })), ...query, total, hasNext: query.page * query.pageSize < total };
    });
  },
  async shares(projectId: string, actorId: string): Promise<PlanShareSummary[]> {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project }) => {
      // Never hide a still-live grant behind a page of revoked grants.
      const rows = await tx.planShare.findMany({ where: { projectId: project.id, revokedAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const [relationships, revisions] = await Promise.all([tx.mentorRelationship.findMany({ where: { id: { in: rows.map(row => row.relationshipId) } } }), tx.planRevision.findMany({ where: { id: { in: rows.map(row => row.revisionId) } } })]);
      const people = await workspacePeople(tx, relationships.map(row => row.mentorUserId));
      return rows.map(row => ({ id: row.id, revisionId: row.revisionId, version: revisions.find(revision => revision.id === row.revisionId)!.version, relationshipId: row.relationshipId, mentor: workspacePerson(people, relationships.find(relation => relation.id === row.relationshipId)!.mentorUserId), revokedAt: row.revokedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }));
    });
  },
  async share(projectId: string, actorId: string, input: { revisionId: string; relationshipId: string }) {
    return withWorkspace(projectId, actorId, { write: true, owner: true }, async context => {
      await authorizedPlanRevision(context, input.revisionId);
      const relation = await context.tx.mentorRelationship.findFirst({ where: { id: input.relationshipId, projectId: context.project.id, status: "ACTIVE" } });
      if (!relation || !await canAccessProjectAsMentor(context.project.id, relation.mentorUserId, context.tx)) throw AppError.badRequest("Choose an active verified mentor");
      const existing = await context.tx.planShare.findFirst({ where: { projectId: context.project.id, ...input, revokedAt: null } });
      if (existing) return existing;
      const share = await context.tx.planShare.create({ data: { projectId: context.project.id, ...input, sharedById: context.actorId } });
      await workspaceEvent(context, "PLAN_SHARED", "PLAN_REVISION", input.revisionId, { shareId: share.id });
      await notificationService.create({ userId: relation.mentorUserId, title: "Research plan shared", message: "A research team shared a specific plan revision for your feedback.", type: "PROJECT_WORKSPACE_PLAN_SHARED", targetKind: "project", targetId: context.project.id, eventKey: `WORKSPACE:PLAN_SHARED:${share.id}`, emailStatus: "SKIPPED" }, context.tx);
      return share;
    });
  },
  async revokeShare(projectId: string, actorId: string, id: string) {
    return withWorkspace(projectId, actorId, {}, async context => {
      if (context.role !== "OWNER") throw AppError.forbidden("Only the project owner can revoke a share");
      const share = await context.tx.planShare.findFirst({ where: { id, projectId: context.project.id } });
      if (!share) throw AppError.notFound("Plan share not found");
      if (!share.revokedAt) {
        await context.tx.planShare.update({ where: { id }, data: { revokedAt: new Date() } });
        await workspaceEvent(context, "PLAN_SHARE_REVOKED", "PLAN_REVISION", share.revisionId, { shareId: id });
      }
      return { id };
    });
  },
};
