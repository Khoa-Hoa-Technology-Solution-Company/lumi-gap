import type { Prisma } from "../../generated/prisma/client.js";
import { isDeepStrictEqual } from "node:util";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { authorizeProjectTransaction, assertActiveProjectAccount, lockProjectAccounts } from "./project-transaction.js";
import { canAccessProjectAsMentor } from "./academic-relationship-access.js";
import { notificationService } from "../notifications/notification.service.js";
import type { WorkspaceLink, WorkspacePerson } from "@trend/shared-types";

export type WorkspaceDb = Prisma.TransactionClient;
export function workspaceId(value: string) {
  const id = parseDatabaseId(value);
  if (!id) throw AppError.badRequest("Invalid identifier");
  return id.kind === "uuid" ? { id: id.value } : { legacyMongoId: id.value };
}
export async function withWorkspace<T>(projectId: string, actorId: string, options: { write?: boolean; owner?: boolean; mentor?: boolean; accounts?: string[] }, run: (context: WorkspaceContext) => Promise<T>) {
  const db = getPrisma();
  const [project, actor] = await Promise.all([db.project.findUnique({ where: workspaceId(projectId) }), db.user.findUnique({ where: workspaceId(actorId) })]);
  if (!project || !actor) throw AppError.notFound("Project not found");
  return db.$transaction(async tx => {
    await lockProjectAccounts(tx, [actor.id, ...(options.accounts ?? [])], project.id);
    await assertActiveProjectAccount(tx, actor.id);
    const live = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
    const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: live.id, userId: actor.id } } });
    const role = live.ownerId === actor.id ? "OWNER" as const : member?.status === "ACTIVE" ? "MEMBER" as const : null;
    if (role) {
      await authorizeProjectTransaction(tx, live.id, actor.id, options.owner ? "EDIT_SETTINGS" : options.write ? "CONTRIBUTE" : undefined);
    } else if (!options.mentor || !await canAccessProjectAsMentor(live.id, actor.id, tx)) throw AppError.notFound("Project not found");
    if (options.write && live.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
    return run({ tx, project: live, actorId: actor.id, role });
  }, { maxWait: 10000, timeout: 20000 });
}
export type WorkspaceContext = { tx: WorkspaceDb; project: NonNullable<Awaited<ReturnType<WorkspaceDb["project"]["findUnique"]>>>; actorId: string; role: "OWNER" | "MEMBER" | null };
export function jsonSnapshot(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
export async function workspacePeople(tx: WorkspaceDb, ids: string[]): Promise<Map<string, WorkspacePerson>> {
  const rows = await tx.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true } });
  return new Map(rows.map(row => [row.id, { id: row.id, name: row.fullName || "Researcher" }]));
}
export function workspacePerson(people: Map<string, WorkspacePerson>, id: string): WorkspacePerson { return people.get(id) ?? { id, name: "Researcher" }; }
export async function workspaceEvent(context: WorkspaceContext, type: string, entityKind: string, entityId: string, metadata: Prisma.InputJsonValue = {}, requestKey?: string) {
  const version = metadata && typeof metadata === "object" && !Array.isArray(metadata) && "version" in metadata && typeof metadata.version === "number" ? metadata.version : undefined;
  return context.tx.projectActivity.create({ data: { projectId: context.project.id, actorId: context.actorId, type, entityKind, entityId, metadata, sourceModule: entityKind.slice(0, 32), artifactVersion: version, idempotencyKey: requestKey ?? (version ? `${type}:${entityId}:${version}` : undefined) } });
}
export async function workspaceRevision<T extends { id: string; version: number }>(context: WorkspaceContext, entityKind: string, row: T, creationInput?: unknown) {
  return context.tx.projectWorkspaceRevision.create({ data: { projectId: context.project.id, entityKind, entityId: row.id, version: row.version, actorId: context.actorId, snapshot: jsonSnapshot(creationInput ? { ...row, creationInput } : row) } });
}
/** Compare the original request, even if collaborators have since edited the resource. */
export async function assertWorkspaceRetry(context: WorkspaceContext, entityKind: string, entityId: string, input: unknown) {
  const original = await context.tx.projectWorkspaceRevision.findFirst({ where: { projectId: context.project.id, entityKind, entityId, version: 1 } });
  const snapshot = original?.snapshot as { creationInput?: unknown } | undefined;
  if (!snapshot?.creationInput || !isDeepStrictEqual(snapshot.creationInput, jsonSnapshot(input))) throw AppError.conflict("This request key was already used with different content");
}
export function expectWorkspaceVersion(actual: number, expected: number) { if (actual !== expected) throw AppError.conflict("This item changed. Reload before saving again"); }
export async function assertWorkspaceAssignee(context: WorkspaceContext, id: string | null) {
  if (!id) return;
  await assertActiveProjectAccount(context.tx, id);
  const membership = await context.tx.projectMember.findUnique({ where: { projectId_userId: { projectId: context.project.id, userId: id } } });
  if (context.project.ownerId !== id && membership?.status !== "ACTIVE") throw AppError.badRequest("Choose a current project member");
}
/** Links are references, never access grants. Every target is checked against this project. */
export async function assertWorkspaceLink(context: WorkspaceContext, link: WorkspaceLink | null) {
  if (!link) return;
  const { tx, project } = context;
  let valid = false;
  switch (link.kind) {
    case "PAPER": valid = Boolean(await tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId: project.id, paperId: link.id } } })); break;
    case "SCREENING": valid = Boolean(await tx.projectPaper.findFirst({ where: { id: link.id, projectId: project.id } })); break;
    case "GAP": valid = Boolean(await tx.researchGap.findFirst({ where: { id: link.id, projectId: project.id } })); break;
    case "EVIDENCE": {
      if (await tx.projectEvidenceItem.findFirst({ where: { id: link.id, projectId: project.id } })) { valid = true; break; }
      const evidence = await tx.gapEvidenceRecord.findUnique({ where: { id: link.id } });
      valid = Boolean(evidence && await tx.researchGap.findFirst({ where: { id: evidence.gapId, projectId: project.id } })); break;
    }
    case "QUESTION": {
      const plan = await tx.researchPlan.findUnique({ where: { projectId: project.id } });
      valid = Array.isArray(plan?.questions) && plan.questions.some(question => question && typeof question === "object" && !Array.isArray(question) && question.id === link.id); break;
    }
    case "MANUSCRIPT": valid = Boolean(await tx.draftWorkspace.findFirst({ where: { id: link.id, projectId: project.id, deletedAt: null } })); break;
    case "MANUSCRIPT_SNAPSHOT": valid = Boolean(await tx.manuscriptSnapshot.findFirst({ where: { id: link.id, projectId: project.id } })); break;
    case "MENTOR_FEEDBACK": valid = Boolean(await tx.projectDiscussion.findFirst({ where: { id: link.id, projectId: project.id, targetKind: { in: ["MANUSCRIPT_SNAPSHOT", "PLAN_REVISION"] }, mentorRelationshipId: { not: null } } })); break;
    case "PLAN": valid = Boolean(await tx.researchPlan.findFirst({ where: { id: link.id, projectId: project.id } })); break;
    case "REVIEW_REQUEST": valid = Boolean(await tx.reviewRequest.findFirst({ where: { id: link.id, projectId: project.id } })); break;
    case "PLAN_REVISION": valid = Boolean(await tx.planRevision.findFirst({ where: { id: link.id, projectId: project.id } })); break;
    case "REPORT": valid = Boolean(await tx.report.findFirst({ where: { id: link.id, projectId: project.id } })); break;
  }
  if (!valid) throw AppError.badRequest("The linked item does not belong to this project or is unavailable");
}
/** Minimal durable in-app/push intent. Private research text never enters a notification. */
export async function workspaceNotify(context: WorkspaceContext, recipients: string[], type: string, entityId: string, version: number) {
  const allowed = await context.tx.projectMember.findMany({ where: { projectId: context.project.id, status: "ACTIVE", userId: { in: recipients } }, select: { userId: true } });
  const ids = new Set(allowed.map(row => row.userId));
  if (recipients.includes(context.project.ownerId)) ids.add(context.project.ownerId);
  ids.delete(context.actorId);
  const messages: Record<string, string> = { ASSIGNMENT: "A research task was assigned to you.", REASSIGNMENT: "A research task was reassigned. Review the task history.", MENTION: "A teammate requested your response.", MENTOR_FEEDBACK: "New mentor feedback is ready in your workspace.", TASK_BLOCKED: "A research task needs help with a blocker.", TASK_UNBLOCKED: "A research task is ready to continue.", TASK_DEADLINE: "A research task deadline changed." };
  for (const userId of ids) await notificationService.create({ userId, type: `PROJECT_WORKSPACE_${type}`, title: "Research workspace update", message: messages[type] ?? "A project milestone changed. Review your upcoming work.", targetKind: "project", targetId: context.project.id, eventKey: `WORKSPACE:${type}:${entityId}:${version}:${userId}`, emailStatus: "SKIPPED" }, context.tx);
}
