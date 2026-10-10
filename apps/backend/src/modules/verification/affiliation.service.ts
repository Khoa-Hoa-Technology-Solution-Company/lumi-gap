import crypto from "node:crypto";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { participantScopeForUser } from "../identity/participant-scope.service.js";
import { trustedInstitutionForEmail } from "../identity/institution-domain.service.js";

async function resolveUser(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.unauthorized();
  const user = await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
  });
  if (!user) throw AppError.unauthorized();
  return user;
}

export async function resolveAcademicInstitution(name: string) {
  const prisma = getPrisma();
  const normalizedName = name.trim();
  const existing = await prisma.institution.findFirst({ where: { name: { equals: normalizedName, mode: "insensitive" } } });
  if (existing) {
    if (!existing.isActive || existing.status !== "ACTIVE") throw AppError.badRequest("Selected institution is no longer available");
    return existing;
  }
  const slug = `external-${crypto.createHash("sha256").update(normalizedName.toLowerCase()).digest("hex").slice(0, 24)}`;
  const institution = await prisma.institution.upsert({
    where: { slug },
    create: { name: normalizedName, slug, hostInstitution: false, status: "ACTIVE", verificationPolicy: {} },
    update: {},
  });
  if (!institution.isActive || institution.status !== "ACTIVE") throw AppError.badRequest("Selected institution is no longer available");
  return institution;
}

export const affiliationService = {
  async declare(userId: string, institutionName: string, details: { department?: string; rorId?: string } = {}) {
    const user = await resolveUser(userId);
    const institution = await resolveAcademicInstitution(institutionName);
    const prisma = getPrisma();
    const current = await prisma.affiliation.findFirst({ where: { userId: user.id, isPrimary: true, isCurrent: true } });
    const sameDeclaration = current
      && current.institutionId === institution.id
      && (current.department ?? "") === (details.department ?? "")
      && (current.rorId ?? "") === (details.rorId ?? "");
    if (sameDeclaration) return;
    const now = new Date();
    const created = await prisma.$transaction(async (tx) => {
      if (current) await tx.affiliation.update({
        where: { id: current.id }, data: { isPrimary: false, isCurrent: false, endDate: now, validUntil: now },
      });
      const affiliation = await tx.affiliation.create({ data: {
        userId: user.id, institutionId: institution.id, institutionName: institution.name,
        department: details.department, rorId: details.rorId,
        verificationStatus: "NOT_SUBMITTED", verificationSource: "SELF_DECLARED",
        isPrimary: true, isCurrent: true, startDate: now, validFrom: now,
      } });
      await tx.user.update({ where: { id: user.id }, data: { institution: institution.name } });
      await tx.academicProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, affiliationStatus: "NOT_SUBMITTED" },
        update: { affiliationStatus: "NOT_SUBMITTED" },
      });
      return affiliation;
    });
    await auditService.log("AFFILIATION_CREATED", {
      userId: user.id, targetTableName: "affiliations", targetRecordId: created.id,
      details: { institutionId: institution.id, source: "SELF_DECLARED" },
    });
  },

  async verifyFromEmail(userId: string, emailInput: string, options: { requireCurrentProfileEmail?: boolean } = {}) {
    const user = await resolveUser(userId);
    const trusted = await trustedInstitutionForEmail(emailInput);
    if (!trusted) return null;
    const { email, domain, institution } = trusted;
    const verificationMethod = "INSTITUTIONAL_EMAIL";
    const prisma = getPrisma();
    const claimedEmail = await prisma.userEmail.findUnique({ where: { normalizedEmail: email } });
    if (claimedEmail && claimedEmail.userId !== user.id) {
      throw AppError.conflict("Institutional email is already linked to another account");
    }
    if (!claimedEmail?.verifiedAt) throw AppError.badRequest("Verify ownership of the institutional email first");
    const now = new Date();
    let affiliationId: string | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const liveUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const ownership = await tx.userEmail.findUnique({ where: { normalizedEmail: email } });
      if (!liveUser.isActive || liveUser.accountStatus !== "ACTIVE" || ownership?.userId !== user.id || !ownership.verifiedAt) throw AppError.forbidden("Verified email ownership and an active account are required");
      if (options.requireCurrentProfileEmail) {
        const liveProfile = await tx.academicProfile.findUnique({ where: { userId: user.id } });
        if (liveProfile?.institutionalEmail?.toLowerCase() !== email || !liveProfile.institutionalEmailVerifiedAt) throw AppError.conflict("Institutional email changed; verify the current email first");
      }
      const current = await tx.affiliation.findFirst({ where: { userId: user.id, isPrimary: true, isCurrent: true } });
      const sameInstitution = current?.institutionId === institution.id;
      if (options.requireCurrentProfileEmail && !sameInstitution) throw AppError.conflict("Your selected institution changed; refresh before linking affiliation evidence");
      const changedPosition = !sameInstitution ? {
        positionStatus: "NOT_SUBMITTED", roleVerificationStatus: "SELF_DECLARED", roleVerificationMethod: null,
        roleVerifiedAt: null, roleVerifiedById: null, verificationStatus: "SELF_DECLARED",
        verificationRequestedAt: null, verifiedAt: null, verifiedById: null,
      } : {};
      const verifiedEmail = await tx.userEmail.upsert({
        where: { normalizedEmail: email },
        create: { userId: user.id, normalizedEmail: email, purpose: "INSTITUTIONAL", verifiedAt: now },
        update: { verifiedAt: now },
      });
      if (verifiedEmail.userId !== user.id) {
        throw AppError.conflict("Institutional email is already linked to another account");
      }
      const profile = await tx.academicProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          institutionalEmail: email,
          institutionalEmailVerifiedAt: now,
          affiliationStatus: "VERIFIED",
        },
        update: {
          institutionalEmail: email,
          institutionalEmailVerifiedAt: now,
          affiliationStatus: "VERIFIED",
          ...changedPosition,
        },
      });
      if (!sameInstitution) await tx.verificationEvidence.updateMany({
        where: { userId: user.id, verificationType: "POSITION", status: { in: ["PENDING", "VERIFIED", "NEEDS_MORE_INFORMATION"] } },
        data: { status: "INVALIDATED", reviewedAt: now, rejectionReason: "Institution changed through institutional email verification" },
      });
      if (current && !sameInstitution) {
        await tx.affiliation.update({
          where: { id: current.id },
          data: { isPrimary: false, isCurrent: false, endDate: now, validUntil: now },
        });
      }
      const affiliation = current && sameInstitution
        ? await tx.affiliation.update({
            where: { id: current.id },
            data: {
              institutionName: institution.name,
              institutionDomain: domain,
              rorId: institution.rorId,
              verificationStatus: "VERIFIED",
              verificationMethod,
              verificationSource: "EMAIL",
              verifiedAt: now,
            },
          })
        : await tx.affiliation.create({
            data: {
              userId: user.id,
              institutionId: institution.id,
              institutionName: institution.name,
              institutionDomain: domain,
              rorId: institution.rorId,
              verificationStatus: "VERIFIED",
              verificationMethod,
              verificationSource: "EMAIL",
              verifiedAt: now,
              isPrimary: true,
              isCurrent: true,
              positionTitle: profile.positionTitle,
              positionCategory: profile.positionCategory,
              positionSource: profile.positionSource,
              positionStatus: "NOT_SUBMITTED",
              startDate: now,
              validFrom: now,
            },
          });
      affiliationId = affiliation.id;
      await tx.user.update({ where: { id: user.id }, data: { institution: institution.name } });
      await tx.verificationEvidence.updateMany({ where: { userId: user.id, verificationType: "AFFILIATION", status: "PENDING" }, data: { status: "INVALIDATED", reviewedAt: now, rejectionReason: "Affiliation verified through institutional email" } });
      await tx.verificationEvidence.updateMany({ where: { userId: user.id, verificationType: "AFFILIATION", status: "NEEDS_MORE_INFORMATION", supersededAt: null }, data: { supersededAt: now } });
      await tx.verificationEvidence.create({
        data: {
          userId: user.id,
          academicProfileId: profile.id,
          verificationType: "AFFILIATION",
          sourceType: verificationMethod,
          sourceReference: domain,
          status: "VERIFIED",
          reviewedAt: now,
          metadata: { institutionId: institution.id, hostInstitution: institution.hostInstitution },
        },
      });
    });
    await auditService.log("AFFILIATION_VERIFIED", {
      userId: user.id, targetTableName: "affiliations", targetRecordId: affiliationId,
      details: { institutionId: institution.id, domain, method: verificationMethod },
    });
    return {
      participantScope: await participantScopeForUser(user.id),
      status: "VERIFIED" as const,
      method: verificationMethod,
    };
  },

  async verifyFromInstitutionalEmail(userId: string) {
    const user = await resolveUser(userId);
    const prisma = getPrisma();
    const profile = await prisma.academicProfile.findUnique({ where: { userId: user.id } });
    if (!profile?.institutionalEmail || !profile.institutionalEmailVerifiedAt) {
      throw AppError.badRequest("Institutional email is not verified");
    }
    const trusted = await trustedInstitutionForEmail(profile.institutionalEmail);
    if (!trusted) {
      throw AppError.badRequest("Institution is not trusted for affiliation verification");
    }
    return this.verifyFromEmail(user.id, trusted.email, { requireCurrentProfileEmail: true });
  },
};
