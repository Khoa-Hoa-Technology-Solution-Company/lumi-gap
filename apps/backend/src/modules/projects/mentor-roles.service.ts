import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { MentorRole, MentorRoleProposal, MentorRolesWorkspace } from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { notificationService } from "../notifications/notification.service.js";
import { canAccessProjectAsMentor } from "./academic-relationship-access.js";

const role = z.enum(["UNASSIGNED", "PRIMARY", "SECONDARY"]);
export const proposeMentorRolesSchema = z.object({ clientKey: z.string().uuid(), assignments: z.array(z.object({ relationshipId: z.string().uuid(), role }).strict()).min(1).max(2).refine(items => new Set(items.map(a => a.relationshipId)).size === items.length) }).strict();
export const respondMentorRolesSchema = z.object({ action: z.enum(["ACCEPT", "DECLINE", "CANCEL"]) }).strict();
type Db = Prisma.TransactionClient;
type Assignment = { relationshipId: string; mentorId: string; fullName: string; from: MentorRole; to: MentorRole };
type ProposalData = { ownerId: string; assignments: Assignment[] };
function key(value: string) { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; }
async function context(projectId: string, actorId: string, tx: Db, write = false) {
  const [p, actor] = await Promise.all([tx.project.findUnique({ where: key(projectId) }), tx.user.findUnique({ where: key(actorId) })]);
  if (!p || p.deletedAt) throw AppError.notFound("Project not found");
  if (!actor?.isActive || actor.accountStatus !== "ACTIVE" || !actor.emailVerifiedAt) throw AppError.forbidden();
  if (write) {
    await tx.$queryRaw`SELECT id FROM users WHERE id IN (${Prisma.join([...new Set([actor.id, p.ownerId])].sort().map(id => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${p.id}::uuid FOR UPDATE`;
  }
  const live = await tx.project.findUniqueOrThrow({ where: { id: p.id } });
  const currentActor = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!currentActor.isActive || currentActor.accountStatus !== "ACTIVE" || !currentActor.emailVerifiedAt) throw AppError.forbidden();
  if (live.deletedAt) throw AppError.notFound("Project not found");
  if (write && ["ARCHIVED", "COMPLETED"].includes(live.status)) throw AppError.conflict("Project is read-only");
  const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: actor.id } } });
  if (live.ownerId !== actor.id && member?.status !== "ACTIVE" && !await canAccessProjectAsMentor(p.id, actor.id, tx)) throw AppError.forbidden();
  return { p: live, actor };
}
async function rows(tx: Db, projectId: string, actorId: string, ownerId: string, readOnly = false): Promise<MentorRolesWorkspace> {
  const active = await tx.mentorRelationship.findMany({ where: { projectId, status: "ACTIVE" }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] });
  const users = await tx.user.findMany({ where: { id: { in: active.map(r => r.mentorUserId) } }, select: { id: true, legacyMongoId: true, fullName: true } });
  const proposals = await tx.projectActivity.findMany({ where: { projectId, type: "MENTOR_ROLES_PROPOSED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 });
  const responses = await tx.projectActivity.findMany({ where: { projectId, entityKind: "MENTOR_ROLES", entityId: { in: proposals.map(p => p.id) }, type: { not: "MENTOR_ROLES_PROPOSED" } } });
  return { canPropose: !readOnly && ownerId === actorId, mentors: active.map(r => { const u = users.find(u => u.id === r.mentorUserId)!; return { relationshipId: r.id, mentorId: publicDatabaseId(u), fullName: u.fullName, role: r.mentorRole as MentorRole }; }), proposals: proposals.map(p => {
    const data = p.metadata as unknown as ProposalData, events = responses.filter(r => r.entityId === p.id);
    const confirmedBy = events.filter(e => e.type === "MENTOR_ROLE_CONFIRMED").flatMap(e => e.actorId ? [e.actorId] : []);
    const stale = data.ownerId !== ownerId || data.assignments.some(a => !active.some(r => r.id === a.relationshipId && r.mentorUserId === a.mentorId && r.mentorRole === a.from));
    const status: MentorRoleProposal["status"] = events.some(e => e.type === "MENTOR_ROLES_APPLIED") ? "CONFIRMED" : events.some(e => e.type === "MENTOR_ROLES_DECLINED") ? "DECLINED" : events.some(e => e.type === "MENTOR_ROLES_CANCELLED") ? "CANCELLED" : stale ? "SUPERSEDED" : "PENDING";
    return { id: p.id, assignments: data.assignments, createdAt: p.createdAt.toISOString(), status, confirmedBy, canConfirm: !readOnly && status === "PENDING" && data.assignments.some(a => a.mentorId === actorId) && !confirmedBy.includes(actorId), canCancel: !readOnly && status === "PENDING" && actorId === ownerId };
  }) };
}
async function notify(tx: Db, projectId: string, title: string, proposalId: string, recipients: string[], type: string) {
  for (const userId of new Set(recipients)) await notificationService.create({ userId, type, title, message: "Có cập nhật về phân vai hướng dẫn. Vai trò chỉ thay đổi khi tất cả cố vấn liên quan xác nhận.", targetKind: "project", targetId: projectId, eventKey: `${type}:${proposalId}:${userId}`, emailStatus: "SKIPPED" }, tx);
}
export const mentorRolesService = {
  async read(projectId: string, actorId: string) { return getPrisma().$transaction(async tx => { const { p, actor } = await context(projectId, actorId, tx); return rows(tx, p.id, actor.id, p.ownerId, ["ARCHIVED", "COMPLETED"].includes(p.status)); }); },
  async propose(projectId: string, actorId: string, input: z.infer<typeof proposeMentorRolesSchema>) {
    return getPrisma().$transaction(async tx => {
      const { p, actor } = await context(projectId, actorId, tx, true);
      if (p.ownerId !== actor.id) throw AppError.forbidden("Only the owner can propose supervision roles");
      const requestKey = `mentor-roles:${actor.id}:${input.clientKey}`;
      const prior = await tx.projectActivity.findUnique({ where: { projectId_idempotencyKey: { projectId: p.id, idempotencyKey: requestKey } } });
      if (prior) { if (!isDeepStrictEqual((prior.metadata as unknown as { input: unknown }).input, input.assignments)) throw AppError.conflict("Request key already used"); return rows(tx, p.id, actor.id, p.ownerId, ["ARCHIVED", "COMPLETED"].includes(p.status)); }
      const workspace = await rows(tx, p.id, actor.id, p.ownerId, ["ARCHIVED", "COMPLETED"].includes(p.status));
      if (workspace.proposals.some(p => p.status === "PENDING")) throw AppError.conflict("Finish or cancel the current role proposal first");
      const active = await tx.mentorRelationship.findMany({ where: { projectId: p.id, status: "ACTIVE" } });
      if (input.assignments.some(a => !active.some(r => r.id === a.relationshipId))) throw AppError.notFound("Choose an active mentor in this project");
      const proposed = active.map(r => input.assignments.find(a => a.relationshipId === r.id)?.role ?? r.mentorRole);
      if (["PRIMARY", "SECONDARY"].some(role => proposed.filter(r => r === role).length > 1)) throw AppError.conflict("Each named role can have only one mentor");
      const changes = input.assignments.filter(a => active.find(r => r.id === a.relationshipId)!.mentorRole !== a.role);
      if (!changes.length) throw AppError.badRequest("Choose a different role before proposing a change");
      const assignments: Assignment[] = changes.map(a => { const r = active.find(r => r.id === a.relationshipId)!, u = workspace.mentors.find(m => m.relationshipId === r.id)!; return { relationshipId: r.id, mentorId: r.mentorUserId, fullName: u.fullName, from: r.mentorRole as MentorRole, to: a.role }; });
      const id = randomUUID();
      await tx.projectActivity.create({ data: { id, projectId: p.id, actorId: actor.id, type: "MENTOR_ROLES_PROPOSED", entityKind: "MENTOR_ROLES", entityId: id, idempotencyKey: requestKey, metadata: { ownerId: p.ownerId, assignments, input: input.assignments } } });
      await notify(tx, p.id, "Đề xuất phân vai hướng dẫn", id, assignments.map(a => a.mentorId), "MENTOR_ROLE_PROPOSED");
      return rows(tx, p.id, actor.id, p.ownerId, ["ARCHIVED", "COMPLETED"].includes(p.status));
    });
  },
  async respond(projectId: string, actorId: string, proposalId: string, action: "ACCEPT" | "DECLINE" | "CANCEL") {
    return getPrisma().$transaction(async tx => {
      const { p, actor } = await context(projectId, actorId, tx, true);
      const workspace = await rows(tx, p.id, actor.id, p.ownerId, ["ARCHIVED", "COMPLETED"].includes(p.status)), proposal = workspace.proposals.find(p => p.id === proposalId);
      if (!proposal) throw AppError.notFound("Role proposal not found");
      if (action === "CANCEL" ? p.ownerId !== actor.id : !proposal.assignments.some(a => a.mentorId === actor.id) || !await canAccessProjectAsMentor(p.id, actor.id, tx)) throw AppError.forbidden();
      const eventType = action === "ACCEPT" ? "MENTOR_ROLE_CONFIRMED" : action === "DECLINE" ? "MENTOR_ROLES_DECLINED" : "MENTOR_ROLES_CANCELLED";
      const requestKey = `mentor-role-response:${proposalId}:${actor.id}`;
      const prior = await tx.projectActivity.findUnique({ where: { projectId_idempotencyKey: { projectId: p.id, idempotencyKey: requestKey } } });
      if (prior) { if (prior.type !== eventType) throw AppError.conflict("This response has already been recorded"); return workspace; }
      if (proposal.status !== "PENDING") throw AppError.conflict("This proposal has changed; review the current supervision team");
      await tx.projectActivity.create({ data: { projectId: p.id, actorId: actor.id, type: eventType, entityKind: "MENTOR_ROLES", entityId: proposalId, idempotencyKey: requestKey, metadata: { action } } });
      const confirmed = new Set([...proposal.confirmedBy, actor.id]);
      if (action === "ACCEPT" && proposal.assignments.every(a => confirmed.has(a.mentorId))) {
        // Clear named slots inside the transaction, so a consented role swap cannot collide.
        await tx.mentorRelationship.updateMany({ where: { projectId: p.id, id: { in: proposal.assignments.map(a => a.relationshipId) }, status: "ACTIVE" }, data: { mentorRole: "UNASSIGNED" } });
        for (const a of proposal.assignments) await tx.mentorRelationship.update({ where: { id: a.relationshipId }, data: { mentorRole: a.to } });
        await tx.projectActivity.create({ data: { projectId: p.id, actorId: actor.id, type: "MENTOR_ROLES_APPLIED", entityKind: "MENTOR_ROLES", entityId: proposalId, metadata: { assignments: proposal.assignments } } });
        await notify(tx, p.id, "Đã xác nhận vai trò hướng dẫn", proposalId, [p.ownerId, ...proposal.assignments.map(a => a.mentorId)], "MENTOR_ROLE_APPLIED");
      } else if (action !== "ACCEPT") await notify(tx, p.id, "Đã đóng đề xuất phân vai", proposalId, [p.ownerId, ...proposal.assignments.map(a => a.mentorId)].filter(id => id !== actor.id), "MENTOR_ROLE_CLOSED");
      return rows(tx, p.id, actor.id, p.ownerId, ["ARCHIVED", "COMPLETED"].includes(p.status));
    });
  },
};
