import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";
import { notificationService } from "../notifications/notification.service.js";
import { authMailService, buildBrandedMail, webOrigin } from "../auth/auth-mail.service.js";

const events = ["LECTURER_VERIFICATION_SUBMITTED", "LECTURER_VERIFICATION_SUPPLEMENTED", "LECTURER_VERIFICATION_APPROVED", "LECTURER_VERIFICATION_REJECTED", "LECTURER_VERIFICATION_MORE_INFO_REQUIRED"] as const;
export type LecturerDeliveryEvent = typeof events[number];
const payloadSchema = z.object({
  event: z.enum(events), requestId: z.string().uuid(),
  institutionName: z.string().max(300).optional(), position: z.string().max(200).optional(),
  applicantMessage: z.string().max(1000).optional(), revision: z.number().int().positive().optional(),
}).strict();
type MailContext = Pick<z.infer<typeof payloadSchema>, "institutionName" | "position" | "applicantMessage" | "revision">;
const publicText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
function mailContext(request: { metadata: Prisma.JsonValue; rejectionReason: string | null; revision: number }): MailContext {
  const metadata = request.metadata && typeof request.metadata === "object" && !Array.isArray(request.metadata) ? request.metadata : {};
  return {
    institutionName: publicText(metadata.institutionName, 300), position: publicText(metadata.positionTitle ?? metadata.targetValue, 200),
    applicantMessage: publicText(request.rejectionReason, 1000), revision: request.revision,
  };
}
const labels: Record<LecturerDeliveryEvent, [string, string]> = {
  LECTURER_VERIFICATION_SUBMITTED: ["Lecturer verification received", "Đã tiếp nhận yêu cầu xác minh giảng viên"],
  LECTURER_VERIFICATION_SUPPLEMENTED: ["Supplementary evidence received", "Đã tiếp nhận minh chứng bổ sung"],
  LECTURER_VERIFICATION_APPROVED: ["Lecturer position verified", "Đã xác minh vị trí giảng viên"],
  LECTURER_VERIFICATION_REJECTED: ["Lecturer verification not approved", "Yêu cầu xác minh giảng viên chưa được chấp nhận"],
  LECTURER_VERIFICATION_MORE_INFO_REQUIRED: ["More information required", "Cần bổ sung thông tin xác minh"],
};
const messages: Record<LecturerDeliveryEvent, [string, string]> = {
  LECTURER_VERIFICATION_SUBMITTED: [
    "Your request and evidence have been received and are awaiting administrator review. You can leave this page; LumiGap will notify you when there is a result or more information is needed.",
    "Yêu cầu và minh chứng của bạn đã được tiếp nhận và đang chờ quản trị viên xét duyệt. Bạn có thể rời trang này; LumiGap sẽ thông báo khi có kết quả hoặc cần bổ sung thông tin.",
  ],
  LECTURER_VERIFICATION_SUPPLEMENTED: [
    "Your supplementary evidence has been received. The updated request is awaiting another review; previous submissions and feedback remain in your verification history.",
    "Minh chứng bổ sung đã được tiếp nhận. Hồ sơ cập nhật đang chờ xét duyệt lại; các lần gửi và phản hồi trước đó được giữ trong lịch sử xác minh.",
  ],
  LECTURER_VERIFICATION_MORE_INFO_REQUIRED: [
    "Review is waiting for your response. Open this request to read the feedback, keep any suitable evidence and add or replace the requested documents, then send the supplement for review.",
    "Hồ sơ đang chờ bạn bổ sung. Mở yêu cầu để xem phản hồi, giữ minh chứng phù hợp và thêm hoặc thay tài liệu được yêu cầu, sau đó gửi bổ sung để xét duyệt lại.",
  ],
  LECTURER_VERIFICATION_REJECTED: [
    "This request could not be approved. Read the reason below. If you have corrected information or new evidence, you can submit a new verification request; this decision remains in your history.",
    "Yêu cầu này chưa được chấp nhận. Vui lòng xem lý do bên dưới. Khi đã sửa thông tin hoặc có minh chứng mới, bạn có thể gửi yêu cầu xác minh mới; quyết định này được giữ trong lịch sử.",
  ],
  LECTURER_VERIFICATION_APPROVED: [
    "Your Lecturer position at the declared institution has been verified. You can open Academic Support to configure mentoring availability. Mentoring requires mutual consent and formal academic review requires an accepted assignment.",
    "Vị trí giảng viên tại đơn vị đã khai báo của bạn đã được xác minh. Bạn có thể mở Hỗ trợ học thuật để thiết lập khả năng nhận cố vấn. Cố vấn cần sự đồng ý của các bên; phản biện học thuật cần phân công được chấp nhận.",
  ],
};

export async function lecturerVerificationNotification(tx: Prisma.TransactionClient, event: LecturerDeliveryEvent, request: { id: string; userId: string; academicProfileId: string | null }) {
  const [profile, evidence] = await Promise.all([
    tx.academicProfile.findUnique({ where: { userId: request.userId }, select: { notificationLocale: true } }),
    tx.verificationEvidence.findUniqueOrThrow({ where: { id: request.id }, select: { metadata: true, rejectionReason: true, revision: true } }),
  ]);
  const context = mailContext(evidence);
  const vi = profile?.notificationLocale === "vi";
  await notificationService.create({ userId: request.userId, title: labels[event][vi ? 1 : 0],
    message: [messages[event][vi ? 1 : 0], ...(["LECTURER_VERIFICATION_REJECTED", "LECTURER_VERIFICATION_MORE_INFO_REQUIRED"].includes(event) && context.applicantMessage ? [context.applicantMessage] : [])].join("\n"),
    type: event, eventKey: `${event}:${request.id}:${request.userId}`, targetKind: "academic_profile", targetId: request.academicProfileId ?? undefined,
    emailPayload: { event, requestId: request.id, ...context } as Prisma.InputJsonObject, emailStatus: "PENDING",
  }, tx);
  if (["LECTURER_VERIFICATION_SUBMITTED", "LECTURER_VERIFICATION_SUPPLEMENTED"].includes(event)) await notificationService.create({ role: "admin", title: event === "LECTURER_VERIFICATION_SUPPLEMENTED" ? "Supplementary Lecturer evidence awaiting review" : "Lecturer verification awaiting review",
    message: [context.institutionName, context.position, `Revision ${context.revision ?? 1}. Open this request to review its evidence.`].filter(Boolean).join(" · "),
    type: "LECTURER_VERIFICATION_REVIEW_REQUESTED", eventKey: `LECTURER_VERIFICATION_REVIEW_REQUESTED:${request.id}`, emailPayload: { requestId: request.id }, emailStatus: "SKIPPED" }, tx);
}

export function buildLecturerVerificationMail(event: LecturerDeliveryEvent, requestId: string, name: string, locale: "en" | "vi", origin: string, context: MailContext = {}) {
  const vi = locale === "vi", subject = labels[event][vi ? 1 : 0];
  const url = new URL("/settings/verification/lecturer", origin); url.searchParams.set("requestId", requestId);
  const cta = event === "LECTURER_VERIFICATION_MORE_INFO_REQUIRED" ? vi ? "Xem yêu cầu bổ sung" : "View requested information" : event === "LECTURER_VERIFICATION_REJECTED" ? vi ? "Xem kết quả xét duyệt" : "View review result" : vi ? "Xem trạng thái xác minh" : "View verification status";
  const claim = [context.institutionName, context.position].filter(Boolean).join(" · ");
  const feedback = ["LECTURER_VERIFICATION_MORE_INFO_REQUIRED", "LECTURER_VERIFICATION_REJECTED"].includes(event) && context.applicantMessage;
  return { subject, ...buildBrandedMail({ locale, subject, greeting: vi ? `Xin chào ${name},` : `Hi ${name},`,
    paragraphs: [...(claim ? [claim] : []), messages[event][vi ? 1 : 0], ...(feedback ? [`${event === "LECTURER_VERIFICATION_MORE_INFO_REQUIRED" ? vi ? "Nội dung cần bổ sung" : "Requested information" : vi ? "Lý do" : "Reason"}: ${feedback}`] : []), ...(event === "LECTURER_VERIFICATION_SUPPLEMENTED" && context.revision ? [`${vi ? "Phiên bản hồ sơ" : "Request revision"}: ${context.revision}`] : [])],
    cta, url: url.toString(), footer: vi ? "Email tự động về yêu cầu xác minh của bạn trên LumiGap." : "Automated email about your verification request on LumiGap.",
  }) };
}

export async function deliverLecturerVerificationEmail(notificationId: string) {
  const db = getPrisma(), row = await db.notification.findUnique({ where: { id: notificationId } });
  if (!row?.userId || row.emailStatus !== "PENDING") return;
  const parsed = payloadSchema.safeParse(row.emailPayload);
  const [user, profile] = await Promise.all([db.user.findUnique({ where: { id: row.userId } }), db.academicProfile.findUnique({ where: { userId: row.userId } })]);
  if (!parsed.success || !user?.isActive || user.accountStatus !== "ACTIVE" || !user.emailVerifiedAt || env.EMAIL_DELIVERY_MODE !== "smtp") {
    await db.notification.updateMany({ where: { id: row.id, emailStatus: "PENDING" }, data: { emailStatus: "SKIPPED" } }); return;
  }
  const request = await db.verificationEvidence.findFirst({ where: { id: parsed.data.requestId, userId: row.userId } });
  const expectedStatus = parsed.data.event === "LECTURER_VERIFICATION_APPROVED" ? "VERIFIED" : parsed.data.event === "LECTURER_VERIFICATION_REJECTED" ? "REJECTED" : parsed.data.event === "LECTURER_VERIFICATION_MORE_INFO_REQUIRED" ? "NEEDS_MORE_INFORMATION" : "PENDING";
  // A delayed email must not ask the applicant to act on a superseded request.
  if (!request || request.invalidatedAt || request.supersededAt || request.status !== expectedStatus) { await db.notification.updateMany({ where: { id: row.id, emailStatus: "PENDING" }, data: { emailStatus: "SKIPPED" } }); return; }
  const mail = buildLecturerVerificationMail(parsed.data.event, request.id, user.fullName, profile?.notificationLocale === "vi" ? "vi" : "en", webOrigin(), { ...mailContext(request), ...parsed.data });
  const claim = await db.notification.updateMany({ where: { id: row.id, emailStatus: "PENDING" }, data: { emailStatus: "SENDING", emailClaimedAt: new Date() } });
  if (!claim.count) return;
  try {
    const sent = await authMailService.sendLecturerVerification(user.email, mail);
    await db.notification.update({ where: { id: row.id }, data: { emailStatus: sent ? "SENT" : "SKIPPED", emailSentAt: sent ? new Date() : null } });
  } catch (error) {
    const failure = error as { code?: string; responseCode?: number };
    // SMTP cannot guarantee exactly-once after an ambiguous DATA timeout.
    const permanent = Boolean(failure.responseCode && failure.responseCode >= 500);
    const retryable = !permanent && Boolean(failure.responseCode || ["ECONNREFUSED", "ENOTFOUND", "EAUTH"].includes(failure.code ?? ""));
    await db.notification.update({ where: { id: row.id }, data: { emailStatus: retryable ? "PENDING" : permanent ? "FAILED" : "UNCERTAIN" } });
    logger.warn({ notificationId, code: failure.code, retryable }, "Lecturer verification email delivery failed");
    if (retryable) throw error;
  }
}
