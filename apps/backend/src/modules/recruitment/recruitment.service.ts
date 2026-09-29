import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";

function whereId(value: string): { id: string } | { legacyMongoId: string } {
  const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}
async function userId(value: string) { const row = await getPrisma().user.findUnique({ where: whereId(value), select: { id: true } }); if (!row) throw AppError.notFound("User not found"); return row.id; }
async function project(value: string) { const row = await getPrisma().project.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("Project not found"); return row; }
async function opening(value: string) { const row = await getPrisma().recruitmentOpening.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("Recruitment opening not found"); return row; }
async function application(value: string) { const row = await getPrisma().recruitmentApplication.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("Recruitment application not found"); return row; }
async function assertProjectOwner(projectId: string, actorId: string, role?: UserRole) {
  const [row, actor] = await Promise.all([project(projectId), userId(actorId)]);
  const membership = await getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId: row.id, userId: actor } } });
  if (row.ownerId !== actor && membership?.role !== "OWNER" && role !== "admin" && role !== "moderator") throw AppError.forbidden("Project owner access is required");
  return row;
}
const present = <T extends { id: string; legacyMongoId?: string | null }>(row: T) => ({ ...row, id: publicDatabaseId(row), _id: publicDatabaseId(row) });

export const recruitmentService = {
  async createOpening(input: { projectId: string; title: string; description: string; requirements?: string[]; capacity?: number; closesAt?: Date }, actorId: string, actorRole: UserRole) {
    const [target, actor] = await Promise.all([assertProjectOwner(input.projectId, actorId, actorRole), userId(actorId)]);
    const row = await getPrisma().recruitmentOpening.create({ data: { projectId: target.id, createdById: actor, title: input.title, description: input.description, requirements: input.requirements ?? [], capacity: input.capacity ?? 1, closesAt: input.closesAt } });
    await auditService.log("recruitment.opening.created", { userId: actorId, targetTableName: "recruitment_openings", targetRecordId: row.id, details: { projectId: target.id } }); return present(row);
  },
  async listOpenings(page: number, pageSize: number, projectId?: string) {
    const target = projectId ? await project(projectId) : undefined; const where = { ...(target ? { projectId: target.id } : {}), status: "open", OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] };
    const [rows, total] = await Promise.all([getPrisma().recruitmentOpening.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), getPrisma().recruitmentOpening.count({ where })]);
    const projects = await getPrisma().project.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.projectId))] } } }); const byId = new Map(projects.map((row) => [row.id, row]));
    return { data: rows.map((row) => ({ ...present(row), projectId: byId.get(row.projectId) ? present(byId.get(row.projectId)!) : row.projectId })), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },
  async updateOpening(openingId: string, input: { title?: string; description?: string; requirements?: string[]; capacity?: number; status?: "open" | "closed" | "archived"; closesAt?: Date | null }, actorId: string, actorRole: UserRole) {
    const row = await opening(openingId); await assertProjectOwner(row.projectId, actorId, actorRole); return present(await getPrisma().recruitmentOpening.update({ where: { id: row.id }, data: input }));
  },
  async apply(openingId: string, input: { coverLetter: string; skills?: string[] }, applicantId: string) {
    const [row, applicant] = await Promise.all([opening(openingId), userId(applicantId)]); if (row.status !== "open" || row.closesAt && row.closesAt <= new Date()) throw AppError.conflict("This recruitment opening is closed");
    const existing = await getPrisma().recruitmentApplication.findUnique({ where: { openingId_applicantId: { openingId: row.id, applicantId: applicant } } }); if (existing) throw AppError.conflict("You have already applied to this opening");
    return present(await getPrisma().recruitmentApplication.create({ data: { openingId: row.id, projectId: row.projectId, applicantId: applicant, coverLetter: input.coverLetter, skills: input.skills ?? [] } }));
  },
  async listApplications(openingId: string, actorId: string, actorRole: UserRole) {
    const row = await opening(openingId); await assertProjectOwner(row.projectId, actorId, actorRole); const apps = await getPrisma().recruitmentApplication.findMany({ where: { openingId: row.id }, orderBy: { createdAt: "desc" } });
    const users = await getPrisma().user.findMany({ where: { id: { in: apps.map((app) => app.applicantId) } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true, institution: true, researchInterests: true } }); const byId = new Map(users.map((user) => [user.id, user]));
    return apps.map((app) => ({ ...present(app), applicantId: byId.get(app.applicantId) ? present(byId.get(app.applicantId)!) : app.applicantId }));
  },
  async decideApplication(openingId: string, applicationId: string, status: "shortlisted" | "accepted" | "rejected", actorId: string, actorRole: UserRole) {
    const [row, app, actor] = await Promise.all([opening(openingId), application(applicationId), userId(actorId)]); if (app.openingId !== row.id) throw AppError.notFound("Recruitment application not found"); await assertProjectOwner(row.projectId, actorId, actorRole);
    if (["accepted", "rejected", "withdrawn"].includes(app.status) && app.status !== status) throw AppError.conflict("This application already has a final decision"); if (app.status === status) return present(app);
    const updated = await getPrisma().$transaction(async (tx) => { if (status === "accepted") { const reserved = await tx.recruitmentOpening.updateMany({ where: { id: row.id, status: "open", acceptedCount: { lt: row.capacity } }, data: { acceptedCount: { increment: 1 } } }); if (!reserved.count) throw AppError.conflict("This opening has reached capacity or is closed"); await tx.projectMember.upsert({ where: { projectId_userId: { projectId: row.projectId, userId: app.applicantId } }, create: { projectId: row.projectId, userId: app.applicantId, role: "MEMBER", status: "ACTIVE" }, update: { status: "ACTIVE" } }); }
      return tx.recruitmentApplication.update({ where: { id: app.id }, data: { status, decidedById: actor, decidedAt: new Date() } }); });
    await auditService.log("recruitment.application.decided", { userId: actorId, targetTableName: "recruitment_applications", targetRecordId: app.id, details: { status, projectId: row.projectId } }); return present(updated);
  },
  async withdraw(openingId: string, applicationId: string, applicantId: string) { const [row, app, applicant] = await Promise.all([opening(openingId), application(applicationId), userId(applicantId)]); if (app.openingId !== row.id || app.applicantId !== applicant) throw AppError.notFound("Recruitment application not found"); if (app.status === "accepted") throw AppError.conflict("An accepted application cannot be withdrawn"); return present(await getPrisma().recruitmentApplication.update({ where: { id: app.id }, data: { status: "withdrawn" } })); },
};
