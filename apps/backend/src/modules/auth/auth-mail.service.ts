import nodemailer from "nodemailer";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";

type SecurityMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; path: string; cid: string }>;
  event: "email_verification" | "password_reset" | "copyright_claim_verification";
};

const LUMIGAP_LOGO_PATH = fileURLToPath(new URL("./assets/lumigap-logo.png", import.meta.url));

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]!);
}

export function buildPasswordResetContent(name: string, resetUrl: string): { text: string; html: string } {
  const safeName = name.trim().replace(/\s+/g, " ") || "there";
  const parsedUrl = new URL(resetUrl);
  if ((parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") || parsedUrl.username || parsedUrl.password) {
    throw new Error("Password reset URL must use HTTP(S) and must not contain credentials");
  }
  const normalizedResetUrl = parsedUrl.toString();
  const greetingName = escapeHtml(safeName);
  const safeUrl = escapeHtml(normalizedResetUrl);

  return {
    text: [
      "LumiGap — Reset your password",
      "",
      `Hi ${safeName},`,
      "",
      "We received a request to reset the password for your LumiGap account.",
      "Click the link below to choose a new password:",
      normalizedResetUrl,
      "",
      "This link will expire in 30 minutes and can only be used once.",
      "",
      "If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.",
      "",
      "LumiGap — Academic research & collaboration platform",
      "This is an automated message. Please do not reply.",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Reset your LumiGap password</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#172b4d;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Choose a new password for your LumiGap account.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6fb;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5eaf2;border-radius:16px;overflow:hidden;">
          <tr><td align="center" style="padding:28px 28px 24px;border-bottom:1px solid #edf1f6;">
            <img src="cid:lumigap-logo" width="220" alt="LumiGap" style="display:block;width:220px;max-width:100%;height:auto;border:0;">
          </td></tr>
          <tr><td style="padding:34px 36px 12px;">
            <p style="margin:0 0 10px;color:#64748b;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Account security</p>
            <h1 style="margin:0;color:#102a56;font-size:28px;line-height:1.25;">Reset your password</h1>
          </td></tr>
          <tr><td style="padding:12px 36px 36px;color:#334155;font-size:16px;line-height:1.65;">
            <p style="margin:0 0 18px;">Hi ${greetingName},</p>
            <p style="margin:0 0 14px;">We received a request to reset the password for your LumiGap account.</p>
            <p style="margin:0 0 24px;">Click the button below to choose a new password.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 24px;">
              <tr><td align="center" style="border-radius:9px;background:#155eef;">
                <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;border:1px solid #155eef;border-radius:9px;color:#ffffff;font-size:16px;font-weight:700;line-height:1.2;text-decoration:none;">Reset password</a>
              </td></tr>
            </table>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background:#f7f9fc;border-radius:10px;">
              <tr><td style="padding:14px 16px;color:#52627a;font-size:14px;line-height:1.55;">This link will expire in <strong style="color:#263b5a;">30 minutes</strong> and can only be used once.</td></tr>
            </table>
            <p style="margin:0 0 22px;color:#64748b;font-size:14px;">If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="margin:0;overflow-wrap:anywhere;word-break:break-all;font-size:13px;line-height:1.55;"><a href="${safeUrl}" style="color:#155eef;">${safeUrl}</a></p>
          </td></tr>
          <tr><td style="padding:20px 36px 24px;border-top:1px solid #edf1f6;text-align:center;">
            <p style="margin:0 0 5px;color:#102a56;font-size:14px;font-weight:700;">LumiGap</p>
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;">Academic research &amp; collaboration platform</p>
            <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated message. Please do not reply.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}

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
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...(message.attachments ? { attachments: message.attachments } : {}),
  });
  return true;
}

export function resolvePasswordResetOrigin(configuredOrigin: string, nodeEnv: string): string {
  const parsedOrigin = new URL(configuredOrigin);
  const isLocalHttp = nodeEnv !== "production"
    && parsedOrigin.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname);
  if (parsedOrigin.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Password reset links must use HTTPS outside local development");
  }
  if (parsedOrigin.username || parsedOrigin.password) {
    throw new Error("Password reset origin must not contain credentials");
  }
  return parsedOrigin.origin;
}

function webOrigin(): string {
  const configuredOrigin = env.CORS_ORIGIN.split(",")[0]?.trim() || "http://localhost:5173";
  return resolvePasswordResetOrigin(configuredOrigin, env.NODE_ENV);
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

  sendCopyrightVerification(email: string, token: string, claimId: string) {
    const url = new URL("/copyright/verify", webOrigin());
    url.searchParams.set("token", token);
    url.searchParams.set("claim", claimId);
    return deliver({
      to: email,
      event: "copyright_claim_verification",
      subject: "Verify your LumiGap copyright claim",
      text: `Verify your copyright claim by opening this link within the configured verification window: ${url.toString()}`,
    });
  },

  sendPasswordReset(email: string, name: string, token: string) {
    const url = new URL("/reset-password", webOrigin());
    url.searchParams.set("token", token);
    const content = buildPasswordResetContent(name, url.toString());
    return deliver({
      to: email,
      event: "password_reset",
      subject: "Reset your LumiGap password",
      ...content,
      attachments: [{ filename: "lumigap-logo.png", path: LUMIGAP_LOGO_PATH, cid: "lumigap-logo" }],
    });
  },
};
