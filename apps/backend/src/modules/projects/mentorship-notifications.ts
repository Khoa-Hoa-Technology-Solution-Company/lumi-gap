import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { notificationService } from "../notifications/notification.service.js";

export type MentorshipEvent = "MENTORSHIP_REQUEST_RECEIVED" | "MENTORSHIP_OFFER_RECEIVED" | "MENTORSHIP_REQUEST_ACCEPTED"
  | "MENTORSHIP_OFFER_ACCEPTED" | "MENTORSHIP_REQUEST_DECLINED" | "MENTORSHIP_OFFER_DECLINED"
  | "MENTORSHIP_CANCELLED" | "MENTORSHIP_EXPIRED" | "MENTORSHIP_ENDED";
export interface MentorshipEmailPayload { event: MentorshipEvent; projectId: string; projectTitle: string; actorName: string }

// Persist through the existing Notification store inside the domain transaction.
export async function mentorshipNotification(tx: Prisma.TransactionClient, input: {
  event: MentorshipEvent; recordId: string; projectId: string; projectTitle: string; actorId: string; recipients: string[];
}) {
  const actor = await tx.user.findUniqueOrThrow({ where: { id: input.actorId }, select: { fullName: true } });
  const payload: MentorshipEmailPayload = { event: input.event, projectId: input.projectId, projectTitle: input.projectTitle, actorName: actor.fullName };
  for (const userId of [...new Set(input.recipients)].filter(id => id !== input.actorId)) {
    const preference = await tx.academicProfile.findUnique({ where: { userId }, select: { notificationLocale: true } });
    const vi = preference?.notificationLocale === "vi";
    const labels: Record<MentorshipEvent, [string, string]> = {
      MENTORSHIP_REQUEST_RECEIVED: ["Mentorship invitation", "Lời mời hướng dẫn"], MENTORSHIP_OFFER_RECEIVED: ["Mentorship offer", "Đề nghị hướng dẫn"],
      MENTORSHIP_REQUEST_ACCEPTED: ["Mentorship invitation accepted", "Đã chấp nhận lời mời hướng dẫn"], MENTORSHIP_OFFER_ACCEPTED: ["Mentorship offer accepted", "Đã chấp nhận đề nghị hướng dẫn"],
      MENTORSHIP_REQUEST_DECLINED: ["Mentorship invitation declined", "Đã từ chối lời mời hướng dẫn"], MENTORSHIP_OFFER_DECLINED: ["Mentorship offer declined", "Đã từ chối đề nghị hướng dẫn"],
      MENTORSHIP_CANCELLED: ["Mentorship request closed", "Đã đóng lời mời hướng dẫn"], MENTORSHIP_EXPIRED: ["Mentorship request expired", "Lời mời hướng dẫn đã hết hạn"], MENTORSHIP_ENDED: ["Mentorship ended", "Đã kết thúc hướng dẫn"],
    };
    await notificationService.create({ userId, type: input.event, title: labels[input.event][vi ? 1 : 0],
      message: `${actor.fullName} · ${input.projectTitle}. ${vi ? "Mở Hỗ trợ học thuật để xem cập nhật." : "Open Academic Support to view the update."}`,
      targetKind: "project", targetId: input.projectId, eventKey: `${input.event}:${input.recordId}:${userId}`,
      emailPayload: payload as unknown as Prisma.InputJsonValue,
      // Cancellation/expiry are in-app only; principal consent changes also send email.
      emailStatus: ["MENTORSHIP_CANCELLED", "MENTORSHIP_EXPIRED"].includes(input.event) ? "SKIPPED" : "PENDING",
    }, tx);
  }
}
export async function dispatchMentorshipNotifications() {
  // The consent transaction has already committed. Recovery must also cover a failed outbox scan.
  try {
    const rows = await getPrisma().notification.findMany({ where: { eventKey: { startsWith: "MENTORSHIP_" }, dispatchedAt: null }, take: 100 });
    for (const row of rows) {
      try { await notificationService.dispatch(row); }
      catch (err) { logger.warn({ err, notificationId: row.id }, "Mentorship delivery queued for recovery"); }
    }
  } catch (err) {
    logger.warn({ err }, "Mentorship outbox scan queued for recovery");
  }
}
