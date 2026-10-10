import { AppError } from "../../common/exceptions/app-error.js";
import { z } from "zod";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { normalizeEmail } from "../identity/identity-foundation.rules.js";
import { approvedInstitutionDomains, trustedInstitutionForEmail } from "../identity/institution-domain.service.js";
import { verifiedInstitutionalIdentity } from "./institutional-identity.service.js";
import { academicEmailDelivery, academicEmailOtpMatches, generateAcademicEmailOtp, hashAcademicEmailOtp } from "./academic-email.service.js";
import { env } from "../../config/env.js";

const OTP_TTL_MINUTES = env.ACADEMIC_EMAIL_OTP_TTL_MINUTES;
const OTP_MAX_ATTEMPTS = env.ACADEMIC_EMAIL_OTP_MAX_ATTEMPTS;
const unavailableEmail = () => new AppError(409, "INSTITUTIONAL_EMAIL_UNAVAILABLE", "This email cannot be linked. Use another institutional email or manual verification.");
const emailDomain = (email: string) => email.slice(email.lastIndexOf("@") + 1).toLowerCase();

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

async function userId(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.unauthorized();
  const user = await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }, select: { id: true },
  });
  if (!user) throw AppError.unauthorized();
  return user.id;
}

async function currentProfile(value: string) {
  const id = await userId(value);
  const profile = await getPrisma().academicProfile.findUnique({ where: { userId: id } });
  if (!profile?.institutionalEmail) throw AppError.badRequest("Add and save an institutional email first");
  return { id, profile, email: normalizeEmail(profile.institutionalEmail) };
}

export const institutionalEmailVerificationService = {
  async status(value: string) {
    const id = await userId(value);
    const db = getPrisma();
    const [profile, affiliation, user] = await Promise.all([
      db.academicProfile.findUnique({ where: { userId: id } }),
      db.affiliation.findFirst({ where: { userId: id, isPrimary: true, isCurrent: true } }),
      db.user.findUniqueOrThrow({ where: { id } }),
    ]);
    const identity = affiliation ? await verifiedInstitutionalIdentity(id, affiliation.institutionId) : null;
    const websiteDomains = affiliation ? await approvedInstitutionDomains(affiliation.institutionId, "WEBSITE") : [];
    const emailDomains = affiliation ? await approvedInstitutionDomains(affiliation.institutionId, "EMAIL") : [];
    const trusted = profile?.institutionalEmail ? await trustedInstitutionForEmail(profile.institutionalEmail) : null;
    return {
      email: identity?.email ?? profile?.institutionalEmail ?? undefined,
      verified: Boolean(identity), verifiedAt: identity?.verifiedAt.toISOString(),
      trustedInstitution: Boolean(identity || trusted && affiliation && trusted.institution.id === affiliation.institutionId),
      institutionName: affiliation?.institutionName, institutionId: affiliation?.institutionId,
      source: identity?.source, accountEmailVerified: Boolean(user.emailVerifiedAt),
      officialDomains: websiteDomains.map(item => item.domain),
      // Email ownership requires an exact approved domain; website subdomain policy is separate.
      approvedEmailDomains: emailDomains.map(({ domain }) => ({ domain, allowSubdomains: false })),
    };
  },

  async requestChallenge(value: string, emailInput?: string) {
    if (emailInput !== undefined && !z.string().trim().email().max(320).safeParse(emailInput).success) {
      throw new AppError(400, "INVALID_INSTITUTIONAL_EMAIL", "Enter a valid institutional email address.");
    }
    const id = await userId(value), db = getPrisma();
    const status = await this.status(value);
    if (status.verified && (!emailInput || normalizeEmail(emailInput) === status.email)) return { ...status, alreadyVerified: true };
    const profile = await db.academicProfile.findUnique({ where: { userId: id } });
    const email = normalizeEmail(emailInput ?? profile?.institutionalEmail ?? "");
    const institution = (await trustedInstitutionForEmail(email))?.institution;
    if (institution && institution.id !== status.institutionId) {
      throw new AppError(400, "INSTITUTIONAL_EMAIL_INSTITUTION_MISMATCH", "This email does not belong to the selected institution.");
    }
    if (!institution) {
      const unavailable = status.approvedEmailDomains?.length === 0;
      throw new AppError(400, unavailable ? "INSTITUTIONAL_EMAIL_VERIFICATION_UNAVAILABLE" : "INSTITUTIONAL_EMAIL_DOMAIN_UNAPPROVED",
        unavailable ? "Email verification is not configured for this institution. Use manual verification or contact support." : "Use an approved institutional email for your selected institution");
    }
    if (!status.accountEmailVerified) throw AppError.forbidden("Verify your account email first");
    if (!profile) throw AppError.badRequest("Complete your academic profile first");
    const code = generateAcademicEmailOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
    const codeHash = hashAcademicEmailOtp(id, email, code);
    const reused = await getPrisma().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const live = await tx.academicProfile.findUnique({ where: { id: profile.id } });
      const account = await tx.user.findUniqueOrThrow({ where: { id } });
      const affiliation = await tx.affiliation.findFirst({ where: { userId: id, isPrimary: true, isCurrent: true } });
      const trusted = await trustedInstitutionForEmail(email, tx);
      if (!live || !account.isActive || account.accountStatus !== "ACTIVE" || !account.emailVerifiedAt || !affiliation || !trusted || affiliation.institutionId !== trusted.institution.id) throw AppError.conflict("Account or institution changed; refresh before requesting a code");
      const identity = await verifiedInstitutionalIdentity(id, affiliation.institutionId, tx);
      if (identity?.email === email) return "REUSED";
      const [existing, loginOwner] = await Promise.all([tx.userEmail.findUnique({ where: { normalizedEmail: email } }), tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })]);
      const recent = await tx.academicEmailVerificationChallenge.findFirst({ where: { userId: id, sentAt: { gt: new Date(Date.now() - env.ACADEMIC_EMAIL_RESEND_COOLDOWN_SECONDS * 1000) } } });
      if (recent) throw new AppError(429, "INSTITUTIONAL_EMAIL_COOLDOWN", "Please wait before requesting another verification code.");
      await tx.academicEmailVerificationChallenge.updateMany({ where: { userId: id, consumedAt: null }, data: { consumedAt: new Date() } });
      if (existing && existing.userId !== id || loginOwner && loginOwner.id !== id) {
        // Identical acknowledgement; no email, link or ownership disclosure for unrelated accounts.
        await tx.academicEmailVerificationChallenge.upsert({ where: { userId_email: { userId: id, email } },
          create: { userId: id, email, codeHash, expiresAt, consumedAt: new Date(), sentAt: new Date() },
          update: { codeHash, expiresAt, consumedAt: new Date(), sentAt: new Date() } });
        return "UNAVAILABLE";
      }
      await tx.academicProfile.update({ where: { id: profile.id }, data: { institutionalEmail: email, institutionalEmailVerifiedAt: null } });
      await tx.academicEmailVerificationChallenge.upsert({
      where: { userId_email: { userId: id, email } },
      create: { userId: id, email, codeHash, attempts: 0, maxAttempts: OTP_MAX_ATTEMPTS, expiresAt, sentAt: new Date() },
      update: { codeHash, attempts: 0, maxAttempts: OTP_MAX_ATTEMPTS, expiresAt, consumedAt: null, sentAt: new Date() },
      });
      return "CREATED";
    });
    if (reused === "REUSED") return { ...await this.status(value), alreadyVerified: true };
    if (reused === "UNAVAILABLE") return { email: maskEmail(email), expiresAt: expiresAt.toISOString(), resendAt: new Date(Date.now() + env.ACADEMIC_EMAIL_RESEND_COOLDOWN_SECONDS * 1000).toISOString() };
    try {
      await academicEmailDelivery.sendVerificationCode({ email, code, expiresInMinutes: OTP_TTL_MINUTES });
    } catch (error) {
      await getPrisma().academicEmailVerificationChallenge.updateMany({
        where: { userId: id, email, codeHash }, data: { consumedAt: new Date() },
      });
      throw error;
    }
    await auditService.log("AFFILIATION_VERIFICATION_SUBMITTED", {
      userId: value, targetTableName: "academic_profiles", targetRecordId: profile.id,
      details: { institutionId: institution.id, domain: emailDomain(email), method: "INSTITUTIONAL_EMAIL" },
    });
    return { email: maskEmail(email), expiresAt: expiresAt.toISOString(), resendAt: new Date(Date.now() + env.ACADEMIC_EMAIL_RESEND_COOLDOWN_SECONDS * 1000).toISOString() };
  },

  async verifyChallenge(value: string, code: string, emailInput?: string) {
    const prisma = getPrisma();
    const { id, profile, email } = await currentProfile(value);
    const now = new Date();
    if (emailInput && normalizeEmail(emailInput) !== email) throw AppError.badRequest("The verification code is invalid or expired");
    const codeHash = hashAcademicEmailOtp(id, email, code);
    const challenge = await prisma.academicEmailVerificationChallenge.findUnique({ where: { userId_email: { userId: id, email } } });
    if (!challenge || !academicEmailOtpMatches(challenge.codeHash, codeHash) || challenge.consumedAt
      || challenge.expiresAt <= now || challenge.attempts >= challenge.maxAttempts) {
      if (challenge && !challenge.consumedAt && challenge.expiresAt > now && challenge.attempts < challenge.maxAttempts) {
        await prisma.academicEmailVerificationChallenge.updateMany({ where: { id: challenge.id, codeHash: challenge.codeHash, consumedAt: null, attempts: { lt: challenge.maxAttempts } }, data: { attempts: { increment: 1 } } });
      }
      throw AppError.badRequest("The verification code is invalid or expired");
    }
    const institution = (await trustedInstitutionForEmail(email))?.institution;
    if (!institution) throw AppError.badRequest("This institution is no longer eligible for email verification");
    const claimedEmail = await prisma.userEmail.findUnique({ where: { normalizedEmail: email } });
    if (claimedEmail && claimedEmail.userId !== id) throw unavailableEmail();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const consumedAt = new Date();
      const claimed = await tx.academicEmailVerificationChallenge.updateMany({
        where: { id: challenge.id, codeHash, consumedAt: null, attempts: { lt: challenge.maxAttempts }, expiresAt: { gt: consumedAt } },
        data: { consumedAt },
      });
      if (!claimed.count) throw AppError.badRequest("The verification code is invalid or expired");
      const current = await tx.academicProfile.findUnique({ where: { id: profile.id }, select: { institutionalEmail: true } });
      if (current?.institutionalEmail?.toLowerCase() !== email) throw AppError.conflict("Institutional email changed; request a new code");
      const account = await tx.user.findUniqueOrThrow({ where: { id } });
      const affiliation = await tx.affiliation.findFirst({ where: { userId: id, isPrimary: true, isCurrent: true } });
      const trusted = await trustedInstitutionForEmail(email, tx);
      const loginOwner = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
      if (!account.isActive || account.accountStatus !== "ACTIVE" || !account.emailVerifiedAt || !trusted || affiliation?.institutionId !== trusted.institution.id) throw AppError.conflict("Account or institution changed before email verification");
      if (loginOwner && loginOwner.id !== id) throw unavailableEmail();
      const verifiedEmail = await tx.userEmail.upsert({
        where: { normalizedEmail: email },
        create: { userId: id, normalizedEmail: email, purpose: "INSTITUTIONAL", verifiedAt: consumedAt },
        update: { verifiedAt: consumedAt },
      });
      if (verifiedEmail.userId !== id) {
        throw unavailableEmail();
      }
      await tx.academicProfile.update({ where: { id: profile.id }, data: { institutionalEmailVerifiedAt: consumedAt } });
      await tx.academicVerificationEvidence.deleteMany({
        where: { profileId: profile.id, type: { in: ["INSTITUTIONAL_EMAIL", "TRUSTED_INSTITUTION"] } },
      });
      await tx.academicVerificationEvidence.createMany({ data: [
        { profileId: profile.id, type: "INSTITUTIONAL_EMAIL", value: email, status: "VALIDATED", source: "SYSTEM", createdAt: consumedAt, validatedAt: consumedAt },
        { profileId: profile.id, type: "TRUSTED_INSTITUTION", value: institution.id, status: "VALIDATED", source: "SYSTEM", createdAt: consumedAt, validatedAt: consumedAt },
      ] });
    });
    await auditService.log("INSTITUTIONAL_EMAIL_VERIFIED", {
      userId: value, targetTableName: "user_emails", details: { purpose: "INSTITUTIONAL", institutionId: institution.id },
    });
    return this.status(value);
  },

  async invalidate(value: string) {
    const id = await userId(value);
    await getPrisma().academicEmailVerificationChallenge.updateMany({
      where: { userId: id, consumedAt: null }, data: { consumedAt: new Date() },
    });
  },
};
