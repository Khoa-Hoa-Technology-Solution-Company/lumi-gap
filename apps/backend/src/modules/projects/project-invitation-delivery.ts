import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma, ProjectInvitation } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { notificationService } from "../notifications/notification.service.js";
import { sendProjectInvitationEmail } from "./project-invitation.mail.js";

const payloadSchema = z.object({ invitationId: z.string().uuid(), tokenHash: z.string(), envelope: z.string() }).strict();
const encryptionKey = () => createHash("sha256").update("lumigap:project-invitation:v1:").update(env.INTERNAL_SERVICE_KEY).digest();

function seal(token: string, invitationId: string) {
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(invitationId));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function open(envelope: string, invitationId: string) {
  const value = Buffer.from(envelope, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  decipher.setAAD(Buffer.from(invitationId));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8");
}

/** Durable outbox and in-app notification commit together with the invitation. */
export async function queueProjectInvitation(tx: Prisma.TransactionClient, invite: ProjectInvitation, token: string) {
  return notificationService.create({
    userId: invite.invitedUserId ?? undefined,
    title: "Project invitation", message: "You have a project invitation. Sign in to review it.",
    type: "project_invitation", targetKind: "project", targetId: invite.projectId,
    eventKey: `PROJECT_INVITATION_${invite.id}_${invite.tokenHash}`,
    emailStatus: "PENDING",
    emailPayload: { invitationId: invite.id, tokenHash: invite.tokenHash!, envelope: seal(token, invite.id) },
  }, tx);
}

export async function deliverProjectInvitationEmail(notificationId: string) {
  const db = getPrisma();
  const notification = await db.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.emailStatus !== "PENDING") return;
  const payload = payloadSchema.safeParse(notification.emailPayload);
  if (!payload.success) return;
  const invite = await db.projectInvitation.findUnique({ where: { id: payload.data.invitationId } });
  const project = invite ? await db.project.findUnique({ where: { id: invite.projectId } }) : null;
  if (!invite || !project || project.status === "ARCHIVED" || invite.status !== "PENDING" || invite.expiresAt <= new Date() || invite.tokenHash !== payload.data.tokenHash) {
    await db.notification.updateMany({ where: { id: notificationId, emailStatus: "PENDING" }, data: { emailStatus: "SKIPPED", emailPayload: {} } });
    return;
  }
  const claim = await db.notification.updateMany({ where: { id: notificationId, emailStatus: "PENDING" }, data: { emailStatus: "SENDING", emailClaimedAt: new Date() } });
  if (!claim.count) return;
  try {
    const inviter = await db.user.findUnique({ where: { id: invite.invitedById }, select: { fullName: true } });
    const sent = await sendProjectInvitationEmail({ email: invite.email, projectTitle: project.title, inviterName: inviter?.fullName || "A LumiGap member", message: invite.message ?? undefined, token: open(payload.data.envelope, invite.id) });
    await db.notification.update({ where: { id: notificationId }, data: { emailStatus: sent ? "SENT" : "SKIPPED", emailSentAt: sent ? new Date() : null, emailPayload: {} } });
  } catch (error) {
    const failure = error as { code?: string; responseCode?: number };
    const retry = Boolean(failure.responseCode || ["ECONNREFUSED", "ENOTFOUND", "EAUTH"].includes(failure.code ?? ""));
    await db.notification.update({ where: { id: notificationId }, data: { emailStatus: retry ? "PENDING" : "UNCERTAIN" } });
    logger.warn({ notificationId, code: failure.code, retry }, "Project invitation email delivery failed");
    if (retry) throw error;
  }
}

/** External recipients have no account yet, so their email jobs must also be recoverable. */
export async function recoverProjectInvitationEmails() {
  const db = getPrisma();
  const rows = await db.notification.findMany({ where: { eventKey: { startsWith: "PROJECT_INVITATION_" }, emailStatus: "PENDING" }, take: 50, orderBy: { createdAt: "asc" } });
  for (const row of rows) {
    try { await deliverProjectInvitationEmail(row.id); }
    catch { /* Definite failures stay pending for the next worker tick. */ }
  }
}
