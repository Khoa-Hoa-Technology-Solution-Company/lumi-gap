import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { assertReviewerInTransaction } from "../reviews/peer-review-access.js";

type Db = Prisma.TransactionClient;
export function isVerifiedLecturer(user: { isActive: boolean; accountStatus: string; emailVerifiedAt: Date | null } | null,
  profile: { academicRole: string | null; roleVerificationStatus: string; positionStatus: string } | null) {
  return Boolean(user?.isActive && user.accountStatus === "ACTIVE" && user.emailVerifiedAt && profile?.academicRole === "LECTURER"
    && profile.roleVerificationStatus === "VERIFIED" && profile.positionStatus === "VERIFIED");
}
export function canManageAcademicRelationships(actorId: string, project: { ownerId: string }) {
  return actorId === project.ownerId;
}
export async function assertAcademicRelationshipManager(projectId: string, actorId: string, db: Db = getPrisma()) {
  const actor = await db.user.findUnique({ where: { id: actorId } });
  if (!actor?.isActive || actor.accountStatus !== "ACTIVE" || !actor.emailVerifiedAt) throw AppError.forbidden("An active, email-verified project owner is required");
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw AppError.notFound("Project not found");
  if (!canManageAcademicRelationships(actorId, project)) throw AppError.forbidden("Only the project owner can manage academic relationships");
  if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
  return project;
}
export async function canAccessProjectAsMentor(projectId: string, actorId: string, db: Db = getPrisma()) {
  const [user, profile, relationship] = await Promise.all([
    db.user.findUnique({ where: { id: actorId }, select: { isActive: true, accountStatus: true, emailVerifiedAt: true } }),
    db.academicProfile.findUnique({ where: { userId: actorId }, select: { academicRole: true, roleVerificationStatus: true, positionStatus: true } }),
    db.mentorRelationship.findFirst({ where: { projectId, mentorUserId: actorId, status: "ACTIVE" } }),
  ]);
  return isVerifiedLecturer(user, profile) && Boolean(relationship);
}
export const assertVerifiedLecturer = assertReviewerInTransaction;
export async function assertAcceptingNewMentorships(db: Db, userId: string) {
  const profile = await assertVerifiedLecturer(db, userId);
  if (!(profile.supportAvailability as { enabled?: boolean } | null)?.enabled) throw AppError.conflict("This Lecturer is not open to mentoring");
  return profile;
}
