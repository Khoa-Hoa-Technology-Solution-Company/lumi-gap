import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";

function webOrigin() {
  return env.CORS_ORIGIN.split(",")[0]?.trim() || "http://localhost:3000";
}

function singleLine(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendProjectInvitationEmail(input: { email: string; projectTitle: string; inviterName: string; token: string; message?: string }) {
  if (env.NODE_ENV === "test") return false;
  if (env.EMAIL_DELIVERY_MODE === "disabled") return false;
  if (env.EMAIL_DELIVERY_MODE === "log") {
    logger.info({ to: input.email, event: "project_invitation" }, "DEV project invitation email suppressed; configure SMTP to deliver it");
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  const url = new URL(`/invitations/${encodeURIComponent(input.token)}`, webOrigin());
  const projectTitle = singleLine(input.projectTitle);
  const inviterName = singleLine(input.inviterName);
  const message = input.message ? singleLine(input.message) : undefined;
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.email,
    subject: `${inviterName} invited you to collaborate on ${projectTitle}`,
    text: [
      "LumiGap",
      "",
      `${inviterName} invited you to collaborate on “${projectTitle}”.`,
      message ? `Message: ${message}` : undefined,
      "",
      "View invitation:",
      url.toString(),
      "",
      "Sign in or create a LumiGap account using this email address to respond to the invitation.",
      "This invitation link opens a preview only. Accepting or declining happens inside LumiGap after sign-in.",
    ].filter(Boolean).join("\n"),
  });
  return true;
}
