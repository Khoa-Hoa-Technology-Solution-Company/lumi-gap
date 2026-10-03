import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { cleanForumText } from "./forum.rules.js";

type CategoryInput = { name: string; slug: string; description?: string; sortOrder?: number; status?: "ACTIVE" | "ARCHIVED" };
const idWhere = (value: string) => parseDatabaseId(value)?.kind === "uuid" ? { id: value } : { legacyMongoId: value };
function assertAdmin(role: UserRole) { if (role !== "admin") throw AppError.forbidden("Only administrators can manage forum categories"); }
function cleanName(value: string) {
  const name = cleanForumText(value).trim();
  if (name.length < 2) throw AppError.badRequest("Category name is required");
  return name;
}
async function withUniqueSlug<T>(write: () => Promise<T>): Promise<T> {
  try { return await write(); }
  catch (error) {
    if ((error as { code?: string }).code === "P2002") throw AppError.conflict("This category slug is already in use");
    throw error;
  }
}

export async function resolveForumCategory(value: string) {
  if (!parseDatabaseId(value) && (value.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))) throw AppError.badRequest("Invalid category identifier");
  const category = await getPrisma().community.findUnique({ where: parseDatabaseId(value) ? idWhere(value) : { slug: value } });
  if (!category?.isForumCategory || category.visibility !== "public") throw AppError.notFound("Forum category not found");
  return category;
}
const present = (row: Awaited<ReturnType<typeof resolveForumCategory>>) => ({
  id: publicDatabaseId(row), name: row.name, slug: row.slug, description: row.description,
  status: row.status as "ACTIVE" | "ARCHIVED", sortOrder: row.sortOrder,
});

export const forumCategoryService = {
  async list(all = false, role?: UserRole) {
    if (all) assertAdmin(role!);
    const rows = await getPrisma().community.findMany({ where: { isForumCategory: true, visibility: "public", status: all ? { in: ["ACTIVE", "ARCHIVED"] } : "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }] });
    if (!rows.length) return [];
    const visibleTopics = { communityId: { in: rows.map((row) => row.id) }, status: { in: ["active", "locked"] }, visibilityStatus: "ACTIVE" };
    const [totals, recent] = await Promise.all([
      getPrisma().forumPost.groupBy({ by: ["communityId"], where: visibleTopics, _count: { _all: true } }),
      getPrisma().forumPost.groupBy({ by: ["communityId"], where: { ...visibleTopics, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) } }, _count: { _all: true } }),
    ]);
    const countByCategory = new Map(totals.map((row) => [row.communityId, row._count._all]));
    const recentByCategory = new Map(recent.map((row) => [row.communityId, row._count._all]));
    return rows.map((row) => ({ ...present(row), topicCount: countByCategory.get(row.id) ?? 0, topicsThisWeek: recentByCategory.get(row.id) ?? 0 }));
  },
  async create(input: CategoryInput, actorId: string, role: UserRole) {
    assertAdmin(role);
    const actor = await getPrisma().user.findUnique({ where: idWhere(actorId), select: { id: true } });
    if (!actor) throw AppError.notFound("User not found");
    if (await getPrisma().community.findUnique({ where: { slug: input.slug } })) throw AppError.conflict("This category slug is already in use");
    const row = await withUniqueSlug(() => getPrisma().community.create({ data: { name: cleanName(input.name), slug: input.slug, description: cleanForumText(input.description ?? ""), sortOrder: input.sortOrder ?? 0, status: input.status ?? "ACTIVE", isForumCategory: true, visibility: "public", ownerId: actor.id } }));
    await auditService.log("FORUM_CATEGORY_CREATED", { userId: actorId, targetTableName: "communities", targetRecordId: row.id });
    return present(row);
  },
  async update(value: string, input: Partial<CategoryInput>, actorId: string, role: UserRole) {
    assertAdmin(role);
    const category = await resolveForumCategory(value);
    if (input.slug) {
      const existing = await getPrisma().community.findUnique({ where: { slug: input.slug } });
      if (existing && existing.id !== category.id) throw AppError.conflict("This category slug is already in use");
    }
    const row = await withUniqueSlug(() => getPrisma().community.update({ where: { id: category.id }, data: { ...input, ...(input.name !== undefined ? { name: cleanName(input.name) } : {}), ...(input.description !== undefined ? { description: cleanForumText(input.description) } : {}) } }));
    await auditService.log("FORUM_CATEGORY_UPDATED", { userId: actorId, targetTableName: "communities", targetRecordId: row.id, details: input });
    return present(row);
  },
  async moderators(value: string, role: UserRole) {
    assertAdmin(role);
    const category = await resolveForumCategory(value);
    const assignments = await getPrisma().communityMembership.findMany({ where: { communityId: category.id, role: { in: ["moderator", "owner"] }, status: "active", revokedAt: null }, orderBy: { assignedAt: "asc" } });
    const users = await getPrisma().user.findMany({ where: { id: { in: assignments.map((row) => row.userId) } }, select: { id: true, legacyMongoId: true, fullName: true } });
    return assignments.flatMap((assignment) => { const user = users.find((row) => row.id === assignment.userId); return user ? [{ userId: publicDatabaseId(user), fullName: user.fullName, assignedAt: assignment.assignedAt, assignedBy: assignment.assignedById }] : []; });
  },
  async assignModerator(value: string, userInput: string, assigned: boolean, actorInput: string, role: UserRole) {
    assertAdmin(role);
    const [category, user, actor] = await Promise.all([resolveForumCategory(value), getPrisma().user.findUnique({ where: idWhere(userInput), select: { id: true } }), getPrisma().user.findUnique({ where: idWhere(actorInput), select: { id: true } })]);
    if (!user || !actor) throw AppError.notFound("User not found");
    const now = new Date();
    if (assigned) await getPrisma().communityMembership.upsert({ where: { communityId_userId: { communityId: category.id, userId: user.id } }, create: { communityId: category.id, userId: user.id, role: "moderator", status: "active", assignedById: actor.id, assignedAt: now }, update: { role: "moderator", status: "active", assignedById: actor.id, assignedAt: now, revokedAt: null } });
    else await getPrisma().communityMembership.updateMany({ where: { communityId: category.id, userId: user.id, role: { in: ["moderator", "owner"] } }, data: { role: "member", revokedAt: now } });
    await auditService.log(assigned ? "ASSIGN_MODERATOR" : "REVOKE_MODERATOR", { userId: actorInput, targetTableName: "communities", targetRecordId: category.id, details: { moderatorId: user.id } });
  },
};
