import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { assertProjectActionAllowed, type ProjectMutationAction } from "./project-workspace.rules.js";

/** Lock order shared with mentorship: sorted accounts, then project. Never reverse it. */
export async function lockProjectAccounts(tx: Prisma.TransactionClient, userIds: string[], projectId?: string) {
  for (const id of [...new Set(userIds)].sort()) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
  }
  if (projectId) await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
}

export async function assertActiveProjectAccount(tx: Prisma.TransactionClient, userId: string, onboarded = false) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user?.isActive || user.accountStatus !== "ACTIVE") throw AppError.unauthorized();
  if (!user.emailVerifiedAt) throw new AppError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before continuing");
  if (onboarded) {
    const profile = await tx.academicProfile.findUnique({ where: { userId } });
    if (!user.onboardingCompletedAt || !profile?.primaryPosition || !["STUDENT", "LECTURER", "RESEARCHER"].includes(profile.academicRole ?? "")) {
      throw new AppError(403, "ONBOARDING_REQUIRED", "Complete your academic profile before creating a project", { statusUrl: "/onboarding" });
    }
  }
  return user;
}

export async function authorizeProjectTransaction(tx: Prisma.TransactionClient, projectId: string, actorId: string, action?: ProjectMutationAction) {
  const actor = await assertActiveProjectAccount(tx, actorId);
  const project = await tx.project.findUnique({ where: { id: projectId } });
  if (!project) throw AppError.notFound("Project not found");
  const member = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } });
  const role = project.ownerId === actorId ? "OWNER" : member?.status === "ACTIVE" ? "MEMBER" : undefined;
  if (action) assertProjectActionAllowed(role, project.status, action);
  else if (!role) throw AppError.notFound("Project not found");
  return { project, actor, role };
}
