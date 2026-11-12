import type { Prisma, MentorshipApplication, MentorshipRequest, Project } from "../../generated/prisma/client.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { notificationService } from "../notifications/notification.service.js";

export type ApplicationDb = Prisma.TransactionClient;
export function applicationKey(input: string) {
  const key = parseDatabaseId(input); if (!key) throw AppError.badRequest("Invalid identifier");
  return key.kind === "uuid" ? { id: key.value } : { legacyMongoId: key.value };
}
export async function applicationActor(input: string, db: ApplicationDb = getPrisma()) {
  const actor = await db.user.findUnique({ where: applicationKey(input) });
  if (!actor?.isActive || actor.accountStatus !== "ACTIVE" || !actor.emailVerifiedAt) throw AppError.forbidden("An active verified email account is required");
  return actor;
}
export async function applicationProject(input: string, db: ApplicationDb = getPrisma()) {
  const project = await db.project.findUnique({ where: applicationKey(input) }); if (!project) throw AppError.notFound("Project not found"); return project;
}
export function applicationPreview(p: Project): import("@trend/shared-types").MentorProjectPreview {
  return { id: publicDatabaseId(p), title: p.title, summary: p.mentorshipSummary ?? "", researchAreas: p.mentorshipResearchAreas, expertise: p.mentorshipExpertise,
    mentoringNeeds: p.mentorshipNeeds, methodologies: p.mentorshipMethodologies, discovery: p.mentorshipDiscovery as "CLOSED" | "SEEKING_MENTOR", stage: p.status as import("@trend/shared-types").ProjectStatus };
}
export async function applicationLocks(db: ApplicationDb, projectId: string, users: string[]) {
  for (const id of [...new Set(users)].sort()) await db.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR NO KEY UPDATE`;
  await db.$queryRaw`SELECT id FROM projects WHERE id=${projectId}::uuid FOR UPDATE`;
}
export function applicationOpen(p: Project) { if (["ARCHIVED", "COMPLETED"].includes(p.status)) throw AppError.conflict("This project no longer accepts recruitment changes"); }
export async function applicationEvent(db: ApplicationDb, row: MentorshipApplication, actorId: string, type: string, details: Prisma.InputJsonObject = {}, command?: { key: string; hash: string }) {
  await db.mentorshipApplicationEvent.create({ data: { applicationId: row.id, actorId, type, details, clientKey: command?.key, commandHash: command?.hash } });
  await db.projectActivity.create({ data: { projectId: row.projectId, actorId, type: "MENTOR_APPLICATION_UPDATED", entityKind: "mentorship_application", entityId: row.id, metadata: { status: row.status, version: row.version, action: type } } });
  await db.auditLog.create({ data: { userId: actorId, actionName: `MENTOR_APPLICATION_${type}`, targetTableName: "mentorship_applications", targetRecordId: row.id, details: { projectId: row.projectId, version: row.version } } });
}
export async function applicationNotify(db: ApplicationDb, row: MentorshipApplication, recipientId: string, ownerView: boolean) {
  const profile = await db.academicProfile.findUnique({ where: { userId: recipientId }, select: { notificationLocale: true } });
  await notificationService.create({ userId: recipientId, type: ownerView ? "MENTORSHIP_APPLICANT_UPDATE" : "MENTORSHIP_APPLICATION_UPDATE",
    title: profile?.notificationLocale === "vi" ? "Hồ sơ ứng tuyển cố vấn có cập nhật" : "Mentoring application updated",
    message: profile?.notificationLocale === "vi" ? "Mở danh sách ứng tuyển để xem trạng thái hoặc câu hỏi mới." : "Open mentoring applications to review the update.",
    targetKind: "project", targetId: row.projectId, eventKey: `MENTORSHIP_APPLICATION:${row.id}:${row.version}:${recipientId}`,
    emailStatus: "SKIPPED" }, db);
}
/** Called inside the existing consent transaction after it holds account/project locks. */
export async function assertApplicationInvitation(db: ApplicationDb, id: string, projectId: string, lecturerId: string, expectedVersion?: number) {
  const row = await db.mentorshipApplication.findFirst({ where: { id, projectId, lecturerId } });
  if (!row) throw AppError.notFound("Application not found");
  if (row.version !== expectedVersion || !["APPLIED", "SHORTLISTED"].includes(row.status)) throw AppError.conflict("Application changed. Review the latest version before inviting.");
  return row;
}
export async function syncApplicationRequest(db: ApplicationDb, request: MentorshipRequest, actorId: string) {
  if (!request.applicationId) return;
  const row = await db.mentorshipApplication.findUniqueOrThrow({ where: { id: request.applicationId } });
  if (row.status !== "INVITED") return;
  const status = request.status === "ACCEPTED" ? "ACCEPTED" : request.status === "DECLINED" ? "DECLINED" : request.status === "PENDING" ? "INVITED" : "CLOSED";
  if (status === row.status) return;
  const updated = await db.mentorshipApplication.update({ where: { id: row.id }, data: { status, version: { increment: 1 } } });
  await applicationEvent(db, updated, actorId, status, { requestId: request.id });
}
/** Both relationship termination and access revocation close the recruitment record atomically. */
export async function closeAcceptedApplication(db: ApplicationDb, request: MentorshipRequest, actorId: string, relationshipId: string) {
  if (!request.applicationId) return;
  const row = await db.mentorshipApplication.findUniqueOrThrow({ where: { id: request.applicationId } });
  if (row.status !== "ACCEPTED") return;
  const closed = await db.mentorshipApplication.update({ where: { id: row.id }, data: { status: "CLOSED", version: { increment: 1 } } });
  await applicationEvent(db, closed, actorId, "RELATIONSHIP_ENDED", { relationshipId });
}
