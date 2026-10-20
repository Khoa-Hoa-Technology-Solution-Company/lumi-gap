import type { MentorRole, MentorPositions } from "@trend/shared-types";
import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { isVerifiedLecturer } from "./academic-relationship-access.js";

export const mentorshipPolicy = { maxActiveMentors: 2, maxPendingRequests: 6, maxPendingPerRole: 3, expiryDays: 7 } as const;

export async function mentorPositions(projectId: string, db: Prisma.TransactionClient = getPrisma()): Promise<MentorPositions> {
  const now = new Date();
  const [active, pending] = await Promise.all([
    db.mentorRelationship.findMany({ where: { projectId, status: "ACTIVE" } }),
    db.mentorshipRequest.findMany({ where: { projectId, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { mentorRole: true } }),
  ]);
  const primary = active.find(r => r.mentorRole === "PRIMARY");
  const [user, profile] = primary ? await Promise.all([
    db.user.findUnique({ where: { id: primary.mentorUserId } }), db.academicProfile.findUnique({ where: { userId: primary.mentorUserId } }),
  ]) : [null, null];
  const positions = {} as MentorPositions;
  for (const role of ["PRIMARY", "SECONDARY"] as const) {
    const relationship = active.find(r => r.mentorRole === role);
    const count = pending.filter(r => r.mentorRole === role).length;
    positions[role] = { role, status: relationship ? "ASSIGNED" : role === "SECONDARY" && !isVerifiedLecturer(user, profile) ? "LOCKED" : count ? "INVITING" : "VACANT", pendingRequests: count, relationshipId: relationship?.id };
  }
  return positions;
}

// Caller must hold the project's row lock for every mutation.
export async function assertMentorPosition(db: Prisma.TransactionClient, projectId: string, role: MentorRole, creating = false) {
  const positions = await mentorPositions(projectId, db), position = positions[role];
  if (position.status === "LOCKED") throw AppError.conflict("Assign a verified primary mentor before inviting a secondary mentor");
  if (position.status === "ASSIGNED") throw AppError.conflict("This mentor position has already been assigned");
  if (creating && position.pendingRequests >= mentorshipPolicy.maxPendingPerRole) throw AppError.conflict("A mentor position can have at most three pending invitations");
  return positions;
}
