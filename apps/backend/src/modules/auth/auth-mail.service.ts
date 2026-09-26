import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";

type SecurityMessage = {
  to: string;
  subject: string;
  text: string;
  event: "email_verification" | "password_reset";
};

async function deliver(message: SecurityMessage): Promise<boolean> {
  if (env.EMAIL_DELIVERY_MODE === "disabled") return false;
  if (env.EMAIL_DELIVERY_MODE === "log") {
    // Security tokens and links must never enter application logs.
    logger.info({ to: message.to, event: message.event }, "DEV email delivery suppressed; configure SMTP to receive the link");
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transporter.sendMail({ from: env.SMTP_FROM, to: message.to, subject: message.subject, text: message.text });
  return true;
}

function webOrigin(): string {
  return env.CORS_ORIGIN.split(",")[0]?.trim() || "http://localhost:5173";
}

export const authMailService = {
  sendEmailVerification(email: string, token: string) {
    const url = new URL("/verify-email", webOrigin());
    url.searchParams.set("token", token);
    return deliver({
      to: email,
      event: "email_verification",
      subject: "Verify your LumiGap email",
      text: `Verify your LumiGap email by opening this link within 24 hours: ${url.toString()}`,
    });
  },

  sendPasswordReset(email: string, token: string) {
    const url = new URL("/reset-password", webOrigin());
    url.searchParams.set("token", token);
    return deliver({
      to: email,
      event: "password_reset",
      subject: "Reset your LumiGap password",
      text: `Reset your LumiGap password by opening this link within 30 minutes: ${url.toString()}`,
    });
  },
};
