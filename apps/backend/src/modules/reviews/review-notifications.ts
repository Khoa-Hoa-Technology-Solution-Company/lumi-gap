import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { notificationService } from "../notifications/notification.service.js";
import { logger } from "../../infrastructure/logger.js";

export const reviewNotificationRecoveryConditions: Prisma.NotificationWhereInput[] = [
  { eventKey: { startsWith: "REVIEW_" } }, { eventKey: { startsWith: "MENTOR_REVIEW_" } }, { eventKey: { startsWith: "REVISION_" } },
];

export async function dispatchReviewNotifications(rows: Awaited<ReturnType<typeof notificationService.create>>[]) {
  for (const row of rows) {
    try { await notificationService.dispatch(row); }
    catch (error) { logger.warn({ err: error, notificationId: row.id }, "Review notification persisted; transport dispatch failed"); }
  }
}

/** Persist the in-app notification independently of the transport's availability.
 * With a sender transaction, dispatch only after that transaction commits. */
export async function createReviewNotification(input: Parameters<typeof notificationService.create>[0], tx?: Prisma.TransactionClient) {
  const row = await notificationService.create(input, tx ?? getPrisma());
  if (!tx) await dispatchReviewNotifications([row]);
  return row;
}

/** Feedback is shared with current manuscript authors and the current project owner. */
export async function reviewTeamRecipients(projectId: string, submissionId: string, db: Prisma.TransactionClient = getPrisma()) {
  const [project, authors, members] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerId: true } }),
    db.submissionAuthor.findMany({ where: { submissionId }, select: { userId: true } }),
    db.projectMember.findMany({ where: { projectId, status: "ACTIVE" }, select: { userId: true } }),
  ]);
  const active = new Set(members.map(member => member.userId));
  const ids = [...new Set([project.ownerId, ...authors.filter(author => active.has(author.userId)).map(author => author.userId)])];
  return (await db.user.findMany({ where: { id: { in: ids }, isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true } })).map(user => user.id);
}
