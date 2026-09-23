import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { AcademicProfileModel } from "./academic-profile.model.js";
import { AcademicEmailVerificationChallengeModel } from "./academic-email-verification.model.js";
import { academicEmailDelivery, generateAcademicEmailOtp, hashAcademicEmailOtp } from "./academic-email.service.js";
import { TrustedInstitutionModel } from "./trusted-institution.model.js";

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

async function trustedInstitutionForEmail(email: string) {
  return TrustedInstitutionModel.findOne({
    domains: emailDomain(email),
    isActive: true,
    "verificationPolicy.allowInstitutionalEmailVerification": true,
  }).lean();
}

async function currentInstitutionalEmail(userId: string): Promise<string> {
  const profile = await AcademicProfileModel.findOne({ userId })
    .select("affiliation.institutionalEmail")
    .lean();
  const email = profile?.affiliation?.institutionalEmail;
  if (!email) throw AppError.badRequest("Add and save an institutional email first");
  return normalizeEmail(email);
}

export const institutionalEmailVerificationService = {
  async status(userId: string) {
    const profile = await AcademicProfileModel.findOne({ userId })
      .select("affiliation.institutionalEmail affiliation.institutionalEmailVerifiedAt")
      .lean();
    const email = profile?.affiliation?.institutionalEmail;
    if (!email) return { verified: false, trustedInstitution: false };
    const institution = await trustedInstitutionForEmail(email);
    return {
      email,
      verified: Boolean(profile.affiliation?.institutionalEmailVerifiedAt),
      verifiedAt: profile.affiliation?.institutionalEmailVerifiedAt?.toISOString(),
      trustedInstitution: Boolean(institution),
      institutionName: institution?.name,
    };
  },

  async requestChallenge(userId: string) {
    const email = await currentInstitutionalEmail(userId);
    const institution = await trustedInstitutionForEmail(email);
    if (!institution) {
      throw AppError.badRequest("This email domain is not registered as a trusted institution");
    }

    const code = generateAcademicEmailOtp();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);
    const codeHash = hashAcademicEmailOtp(userId, email, code);
    await AcademicEmailVerificationChallengeModel.findOneAndUpdate(
      { userId, email },
      { $set: { codeHash, attempts: 0, maxAttempts: OTP_MAX_ATTEMPTS, expiresAt }, $unset: { consumedAt: 1 } },
      { upsert: true, new: true, runValidators: true },
    );

    try {
      await academicEmailDelivery.sendVerificationCode({ email, code, expiresInMinutes: OTP_TTL_MINUTES });
    } catch (error) {
      await AcademicEmailVerificationChallengeModel.updateOne(
        { userId, email, codeHash },
        { $set: { consumedAt: new Date() } },
      );
      throw error;
    }

    await auditService.log("academic_profile.institutional_email.challenge_requested", {
      userId,
      targetTableName: "academic_profiles",
      targetRecordId: userId,
      details: { institutionId: String(institution._id), domain: emailDomain(email) },
    });
    return { email: maskEmail(email), expiresAt: expiresAt.toISOString() };
  },

  async verifyChallenge(userId: string, code: string) {
    const email = await currentInstitutionalEmail(userId);
    const now = new Date();
    const codeHash = hashAcademicEmailOtp(userId, email, code);
    const challenge = await AcademicEmailVerificationChallengeModel.findOneAndUpdate(
      {
        userId,
        email,
        codeHash,
        consumedAt: { $exists: false },
        expiresAt: { $gt: now },
        $expr: { $lt: ["$attempts", "$maxAttempts"] },
      },
      { $set: { consumedAt: now } },
      { new: true },
    );

    if (!challenge) {
      await AcademicEmailVerificationChallengeModel.updateOne(
        {
          userId,
          email,
          consumedAt: { $exists: false },
          expiresAt: { $gt: now },
          $expr: { $lt: ["$attempts", "$maxAttempts"] },
        },
        { $inc: { attempts: 1 } },
      );
      throw AppError.badRequest("The verification code is invalid or expired");
    }

    const institution = await trustedInstitutionForEmail(email);
    if (!institution) throw AppError.badRequest("This institution is no longer eligible for email verification");

    const evidence = [
      {
        type: "INSTITUTIONAL_EMAIL",
        value: email,
        status: "VALIDATED",
        source: "SYSTEM",
        createdAt: now,
        validatedAt: now,
      },
      {
        type: "TRUSTED_INSTITUTION",
        value: String(institution._id),
        status: "VALIDATED",
        source: "SYSTEM",
        createdAt: now,
        validatedAt: now,
      },
    ];
    const profile = await AcademicProfileModel.findOneAndUpdate(
      { userId, "affiliation.institutionalEmail": email },
      [
        {
          $set: {
            "affiliation.institutionalEmailVerifiedAt": now,
            verificationEvidence: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ["$verificationEvidence", []] },
                    as: "item",
                    cond: { $not: [{ $in: ["$$item.type", ["INSTITUTIONAL_EMAIL", "TRUSTED_INSTITUTION"]] }] },
                  },
                },
                evidence,
              ],
            },
          },
        },
      ],
      { new: true },
    );
    if (!profile) throw AppError.conflict("Institutional email changed; request a new code");

    await auditService.log("academic_profile.institutional_email.verified", {
      userId,
      targetTableName: "academic_profiles",
      targetRecordId: profile.id,
      details: { institutionId: String(institution._id), domain: emailDomain(email) },
    });
    return this.status(userId);
  },

  async invalidate(userId: string) {
    await AcademicEmailVerificationChallengeModel.updateMany(
      { userId, consumedAt: { $exists: false } },
      { $set: { consumedAt: new Date() } },
    );
  },
};
