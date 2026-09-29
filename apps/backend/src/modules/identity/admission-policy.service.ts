import type { AdmissionBasis } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { hashOpaqueToken } from "../auth/token.service.js";
import { normalizeEmail } from "./identity-foundation.rules.js";

export interface AdmissionDecision {
  basis: AdmissionBasis;
  sourceId?: string;
}

async function hostInstitutionDomain(email: string): Promise<boolean> {
  const domain = normalizeEmail(email).split("@")[1];
  if (!domain) return false;
  const prisma = getPrisma();
  const configured = await prisma.institutionDomain.findUnique({ where: { domain } });
  if (!configured?.trusted || configured.status !== "ACTIVE") return false;
  const institution = await prisma.institution.findUnique({ where: { id: configured.institutionId } });
  return Boolean(institution?.hostInstitution && institution.status === "ACTIVE" && institution.isActive);
}

export const admissionPolicyService = {
  async evaluateRegistration(emailInput: string, invitationToken?: string): Promise<AdmissionDecision> {
    const email = normalizeEmail(emailInput);
    if (await hostInstitutionDomain(email)) return { basis: "HOST_INSTITUTION" };
    if (!invitationToken) {
      throw AppError.forbidden("External registration requires a valid invitation");
    }
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(invitationToken)) {
      throw AppError.forbidden("External registration requires a valid invitation");
    }
    const invitation = await getPrisma().projectInvitation.findFirst({
      where: {
        tokenHash: hashOpaqueToken(invitationToken),
        purpose: "PROJECT_MEMBERSHIP",
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true, email: true },
    });
    if (invitation) return { basis: "INVITATION", sourceId: invitation.id };
    const reviewInvitation = await getPrisma().externalReviewInvitation.findFirst({
      where: {
        tokenHash: hashOpaqueToken(invitationToken),
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (reviewInvitation) return { basis: "INVITATION", sourceId: reviewInvitation.id };
    throw AppError.forbidden("Invitation is invalid, expired, or belongs to another email address");
  },
};

