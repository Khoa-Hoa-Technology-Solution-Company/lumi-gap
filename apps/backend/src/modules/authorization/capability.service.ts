import type { UserCapability as Capability } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { policyCapabilities } from "../identity/identity-foundation.rules.js";
import { participantScopeForUser } from "../identity/participant-scope.service.js";

const POLICY_SOURCE = "SYSTEM_POLICY_V1";
const ALL_CAPABILITIES: Capability[] = [
  "BASIC_RESEARCH",
  "RESEARCH_SUPPORT",
  "STRUCTURED_REVIEW",
  "GAP_VALIDATION",
  "CREATE_RESEARCH_PROJECT",
  "APPROVE_ACADEMIC_CONTRIBUTION",
  "MENTOR_PROJECT",
  "REVIEW_ARTIFACT",
  "MANAGE_SYSTEM",
];

async function userUuid(value: string): Promise<string> {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.unauthorized();
  const user = await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true },
  });
  if (!user) throw AppError.unauthorized();
  return user.id;
}

export const capabilityService = {
  async list(userId: string): Promise<Capability[]> {
    const id = await userUuid(userId);
    const now = new Date();
    const [rows, scope, user, profile] = await Promise.all([getPrisma().userCapability.findMany({
      where: { userId: id, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { capability: true },
    }), participantScopeForUser(id), getPrisma().user.findUnique({ where: { id }, select: { systemRole: true, accountStatus: true, isActive: true, emailVerifiedAt: true } }),
    getPrisma().academicProfile.findUnique({ where: { userId: id }, select: { academicRole: true, roleVerificationStatus: true, positionStatus: true } })]);
    if (user?.accountStatus !== "ACTIVE" || !user.isActive || (user.systemRole !== "ADMIN" && !user.emailVerifiedAt)) return [];
    const lecturer = profile?.academicRole === "LECTURER" && profile.roleVerificationStatus === "VERIFIED" && profile.positionStatus === "VERIFIED";
    const core: Capability[] = user.systemRole === "ADMIN" ? ["MANAGE_SYSTEM"] : ["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"];
    return [...new Set([...core, ...rows.map((row) => row.capability).filter((value): value is Capability =>
      ALL_CAPABILITIES.includes(value as Capability)
      && (!["REVIEW_ARTIFACT", "STRUCTURED_REVIEW", "MENTOR_PROJECT", "APPROVE_ACADEMIC_CONTRIBUTION"].includes(value) || lecturer)
      && (value !== "MANAGE_SYSTEM" || user.systemRole === "ADMIN")
      && (value !== "APPROVE_ACADEMIC_CONTRIBUTION" || scope === "INTERNAL"))])];
  },

  async evaluate(userId: string): Promise<Capability[]> {
    const id = await userUuid(userId);
    const prisma = getPrisma();
    const [user, profile, current, participantScope] = await Promise.all([
      prisma.user.findUnique({ where: { id }, select: { accountStatus: true, systemRole: true, isActive: true, emailVerifiedAt: true } }),
      prisma.academicProfile.findUnique({ where: { userId: id }, select: { academicRole: true, roleVerificationStatus: true, positionStatus: true } }),
      prisma.userCapability.findMany({ where: { userId: id } }),
      participantScopeForUser(id),
    ]);
    if (!user) throw AppError.unauthorized();
    const currentHostPosition = participantScope === "INTERNAL"
      ? await prisma.affiliation.findFirst({
        where: {
          userId: id,
          isCurrent: true,
          verificationStatus: "VERIFIED",
          positionStatus: "VERIFIED",
          institutionId: {
            in: (await prisma.institution.findMany({
              where: { hostInstitution: true, status: "ACTIVE", isActive: true },
              select: { id: true },
            })).map((institution) => institution.id),
          },
        },
        select: { id: true },
      })
      : null;

    const desired = new Set<Capability>(policyCapabilities({
      systemRole: user.systemRole === "ADMIN" ? "ADMIN" : "USER",
      accountActive: user.accountStatus === "ACTIVE" && user.isActive,
      emailVerified: Boolean(user.emailVerifiedAt),
      positionVerified: profile?.positionStatus === "VERIFIED",
      academicRole: profile?.academicRole as "STUDENT" | "RESEARCHER" | "LECTURER" | undefined,
      academicRoleVerificationStatus: profile?.roleVerificationStatus as never,
      participantScope,
      currentHostPositionVerified: Boolean(currentHostPosition),
    }));

    const policyRows = current.filter((row) => row.source === POLICY_SOURCE);
    const grants = [...desired].filter((capability) =>
      !policyRows.some((row) => row.capability === capability && row.status === "ACTIVE"));
    const revokes = policyRows.filter((row) => row.status === "ACTIVE" && !desired.has(row.capability as Capability));

    await prisma.$transaction(async (tx) => {
      for (const capability of desired) {
        await tx.userCapability.upsert({
          where: { userId_capability: { userId: id, capability } },
          create: { userId: id, capability, status: "ACTIVE", source: POLICY_SOURCE },
          update: { status: "ACTIVE", source: POLICY_SOURCE, expiresAt: null },
        });
      }
      if (revokes.length) {
        await tx.userCapability.updateMany({
          where: { id: { in: revokes.map((row) => row.id) } },
          data: { status: "REVOKED" },
        });
      }
    });

    for (const capability of grants) {
      await auditService.log("capability.granted", {
        userId: id,
        targetTableName: "user_capabilities",
        details: { capability, source: POLICY_SOURCE },
      });
    }
    for (const row of revokes) {
      await auditService.log("capability.revoked", {
        userId: id,
        targetTableName: "user_capabilities",
        targetRecordId: row.id,
        details: { capability: row.capability, source: POLICY_SOURCE },
      });
    }
    return this.list(id);
  },
};
