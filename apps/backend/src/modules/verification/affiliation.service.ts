import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";

const FPT_DOMAINS = new Set(["fpt.edu.vn", "fe.edu.vn"]);

async function resolveUser(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.unauthorized();
  const user = await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
  });
  if (!user) throw AppError.unauthorized();
  return user;
}

export const affiliationService = {
  async declare(userId: string, institutionName: string, details: { department?: string; rorId?: string } = {}) {
    const user = await resolveUser(userId);
    const prisma = getPrisma();
    const current = await prisma.affiliation.findFirst({ where: { userId: user.id, isPrimary: true } });
    const sameDeclaration = current
      && current.institutionName.trim().toLocaleLowerCase() === institutionName.trim().toLocaleLowerCase()
      && (current.department ?? "") === (details.department ?? "")
      && (current.rorId ?? "") === (details.rorId ?? "");
    // Saving an unrelated profile section must not erase valid evidence.
    if (sameDeclaration) return;
    await prisma.$transaction(async (tx) => {
      if (current) await tx.affiliation.update({ where: { id: current.id }, data: { isPrimary: false, validUntil: new Date() } });
      await tx.affiliation.create({ data: {
        userId: user.id, institutionName, department: details.department, rorId: details.rorId,
        affiliationType: "EXTERNAL", verificationStatus: "NOT_SUBMITTED",
        verificationSource: "SELF_DECLARED", isPrimary: true, validFrom: new Date(),
      } });
      await tx.user.update({ where: { id: user.id }, data: { institution: institutionName } });
      await tx.academicProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, affiliationStatus: "NOT_SUBMITTED" },
        update: { affiliationStatus: "NOT_SUBMITTED" },
      });
    });
    await auditService.log("affiliation.declared", {
      userId: user.id,
      targetTableName: "affiliations",
      details: { institutionName, source: "SELF_DECLARED" },
    });
  },

  async verifyFromInstitutionalEmail(userId: string) {
    const user = await resolveUser(userId);
    const prisma = getPrisma();
    const profile = await prisma.academicProfile.findUnique({ where: { userId: user.id } });
    if (!profile?.institutionalEmail || !profile.institutionalEmailVerifiedAt) {
      throw AppError.badRequest("Institutional email is not verified");
    }
    const domain = profile.institutionalEmail.split("@").at(-1)?.toLowerCase();
    if (!domain) throw AppError.badRequest("Institutional email is invalid");
    const trustedDomain = await prisma.trustedInstitutionDomain.findUnique({ where: { domain } });
    const institution = trustedDomain
      ? await prisma.trustedInstitution.findUnique({ where: { id: trustedDomain.institutionId } })
      : null;
    if (!institution?.isActive) throw AppError.badRequest("Institution is not trusted for affiliation verification");
    const affiliationType = FPT_DOMAINS.has(domain) ? "INTERNAL" : "EXTERNAL";
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const current = await tx.affiliation.findFirst({ where: { userId: user.id, isPrimary: true } });
      const sameInstitution = current?.institutionName.trim().toLocaleLowerCase() === institution.name.trim().toLocaleLowerCase();
      if (current && !sameInstitution) await tx.affiliation.update({ where: { id: current.id }, data: { isPrimary: false, validUntil: now } });
      if (current && sameInstitution) {
        await tx.affiliation.update({ where: { id: current.id }, data: {
          institutionDomain: domain, rorId: institution.rorId, department: profile.affiliationDepartment,
          academicTitle: profile.academicTitle, affiliationType, verificationStatus: "VERIFIED", verificationSource: "EMAIL",
        } });
      } else {
        await tx.affiliation.create({ data: {
          userId: user.id, institutionName: institution.name, institutionDomain: domain, rorId: institution.rorId,
          department: profile.affiliationDepartment, academicTitle: profile.academicTitle,
          positionTitle: profile.positionTitle, positionCategory: profile.positionCategory, positionSource: profile.positionSource,
          positionStatus: profile.positionStatus, affiliationType, verificationStatus: "VERIFIED",
          verificationSource: "EMAIL", isPrimary: true, validFrom: now,
        } });
      }
      await tx.user.update({ where: { id: user.id }, data: { institution: institution.name } });
      await tx.academicProfile.update({ where: { id: profile.id }, data: { affiliationStatus: "VERIFIED" } });
      await tx.verificationEvidence.create({
        data: {
          userId: user.id,
          academicProfileId: profile.id,
          verificationType: "AFFILIATION",
          sourceType: "EMAIL",
          sourceReference: domain,
          status: "VERIFIED",
          reviewedAt: now,
          metadata: { institutionId: institution.id, affiliationType },
        },
      });
    });
    await auditService.log("affiliation.verified", {
      userId: user.id,
      targetTableName: "affiliations",
      details: { institutionId: institution.id, domain, affiliationType, source: "EMAIL" },
    });
    return { affiliationType, status: "VERIFIED" as const, source: "EMAIL" as const };
  },
};
