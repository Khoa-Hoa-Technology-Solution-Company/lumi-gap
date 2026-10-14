import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";

/** Current membership takes precedence over historical creator/author attribution. */
export async function currentProjectMembership(projectId: string, userId: string, db: Prisma.TransactionClient = getPrisma()) {
  const [project, member, user] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }),
    db.user.findUnique({ where: { id: userId }, select: { isActive: true, accountStatus: true, emailVerifiedAt: true } }),
  ]);
  return project && user?.isActive && user.accountStatus === "ACTIVE" && user.emailVerifiedAt && (project.ownerId === userId || member?.status === "ACTIVE") ? project : null;
}

export async function requireCurrentProjectMembership(projectId: string, userId: string, mutable = false, db: Prisma.TransactionClient = getPrisma()) {
  const project = await currentProjectMembership(projectId, userId, db);
  if (!project) throw AppError.notFound("Project not found");
  if (mutable && project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
  return project;
}

export async function currentProjectIds(userId: string) {
  const [memberships, owned] = await Promise.all([
    getPrisma().projectMember.findMany({ where: { userId, status: "ACTIVE" }, select: { projectId: true } }),
    getPrisma().project.findMany({ where: { ownerId: userId }, select: { id: true } }),
  ]);
  return [...new Set([...memberships.map(m => m.projectId), ...owned.map(p => p.id)])];
}
