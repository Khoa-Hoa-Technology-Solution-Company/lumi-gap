import type { FilterQuery } from "mongoose";
import type {
  AdminStats,
  AdminUserItem,
  ListUsersResponse,
  UserRole,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import {
  UserModel,
  RefreshTokenModel,
  type UserDoc,
  type UserHydrated,
} from "../auth/models/user.model.js";
import { ApiSyncRunModel } from "../api-sync/models/api-sync-run.model.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { ReportModel } from "../reports/models/report.model.js";
import { ResearchGapModel } from "../gaps/models/research-gap.model.js";
import type { ListUsersQueryInput } from "./dto/admin.schema.js";

function toAdminUserItem(u: UserDoc): AdminUserItem {
  return {
    id: u._id.toString(),
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive !== false,
    institution: u.institution ?? undefined,
    createdAt: (u as unknown as { createdAt: Date }).createdAt.toISOString(),
  };
}

async function loadTarget(targetId: string): Promise<UserHydrated> {
  const user = await UserModel.findById(targetId);
  if (!user) throw AppError.notFound("User not found");
  return user;
}

/** Refuse changes that would remove the last enabled admin. */
async function assertNotLastAdmin(target: UserHydrated): Promise<void> {
  if (target.role !== "admin") return;
  const enabledAdmins = await UserModel.countDocuments({
    role: "admin",
    isActive: { $ne: false },
  });
  if (enabledAdmins <= 1) {
    throw AppError.badRequest("Cannot demote or lock the last remaining admin");
  }
}

export const adminService = {
  async listUsers(q: ListUsersQueryInput): Promise<ListUsersResponse> {
    const filter: FilterQuery<UserDoc> = {};
    if (q.role) filter.role = q.role;
    if (q.isActive !== undefined) {
      filter.isActive = q.isActive ? { $ne: false } : false;
    }
    if (q.search) {
      const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ email: rx }, { fullName: rx }];
    }

    const total = await UserModel.countDocuments(filter);
    const docs = await UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize);

    return {
      data: docs.map((d) => toAdminUserItem(d as UserDoc)),
      meta: {
        total,
        page: q.page,
        pageSize: q.pageSize,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  },

  async updateRole(actorId: string, targetId: string, role: UserRole): Promise<AdminUserItem> {
    if (actorId === targetId) {
      throw AppError.badRequest("You cannot change your own role");
    }
    const target = await loadTarget(targetId);
    if (target.role === "admin" && role !== "admin") {
      await assertNotLastAdmin(target);
    }
    target.role = role;
    await target.save();
    return toAdminUserItem(target);
  },

  async updateStatus(
    actorId: string,
    targetId: string,
    isActive: boolean,
  ): Promise<AdminUserItem> {
    if (actorId === targetId) {
      throw AppError.badRequest("You cannot lock your own account");
    }
    const target = await loadTarget(targetId);
    if (!isActive) {
      await assertNotLastAdmin(target);
    }
    target.isActive = isActive;
    await target.save();
    if (!isActive) {
      // Kill active sessions so a locked user cannot refresh back in.
      await RefreshTokenModel.updateMany(
        { userId: target._id, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      );
    }
    return toAdminUserItem(target);
  },

  async stats(): Promise<AdminStats> {
    const roleAgg = await UserModel.aggregate<{ _id: UserRole; count: number }>([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);
    const byRole: Record<UserRole, number> = {
      student: 0,
      lecturer: 0,
      researcher: 0,
      admin: 0,
    };
    for (const r of roleAgg) {
      if (r._id in byRole) byRole[r._id] = r.count;
    }
    const [total, papers, reports, gaps, syncAgg, latestSync] = await Promise.all([
      UserModel.countDocuments({}),
      PaperModel.countDocuments({}),
      ReportModel.countDocuments({}),
      ResearchGapModel.countDocuments({}),
      ApiSyncRunModel.aggregate<{
        _id: null;
        totalRuns: number;
        totalFetched: number;
        totalInserted: number;
        totalUpdated: number;
        totalDuplicates: number;
      }>([
        {
          $group: {
            _id: null,
            totalRuns: { $sum: 1 },
            totalFetched: { $sum: "$totalFetched" },
            totalInserted: { $sum: "$totalInserted" },
            totalUpdated: { $sum: "$totalUpdated" },
            totalDuplicates: { $sum: "$totalDuplicates" },
          },
        },
      ]),
      ApiSyncRunModel.findOne().sort({ startedAt: -1 }).lean(),
    ]);
    const syncTotals = syncAgg[0] ?? {
      totalRuns: 0,
      totalFetched: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalDuplicates: 0,
    };
    return {
      users: { total, byRole },
      papers,
      reports,
      gaps,
      sync: {
        totalRuns: syncTotals.totalRuns ?? 0,
        totalFetched: syncTotals.totalFetched ?? 0,
        totalInserted: syncTotals.totalInserted ?? 0,
        totalUpdated: syncTotals.totalUpdated ?? 0,
        totalDuplicates: syncTotals.totalDuplicates ?? 0,
        latestRun: latestSync
          ? {
              id: String(latestSync._id),
              status: latestSync.runStatus,
              searchText: latestSync.searchText ?? undefined,
              startedAt: latestSync.startedAt.toISOString(),
              finishedAt: latestSync.finishedAt ? latestSync.finishedAt.toISOString() : undefined,
              totalFetched: latestSync.totalFetched ?? 0,
              totalInserted: latestSync.totalInserted ?? 0,
              totalUpdated: latestSync.totalUpdated ?? 0,
              totalDuplicates: latestSync.totalDuplicates ?? 0,
              errorMessage: latestSync.errorMessage ?? undefined,
            }
          : null,
      },
    };
  },
};
