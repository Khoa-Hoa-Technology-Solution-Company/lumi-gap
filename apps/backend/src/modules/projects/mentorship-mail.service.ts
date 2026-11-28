import { z } from "zod";
import { authMailService, buildBrandedMail, webOrigin } from "../auth/auth-mail.service.js";
import type { MentorshipEmailPayload, MentorshipEvent } from "./mentorship-notifications.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";

const events = ["MENTORSHIP_REQUEST_RECEIVED", "MENTORSHIP_OFFER_RECEIVED", "MENTORSHIP_REQUEST_ACCEPTED", "MENTORSHIP_OFFER_ACCEPTED",
  "MENTORSHIP_REQUEST_DECLINED", "MENTORSHIP_OFFER_DECLINED", "MENTORSHIP_INFO_REQUESTED", "MENTORSHIP_TERMS_CHANGED", "MENTORSHIP_CANCELLED", "MENTORSHIP_EXPIRED", "MENTORSHIP_ENDED",
  "MENTORSHIP_SUGGESTED", "MENTORSHIP_SUGGESTION_PLANNED", "MENTORSHIP_SUGGESTION_INVITED", "MENTORSHIP_SUGGESTION_DISMISSED", "MENTORSHIP_POSITION_FILLED"] as const;
const payloadSchema = z.object({ event: z.enum(events), projectId: z.string().uuid(), projectTitle: z.string().max(100), actorName: z.string().max(200), requestId: z.string().uuid().optional() }).strict();

export function buildMentorshipMail(payload: MentorshipEmailPayload, name: string, locale: "en" | "vi", origin: string) {
  const { projectTitle: project, actorName: actor } = payload;
  const subjects: Record<MentorshipEvent, [string, string]> = {
    MENTORSHIP_POSITION_FILLED: [`Mentor position assigned for ${project}`, `Vị trí mentor của ${project} đã có người nhận`],
    MENTORSHIP_SUGGESTED: [`A teammate suggested a mentor for ${project}`, `Thành viên đề xuất cố vấn cho ${project}`],
    MENTORSHIP_SUGGESTION_PLANNED: [`Suggested mentor added to recruitment plan for ${project}`, `Đề xuất cố vấn đã được đưa vào kế hoạch mời cho ${project}`],
    MENTORSHIP_SUGGESTION_INVITED: [`Official invitation sent for your suggested mentor in ${project}`, `Chủ dự án đã gửi lời mời chính thức cho đề xuất của bạn trong ${project}`],
    MENTORSHIP_SUGGESTION_DISMISSED: [`Update on your mentor suggestion for ${project}`, `Cập nhật đề xuất cố vấn cho ${project}`],
    MENTORSHIP_REQUEST_RECEIVED: [`${actor} invited you to mentor ${project}`, `${actor} mời bạn hướng dẫn ${project}`],
    MENTORSHIP_OFFER_RECEIVED: [`${actor} proposed to mentor ${project}`, `${actor} gửi đề nghị hướng dẫn ${project}`],
    MENTORSHIP_REQUEST_ACCEPTED: [`${actor} accepted your mentorship request`, `${actor} đã chấp nhận lời mời hướng dẫn`],
    MENTORSHIP_OFFER_ACCEPTED: [`${project} accepted your mentorship proposal`, `${project} đã chấp nhận đề nghị hướng dẫn`],
    MENTORSHIP_REQUEST_DECLINED: [`Update on your mentorship request for ${project}`, `Cập nhật lời mời hướng dẫn ${project}`],
    MENTORSHIP_OFFER_DECLINED: [`Update on your mentorship proposal for ${project}`, `Cập nhật đề nghị hướng dẫn ${project}`],
    MENTORSHIP_INFO_REQUESTED: [`${actor} sent a clarification message for ${project}`, `${actor} gửi trao đổi làm rõ cho ${project}`],
    MENTORSHIP_TERMS_CHANGED: [`${actor} proposed updated mentorship terms for ${project}`, `${actor} đề xuất điều chỉnh điều kiện hướng dẫn ${project}`],
    MENTORSHIP_CANCELLED: [`Mentorship request closed for ${project}`, `Đề nghị hướng dẫn ${project} đã đóng`],
    MENTORSHIP_EXPIRED: [`Mentorship request expired for ${project}`, `Đề nghị hướng dẫn ${project} đã hết hạn`],
    MENTORSHIP_ENDED: [`Mentorship ended for ${project}`, `Đã kết thúc hướng dẫn ${project}`],
  };
  const messages: Record<MentorshipEvent, [string, string]> = {
    MENTORSHIP_POSITION_FILLED: ["This mentor position was assigned to another lecturer. Your invitation was closed automatically, not declined.", "Vị trí đã được phân công cho giảng viên khác. Lời mời tự động đóng, không được ghi nhận là từ chối."],
    MENTORSHIP_SUGGESTED: ["Review the suggested lecturer in Academic Support.", "Xem giảng viên được đề xuất trong Hỗ trợ học thuật."],
    MENTORSHIP_SUGGESTION_PLANNED: ["Your suggested lecturer was added to the project's private recruitment plan. No invitation has been sent to the lecturer yet.", "Giảng viên bạn đề xuất đã được đưa vào kế hoạch mời nội bộ. Giảng viên chưa nhận được lời mời chính thức."],
    MENTORSHIP_SUGGESTION_INVITED: ["The project owner sent an official mentorship invitation to the lecturer you suggested.", "Chủ dự án đã gửi lời mời chính thức đến giảng viên bạn đề xuất."],
    MENTORSHIP_SUGGESTION_DISMISSED: ["The project owner dismissed your internal mentor suggestion.", "Chủ dự án đã bỏ qua đề xuất cố vấn nội bộ của bạn."],
    MENTORSHIP_REQUEST_RECEIVED: [
      `${actor} invited you to become the academic mentor for “${project}” on LumiGap. Review the Research Mentorship Invitation Dossier (project overview, student profile, competencies, expectations, and proposed permissions) before deciding.`,
      `${actor} mời bạn làm cố vấn học thuật cho “${project}” trên LumiGap. Vui lòng xem Hồ sơ mời hướng dẫn nghiên cứu (thông tin đề tài, đại diện nhóm, năng lực, kỳ vọng và quyền truy cập đề xuất) trước khi quyết định.`,
    ],
    MENTORSHIP_OFFER_RECEIVED: [`${actor} sent a formal mentorship proposal for “${project}”. Review the lecturer's profile and proposed terms before deciding.`, `${actor} đã gửi đề nghị hướng dẫn cho “${project}”. Xem hồ sơ giảng viên và điều kiện hợp tác trước khi quyết định.`],
    MENTORSHIP_REQUEST_ACCEPTED: [`${actor} accepted the invitation to mentor “${project}”. The mentor now has scoped read and feedback access.`, `${actor} đã nhận lời hướng dẫn “${project}”. Mentor có quyền đọc và góp ý trong phạm vi được cấp.`],
    MENTORSHIP_OFFER_ACCEPTED: [`The team behind “${project}” accepted your proposal. You can now open its mentoring workspace.`, `Nhóm của “${project}” đã chấp nhận đề nghị hướng dẫn. Bạn có thể mở không gian hướng dẫn của dự án.`],
    MENTORSHIP_REQUEST_DECLINED: [`The invitation for “${project}” was declined. You may continue searching for another available mentor.`, `Lời mời hướng dẫn “${project}” đã được từ chối. Bạn có thể tìm mentor khác đang nhận nhóm mới.`],
    MENTORSHIP_OFFER_DECLINED: [`The team decided not to proceed with the proposal for “${project}” at this time. No further action is required.`, `Nhóm chưa tiếp tục với đề nghị hướng dẫn “${project}” vào lúc này. Bạn không cần thực hiện thêm thao tác.`],
    MENTORSHIP_INFO_REQUESTED: [`${actor} sent a private clarification message regarding “${project}”. Open Academic Support to review and reply.`, `${actor} đã gửi trao đổi làm rõ cho đề nghị hướng dẫn “${project}”. Mở Hỗ trợ học thuật để xem và phản hồi.`],
    MENTORSHIP_TERMS_CHANGED: [`${actor} proposed updated mentorship terms for “${project}”. Review the new version before deciding — no mentorship is activated until both parties agree to the same version.`, `${actor} đã đề xuất điều chỉnh điều kiện hướng dẫn cho “${project}”. Vui lòng xem phiên bản mới trước khi quyết định — quan hệ hướng dẫn chỉ được kích hoạt khi cả hai bên đồng thuận cùng phiên bản.`],
    MENTORSHIP_CANCELLED: [`The request for “${project}” is closed. Review Academic Support for the current status.`, `Đề nghị hướng dẫn “${project}” đã đóng. Xem Hỗ trợ học thuật để biết trạng thái hiện tại.`],
    MENTORSHIP_EXPIRED: [`The pending request for “${project}” has expired.`, `Đề nghị hướng dẫn “${project}” đã hết hạn.`],
    MENTORSHIP_ENDED: [`The mentorship for “${project}” has ended. Mentor access is no longer active; previous guidance remains in project history.`, `Quan hệ hướng dẫn “${project}” đã kết thúc. Quyền mentor đã được thu hồi; góp ý trước đây vẫn được giữ trong lịch sử project.`],
  };
  const index = locale === "vi" ? 1 : 0, subject = subjects[payload.event][index];
  const url = new URL("/academic-support", origin);
  if (["MENTORSHIP_REQUEST_RECEIVED", "MENTORSHIP_OFFER_RECEIVED", "MENTORSHIP_TERMS_CHANGED"].includes(payload.event)) {
    url.searchParams.set("view", "incoming");
    if (payload.requestId) { url.searchParams.set("invitationProjectId", payload.projectId); url.searchParams.set("requestId", payload.requestId); }
  } else if (payload.event === "MENTORSHIP_INFO_REQUESTED" || payload.event === "MENTORSHIP_SUGGESTED") { url.pathname = `/projects/${encodeURIComponent(payload.projectId)}`; url.searchParams.set("tab", "support"); }
  else if (payload.event.endsWith("_ACCEPTED")) url.searchParams.set("view", "active");
  else url.searchParams.set("view", "history");
  return { subject, ...buildBrandedMail({ locale, subject, greeting: locale === "vi" ? `Xin chào ${name},` : `Hi ${name},`,
    paragraphs: [messages[payload.event][index]],
    cta: payload.event === "MENTORSHIP_REQUEST_RECEIVED"
      ? (locale === "vi" ? "Xem hồ sơ mời hướng dẫn" : "Review Invitation Dossier")
      : (locale === "vi" ? "Mở Hỗ trợ học thuật" : "Open Academic Support"),
    url: url.toString() }) };
}

export async function deliverMentorshipEmail(notificationId: string) {
  const db = getPrisma(), notification = await db.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.emailStatus !== "PENDING" || !notification.userId) return;
  const [user, profile] = await Promise.all([db.user.findUnique({ where: { id: notification.userId } }), db.academicProfile.findUnique({ where: { userId: notification.userId } })]);
  const parsed = payloadSchema.safeParse(notification.emailPayload);
  // An outbox retry must not send an invitation that was withdrawn, expired or accepted meanwhile.
  if (parsed.success && ["MENTORSHIP_REQUEST_RECEIVED", "MENTORSHIP_OFFER_RECEIVED", "MENTORSHIP_TERMS_CHANGED"].includes(parsed.data.event)) {
    const invitation = parsed.data.requestId ? await db.mentorshipRequest.findFirst({ where: { id: parsed.data.requestId, projectId: parsed.data.projectId } }) : null;
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt && invitation.expiresAt <= new Date()) {
      await db.notification.updateMany({ where: { id: notificationId, emailStatus: "PENDING" }, data: { emailStatus: "SKIPPED" } }); return;
    }
  }
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
