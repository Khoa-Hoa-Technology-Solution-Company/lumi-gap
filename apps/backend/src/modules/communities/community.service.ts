import { randomBytes } from "node:crypto";
import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";

type CommunityInput = {
  name: string;
  description?: string;
  visibility?: "public" | "private";
  rules?: string[];
  researchTopics?: string[];
};
type MembershipSummary = {
  role: "owner" | "moderator" | "member";
  status: "pending" | "active" | "declined" | "banned";
};

function slugify(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function resolveUserId(value: string): Promise<string> {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid user id");
  const user = await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true },
  });
  if (!user) throw AppError.notFound("User not found");
  return user.id;
}

async function resolveCommunityId(value: string): Promise<string> {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid community id");
  const community = await getPrisma().community.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true },
  });
  if (!community) throw AppError.notFound("Community not found");
  return community.id;
}

export async function getActiveCommunityMembership(communityId: string, userId: string) {
  const [resolvedCommunityId, resolvedUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(userId)]);
  return getPrisma().communityMembership.findUnique({
    where: { communityId_userId: { communityId: resolvedCommunityId, userId: resolvedUserId } },
  }).then((membership) => membership?.status === "active" ? membership : null);
}

export async function isCommunityModerator(communityId: string, userId: string): Promise<boolean> {
  const membership = await getActiveCommunityMembership(communityId, userId);
  return Boolean(membership && ["owner", "moderator"].includes(membership.role));
}

async function moderatorMembership(communityId: string, userId: string, role?: UserRole): Promise<MembershipSummary | null> {
  if (role === "admin") return { role: "owner", status: "active" };
  const membership = await getActiveCommunityMembership(communityId, userId);
  if (!membership || !["owner", "moderator"].includes(membership.role)) return null;
  return membership as MembershipSummary;
}

async function assertCommunityModerator(communityId: string, userId: string, role?: UserRole): Promise<MembershipSummary> {
  const membership = await moderatorMembership(communityId, userId, role);
  if (!membership) throw AppError.forbidden("Community moderator access is required");
  return membership;
}

function presentCommunity(community: {
  id: string; legacyMongoId: string | null; name: string; slug: string; description: string;
  researchTopics: string[]; visibility: string; rules: string[]; memberCount: number;
  createdAt: Date; updatedAt: Date;
}, membership?: MembershipSummary | null, actorRole?: UserRole) {
  const activeMembership = membership?.status === "active";
  return {
    id: publicDatabaseId(community), name: community.name, slug: community.slug,
    description: community.description, researchTopics: community.researchTopics,
    visibility: community.visibility, rules: community.rules, memberCount: community.memberCount,
    viewerMembership: membership ? { role: membership.role, status: membership.status } : undefined,
    canManage: actorRole === "admin" || Boolean(activeMembership && ["owner", "moderator"].includes(membership!.role)),
    contentRestricted: community.visibility === "private" && actorRole !== "admin" && !activeMembership,
    createdAt: community.createdAt, updatedAt: community.updatedAt,
  };
}

export const communityService = {
  async create(input: CommunityInput, actorId: string) {
    const ownerId = await resolveUserId(actorId);
    const slugBase = slugify(input.name);
    if (!slugBase) throw AppError.badRequest("Community name must contain letters or numbers");
    const slug = `${slugBase}-${randomBytes(3).toString("hex")}`;
    const community = await getPrisma().$transaction(async (tx) => {
      const created = await tx.community.create({ data: { ...input, slug, ownerId, memberCount: 1 } });
      await tx.communityMembership.create({ data: { communityId: created.id, userId: ownerId, role: "owner", status: "active" } });
      return created;
    });
    await auditService.log("community.created", { userId: actorId, targetTableName: "communities", targetRecordId: community.id });
    return presentCommunity(community, { role: "owner", status: "active" });
  },

  async list(userId: string | undefined, page: number, pageSize: number, role?: UserRole) {
    const prisma = getPrisma();
    const resolvedUserId = userId ? await resolveUserId(userId) : undefined;
    const [communities, total] = await Promise.all([
      prisma.community.findMany({ orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.community.count(),
    ]);
    const memberships = resolvedUserId && communities.length > 0
      ? await prisma.communityMembership.findMany({ where: { userId: resolvedUserId, communityId: { in: communities.map((item) => item.id) } } })
      : [];
    const byCommunity = new Map(memberships.map((item) => [item.communityId, item as MembershipSummary]));
    return { data: communities.map((community) => presentCommunity(community, byCommunity.get(community.id), role)), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async get(idOrSlug: string, userId?: string, role?: UserRole) {
    const parsed = parseDatabaseId(idOrSlug);
    const community = await getPrisma().community.findUnique({ where: parsed ? (parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }) : { slug: idOrSlug } });
    if (!community) throw AppError.notFound("Community not found");
    const resolvedUserId = userId ? await resolveUserId(userId) : undefined;
    const membership = resolvedUserId ? await getPrisma().communityMembership.findUnique({ where: { communityId_userId: { communityId: community.id, userId: resolvedUserId } } }) : null;
    return presentCommunity(community, membership as MembershipSummary | null, role);
  },

  async update(communityId: string, input: Partial<CommunityInput>, actorId: string, actorRole?: UserRole) {
    const id = await resolveCommunityId(communityId);
    const actorMembership = await assertCommunityModerator(id, actorId, actorRole);
    const community = await getPrisma().community.update({ where: { id }, data: input });
    await auditService.log("community.updated", { userId: actorId, targetTableName: "communities", targetRecordId: id, details: { fields: Object.keys(input) } });
    return presentCommunity(community, actorMembership, actorRole);
  },

  async join(communityId: string, userId: string) {
    const [id, resolvedUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(userId)]);
    const community = await getPrisma().community.findUniqueOrThrow({ where: { id } });
    const existing = await getPrisma().communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: resolvedUserId } } });
    if (existing?.status === "banned") throw AppError.forbidden("You are banned from this community");
    const status = community.visibility === "public" ? "active" : "pending";
    const membership = await getPrisma().$transaction(async (tx) => {
      const updated = await tx.communityMembership.upsert({ where: { communityId_userId: { communityId: id, userId: resolvedUserId } }, create: { communityId: id, userId: resolvedUserId, role: "member", status }, update: { status } });
      if (status === "active" && existing?.status !== "active") await tx.community.update({ where: { id }, data: { memberCount: { increment: 1 } } });
      return updated;
    });
    await auditService.log("community.joined", { userId, targetTableName: "community_memberships", targetRecordId: membership.id, details: { communityId: id, status } });
    return { role: membership.role, status: membership.status };
  },

  async leave(communityId: string, userId: string) {
    const [id, resolvedUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(userId)]);
    const membership = await getPrisma().communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: resolvedUserId } } });
    if (!membership) return;
    if (membership.role === "owner") throw AppError.badRequest("Transfer ownership before leaving the community");
    await getPrisma().$transaction(async (tx) => {
      await tx.communityMembership.delete({ where: { id: membership.id } });
      if (membership.status === "active") {
        const community = await tx.community.findUniqueOrThrow({ where: { id } });
        await tx.community.update({ where: { id }, data: { memberCount: Math.max(0, community.memberCount - 1) } });
      }
    });
    await auditService.log("community.left", { userId, targetTableName: "community_memberships", targetRecordId: membership.id, details: { communityId: id } });
  },

  async listMembers(communityId: string, actorId: string, actorRole?: UserRole) {
    const id = await resolveCommunityId(communityId);
    await assertCommunityModerator(id, actorId, actorRole);
    return getPrisma().communityMembership.findMany({ where: { communityId: id }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] });
  },

  async updateMember(communityId: string, targetUserId: string, input: { role?: "moderator" | "member"; status?: "pending" | "active" | "declined" | "banned" }, actorId: string, actorRole?: UserRole) {
    const [id, resolvedTargetId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(targetUserId)]);
    const actorMembership = await assertCommunityModerator(id, actorId, actorRole);
    const target = await getPrisma().communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: resolvedTargetId } } });
    if (!target) throw AppError.notFound("Community membership not found");
    if (target.role === "owner") throw AppError.badRequest("The owner membership cannot be changed here");
    if (input.role !== undefined && actorRole !== "admin" && actorMembership.role !== "owner") throw AppError.forbidden("Only the community owner can assign or remove moderators");
    if (actorRole !== "admin" && actorMembership.role === "moderator" && target.role !== "member") throw AppError.forbidden("Community moderators can only manage regular members");
    const nextStatus = input.status ?? target.status;
    const updated = await getPrisma().$transaction(async (tx) => {
      const result = await tx.communityMembership.update({ where: { id: target.id }, data: input });
      if ((target.status === "active") !== (nextStatus === "active")) {
        const community = await tx.community.findUniqueOrThrow({ where: { id } });
        await tx.community.update({ where: { id }, data: { memberCount: Math.max(0, community.memberCount + (nextStatus === "active" ? 1 : -1)) } });
      }
      return result;
    });
    await auditService.log("community.member.updated", { userId: actorId, targetTableName: "community_memberships", targetRecordId: target.id, details: input });
    return updated;
  },
};
