import type { AcademicProfileType, AdminStats, AdminUserItem, ListUsersResponse, SystemRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { ListUsersQueryInput } from "./dto/admin.schema.js";

type UserRow = Awaited<ReturnType<typeof loadTarget>>;

function legacyAcademicProfile(role: string): AcademicProfileType | undefined {
  return role === "student" || role === "researcher" || role === "lecturer" ? role : undefined;
}

function normalizeSystemRole(role: string): SystemRole {
  return role === "reviewer" || role === "moderator" || role === "admin" ? role : "user";
}

function toAdminUserItem(user: UserRow): AdminUserItem {
  return {
    id: publicDatabaseId(user),
    email: user.email,
    fullName: user.fullName,
    role: normalizeSystemRole(user.role),
    academicProfileType: (user.academicProfileType as AcademicProfileType | null) ?? legacyAcademicProfile(user.role),
    isActive: user.isActive,
    institution: user.institution ?? undefined,
    createdAt: user.createdAt.toISOString(),
  };
}

async function loadTarget(targetId: string) {
  const parsed = parseDatabaseId(targetId);
  if (!parsed) throw AppError.notFound("User not found");
  const user = await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
  });
  if (!user) throw AppError.notFound("User not found");
  return user;
}

async function resolveUserId(userId: string) {
  return (await loadTarget(userId)).id;
}

async function assertNotLastAdmin(target: UserRow): Promise<void> {
  if (target.role !== "admin") return;
  const enabledAdmins = await getPrisma().user.count({ where: { role: "admin", isActive: true } });
  if (enabledAdmins <= 1) throw AppError.badRequest("Cannot demote or lock the last remaining admin");
}

export const adminService = {
  async listUsers(query: ListUsersQueryInput): Promise<ListUsersResponse> {
    const where = {
      ...(query.role === "user"
        ? { role: { in: ["user", "student", "researcher", "lecturer"] } }
        : query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search ? { OR: [
        { email: { contains: query.search, mode: "insensitive" as const } },
        { fullName: { contains: query.search, mode: "insensitive" as const } },
      ] } : {}),
    };
    const [total, users] = await Promise.all([
      getPrisma().user.count({ where }),
      getPrisma().user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: users.map(toAdminUserItem),
      meta: { total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  },

  async updateRole(actorId: string, targetId: string, role: SystemRole): Promise<AdminUserItem> {
    const [actorUuid, target] = await Promise.all([resolveUserId(actorId), loadTarget(targetId)]);
    if (actorUuid === target.id) throw AppError.badRequest("You cannot change your own role");
    if (target.role === "admin" && role !== "admin") await assertNotLastAdmin(target);
    return toAdminUserItem(await getPrisma().user.update({ where: { id: target.id }, data: { role } }));
  },

  async updateStatus(actorId: string, targetId: string, isActive: boolean): Promise<AdminUserItem> {
    const [actorUuid, target] = await Promise.all([resolveUserId(actorId), loadTarget(targetId)]);
    if (actorUuid === target.id) throw AppError.badRequest("You cannot lock your own account");
    if (!isActive) await assertNotLastAdmin(target);
    const updated = await getPrisma().$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: target.id }, data: { isActive } });
      if (!isActive) {
        await tx.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return user;
    });
    return toAdminUserItem(updated);
  },

  async stats(): Promise<AdminStats> {
    const prisma = getPrisma();
    const [roleGroups, total, papers, reports, gaps, syncTotals, latestSync] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.user.count(),
      prisma.paper.count(),
      prisma.report.count(),
      prisma.researchGap.count(),
      prisma.apiSyncRun.aggregate({
        _count: { _all: true },
        _sum: { totalFetched: true, totalInserted: true, totalUpdated: true, totalDuplicates: true },
      }),
      prisma.apiSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    ]);
    const byRole: Record<SystemRole, number> = { user: 0, reviewer: 0, moderator: 0, admin: 0 };
    for (const group of roleGroups) byRole[normalizeSystemRole(group.role)] += group._count._all;
    return {
      users: { total, byRole }, papers, reports, gaps,
      sync: {
        totalRuns: syncTotals._count._all,
        totalFetched: syncTotals._sum.totalFetched ?? 0,
        totalInserted: syncTotals._sum.totalInserted ?? 0,
        totalUpdated: syncTotals._sum.totalUpdated ?? 0,
        totalDuplicates: syncTotals._sum.totalDuplicates ?? 0,
        latestRun: latestSync ? {
          id: publicDatabaseId(latestSync), status: latestSync.runStatus as "failed" | "running" | "succeeded" | "cancelled",
          searchText: latestSync.searchText ?? undefined,
          startedAt: latestSync.startedAt.toISOString(),
          finishedAt: latestSync.finishedAt?.toISOString(),
          totalFetched: latestSync.totalFetched, totalInserted: latestSync.totalInserted,
          totalUpdated: latestSync.totalUpdated, totalDuplicates: latestSync.totalDuplicates,
          errorMessage: latestSync.errorMessage ?? undefined,
        } : null,
      },
    };
  },
};
