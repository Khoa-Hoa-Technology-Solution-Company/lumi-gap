import { z } from "zod";
import { authMailService, buildBrandedMail, webOrigin } from "../auth/auth-mail.service.js";
import type { MentorshipEmailPayload, MentorshipEvent } from "./mentorship-notifications.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";

const events = ["MENTORSHIP_REQUEST_RECEIVED", "MENTORSHIP_OFFER_RECEIVED", "MENTORSHIP_REQUEST_ACCEPTED", "MENTORSHIP_OFFER_ACCEPTED",
  "MENTORSHIP_REQUEST_DECLINED", "MENTORSHIP_OFFER_DECLINED", "MENTORSHIP_CANCELLED", "MENTORSHIP_EXPIRED", "MENTORSHIP_ENDED"] as const;
const payloadSchema = z.object({ event: z.enum(events), projectId: z.string().uuid(), projectTitle: z.string().max(100), actorName: z.string().max(200) }).strict();

export function buildMentorshipMail(payload: MentorshipEmailPayload, name: string, locale: "en" | "vi", origin: string) {
  const { projectTitle: project, actorName: actor } = payload;
  const subjects: Record<MentorshipEvent, [string, string]> = {
    MENTORSHIP_REQUEST_RECEIVED: [`${actor} invited you to mentor ${project}`, `${actor} mời bạn hướng dẫn ${project}`],
    MENTORSHIP_OFFER_RECEIVED: [`${actor} offered to mentor ${project}`, `${actor} đề nghị hướng dẫn ${project}`],
    MENTORSHIP_REQUEST_ACCEPTED: [`${actor} accepted your mentorship request`, `${actor} đã chấp nhận lời mời hướng dẫn`],
    MENTORSHIP_OFFER_ACCEPTED: [`${project} accepted your mentorship offer`, `${project} đã chấp nhận đề nghị hướng dẫn`],
    MENTORSHIP_REQUEST_DECLINED: [`Update on your mentorship request for ${project}`, `Cập nhật lời mời hướng dẫn ${project}`],
    MENTORSHIP_OFFER_DECLINED: [`Update on your mentorship offer for ${project}`, `Cập nhật đề nghị hướng dẫn ${project}`],
    MENTORSHIP_CANCELLED: [`Mentorship request closed for ${project}`, `Lời mời hướng dẫn ${project} đã đóng`],
    MENTORSHIP_EXPIRED: [`Mentorship request expired for ${project}`, `Lời mời hướng dẫn ${project} đã hết hạn`],
    MENTORSHIP_ENDED: [`Mentorship ended for ${project}`, `Đã kết thúc hướng dẫn ${project}`],
  };
  const messages: Record<MentorshipEvent, [string, string]> = {
    MENTORSHIP_REQUEST_RECEIVED: [`${actor} invited you to become the academic mentor for “${project}” on LumiGap. Review the shared preview and choose whether to accept.`, `${actor} mời bạn làm mentor học thuật cho “${project}” trên LumiGap. Xem tóm tắt được chia sẻ và quyết định chấp nhận hoặc từ chối.`],
    MENTORSHIP_OFFER_RECEIVED: [`${actor} offered to mentor “${project}”. Review the lecturer's profile before deciding.`, `${actor} đề nghị hướng dẫn “${project}”. Xem hồ sơ giảng viên trước khi quyết định.`],
    MENTORSHIP_REQUEST_ACCEPTED: [`${actor} accepted the invitation to mentor “${project}”. The mentor now has scoped read and feedback access.`, `${actor} đã nhận lời hướng dẫn “${project}”. Mentor có quyền đọc và góp ý trong phạm vi project.`],
    MENTORSHIP_OFFER_ACCEPTED: [`The team behind “${project}” accepted your offer. You can now open its mentoring workspace.`, `Nhóm của “${project}” đã chấp nhận đề nghị. Bạn có thể mở không gian hướng dẫn của project.`],
    MENTORSHIP_REQUEST_DECLINED: [`The invitation for “${project}” was declined. You may continue searching for another available mentor.`, `Lời mời hướng dẫn “${project}” đã được từ chối. Bạn có thể tìm mentor khác đang nhận nhóm mới.`],
    MENTORSHIP_OFFER_DECLINED: [`The team decided not to proceed with the offer for “${project}” at this time. No further action is required.`, `Nhóm chưa tiếp tục với đề nghị hướng dẫn “${project}” vào lúc này. Bạn không cần thực hiện thêm thao tác.`],
    MENTORSHIP_CANCELLED: [`The request for “${project}” is closed. Review Academic Support for the current status.`, `Lời mời hướng dẫn “${project}” đã đóng. Xem Hỗ trợ học thuật để biết trạng thái hiện tại.`],
    MENTORSHIP_EXPIRED: [`The pending request for “${project}” has expired.`, `Lời mời hướng dẫn “${project}” đã hết hạn.`],
    MENTORSHIP_ENDED: [`The mentorship for “${project}” has ended. Mentor access is no longer active; previous guidance remains in project history.`, `Quan hệ hướng dẫn “${project}” đã kết thúc. Quyền mentor đã được thu hồi; góp ý trước đây vẫn được giữ trong lịch sử project.`],
  };
  const index = locale === "vi" ? 1 : 0, subject = subjects[payload.event][index];
  const url = new URL("/academic-support", origin); url.searchParams.set("projectId", payload.projectId);
  return { subject, ...buildBrandedMail({ locale, subject, greeting: locale === "vi" ? `Xin chào ${name},` : `Hi ${name},`,
    paragraphs: [messages[payload.event][index]], cta: locale === "vi" ? "Mở Hỗ trợ học thuật" : "Open Academic Support", url: url.toString() }) };
}

export async function deliverMentorshipEmail(notificationId: string) {
  const db = getPrisma(), notification = await db.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.emailStatus !== "PENDING" || !notification.userId) return;
  const [user, profile] = await Promise.all([db.user.findUnique({ where: { id: notification.userId } }), db.academicProfile.findUnique({ where: { userId: notification.userId } })]);
  const parsed = payloadSchema.safeParse(notification.emailPayload);
  if (!parsed.success || !user?.isActive || user.accountStatus !== "ACTIVE" || !user.emailVerifiedAt || profile?.mentorshipEmailEnabled === false || env.EMAIL_DELIVERY_MODE !== "smtp") {
    await db.notification.updateMany({ where: { id: notificationId, emailStatus: "PENDING" }, data: { emailStatus: "SKIPPED" } }); return;
  }
  const content = buildMentorshipMail(parsed.data, user.fullName, profile?.notificationLocale === "vi" ? "vi" : "en", webOrigin());
  const claim = await db.notification.updateMany({ where: { id: notificationId, emailStatus: "PENDING" }, data: { emailStatus: "SENDING", emailClaimedAt: new Date() } });
  if (!claim.count) return;
  try {
    const delivered = await authMailService.sendMentorship(user.email, content.subject, content);
    await db.notification.update({ where: { id: notificationId }, data: { emailStatus: delivered ? "SENT" : "SKIPPED", emailSentAt: delivered ? new Date() : null } });
  } catch (error) {
    const failure = error as { code?: string; responseCode?: number };
    // Retry definite rejections. SMTP timeout after DATA may already have delivered: never send twice automatically.
    const safeRetry = Boolean(failure.responseCode || ["ECONNREFUSED", "ENOTFOUND", "EAUTH"].includes(failure.code ?? ""));
    await db.notification.update({ where: { id: notificationId }, data: { emailStatus: safeRetry ? "PENDING" : "UNCERTAIN" } });
    logger.warn({ notificationId, code: failure.code, safeRetry }, "Mentorship email delivery failed");
    if (safeRetry) throw error;
  }
}
