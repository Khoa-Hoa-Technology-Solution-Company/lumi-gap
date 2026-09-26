import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";

const OTP_CONTEXT = "academic-institutional-email-v1";

export function generateAcademicEmailOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashAcademicEmailOtp(userId: string, email: string, code: string): string {
  const secret = env.ACADEMIC_EMAIL_OTP_SECRET ?? env.JWT_REFRESH_SECRET;
  if (!secret) throw AppError.serviceUnavailable("Academic email verification is not configured");
  return createHmac("sha256", secret)
    .update(`${OTP_CONTEXT}:${userId}:${email.toLowerCase()}:${code}`)
    .digest("hex");
}

export function academicEmailOtpMatches(expectedHash: string, actualHash: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const academicEmailDelivery = {
  async sendVerificationCode(input: { email: string; code: string; expiresInMinutes: number }) {
    if (env.EMAIL_DELIVERY_MODE === "disabled") {
      throw AppError.serviceUnavailable("Institutional email delivery is not configured");
    }
    if (env.EMAIL_DELIVERY_MODE === "log") {
      logger.warn(
        { email: input.email, verificationCode: input.code, expiresInMinutes: input.expiresInMinutes },
        "DEV ONLY: institutional email verification code",
      );
      return;
    }
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: input.email,
      subject: "Verify your LumiGap institutional email",
      text: `Your LumiGap verification code is ${input.code}. It expires in ${input.expiresInMinutes} minutes. If you did not request this, ignore this email.`,
    });
  },
};
