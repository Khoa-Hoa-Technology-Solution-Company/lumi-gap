import type { AdmissionBasis } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { hashOpaqueToken } from "../auth/token.service.js";
import { normalizeEmail } from "./identity-foundation.rules.js";
import { trustedInstitutionForEmail } from "./institution-domain.service.js";

export interface AdmissionDecision {
  basis: AdmissionBasis;
  sourceId?: string;
}

async function hostInstitutionDomain(email: string): Promise<boolean> {
  return Boolean((await trustedInstitutionForEmail(email))?.institution.hostInstitution);
}

export const admissionPolicyService = {
  async evaluateRegistration(emailInput: string, invitationToken?: string): Promise<AdmissionDecision> {
    const email = normalizeEmail(emailInput);
    if (await hostInstitutionDomain(email)) return { basis: "HOST_INSTITUTION" };
    if (!invitationToken) {
      return { basis: "PERSONAL_EMAIL" };
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

