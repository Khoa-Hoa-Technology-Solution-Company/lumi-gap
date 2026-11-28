import type {
  AccountStatus,
  AdminAcademicRole,
  AdminAiOperationItem,
  AdminAiOperationsResponse,
  AdminApiProviderSettingItem,
  AdminAuditLogItem,
  AdminAuditLogsResponse,
  AdminInstitutionSettingItem,
  AdminPlatformSettings,
  AdminRuntimePolicySetting,
  AdminStats,
  AdminUserDetail,
  AdminUserItem,
  AdminUserSummary,
  AdminWorkersFleetResponse,
  ListUsersResponse,
  PrimaryPosition,
  SystemRole,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { getReadiness } from "../../infrastructure/readiness.js";
import { auditService } from "../audit/audit.service.js";
import { passwordService } from "../auth/password.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { pipelineService } from "../pipeline/pipeline.service.js";
import { deriveSystemHealth, redactAuditDetails, sanitizeOperationalError } from "./admin-redaction.js";
import { assertCanCreateUser, assertCanManageUser, legacyRole } from "./admin-user.policy.js";
import type {
  CreateUserInput,
  ListAiOperationsQueryInput,
  ListAuditLogsQueryInput,
  ListUsersQueryInput,
  UpdateAdminApiProviderInput,
  UpdateAdminInstitutionInput,
  UpdateUserInput,
} from "./dto/admin.schema.js";

type PrismaClientLike = ReturnType<typeof getPrisma>;

type AcademicProfileRowSummary = {
  userId: string;
  academicRole: string | null;
  primaryPosition: string | null;
  positionTitle: string | null;
  verificationStatus: string;
  positionStatus: string;
  affiliationStatus: string;
};

async function loadTarget(value: string, prisma: PrismaClientLike = getPrisma()) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.notFound("User not found");
  const user = await prisma.user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
  });
  if (!user) throw AppError.notFound("User not found");
  return user;
}

function toAcademicRole(value?: string | null): AdminAcademicRole | undefined {
  if (value === "STUDENT" || value === "LECTURER" || value === "RESEARCHER") return value;
  return undefined;
}

function mapUserItem(
  user: Awaited<ReturnType<typeof loadTarget>>,
  profile?: AcademicProfileRowSummary | null,
): AdminUserItem {
  return {
    id: publicDatabaseId(user),
    email: user.email,
    fullName: user.fullName,
    role: user.systemRole as SystemRole,
    academicProfileType: user.academicProfileType as AdminUserItem["academicProfileType"] ?? undefined,
    academicRole: toAcademicRole(profile?.academicRole),
    primaryPosition: profile?.primaryPosition as PrimaryPosition | null ?? undefined,
    positionTitle: profile?.positionTitle ?? undefined,
    verificationStatus: profile?.verificationStatus ?? undefined,
    positionStatus: profile?.positionStatus ?? undefined,
    affiliationStatus: profile?.affiliationStatus ?? undefined,
    accountStatus: user.accountStatus as AccountStatus,
    isActive: user.accountStatus === "ACTIVE",
    institution: user.institution ?? undefined,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString(),
    statusReason: user.accountStatusReason ?? undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function singleUserItem(user: Awaited<ReturnType<typeof loadTarget>>): Promise<AdminUserItem> {
  const profile = await getPrisma().academicProfile.findUnique({
    where: { userId: user.id },
    select: {
      userId: true,
      academicRole: true,
      primaryPosition: true,
      positionTitle: true,
      verificationStatus: true,
      positionStatus: true,
      affiliationStatus: true,
    },
  });
  return mapUserItem(user, profile);
}

function maskIp(ip?: string | null): string | undefined {
  if (!ip) return undefined;
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:…`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : undefined;
}

async function withUserManagementLock<T>(work: (tx: ReturnType<typeof getPrisma>) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73194025)`;
    return work(tx as ReturnType<typeof getPrisma>);
  });
}

async function safeSection<T>(
  section: string,
  unavailable: string[],
  work: () => Promise<T>,
): Promise<T | null> {
  try {
    return await work();
  } catch (err) {
    unavailable.push(section);
    logger.warn({ err, section }, "admin stats sub-query failed");
    return null;
  }
}

export const adminService = {
  async listUsers(query: ListUsersQueryInput): Promise<ListUsersResponse> {
    const prisma = getPrisma();

    let profileFilteredUserIds: string[] | undefined;
    if (query.academicRole || query.verificationStatus) {
      const profileMatches = await prisma.academicProfile.findMany({
        where: {
          ...(query.academicRole ? { academicRole: query.academicRole } : {}),
          ...(query.verificationStatus ? { verificationStatus: query.verificationStatus } : {}),
        },
        select: { userId: true },
      });
      profileFilteredUserIds = profileMatches.map((row) => row.userId);
      if (profileFilteredUserIds.length === 0) {
        return {
          data: [],
          meta: { total: 0, page: query.page, pageSize: query.pageSize, totalPages: 1 },
        };
      }
    }

    const where = {
      ...(profileFilteredUserIds ? { id: { in: profileFilteredUserIds } } : {}),
      ...(query.role ? { systemRole: query.role } : {}),
      ...(query.accountStatus ? { accountStatus: query.accountStatus } : {}),
      ...(query.emailVerified !== undefined ? { emailVerifiedAt: query.emailVerified ? { not: null } : null } : {}),
      ...(query.isActive !== undefined ? { accountStatus: query.isActive ? "ACTIVE" : { not: "ACTIVE" } } : {}),
      ...(query.institution ? { institution: { contains: query.institution, mode: "insensitive" as const } } : {}),
      ...(query.search ? {
        OR: [
          { email: { contains: query.search, mode: "insensitive" as const } },
          { fullName: { contains: query.search, mode: "insensitive" as const } },
          { institution: { contains: query.search, mode: "insensitive" as const } },
        ],
      } : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const userIds = users.map((u) => u.id);
    const profiles = userIds.length
      ? await prisma.academicProfile.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          academicRole: true,
          primaryPosition: true,
          positionTitle: true,
          verificationStatus: true,
          positionStatus: true,
          affiliationStatus: true,
        },
      })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    return {
      data: users.map((u) => mapUserItem(u, profileMap.get(u.id))),
      meta: { total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  },

  async getUser(targetInput: string): Promise<AdminUserDetail> {
    const target = await loadTarget(targetInput);
    const prisma = getPrisma();
    const [
      profile,
      capabilities,
      sessions,
      activity,
      statusActor,
      ownedProjects,
      memberProjects,
      activeMentorships,
      reviewAssignments,
      aiRuns,
      failedAiRuns,
    ] = await Promise.all([
      prisma.academicProfile.findUnique({
        where: { userId: target.id },
        select: {
          userId: true,
          academicRole: true,
          primaryPosition: true,
          positionTitle: true,
          affiliationDepartment: true,
          verificationStatus: true,
          publicHandle: true,
          profileVisibility: true,
          headline: true,
          biography: true,
          institutionalEmail: true,
          institutionalEmailVerifiedAt: true,
          identityStatus: true,
          emailStatus: true,
          affiliationStatus: true,
          positionStatus: true,
          orcidStatus: true,
        },
      }),
      prisma.userCapability.findMany({
        where: { userId: target.id, status: "ACTIVE" }, select: { capability: true }, orderBy: { capability: "asc" },
      }),
      prisma.refreshToken.findMany({
        where: { userId: target.id, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, userAgent: true, ipAddress: true, lastUsedAt: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 10,
      }),
      prisma.auditLog.findMany({
        where: { targetRecordId: target.id }, orderBy: { createdAt: "desc" }, take: 15,
      }),
      target.accountStatusChangedById
        ? prisma.user.findUnique({
          where: { id: target.accountStatusChangedById },
          select: { id: true, fullName: true, email: true },
        })
        : Promise.resolve(null),
      prisma.project.count({ where: { ownerId: target.id, deletedAt: null } }),
      prisma.projectMember.count({ where: { userId: target.id, status: "ACTIVE" } }),
      prisma.mentorRelationship.count({ where: { mentorUserId: target.id, status: "ACTIVE" } }),
      prisma.reviewerAssignment.count({ where: { reviewerId: target.id } }),
      prisma.aiRun.count({ where: { ownerId: target.id } }),
      prisma.aiRun.count({ where: { ownerId: target.id, status: "failed" } }),
    ]);

    const actorIds = [...new Set(activity.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true, email: true } })
      : [];
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

    return {
      ...mapUserItem(target, profile),
      academicProfile: profile ? {
        academicRole: toAcademicRole(profile.academicRole),
        primaryPosition: profile.primaryPosition as PrimaryPosition | null ?? undefined,
        positionTitle: profile.positionTitle ?? undefined,
        department: profile.affiliationDepartment ?? undefined,
        verificationStatus: profile.verificationStatus,
        publicHandle: profile.publicHandle ?? undefined,
        profileVisibility: profile.profileVisibility,
        headline: profile.headline ?? undefined,
        biography: profile.biography ?? undefined,
        institutionalEmail: profile.institutionalEmail ?? undefined,
        institutionalEmailVerifiedAt: profile.institutionalEmailVerifiedAt?.toISOString(),
        identityStatus: profile.identityStatus,
        emailStatus: profile.emailStatus,
        affiliationStatus: profile.affiliationStatus,
        positionStatus: profile.positionStatus,
        orcidStatus: profile.orcidStatus,
      } : undefined,
      authenticationMethods: [
        ...(target.passwordHash ? ["PASSWORD" as const] : []),
        ...(target.googleId ? ["GOOGLE" as const] : []),
      ],
      onboardingCompletedAt: target.onboardingCompletedAt?.toISOString(),
      statusChangedAt: target.accountStatusChangedAt?.toISOString(),
      statusChangedBy: statusActor ? {
        id: publicDatabaseId(statusActor),
        fullName: statusActor.fullName,
        email: statusActor.email,
      } : undefined,
      points: target.points,
      credits: target.credits,
      penaltyPoints: target.penaltyPoints,
      capabilities: capabilities.map((row) => row.capability),
      activeSessions: sessions.map((session) => ({
        id: session.id,
        userAgent: session.userAgent ?? undefined,
        ipAddress: maskIp(session.ipAddress),
        lastUsedAt: session.lastUsedAt?.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
      })),
      researchActivity: {
        ownedProjects,
        memberProjects,
        activeMentorships,
        reviewAssignments,
        aiRuns,
        failedAiRuns,
      },
      recentActivity: activity.map((row) => ({
        id: publicDatabaseId(row),
        actionName: row.actionName,
        targetTableName: row.targetTableName,
        targetRecordId: row.targetRecordId,
        details: redactAuditDetails(row.details),
        createdAt: row.createdAt.toISOString(),
        user: row.userId ? actorMap.get(row.userId) ?? null : null,
      })),
    };
  },

  async summary(): Promise<AdminUserSummary> {
    const prisma = getPrisma();
    const [total, active, suspended, disabled, unverifiedEmail, roles, academicRoles] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { accountStatus: "ACTIVE" } }),
      prisma.user.count({ where: { accountStatus: "SUSPENDED" } }),
      prisma.user.count({ where: { accountStatus: "DISABLED" } }),
      prisma.user.count({ where: { emailVerifiedAt: null } }),
      prisma.user.groupBy({ by: ["systemRole"], _count: { _all: true } }),
      prisma.academicProfile.groupBy({ by: ["academicRole"], _count: { _all: true } }),
    ]);
    const byRole: Record<SystemRole, number> = { USER: 0, ADMIN: 0 };
    for (const row of roles) if (row.systemRole in byRole) byRole[row.systemRole as SystemRole] = row._count._all;

    const byAcademicRole: AdminUserSummary["byAcademicRole"] = {
      STUDENT: 0,
      LECTURER: 0,
      RESEARCHER: 0,
      UNSPECIFIED: 0,
    };
    let profiledKnown = 0;
    for (const row of academicRoles) {
      const r = toAcademicRole(row.academicRole);
      if (r) {
        byAcademicRole[r] = row._count._all;
        profiledKnown += row._count._all;
      }
    }
    byAcademicRole.UNSPECIFIED = Math.max(0, total - profiledKnown);

    return { total, active, suspended, disabled, unverifiedEmail, byRole, byAcademicRole };
  },

  async createUser(actorInput: string, input: CreateUserInput): Promise<AdminUserItem> {
    const actor = await loadTarget(actorInput);
    assertCanCreateUser(actor, input.role);
    const email = input.email.trim().toLowerCase();
    const passwordHash = await passwordService.hash(input.password);
    try {
      const created = await getPrisma().$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            fullName: input.fullName.trim(),
            passwordHash,
            role: legacyRole(input.role),
            systemRole: input.role,
            accountStatus: input.accountStatus,
            isActive: input.accountStatus === "ACTIVE",
            institution: input.institution?.trim() || null,
            credits: env.INITIAL_USER_CREDITS,
            admissionBasis: "ADMIN",
          },
        });
        await tx.userEmail.create({ data: { userId: user.id, normalizedEmail: email, isPrimary: true, purpose: "ACCOUNT" } });
        if (input.role === "USER") {
          await tx.academicProfile.create({ data: { userId: user.id } });
          await tx.userCapability.create({
            data: { userId: user.id, capability: "BASIC_RESEARCH", status: "ACTIVE", source: "ADMIN_CREATED" },
          });
        }
        return user;
      });
      await auditService.log("admin.user.created", {
        userId: actor.id, targetTableName: "users", targetRecordId: created.id,
        details: { role: input.role, accountStatus: input.accountStatus },
      });
      await capabilityService.evaluate(created.id);
      return singleUserItem(created);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("Email already registered");
      throw error;
    }
  },

  async updateUser(actorInput: string, targetInput: string, input: UpdateUserInput): Promise<AdminUserItem> {
    const [actor, target] = await Promise.all([loadTarget(actorInput), loadTarget(targetInput)]);
    assertCanManageUser(actor, target, "UPDATE_PROFILE");
    const emailChanged = input.email !== undefined && input.email.trim().toLowerCase() !== target.email;
    try {
      const updated = await getPrisma().$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: target.id },
          data: {
            ...(input.email !== undefined ? { email: input.email.trim().toLowerCase(), emailVerifiedAt: emailChanged ? null : undefined } : {}),
            ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
            ...(input.institution !== undefined ? { institution: input.institution?.trim() || null } : {}),
          },
        });
        if (emailChanged) {
          await tx.refreshToken.updateMany({
            where: { userId: target.id, revokedAt: null },
            data: { revokedAt: new Date(), revocationReason: "EMAIL_CHANGED_BY_ADMIN" },
          });
        }
        return user;
      });
      await auditService.log("admin.user.updated", {
        userId: actor.id, targetTableName: "users", targetRecordId: target.id,
        details: { fields: Object.keys(input), emailChanged },
      });
      return singleUserItem(updated);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("Email already registered");
      throw error;
    }
  },

  async updateRole(actorInput: string, targetInput: string, systemRole: SystemRole, reason: string): Promise<AdminUserItem> {
    const now = new Date();
    let actorId = "";
    let previousRole = "";
    const updated = await withUserManagementLock(async (tx) => {
      const [actor, target] = await Promise.all([loadTarget(actorInput, tx), loadTarget(targetInput, tx)]);
      assertCanManageUser(actor, target, "UPDATE_ROLE");
      actorId = actor.id;
      previousRole = target.systemRole;
      if (target.systemRole === "ADMIN" && systemRole !== "ADMIN" && target.accountStatus === "ACTIVE") {
        const activeOwners = await tx.user.count({ where: { systemRole: "ADMIN", accountStatus: "ACTIVE" } });
        if (activeOwners <= 1) throw AppError.badRequest("Cannot demote the last active admin");
      }
      if (target.systemRole === systemRole) throw AppError.badRequest("System role is unchanged");
      const user = await tx.user.update({
        where: { id: target.id },
        data: { systemRole, role: legacyRole(systemRole) },
      });
      await tx.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: now, revocationReason: "SYSTEM_ROLE_CHANGED" },
      });
      return user;
    });
    await capabilityService.evaluate(updated.id);
    await auditService.log("admin.system_role.updated", {
      userId: actorId,
      targetTableName: "users",
      targetRecordId: updated.id,
      details: { previous: previousRole, next: systemRole, reason },
    });
    await auditService.log(systemRole === "ADMIN" ? "ADMIN_ROLE_GRANTED" : "ADMIN_ROLE_REVOKED", {
      userId: actorId, targetTableName: "users", targetRecordId: updated.id, details: { previous: previousRole, next: systemRole, reason },
    });
    return singleUserItem(updated);
  },

  async updateStatus(actorInput: string, targetInput: string, accountStatus: AccountStatus, reason: string): Promise<AdminUserItem> {
    let actorId = "";
    let previousStatus = "";
    const updated = await withUserManagementLock(async (tx) => {
      const [actor, target] = await Promise.all([loadTarget(actorInput, tx), loadTarget(targetInput, tx)]);
      assertCanManageUser(actor, target, "UPDATE_STATUS");
      actorId = actor.id;
      previousStatus = target.accountStatus;
      if (target.systemRole === "ADMIN" && target.accountStatus === "ACTIVE" && accountStatus !== "ACTIVE") {
        const activeOwners = await tx.user.count({ where: { systemRole: "ADMIN", accountStatus: "ACTIVE" } });
        if (activeOwners <= 1) throw AppError.badRequest("Cannot disable the last active admin");
      }
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          accountStatus,
          isActive: accountStatus === "ACTIVE",
          accountStatusReason: reason,
          accountStatusChangedAt: new Date(),
          accountStatusChangedById: actor.id,
        },
      });
      if (accountStatus !== "ACTIVE") {
        await tx.refreshToken.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date(), revocationReason: accountStatus },
        });
      }
      return user;
    });
    await capabilityService.evaluate(updated.id);
    await auditService.log("admin.account_status.updated", {
      userId: actorId,
      targetTableName: "users",
      targetRecordId: updated.id,
      details: { previous: previousStatus, next: accountStatus, reason },
    });
    return singleUserItem(updated);
  },

  async revokeSessions(actorInput: string, targetInput: string, reason: string): Promise<{ revoked: number }> {
    const [actor, target] = await Promise.all([loadTarget(actorInput), loadTarget(targetInput)]);
    assertCanManageUser(actor, target, "REVOKE_SESSIONS");
    const result = await getPrisma().refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: "ADMIN_REVOKED" },
    });
    await auditService.log("admin.sessions.revoked", {
      userId: actor.id, targetTableName: "users", targetRecordId: target.id,
      details: { revoked: result.count, reason },
    });
    return { revoked: result.count };
  },

  async stats(): Promise<AdminStats> {
    const prisma = getPrisma();
    const checkedAt = new Date();
    const unavailableSections: string[] = [];

    const [
      userSummary,
      papers,
      reports,
      gaps,
      projectGroups,
      mentorshipCounts,
      pendingVerifications,
      pendingPaperRequests,
      openModerationReports,
      pendingAppeals,
      aiRunGroups,
      reportGroups,
      gapAnalysisGroups,
      validatedResearchGaps,
      communities,
      syncTotals,
      failedSyncRuns,
      latestSync,
      recentAuditRows,
      readiness,
      pipeline,
      activeAiConn,
      activeEmbConn,
    ] = await Promise.all([
      this.summary(),
      prisma.paper.count(),
      prisma.report.count(),
      prisma.researchGap.count(),
      safeSection("projects", unavailableSections, () =>
        prisma.project.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
      ),
      safeSection("mentorships", unavailableSections, async () => {
        const [activeRelationships, pendingRequests] = await Promise.all([
          prisma.mentorRelationship.count({ where: { status: "ACTIVE" } }),
          prisma.mentorshipRequest.count({ where: { status: "PENDING" } }),
        ]);
        return { activeRelationships, pendingRequests };
      }),
      safeSection("pendingVerifications", unavailableSections, () =>
        prisma.verificationEvidence.count({ where: { verificationType: { in: ["POSITION", "AFFILIATION"] }, status: "PENDING" } }),
      ),
      safeSection("pendingPaperRequests", unavailableSections, () =>
        prisma.paper.count({ where: { paperStatus: "pending" } }),
      ),
      safeSection("openModerationReports", unavailableSections, () =>
        prisma.contentReport.count({ where: { status: { in: ["open", "claimed", "under_review", "escalated"] } } }),
      ),
      safeSection("pendingAppeals", unavailableSections, () =>
        prisma.moderationAppeal.count({ where: { status: "SUBMITTED" } }),
      ),
      safeSection("aiRuns", unavailableSections, () =>
        prisma.aiRun.groupBy({ by: ["status"], _count: { _all: true } }),
      ),
      safeSection("reportStatuses", unavailableSections, () =>
        prisma.report.groupBy({ by: ["status"], _count: { _all: true } }),
      ),
      safeSection("gapAnalyses", unavailableSections, () =>
        prisma.gapAnalysis.groupBy({ by: ["status"], _count: { _all: true } }),
      ),
      safeSection("validatedResearchGaps", unavailableSections, () =>
        prisma.researchGap.count({ where: { validationStatus: "VALIDATED" } }),
      ),
      safeSection("communities", unavailableSections, () =>
        prisma.community.count({ where: { status: "ACTIVE" } }),
      ),
      prisma.apiSyncRun.aggregate({
        _count: { _all: true },
        _sum: { totalFetched: true, totalInserted: true, totalUpdated: true, totalDuplicates: true },
      }),
      safeSection("failedSyncRuns", unavailableSections, () =>
        prisma.apiSyncRun.count({ where: { runStatus: "failed" } }),
      ),
      prisma.apiSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
      safeSection("recentActivity", unavailableSections, () =>
        prisma.auditLog.findMany({ take: 8, orderBy: { createdAt: "desc" } }),
      ),
      safeSection("readiness", unavailableSections, () => getReadiness()),
      safeSection("pipeline", unavailableSections, () => pipelineService.getStatus()),
      safeSection("aiConnection", unavailableSections, () =>
        prisma.platformAiConnection.findFirst({
          where: { isActive: true },
          select: { name: true, fastModel: true, deepModel: true },
        }),
      ),
      safeSection("embeddingConnection", unavailableSections, () =>
        prisma.platformEmbeddingConnection.findFirst({
          where: { isActive: true },
          select: { name: true, model: true },
        }),
      ),
    ]);

    const auditRows = recentAuditRows ?? [];
    const userIds = [...new Set(auditRows.map((r) => r.userId).filter((id): id is string => Boolean(id)))];
    const usersMap = new Map<string, { id: string; fullName: string; email: string }>();
    if (userIds.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, email: true },
      });
      for (const u of users) usersMap.set(u.id, u);
    }

    const recentActivity: AdminAuditLogItem[] = auditRows.map((r) => ({
      id: publicDatabaseId(r),
      actionName: r.actionName,
      targetTableName: r.targetTableName,
      targetRecordId: r.targetRecordId,
      details: redactAuditDetails(r.details),
      createdAt: r.createdAt.toISOString(),
      user: r.userId ? usersMap.get(r.userId) ?? null : null,
    }));

    let projectsSummary: AdminStats["projects"] = null;
    if (projectGroups) {
      const counts = { total: 0, active: 0, planning: 0, onHold: 0, completed: 0, archived: 0 };
      for (const row of projectGroups) {
        counts.total += row._count._all;
        if (row.status === "ACTIVE") counts.active += row._count._all;
        else if (row.status === "PLANNING") counts.planning += row._count._all;
        else if (row.status === "ON_HOLD") counts.onHold += row._count._all;
        else if (row.status === "COMPLETED") counts.completed += row._count._all;
        else if (row.status === "ARCHIVED") counts.archived += row._count._all;
      }
      projectsSummary = counts;
    }

    let aiOperations: AdminStats["aiOperations"] = null;
    let totalAiRuns: number | null = null;
    let failedAiRunsCount: number | null = null;
    if (aiRunGroups && reportGroups && gapAnalysisGroups) {
      const sumBy = (rows: Array<{ status: string; _count: { _all: number } }>, status?: string) =>
        rows.reduce((acc, r) => acc + (!status || r.status === status ? r._count._all : 0), 0);
      totalAiRuns = sumBy(aiRunGroups);
      failedAiRunsCount = sumBy(aiRunGroups, "failed");
      aiOperations = {
        totalAiRuns,
        runningAiRuns: sumBy(aiRunGroups, "running"),
        failedAiRuns: failedAiRunsCount,
        totalReports: sumBy(reportGroups),
        readyReports: sumBy(reportGroups, "ready") + sumBy(reportGroups, "completed"),
        failedReports: sumBy(reportGroups, "failed"),
        totalGapAnalyses: sumBy(gapAnalysisGroups),
        failedGapAnalyses: sumBy(gapAnalysisGroups, "failed"),
        totalResearchGaps: gaps,
        validatedResearchGaps: validatedResearchGaps ?? 0,
      };
    }

    const systemHealth = deriveSystemHealth({
      checkedAt,
      readiness,
      pipeline,
      aiConnection: {
        activeName: activeAiConn?.name ?? null,
        fastModel: activeAiConn?.fastModel ?? null,
        deepModel: activeAiConn?.deepModel ?? null,
        envFastModel: env.GEMINI_MODEL_FAST,
        envDeepModel: env.GEMINI_MODEL_DEEP,
        hasEnvKey: Boolean(env.GEMINI_API_KEY),
      },
      embeddingConnection: {
        activeName: activeEmbConn?.name ?? null,
        model: activeEmbConn?.model ?? null,
        envModel: env.GEMINI_EMBEDDING_MODEL,
        envDimensions: env.GEMINI_EMBEDDING_DIMENSIONS,
        hasEnvKey: Boolean(env.GEMINI_API_KEY),
      },
    });

    const staleAiJobs = pipeline
      ? pipeline.stale.reportsQueuedTooLong
        + pipeline.stale.reportsGeneratingTooLong
        + pipeline.stale.gapsQueuedTooLong
        + pipeline.stale.gapsAnalyzingTooLong
      : null;

    const unhealthyWorkers = pipeline ? pipeline.workers.stale + pipeline.workers.missing : null;

    return {
      generatedAt: checkedAt.toISOString(),
      unavailableSections,
      users: {
        total: userSummary.total,
        byRole: userSummary.byRole,
        byStatus: {
          ACTIVE: userSummary.active,
          SUSPENDED: userSummary.suspended,
          DISABLED: userSummary.disabled,
        },
        byAcademicRole: userSummary.byAcademicRole,
        unverifiedEmail: userSummary.unverifiedEmail,
      },
      projects: projectsSummary,
      mentorships: mentorshipCounts,
      papers,
      reports,
      gaps,
      activeProjects: projectsSummary ? projectsSummary.active : null,
      pendingVerifications,
      aiJobs: totalAiRuns,
      communities,
      attention: {
        pendingVerifications,
        pendingPaperRequests,
        openModerationReports,
        pendingAppeals,
        failedAiRuns: failedAiRunsCount,
        staleAiJobs,
        failedSyncRuns,
        unhealthyWorkers,
      },
      corpus: pipeline
        ? {
          totalPapers: pipeline.corpus.totalPapers,
          activePapers: pipeline.corpus.activePapers,
          analyzablePapers: pipeline.corpus.analyzablePapers,
          embeddedPapers: pipeline.corpus.embeddedPapers,
          aiAnalyzedPapers: pipeline.corpus.aiAnalyzedPapers,
          embeddingCoveragePct: pipeline.corpus.embeddingCoveragePct,
          aiAnalysisCoveragePct: pipeline.corpus.aiAnalysisCoveragePct,
        }
        : null,
      aiOperations,
      systemHealth,
      recentActivity,
      sync: {
        totalRuns: syncTotals._count._all,
        failedRuns: failedSyncRuns ?? 0,
        totalFetched: syncTotals._sum.totalFetched ?? 0,
        totalInserted: syncTotals._sum.totalInserted ?? 0,
        totalUpdated: syncTotals._sum.totalUpdated ?? 0,
        totalDuplicates: syncTotals._sum.totalDuplicates ?? 0,
        latestRun: latestSync ? {
          id: publicDatabaseId(latestSync),
          status: latestSync.runStatus as "failed" | "running" | "succeeded" | "cancelled",
          searchText: latestSync.searchText ?? undefined,
          startedAt: latestSync.startedAt.toISOString(),
          finishedAt: latestSync.finishedAt?.toISOString(),
          totalFetched: latestSync.totalFetched,
          totalInserted: latestSync.totalInserted,
          totalUpdated: latestSync.totalUpdated,
          totalDuplicates: latestSync.totalDuplicates,
          errorMessage: sanitizeOperationalError(latestSync.errorMessage) ?? undefined,
        } : null,
      },
    };
  },

  async listAuditLogs(query: ListAuditLogsQueryInput): Promise<AdminAuditLogsResponse> {
    const prisma = getPrisma();
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const andClauses: Record<string, unknown>[] = [];
    if (query.actionName) {
      andClauses.push({ actionName: { contains: query.actionName, mode: "insensitive" } });
    }
    if (query.targetTableName) {
      andClauses.push({ targetTableName: query.targetTableName });
    }
    if (query.actorId) {
      const parsedActor = parseDatabaseId(query.actorId);
      if (parsedActor?.kind === "uuid") {
        andClauses.push({ userId: parsedActor.value });
      } else {
        return { data: [], meta: { total: 0, page, pageSize, totalPages: 1 } };
      }
    }
    if (query.from || query.to) {
      andClauses.push({
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      });
    }
    if (query.search) {
      const matchedActors = await prisma.user.findMany({
        where: {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 200,
      });
      const actorIds = matchedActors.map((u) => u.id);
      const searchOr: Record<string, unknown>[] = [
        { actionName: { contains: query.search, mode: "insensitive" } },
        { targetTableName: { contains: query.search, mode: "insensitive" } },
        { targetRecordId: { contains: query.search, mode: "insensitive" } },
      ];
      if (actorIds.length > 0) searchOr.push({ userId: { in: actorIds } });
      andClauses.push({ OR: searchOr });
    }

    const where = andClauses.length ? { AND: andClauses } : {};

    const [total, rows, tableGroups] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.auditLog.findMany({
        distinct: ["targetTableName"],
        where: { targetTableName: { not: null } },
        select: { targetTableName: true },
        orderBy: { targetTableName: "asc" },
        take: 60,
      }),
    ]);

    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id)))];
    const usersMap = new Map<string, { id: string; fullName: string; email: string }>();
    if (userIds.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, email: true },
      });
      for (const u of users) usersMap.set(u.id, u);
    }

    const data: AdminAuditLogItem[] = rows.map((r) => ({
      id: publicDatabaseId(r),
      actionName: r.actionName,
      targetTableName: r.targetTableName,
      targetRecordId: r.targetRecordId,
      details: redactAuditDetails(r.details),
      createdAt: r.createdAt.toISOString(),
      user: r.userId ? usersMap.get(r.userId) ?? null : null,
    }));

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        facets: {
          targetTables: tableGroups
            .map((t) => t.targetTableName)
            .filter((name): name is string => Boolean(name)),
        },
      },
    };
  },

  async listWorkersStatus(): Promise<AdminWorkersFleetResponse> {
    const pipeline = await pipelineService.getStatus();
    return {
      generatedAt: pipeline.generatedAt,
      redis: pipeline.redis,
      summary: {
        expected: pipeline.workers.expected,
        alive: pipeline.workers.alive,
        stale: pipeline.workers.stale,
        missing: pipeline.workers.missing,
      },
      workers: pipeline.workers.heartbeats.map((hb) => ({
        workerName: hb.workerName,
        queueName: hb.queueName,
        status: hb.status,
        ageSeconds: hb.ageSeconds,
        lastSeenAt: hb.lastSeenAt,
        startedAt: hb.startedAt,
        hostname: hb.hostname ?? null,
        pid: hb.pid ?? null,
      })),
      queues: pipeline.queues,
      recentFailedJobs: pipeline.recentFailedJobs,
    };
  },

  async listAiOperations(query: ListAiOperationsQueryInput): Promise<AdminAiOperationsResponse> {
    const prisma = getPrisma();
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const statusFilter = query.status?.trim() || undefined;
    const search = query.search?.trim() || undefined;

    const [aiRunGroups, reportGroups, gapAnalysisGroups, gapValidationGroups, pipeline] = await Promise.all([
      prisma.aiRun.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.report.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.gapAnalysis.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.researchGap.groupBy({ by: ["validationStatus"], _count: { _all: true } }),
      pipelineService.getStatus().catch(() => null),
    ]);

    const countOf = (rows: Array<{ status: string; _count: { _all: number } }>, value?: string) =>
      rows.reduce((acc, r) => acc + (!value || r.status === value ? r._count._all : 0), 0);

    const summary: AdminAiOperationsResponse["summary"] = {
      aiRuns: {
        total: countOf(aiRunGroups),
        queued: countOf(aiRunGroups, "queued"),
        running: countOf(aiRunGroups, "running"),
        completed: countOf(aiRunGroups, "completed"),
        failed: countOf(aiRunGroups, "failed"),
        cancelled: countOf(aiRunGroups, "cancelled"),
      },
      reports: {
        total: countOf(reportGroups),
        queued: countOf(reportGroups, "queued"),
        generating: countOf(reportGroups, "generating"),
        ready: countOf(reportGroups, "ready") + countOf(reportGroups, "completed"),
        failed: countOf(reportGroups, "failed"),
      },
      gapAnalyses: {
        total: countOf(gapAnalysisGroups),
        queued: countOf(gapAnalysisGroups, "queued"),
        analyzing: countOf(gapAnalysisGroups, "analyzing"),
        completed: countOf(gapAnalysisGroups, "completed") + countOf(gapAnalysisGroups, "ready"),
        failed: countOf(gapAnalysisGroups, "failed"),
      },
      researchGaps: {
        total: gapValidationGroups.reduce((acc, r) => acc + r._count._all, 0),
        validated: gapValidationGroups.find((r) => r.validationStatus === "VALIDATED")?._count._all ?? 0,
        candidate: gapValidationGroups.find((r) => r.validationStatus === "CANDIDATE")?._count._all ?? 0,
      },
    };

    let matchedOwnerIds: string[] | undefined;
    if (search) {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 150,
      });
      matchedOwnerIds = users.map((u) => u.id);
    }

    const aiRunWhere = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? {
        OR: [
          { jobType: { contains: search, mode: "insensitive" as const } },
          { errorCode: { contains: search, mode: "insensitive" as const } },
          ...(matchedOwnerIds?.length ? [{ ownerId: { in: matchedOwnerIds } }] : []),
        ],
      } : {}),
    };
    const reportWhere = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? {
        OR: [
          { modelVersion: { contains: search, mode: "insensitive" as const } },
          { artifactType: { contains: search, mode: "insensitive" as const } },
          ...(matchedOwnerIds?.length ? [{ userId: { in: matchedOwnerIds } }] : []),
        ],
      } : {}),
    };
    const gapWhere = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search ? {
        OR: [
          { modelVersion: { contains: search, mode: "insensitive" as const } },
          ...(matchedOwnerIds?.length ? [{ userId: { in: matchedOwnerIds } }] : []),
        ],
      } : {}),
    };

    const rawItems: Array<{
      id: string;
      kind: AdminAiOperationItem["kind"];
      operationType: string;
      status: string;
      userId: string;
      modelVersion: string | null;
      attempts: number | null;
      maxAttempts: number | null;
      durationMs: number | null;
      creditCost: number | null;
      costUsd: number | null;
      errorCode: string | null;
      errorMessage: string | null;
      createdAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
    }> = [];

    let total = 0;

    if (query.kind === "ai_run") {
      const [c, rows] = await Promise.all([
        prisma.aiRun.count({ where: aiRunWhere }),
        prisma.aiRun.findMany({
          where: aiRunWhere,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true, legacyMongoId: true, ownerId: true, jobType: true, status: true,
            attempts: true, maxAttempts: true, latencyMs: true, costUsd: true,
            errorCode: true, errorMessage: true, createdAt: true, startedAt: true, completedAt: true,
          },
        }),
      ]);
      total = c;
      for (const r of rows) {
        rawItems.push({
          id: publicDatabaseId(r),
          kind: "ai_run",
          operationType: r.jobType,
          status: r.status || "unknown",
          userId: r.ownerId,
          modelVersion: null,
          attempts: r.attempts,
          maxAttempts: r.maxAttempts,
          durationMs: r.latencyMs ?? (r.startedAt && r.completedAt ? Math.max(0, r.completedAt.getTime() - r.startedAt.getTime()) : null),
          creditCost: null,
          costUsd: r.costUsd !== null ? Number(r.costUsd) : null,
          errorCode: r.errorCode ?? null,
          errorMessage: sanitizeOperationalError(r.errorMessage),
          createdAt: r.createdAt,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
        });
      }
    } else if (query.kind === "report") {
      const [c, rows] = await Promise.all([
        prisma.report.count({ where: reportWhere }),
        prisma.report.findMany({
          where: reportWhere,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true, legacyMongoId: true, userId: true, artifactType: true, status: true,
            modelVersion: true, creditCost: true, errorMessage: true, createdAt: true, completedAt: true,
          },
        }),
      ]);
      total = c;
      for (const r of rows) {
        rawItems.push({
          id: publicDatabaseId(r),
          kind: "report",
          operationType: r.artifactType || "GENERAL_REPORT",
          status: r.status || "unknown",
          userId: r.userId,
          modelVersion: r.modelVersion || null,
          attempts: null,
          maxAttempts: null,
          durationMs: r.completedAt ? Math.max(0, r.completedAt.getTime() - r.createdAt.getTime()) : null,
          creditCost: r.creditCost ?? null,
          costUsd: null,
          errorCode: null,
          errorMessage: sanitizeOperationalError(r.errorMessage),
          createdAt: r.createdAt,
          startedAt: null,
          completedAt: r.completedAt,
        });
      }
    } else if (query.kind === "gap_analysis") {
      const [c, rows] = await Promise.all([
        prisma.gapAnalysis.count({ where: gapWhere }),
        prisma.gapAnalysis.findMany({
          where: gapWhere,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true, legacyMongoId: true, userId: true, evidenceMode: true, status: true,
            modelVersion: true, creditCost: true, errorMessage: true, createdAt: true, updatedAt: true,
          },
        }),
      ]);
      total = c;
      for (const r of rows) {
        rawItems.push({
          id: publicDatabaseId(r),
          kind: "gap_analysis",
          operationType: `gap_analysis:${r.evidenceMode || "auto"}`,
          status: r.status || "unknown",
          userId: r.userId,
          modelVersion: r.modelVersion || null,
          attempts: null,
          maxAttempts: null,
          durationMs: ["completed", "ready", "failed"].includes(r.status) ? Math.max(0, r.updatedAt.getTime() - r.createdAt.getTime()) : null,
          creditCost: r.creditCost ?? null,
          costUsd: null,
          errorCode: null,
          errorMessage: sanitizeOperationalError(r.errorMessage),
          createdAt: r.createdAt,
          startedAt: null,
          completedAt: ["completed", "ready", "failed"].includes(r.status) ? r.updatedAt : null,
        });
      }
    } else {
      const fetchLimit = Math.min(200, page * pageSize);
      const [cRuns, cReps, cGaps, runs, reps, gapRows] = await Promise.all([
        prisma.aiRun.count({ where: aiRunWhere }),
        prisma.report.count({ where: reportWhere }),
        prisma.gapAnalysis.count({ where: gapWhere }),
        prisma.aiRun.findMany({
          where: aiRunWhere,
          orderBy: { createdAt: "desc" },
          take: fetchLimit,
          select: {
            id: true, legacyMongoId: true, ownerId: true, jobType: true, status: true,
            attempts: true, maxAttempts: true, latencyMs: true, costUsd: true,
            errorCode: true, errorMessage: true, createdAt: true, startedAt: true, completedAt: true,
          },
        }),
        prisma.report.findMany({
          where: reportWhere,
          orderBy: { createdAt: "desc" },
          take: fetchLimit,
          select: {
            id: true, legacyMongoId: true, userId: true, artifactType: true, status: true,
            modelVersion: true, creditCost: true, errorMessage: true, createdAt: true, completedAt: true,
          },
        }),
        prisma.gapAnalysis.findMany({
          where: gapWhere,
          orderBy: { createdAt: "desc" },
          take: fetchLimit,
          select: {
            id: true, legacyMongoId: true, userId: true, evidenceMode: true, status: true,
            modelVersion: true, creditCost: true, errorMessage: true, createdAt: true, updatedAt: true,
          },
        }),
      ]);
      total = cRuns + cReps + cGaps;
      const merged: typeof rawItems = [
        ...runs.map((r) => ({
          id: publicDatabaseId(r),
          kind: "ai_run" as const,
          operationType: r.jobType,
          status: r.status || "unknown",
          userId: r.ownerId,
          modelVersion: null,
          attempts: r.attempts,
          maxAttempts: r.maxAttempts,
          durationMs: r.latencyMs ?? (r.startedAt && r.completedAt ? Math.max(0, r.completedAt.getTime() - r.startedAt.getTime()) : null),
          creditCost: null,
          costUsd: r.costUsd !== null ? Number(r.costUsd) : null,
          errorCode: r.errorCode ?? null,
          errorMessage: sanitizeOperationalError(r.errorMessage),
          createdAt: r.createdAt,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
        })),
        ...reps.map((r) => ({
          id: publicDatabaseId(r),
          kind: "report" as const,
          operationType: r.artifactType || "GENERAL_REPORT",
          status: r.status || "unknown",
          userId: r.userId,
          modelVersion: r.modelVersion || null,
          attempts: null,
          maxAttempts: null,
          durationMs: r.completedAt ? Math.max(0, r.completedAt.getTime() - r.createdAt.getTime()) : null,
          creditCost: r.creditCost ?? null,
          costUsd: null,
          errorCode: null,
          errorMessage: sanitizeOperationalError(r.errorMessage),
          createdAt: r.createdAt,
          startedAt: null,
          completedAt: r.completedAt,
        })),
        ...gapRows.map((r) => ({
          id: publicDatabaseId(r),
          kind: "gap_analysis" as const,
          operationType: `gap_analysis:${r.evidenceMode || "auto"}`,
          status: r.status || "unknown",
          userId: r.userId,
          modelVersion: r.modelVersion || null,
          attempts: null,
          maxAttempts: null,
          durationMs: ["completed", "ready", "failed"].includes(r.status) ? Math.max(0, r.updatedAt.getTime() - r.createdAt.getTime()) : null,
          creditCost: r.creditCost ?? null,
          costUsd: null,
          errorCode: null,
          errorMessage: sanitizeOperationalError(r.errorMessage),
          createdAt: r.createdAt,
          startedAt: null,
          completedAt: ["completed", "ready", "failed"].includes(r.status) ? r.updatedAt : null,
        })),
      ];
      merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const offset = (page - 1) * pageSize;
      rawItems.push(...merged.slice(offset, offset + pageSize));
    }

    const actorIds = [...new Set(rawItems.map((i) => i.userId))];
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true, email: true } })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, { id: publicDatabaseId(a), fullName: a.fullName, email: a.email }]));

    const aiQueues = (pipeline?.queues ?? []).filter((q) =>
      ["ai-jobs", "report", "gaps", "paper-analysis", "embedding"].includes(q.name),
    );

    return {
      generatedAt: new Date().toISOString(),
      summary,
      queues: aiQueues,
      items: rawItems.map((row) => ({
        id: row.id,
        kind: row.kind,
        operationType: row.operationType,
        status: row.status,
        initiator: actorMap.get(row.userId) ?? null,
        modelVersion: row.modelVersion,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
        durationMs: row.durationMs,
        creditCost: row.creditCost,
        costUsd: row.costUsd,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt.toISOString(),
        startedAt: row.startedAt ? row.startedAt.toISOString() : null,
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  },

  async getPlatformSettings(): Promise<AdminPlatformSettings> {
    const prisma = getPrisma();
    const [institutions, domains, providers] = await Promise.all([
      prisma.institution.findMany({ orderBy: [{ hostInstitution: "desc" }, { name: "asc" }] }),
      prisma.institutionDomain.findMany({ orderBy: { domain: "asc" } }),
      prisma.apiProvider.findMany({ orderBy: { providerName: "asc" } }),
    ]);

    const domainMap = new Map<string, string[]>();
    for (const d of domains) {
      const list = domainMap.get(d.institutionId) || [];
      list.push(d.domain);
      domainMap.set(d.institutionId, list);
    }

    const openAlexProvider = providers.find((p) => p.providerName.toLowerCase() === "openalex");

    const environmentPolicies: AdminRuntimePolicySetting[] = [
      {
        key: "INITIAL_USER_CREDITS",
        label: "Initial sign-up credits",
        value: env.INITIAL_USER_CREDITS,
        unit: "credits",
        source: "env",
        editable: false,
        requiresRestart: true,
        description: "Credits granted automatically when a new account is created.",
      },
      {
        key: "EMAIL_DELIVERY_MODE",
        label: "Transactional email delivery mode",
        value: env.EMAIL_DELIVERY_MODE,
        source: "env",
        editable: false,
        requiresRestart: true,
        description: "Active transport mode for verification and notification emails.",
      },
      {
        key: "STORAGE_PROVIDER",
        label: "Binary & PDF storage provider",
        value: env.STORAGE_PROVIDER,
        source: "env",
        editable: false,
        requiresRestart: true,
        description: "Configured storage backend for PDFs, avatars, and private evidence.",
      },
      {
        key: "ACADEMIC_VERIFICATION_EVIDENCE_RETENTION_DAYS",
        label: "Verification evidence retention",
        value: env.ACADEMIC_VERIFICATION_EVIDENCE_RETENTION_DAYS,
        unit: "days",
        source: "env",
        editable: false,
        requiresRestart: true,
        description: "Retention period for private academic verification evidence documents.",
      },
      {
        key: "MAX_ACTIVE_MENTORS_PER_PROJECT",
        label: "Max active mentors per project",
        value: env.MAX_ACTIVE_MENTORS_PER_PROJECT,
        source: "env",
        editable: false,
        requiresRestart: true,
        description: "Concurrency cap on active mentor relationships per research project.",
      },
      {
        key: "FORUM_AUTO_HIDE_REPORT_THRESHOLD",
        label: "Forum auto-hide report threshold",
        value: env.FORUM_AUTO_HIDE_REPORT_THRESHOLD,
        unit: "reports",
        source: "env",
        editable: false,
        requiresRestart: true,
        description: "Minimum distinct user reports required to auto-hide a forum post.",
      },
      {
        key: "AI_PROVIDER_TIMEOUT_MS",
        label: "AI provider request timeout",
        value: Math.round(env.AI_PROVIDER_TIMEOUT_MS / 1000),
        unit: "seconds",
        source: "env",
        editable: false,
        requiresRestart: true,
        description: "Maximum wait time for generative AI calls before timing out.",
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      initialCredits: env.INITIAL_USER_CREDITS,
      openAlexRateLimit: openAlexProvider?.rateLimitPerMin ?? null,
      environmentPolicies,
      institutions: institutions.map((i) => ({
        id: publicDatabaseId(i),
        name: i.name,
        slug: i.slug,
        rorId: i.rorId,
        hostInstitution: i.hostInstitution,
        domains: domainMap.get(i.id) || [],
        isActive: i.isActive,
        status: i.status,
        updatedAt: i.updatedAt.toISOString(),
      })),
      apiProviders: providers.map((p) => ({
        id: publicDatabaseId(p),
        providerName: p.providerName,
        baseUrl: p.baseUrl,
        providerKind: p.providerKind,
        providerStatus: p.providerStatus,
        rateLimitPerMin: p.rateLimitPerMin,
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  },

  async updateInstitutionSetting(
    actorInput: string,
    institutionInput: string,
    input: UpdateAdminInstitutionInput,
  ): Promise<AdminInstitutionSettingItem> {
    const actor = await loadTarget(actorInput);
    const parsed = parseDatabaseId(institutionInput);
    if (!parsed) throw AppError.notFound("Institution not found");
    const prisma = getPrisma();

    const { updated, domains } = await prisma.$transaction(async (tx) => {
      const existing = await tx.institution.findUnique({
        where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
      });
      if (!existing) throw AppError.notFound("Institution not found");
      const next = await tx.institution.update({
        where: { id: existing.id },
        data: {
          isActive: input.isActive,
          status: input.isActive ? "ACTIVE" : "INACTIVE",
        },
      });
      const doms = await tx.institutionDomain.findMany({
        where: { institutionId: existing.id },
        orderBy: { domain: "asc" },
      });
      await tx.auditLog.create({
        data: {
          actionName: "admin.institution.updated",
          userId: actor.id,
          targetTableName: "institutions",
          targetRecordId: existing.id,
          details: {
            institutionName: existing.name,
            previous: { isActive: existing.isActive, status: existing.status },
            next: { isActive: next.isActive, status: next.status },
            ...(input.reason ? { reason: input.reason } : {}),
          },
        },
      });
      return { updated: next, domains: doms };
    });

    return {
      id: publicDatabaseId(updated),
      name: updated.name,
      slug: updated.slug,
      rorId: updated.rorId,
      hostInstitution: updated.hostInstitution,
      domains: domains.map((d) => d.domain),
      isActive: updated.isActive,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    };
  },

  async updateApiProviderSetting(
    actorInput: string,
    providerInput: string,
    input: UpdateAdminApiProviderInput,
  ): Promise<AdminApiProviderSettingItem> {
    const actor = await loadTarget(actorInput);
    const parsed = parseDatabaseId(providerInput);
    if (!parsed) throw AppError.notFound("API provider not found");
    const prisma = getPrisma();

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.apiProvider.findUnique({
        where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
      });
      if (!existing) throw AppError.notFound("API provider not found");
      const next = await tx.apiProvider.update({
        where: { id: existing.id },
        data: {
          ...(input.rateLimitPerMin !== undefined ? { rateLimitPerMin: input.rateLimitPerMin } : {}),
          ...(input.providerStatus !== undefined ? { providerStatus: input.providerStatus } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actionName: "admin.api_provider.updated",
          userId: actor.id,
          targetTableName: "api_providers",
          targetRecordId: existing.id,
          details: {
            providerName: existing.providerName,
            previous: { rateLimitPerMin: existing.rateLimitPerMin, providerStatus: existing.providerStatus },
            next: { rateLimitPerMin: next.rateLimitPerMin, providerStatus: next.providerStatus },
            ...(input.reason ? { reason: input.reason } : {}),
          },
        },
      });
      return next;
    });

    return {
      id: publicDatabaseId(updated),
      providerName: updated.providerName,
      baseUrl: updated.baseUrl,
      providerKind: updated.providerKind,
      providerStatus: updated.providerStatus,
      rateLimitPerMin: updated.rateLimitPerMin,
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
};
