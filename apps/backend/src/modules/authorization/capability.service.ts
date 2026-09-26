import type { UserCapability as Capability } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";

const POLICY_SOURCE = "SYSTEM_POLICY_V1";
const ALL_CAPABILITIES: Capability[] = [
  "BASIC_RESEARCH",
  "RESEARCH_SUPPORT",
  "STRUCTURED_REVIEW",
  "GAP_VALIDATION",
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
    const rows = await getPrisma().userCapability.findMany({
      where: { userId: id, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { capability: true },
    });
    return rows.map((row) => row.capability).filter((value): value is Capability =>
      ALL_CAPABILITIES.includes(value as Capability));
  },

  async evaluate(userId: string): Promise<Capability[]> {
    const id = await userUuid(userId);
    const prisma = getPrisma();
    const [user, current] = await Promise.all([
      prisma.user.findUnique({ where: { id }, select: { accountStatus: true, systemRole: true } }),
      prisma.userCapability.findMany({ where: { userId: id } }),
    ]);
    if (!user) throw AppError.unauthorized();

    const desired = new Set<Capability>();
    if (user.accountStatus === "ACTIVE" && user.systemRole === "RESEARCH_USER") {
      desired.add("BASIC_RESEARCH");
      // Academic profile declarations and verification do not grant support, reviewer, or gap-validation capabilities.
      // Those capabilities must be provisioned explicitly, independently of Academic Position.
    }

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
