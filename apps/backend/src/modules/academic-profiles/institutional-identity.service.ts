import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { trustedInstitutionForEmail } from "../identity/institution-domain.service.js";
import { normalizeEmail } from "../identity/identity-foundation.rules.js";

export async function verifiedInstitutionalIdentity(userId: string, institutionId: string, db: Prisma.TransactionClient = getPrisma()) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.isActive || user.accountStatus !== "ACTIVE") return null;
  const emails = await db.userEmail.findMany({ where: { userId, verifiedAt: { not: null } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
  const accountEmail = normalizeEmail(user.email);
  // Reuse account ownership directly, even for an old account with no UserEmail mirror.
  const candidates = [
    ...(user.emailVerifiedAt ? [{ email: accountEmail, verifiedAt: user.emailVerifiedAt, emailIdentityId: emails.find(item => item.normalizedEmail === accountEmail)?.id, source: "ACCOUNT" as const }] : []),
    ...emails.filter(item => item.normalizedEmail !== accountEmail).map(item => ({ email: item.normalizedEmail, verifiedAt: item.verifiedAt!, emailIdentityId: item.id, source: "LINKED" as const })),
  ];
  for (const candidate of candidates) {
    const trusted = await trustedInstitutionForEmail(candidate.email, db);
    if (trusted?.institution.id === institutionId) return { ...candidate, institutionId, domain: trusted.domain };
  }
  return null;
}
