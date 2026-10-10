import { z } from "zod";
import type { InstitutionalEmailVerificationStatus } from "@trend/shared-types";

const emailSchema = z.string().trim().email().max(320);

export function institutionalEmailIssue(email: string, status?: InstitutionalEmailVerificationStatus): string | undefined {
  if (!emailSchema.safeParse(email).success) return "Enter a valid institutional email address.";
  const domains = status?.approvedEmailDomains;
  if (!domains) return undefined; // Older APIs still validate the domain on the server.
  if (!domains.length) return "Email verification is not configured for this institution. Use manual verification or contact support.";
  const host = email.trim().slice(email.trim().lastIndexOf("@") + 1).toLowerCase();
  if (!domains.some(({ domain, allowSubdomains }) => host === domain || allowSubdomains && host.endsWith(`.${domain}`))) {
    return "This email is not approved for {{institution}}. Use an email issued by this institution, edit your institution, or choose manual verification.";
  }
  return undefined;
}

export function lecturerVerificationError(error: unknown, fallback: string, step: "email" | "code" | "evidence"): string {
  const response = (error as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } })?.response;
  const failure = response?.data?.error;
  const domainMismatch = "This email is not approved for {{institution}}. Use an email issued by this institution, edit your institution, or choose manual verification.";
  const codes: Record<string, string> = {
    INSTITUTIONAL_EMAIL_UNAVAILABLE: "This email cannot be linked. Use another institutional email or manual verification.",
    INSTITUTIONAL_EMAIL_COOLDOWN: "Please wait before requesting another verification code.",
    EVIDENCE_UPLOAD_LIMIT: "Too many staged documents. Try again after unused uploads expire.",
    INVALID_INSTITUTIONAL_EMAIL: "Enter a valid institutional email address.",
    INSTITUTIONAL_EMAIL_INSTITUTION_MISMATCH: "This email is not approved for {{institution}}. Use an email issued by this institution, edit your institution, or choose manual verification.",
    INSTITUTIONAL_EMAIL_DOMAIN_UNAPPROVED: "This email is not approved for {{institution}}. Use an email issued by this institution, edit your institution, or choose manual verification.",
    INSTITUTIONAL_EMAIL_VERIFICATION_UNAVAILABLE: "Email verification is not configured for this institution. Use manual verification or contact support.",
  };
  const codeMessage = failure?.code ? codes[failure.code] : undefined;
  if (codeMessage) return codeMessage;
  // Translate expected domain errors; never surface a raw generic payload error or internal message.
  const messages: Record<string, string> = {
    "Previously submitted evidence is unavailable. Upload a replacement.": "Previously submitted evidence is unavailable. Upload a replacement.",
    "This request changed or can no longer receive supplements. Refresh its status.": "This request changed or can no longer receive supplements. Refresh its status.",
    "Supplement the current request before starting another.": "Supplement the current request before starting another.",
    "This document upload is unavailable or expired. Upload it again.": "This document upload is unavailable or expired. Upload it again.",
    "Choose a PDF, JPEG or PNG of up to 10 MB.": "Choose a PDF, JPEG or PNG of up to 10 MB.",
    "Uploaded file is not a valid JPEG or PNG image.": "Uploaded file is not a valid JPEG or PNG image.",
    "Uploaded file is not a valid PDF": "Uploaded file is not a valid PDF",
    "Use an approved institutional email for your selected institution": domainMismatch,
    "The verification code is invalid or expired": "The verification code is invalid or expired. Request a new code and try again.",
    "Email is already linked to another account": "This email is already linked to another LumiGap account. Use another institutional email or contact support.",
    "Verify your account email first": "Verify your LumiGap account email first.",
    "Verify your LumiGap account email first": "Verify your LumiGap account email first.",
    "Verify an institutional email for this institution first, or use manual verification": "Verify your institutional email before submitting, or choose manual verification.",
    "Account or institution changed; refresh before requesting a code": "Your institution or account changed. Refresh this page and try again.",
    "Account or institution changed before email verification": "Your institution or account changed. Refresh this page and try again.",
    "Institutional email changed; request a new code": "The email has changed. Request a new verification code.",
    "Lecturer verification is already pending": "Your Lecturer verification request is already pending. Refresh to view its status.",
    "Your academic claim changed; refresh before submitting": "Your institution or account changed. Refresh this page and try again.",
    "Use an approved official website of the claimed institution": "Provide a valid official institution URL and all required evidence.",
    "This URL is not on an approved website domain for your institution. Use institution-issued documents or ask support to register the official domain.": "This URL is not on an approved website domain for your institution. Use institution-issued documents or ask support to register the official domain.",
    "Use a valid HTTPS institution URL": "Provide a valid official institution URL and all required evidence.",
    "Use a valid public HTTPS institution URL without credentials or fragments": "Provide a valid official institution URL and all required evidence.",
    "Provide two independent institution evidence sources": "Provide two different institution evidence sources.",
  };
  const message = failure?.message ? messages[failure.message] : undefined;
  if (message) return message;
  if (response?.status === 401) return "Your session has expired. Sign in again before submitting.";
  if (response?.status === 429) return "Too many verification attempts. Please wait before trying again.";
  if (failure?.code === "VALIDATION_ERROR") return step === "email" ? "Enter a valid institutional email address." : step === "code" ? "Enter the 6-digit verification code." : "Provide complete evidence for each entry.";
  return fallback;
}
