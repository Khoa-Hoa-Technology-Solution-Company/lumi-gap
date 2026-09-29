import type { AdmissionBasis, ParticipantScope, VerificationStatus } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { deriveParticipantScope } from "./identity-foundation.rules.js";

export async function participantScopeForUser(userId: string): Promise<ParticipantScope> {
  const prisma = getPrisma();
  const [user, affiliations] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { admissionBasis: true } }),
    prisma.affiliation.findMany({
      where: { userId },
      select: { institutionId: true, isCurrent: true, verificationStatus: true },
    }),
  ]);
  if (!user) return "PENDING";
  const institutions = affiliations.length
    ? await prisma.institution.findMany({
        where: { id: { in: [...new Set(affiliations.map((item) => item.institutionId))] } },
        select: { id: true, hostInstitution: true },
      })
    : [];
  const hostById = new Map(institutions.map((item) => [item.id, item.hostInstitution]));
  return deriveParticipantScope(user.admissionBasis as AdmissionBasis, affiliations.map((item) => ({
    hostInstitution: hostById.get(item.institutionId) === true,
    isCurrent: item.isCurrent,
    verificationStatus: item.verificationStatus as VerificationStatus,
  })));
}

