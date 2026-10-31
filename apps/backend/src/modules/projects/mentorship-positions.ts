import type { MentorRole, MentorPositions } from "@trend/shared-types";
import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";

export const mentorshipPolicy = { maxActiveMentors: 2, maxPendingRequests: 2, maxPendingPerRole: 1, expiryDays: 14 } as const;

export async function mentorPositions(projectId: string, db: Prisma.TransactionClient = getPrisma()): Promise<MentorPositions> {
  const now = new Date();
  const [active, pending] = await Promise.all([
    db.mentorRelationship.findMany({ where: { projectId, status: "ACTIVE" } }),
    db.mentorshipRequest.findMany({ where: { projectId, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { mentorRole: true } }),
  ]);
  const positions = {} as MentorPositions;
  for (const role of ["PRIMARY", "SECONDARY"] as const) {
    const relationship = active.find(r => r.mentorRole === role);
    const count = pending.filter(r => r.mentorRole === role).length;
    positions[role] = { role, status: relationship ? "ASSIGNED" : count ? "INVITING" : "VACANT", pendingRequests: count, relationshipId: relationship?.id };
  }
  return positions;
}

// Caller must hold the project's row lock for every mutation.
export async function assertMentorPosition(db: Prisma.TransactionClient, projectId: string, role: MentorRole, creating = false) {
  const positions = await mentorPositions(projectId, db), position = positions[role];
  if (position.status === "ASSIGNED") throw AppError.conflict("This mentor position has already been assigned");
  if (position.pendingRequests > 1) throw AppError.conflict("Có nhiều lời mời cũ cùng vai trò. Chủ dự án cần rà soát và thu hồi rõ ràng trước khi tiếp tục");
  if (creating && position.pendingRequests >= mentorshipPolicy.maxPendingPerRole) throw AppError.conflict("Vai trò đang có lời mời chờ phản hồi. Chưa thể mời ứng viên dự phòng");
  return positions;
}
