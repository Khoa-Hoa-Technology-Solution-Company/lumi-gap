import { z } from "zod";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";
import { authMailService, buildBrandedMail, webOrigin } from "../auth/auth-mail.service.js";
const payloadSchema = z.object({ projectId: z.string().uuid(), entityId: z.string().uuid(), allocation: z.boolean(), evaluation: z.boolean().optional() }).strict();
export async function deliverContributionsEmail(id: string) {
  const db = getPrisma(), notification = await db.notification.findUnique({ where: { id } });
  if (!notification?.userId || notification.emailStatus !== "PENDING") return;
  const user = await db.user.findUnique({ where: { id: notification.userId } });
  const payload = payloadSchema.safeParse(notification.emailPayload);
  if (!payload.success || !user?.isActive || user.accountStatus !== "ACTIVE" || !user.emailVerifiedAt || env.EMAIL_DELIVERY_MODE !== "smtp") {
    await db.notification.updateMany({ where: { id, emailStatus: "PENDING" }, data: { emailStatus: "SKIPPED" } }); return;
  }
  const profile = await db.academicProfile.findUnique({ where: { userId: user.id }, select: { notificationLocale: true } });
  const locale = profile?.notificationLocale === "vi" ? "vi" : "en";
  const subject = locale === "vi" ? "Cập nhật đóng góp trong LumiGap" : "LumiGap contribution update";
  const url = new URL(payload.data.allocation ? `/projects/${payload.data.projectId}/allocation` : `/projects/${payload.data.projectId}/contribution-review`, webOrigin());
  if (payload.data.allocation) url.searchParams.set("revision", payload.data.entityId);
  else url.searchParams.set(payload.data.evaluation ? "evaluation" : "record", payload.data.entityId);
  const content = buildBrandedMail({ locale, subject, greeting: locale === "vi" ? `Xin chào ${user.fullName},` : `Hi ${user.fullName},`, paragraphs: [locale === "vi" ? "Có nội dung đóng góp cần xem hoặc xác nhận. Đăng nhập để xem nội dung được chia sẻ với bạn." : "A contribution record or allocation needs your attention. Sign in to review the information shared with you."], cta: locale === "vi" ? "Xem đóng góp" : "Review contributions", url: url.toString() });
  const claim = await db.notification.updateMany({ where: { id, emailStatus: "PENDING" }, data: { emailStatus: "SENDING", emailClaimedAt: new Date() } });
  if (!claim.count) return;
  try {
    const delivered = await authMailService.sendContributions(user.email, subject, content);
    await db.notification.update({ where: { id }, data: { emailStatus: delivered ? "SENT" : "SKIPPED", emailSentAt: delivered ? new Date() : null } });
  } catch (error) {
    const failure = error as { code?: string; responseCode?: number };
    const retry = Boolean(failure.responseCode || ["ECONNREFUSED", "ENOTFOUND", "EAUTH"].includes(failure.code ?? ""));
    await db.notification.update({ where: { id }, data: { emailStatus: retry ? "PENDING" : "UNCERTAIN" } });
    logger.warn({ id, code: failure.code, retry }, "Contribution email failed"); if (retry) throw error;
  }
}
