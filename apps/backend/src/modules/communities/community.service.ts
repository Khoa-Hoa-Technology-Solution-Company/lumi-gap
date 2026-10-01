import { randomBytes } from "node:crypto";
import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { Prisma } from "../../generated/prisma/client.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";
import { notificationService } from "../notifications/notification.service.js";
import {
  canProposeCommunity,
  initialCommunityStatus,
  isCommunityAdmin,
  matchInterests,
  MAX_PENDING_PROPOSALS,
  prepareInterests,
  type CommunityActor,
} from "./community.rules.js";
import type { CommunityListQuery } from "./dto/community.schema.js";

type CommunityContent = {
  name: string;
  description?: string;
  visibility?: "public" | "private";
  rules?: string[];
  researchTopics?: string[];
  researchField?: string;
  icon?: string;
};
export type CommunityStatus = "ACTIVE" | "ARCHIVED" | "PENDING_APPROVAL" | "REJECTED";
type MemberStatus = "pending" | "active" | "declined" | "banned";
type Tx = Prisma.TransactionClient;

const REVIEW_PENDING_STATUS = "PENDING_APPROVAL";
const OWNER_ONLY_STATUSES: string[] = [REVIEW_PENDING_STATUS, "REJECTED"];
const PROPOSAL_STATUSES = ["ACTIVE", REVIEW_PENDING_STATUS];
const SORT_ORDERS = {
  recent: { updatedAt: "desc" },
  newest: { createdAt: "desc" },
  members: { memberCount: "desc" },
  discussions: { threadCount: "desc" },
  name: { name: "asc" },
} as const;
const ROLE_ORDER: Record<string, number> = { owner: 0, moderator: 1, member: 2 };

/**
 * Admins see everything. Everyone else sees ACTIVE communities that are public or that they belong to
 * (private communities are not discoverable by non-members), plus their own pending/rejected proposals.
 */
async function visibleWhere(role: UserRole | undefined, viewerUserId: string | undefined) {
  if (role === "admin") return {};
  const memberIds = viewerUserId
    ? (await getPrisma().communityMembership.findMany({ where: { userId: viewerUserId, status: "active" }, select: { communityId: true } })).map((row) => row.communityId)
    : [];
  return {
    OR: [
      { status: "ACTIVE", OR: [{ visibility: "public" }, { id: { in: memberIds } }] },
      ...(viewerUserId ? [{ ownerId: viewerUserId, status: { in: OWNER_ONLY_STATUSES } }] : []),
    ],
  };
}

type MembershipSummary = {
  role: "owner" | "moderator" | "member";
  status: MemberStatus;
};

/** Notifications are best-effort: a failed push must never undo an already-committed state change. */
async function notifySafely(input: Parameters<typeof notificationService.create>[0]): Promise<void> {
  try { await notificationService.create(input); } catch (error) { logger.warn({ error, type: input.type }, "community notification failed"); }
}

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

export async function resolveCommunityId(value: string): Promise<string> {
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

/** Serializes membership changes per community so the recount below never races. */
async function lockCommunity(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "communities" WHERE "id" = ${id}::uuid FOR UPDATE`;
}

/** memberCount is always derived from the membership rows, never incremented from a stale read. */
async function syncMemberCount(tx: Tx, id: string): Promise<void> {
  const memberCount = await tx.communityMembership.count({ where: { communityId: id, status: "active" } });
  await tx.community.update({ where: { id }, data: { memberCount } });
}

/** Names must be unique (ignoring case, accents and spacing) among live and pending communities. */
async function assertNameAvailable(name: string, excludeId?: string): Promise<void> {
  const rows = await getPrisma().$queryRaw<Array<{ id: string; slug: string; name: string }>>(Prisma.sql`
    SELECT "id", "slug", "name" FROM "communities"
    WHERE "status" IN (${Prisma.join(PROPOSAL_STATUSES)})
      AND regexp_replace(lower(unaccent("name")), '\\s+', ' ', 'g') = regexp_replace(lower(unaccent(${name.trim()}::text)), '\\s+', ' ', 'g')
      ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}::uuid` : Prisma.empty}
    LIMIT 1`);
  const existing = rows[0];
  if (existing) throw AppError.conflict("A community with this name already exists", { existing: { id: existing.id, slug: existing.slug, name: existing.name } });
}

async function assertProposalQuota(ownerId: string): Promise<void> {
  const pending = await getPrisma().community.count({ where: { ownerId, status: REVIEW_PENDING_STATUS } });
  if (pending >= MAX_PENDING_PROPOSALS) throw AppError.conflict(`You can have at most ${MAX_PENDING_PROPOSALS} proposals waiting for approval`);
}

/** Ids of communities matching free text: full-text first, then accent-insensitive substring fallbacks. */
async function searchCommunityIds(q: string): Promise<string[]> {
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await getPrisma().$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "communities"
    WHERE "search_document" @@ websearch_to_tsquery('simple', unaccent(${q}::text))
       OR unaccent("name") ILIKE unaccent(${like}::text)
       OR unaccent("description") ILIKE unaccent(${like}::text)
       OR unaccent(coalesce("research_field", '')) ILIKE unaccent(${like}::text)
       OR EXISTS (SELECT 1 FROM unnest("research_topics") AS topic WHERE unaccent(topic) ILIKE unaccent(${like}::text))
    LIMIT 1000`);
  return rows.map((row) => row.id);
}

function hiddenFromViewer(community: { status: string; ownerId: string }, viewerUserId: string | undefined, role: UserRole | undefined): boolean {
  if (role === "admin") return false;
  return community.status === "ARCHIVED" || (OWNER_ONLY_STATUSES.includes(community.status) && community.ownerId !== viewerUserId);
}

/** Loads a community the viewer is allowed to see, or 404 (never leaks that a proposal exists). */
export async function loadViewableCommunity(idOrSlug: string, userId?: string, role?: UserRole) {
  const parsed = parseDatabaseId(idOrSlug);
  const community = await getPrisma().community.findUnique({ where: parsed ? (parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }) : { slug: idOrSlug } });
  if (!community) throw AppError.notFound("Community not found");
  const viewerUserId = userId ? await resolveUserId(userId) : undefined;
  if (hiddenFromViewer(community, viewerUserId, role)) throw AppError.notFound("Community not found");
  return { community, viewerUserId };
}

function presentCommunity(community: {
  id: string; legacyMongoId: string | null; name: string; slug: string; description: string;
  researchTopics: string[]; researchField: string | null; icon: string | null; visibility: string; status: string;
  rules: string[]; memberCount: number; threadCount: number;
  ownerId: string; reviewNote: string | null; reviewedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}, membership?: MembershipSummary | null, actorRole?: UserRole, viewerUserId?: string) {
  const activeMembership = membership?.status === "active";
  const isAdmin = actorRole === "admin";
  const isOwner = viewerUserId !== undefined && viewerUserId === community.ownerId;
  return {
    id: publicDatabaseId(community), name: community.name, slug: community.slug,
    description: community.description, researchTopics: community.researchTopics, researchField: community.researchField ?? undefined, icon: community.icon ?? undefined,
    visibility: community.visibility, status: community.status, rules: community.rules, memberCount: community.memberCount, threadCount: community.threadCount,
    viewerMembership: membership ? { role: membership.role, status: membership.status } : undefined,
    canManage: isAdmin || Boolean(activeMembership && ["owner", "moderator"].includes(membership!.role)),
    canEditCommunity: isAdmin || isOwner,
    isOwner,
    isAdmin,
    reviewNote: isAdmin || isOwner ? community.reviewNote ?? undefined : undefined,
    reviewedAt: isAdmin || isOwner ? community.reviewedAt ?? undefined : undefined,
    contentRestricted: community.visibility === "private" && !isAdmin && !activeMembership,
    createdAt: community.createdAt, updatedAt: community.updatedAt,
  };
}

export const communityService = {
  async create(input: CommunityContent, actor: CommunityActor) {
    const ownerId = await resolveUserId(actor.sub);
    if (!isCommunityAdmin(actor)) {
      const profile = await getPrisma().academicProfile.findUnique({ where: { userId: ownerId }, select: { roleVerificationStatus: true } });
      if (!canProposeCommunity(actor, profile?.roleVerificationStatus)) {
        throw AppError.forbidden("Only administrators and verified lecturers or researchers can create research communities");
      }
      await assertProposalQuota(ownerId);
    }
    const slugBase = slugify(input.name);
    if (!slugBase) throw AppError.badRequest("Community name must contain letters or numbers");
    await assertNameAvailable(input.name);
    const slug = `${slugBase}-${randomBytes(3).toString("hex")}`;
    const community = await getPrisma().$transaction(async (tx) => {
      const created = await tx.community.create({ data: { ...input, slug, ownerId, memberCount: 1, status: initialCommunityStatus(actor) } });
      await tx.communityMembership.create({ data: { communityId: created.id, userId: ownerId, role: "owner", status: "active" } });
      return created;
    });
    await auditService.log("community.created", { userId: actor.sub, targetTableName: "communities", targetRecordId: community.id, details: { status: community.status } });
    if (community.status === REVIEW_PENDING_STATUS) {
      await notifySafely({ role: "admin", title: "New community proposal", message: `“${community.name}” is waiting for approval.`, type: "COMMUNITY_PROPOSED", targetKind: "community", targetId: community.id });
    }
    return presentCommunity(community, { role: "owner", status: "active" }, actor.role, ownerId);
  },

  async list(userId: string | undefined, query: CommunityListQuery, role?: UserRole) {
    const prisma = getPrisma();
    const { page, pageSize, status, q, field, sort, scope, activeOnly } = query;
    const resolvedUserId = userId ? await resolveUserId(userId) : undefined;
    const conditions: object[] = [await visibleWhere(role, resolvedUserId)];
    if (status) conditions.push({ status });
    if (activeOnly === "true") conditions.push({ status: "ACTIVE" });
    if (field) conditions.push({ researchField: { equals: field, mode: "insensitive" } });
    if (q) conditions.push({ id: { in: await searchCommunityIds(q) } });
    if (scope === "mine") {
      const joined = resolvedUserId
        ? await prisma.communityMembership.findMany({ where: { userId: resolvedUserId, status: "active" }, select: { communityId: true } })
        : [];
      conditions.push({ id: { in: joined.map((row) => row.communityId) } });
    }
    const where = { AND: conditions };
    const [communities, total] = await Promise.all([
      prisma.community.findMany({ where, orderBy: [SORT_ORDERS[sort], { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.community.count({ where }),
    ]);
    const memberships = resolvedUserId && communities.length > 0
      ? await prisma.communityMembership.findMany({ where: { userId: resolvedUserId, communityId: { in: communities.map((item) => item.id) } } })
      : [];
    const byCommunity = new Map(memberships.map((item) => [item.communityId, item as MembershipSummary]));
    return { data: communities.map((community) => presentCommunity(community, byCommunity.get(community.id), role, resolvedUserId)), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  /** Research-field chips for the list filter, counted over what the viewer can see. */
  async facets(userId: string | undefined, role?: UserRole) {
    const resolvedUserId = userId ? await resolveUserId(userId) : undefined;
    const groups = await getPrisma().community.groupBy({
      by: ["researchField"],
      where: { AND: [await visibleWhere(role, resolvedUserId), { researchField: { not: null } }] },
      _count: { _all: true },
    });
    return groups
      .flatMap((group) => group.researchField ? [{ name: group.researchField, count: group._count._all }] : [])
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 30);
  },

  /** Suggests public communities whose topics overlap the viewer's research interests. */
  async recommend(userId: string, limit = 6) {
    const resolvedUserId = await resolveUserId(userId);
    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: resolvedUserId }, select: { researchInterests: true } });
    const interests = prepareInterests(user.researchInterests);
    if (interests.length === 0) return [];
    const [joined, candidates] = await Promise.all([
      prisma.communityMembership.findMany({ where: { userId: resolvedUserId }, select: { communityId: true } }),
      prisma.community.findMany({ where: { status: "ACTIVE", visibility: "public" }, orderBy: [{ memberCount: "desc" }, { id: "asc" }], take: 300 }),
    ]);
    const excluded = new Set(joined.map((row) => row.communityId));
    return candidates
      .filter((community) => !excluded.has(community.id))
      .map((community) => ({ community, matchedInterests: matchInterests(interests, community) }))
      .filter((entry) => entry.matchedInterests.length > 0)
      .sort((a, b) => b.matchedInterests.length - a.matchedInterests.length || b.community.memberCount - a.community.memberCount)
      .slice(0, limit)
      .map(({ community, matchedInterests }) => ({ ...presentCommunity(community, null, undefined, resolvedUserId), matchedInterests }));
  },

  async get(idOrSlug: string, userId?: string, role?: UserRole) {
    const { community, viewerUserId } = await loadViewableCommunity(idOrSlug, userId, role);
    const prisma = getPrisma();
    const membership = viewerUserId ? await prisma.communityMembership.findUnique({ where: { communityId_userId: { communityId: community.id, userId: viewerUserId } } }) : null;
    const moderatorMemberships = await prisma.communityMembership.findMany({ where: { communityId: community.id, role: { in: ["owner", "moderator"] }, status: "active" }, select: { userId: true } });
    const moderators = moderatorMemberships.length ? await prisma.user.findMany({ where: { id: { in: moderatorMemberships.map((item) => item.userId) } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true } }) : [];
    const presented = presentCommunity(community, membership as MembershipSummary | null, role, viewerUserId);
    const pendingRequestCount = presented.canManage ? await prisma.communityMembership.count({ where: { communityId: community.id, status: "pending" } }) : undefined;
    return { ...presented, pendingRequestCount, moderators: moderators.map((moderator) => ({ id: publicDatabaseId(moderator), fullName: moderator.fullName, avatarUrl: moderator.avatarUrl ?? undefined })) };
  },

  /** Owner or admin edits content fields. Status changes go through `setStatus`/`review`. */
  async update(communityId: string, input: Partial<CommunityContent>, actorId: string, actorRole?: UserRole) {
    const [id, actorUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(actorId)]);
    const current = await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { ownerId: true, status: true, name: true } });
    const admin = actorRole === "admin";
    if (!admin && current.ownerId !== actorUserId) throw AppError.forbidden("Only the community owner or an administrator can edit this community");
    if (current.status === "ARCHIVED" && !admin) throw AppError.conflict("Archived communities are read-only");
    if (input.name && input.name.trim() !== current.name) await assertNameAvailable(input.name, id);
    await getPrisma().community.update({ where: { id }, data: input });
    await auditService.log("community.updated", { userId: actorId, targetTableName: "communities", targetRecordId: id, details: { fields: Object.keys(input) } });
    return this.get(id, actorId, actorRole);
  },

  /** Admin-only archive / restore of a live community. */
  async setStatus(communityId: string, status: "ACTIVE" | "ARCHIVED", actorId: string, actorRole?: UserRole) {
    if (actorRole !== "admin") throw AppError.forbidden("Only administrators can archive or restore research communities");
    const id = await resolveCommunityId(communityId);
    const current = await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (OWNER_ONLY_STATUSES.includes(current.status)) throw AppError.conflict("Use the review endpoint to approve or reject a proposed community");
    await getPrisma().community.update({ where: { id }, data: { status } });
    await auditService.log("community.status_changed", { userId: actorId, targetTableName: "communities", targetRecordId: id, details: { from: current.status, to: status } });
    return this.get(id, actorId, actorRole);
  },

  async review(communityId: string, input: { decision: "approve" | "reject"; note?: string }, actorId: string, actorRole?: UserRole) {
    if (actorRole !== "admin") throw AppError.forbidden("Only administrators can review community proposals");
    const [id, reviewerId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(actorId)]);
    const nextStatus = input.decision === "approve" ? "ACTIVE" : "REJECTED";
    const changed = await getPrisma().community.updateMany({
      where: { id, status: REVIEW_PENDING_STATUS },
      data: { status: nextStatus, reviewNote: input.note ?? null, reviewedById: reviewerId, reviewedAt: new Date() },
    });
    if (!changed.count) throw AppError.conflict("Only communities pending approval can be reviewed");
    await auditService.log(input.decision === "approve" ? "community.approved" : "community.rejected", { userId: actorId, targetTableName: "communities", targetRecordId: id, details: { note: input.note } });
    const reviewed = await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { name: true, ownerId: true } });
    const approved = input.decision === "approve";
    await notifySafely({
      userId: reviewed.ownerId,
      title: approved ? "Community approved" : "Community proposal rejected",
      message: approved ? `“${reviewed.name}” is now live.` : `“${reviewed.name}” was not approved.${input.note ? ` Reviewer note: ${input.note}` : ""}`,
      type: approved ? "COMMUNITY_APPROVED" : "COMMUNITY_REJECTED",
      targetKind: "community",
      targetId: id,
    });
    return this.get(id, actorId, actorRole);
  },

  /** The owner revises a REJECTED proposal and sends it back to the review queue. */
  async resubmit(communityId: string, actorId: string, actorRole?: UserRole) {
    const [id, actorUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(actorId)]);
    const community = await getPrisma().community.findUniqueOrThrow({ where: { id } });
    if (community.ownerId !== actorUserId) throw AppError.forbidden("Only the community owner can resubmit a proposal");
    if (community.status !== "REJECTED") throw AppError.conflict("Only rejected proposals can be resubmitted");
    await assertProposalQuota(actorUserId);
    await assertNameAvailable(community.name, id);
    const changed = await getPrisma().community.updateMany({
      where: { id, status: "REJECTED", ownerId: actorUserId },
      data: { status: REVIEW_PENDING_STATUS, reviewNote: null, reviewedById: null, reviewedAt: null },
    });
    if (!changed.count) throw AppError.conflict("This proposal can no longer be resubmitted");
    await auditService.log("community.resubmitted", { userId: actorId, targetTableName: "communities", targetRecordId: id });
    await notifySafely({ role: "admin", title: "Community proposal resubmitted", message: `“${community.name}” was revised and is waiting for approval.`, type: "COMMUNITY_PROPOSED", targetKind: "community", targetId: id });
    return this.get(id, actorId, actorRole);
  },

  async transferOwnership(communityId: string, targetUserId: string, actorId: string, actorRole?: UserRole) {
    const [id, targetId, actorUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(targetUserId), resolveUserId(actorId)]);
    const admin = actorRole === "admin";
    const name = await getPrisma().$transaction(async (tx) => {
      await lockCommunity(tx, id);
      const community = await tx.community.findUniqueOrThrow({ where: { id } });
      if (!admin && community.ownerId !== actorUserId) throw AppError.forbidden("Only the community owner or an administrator can transfer ownership");
      if (community.status !== "ACTIVE") throw AppError.conflict("Ownership can only be transferred for active communities");
      if (community.ownerId === targetId) throw AppError.badRequest("This member already owns the community");
      const target = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: targetId } } });
      if (target?.status !== "active") throw AppError.conflict("The new owner must be an active member of the community");
      // Demote first: a partial unique index allows only one owner row per community.
      await tx.communityMembership.updateMany({ where: { communityId: id, role: "owner" }, data: { role: "moderator" } });
      await tx.communityMembership.update({ where: { id: target.id }, data: { role: "owner" } });
      await tx.community.update({ where: { id }, data: { ownerId: targetId } });
      return community.name;
    });
    await auditService.log("community.ownership_transferred", { userId: actorId, targetTableName: "communities", targetRecordId: id, details: { newOwnerId: targetId } });
    await notifySafely({ userId: targetId, title: "You now own a community", message: `You are the new owner of “${name}”.`, type: "COMMUNITY_OWNERSHIP_TRANSFERRED", targetKind: "community", targetId: id });
    return this.get(id, actorId, actorRole);
  },

  async join(communityId: string, userId: string) {
    const [id, resolvedUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(userId)]);
    const { membership, previousStatus, communityName } = await getPrisma().$transaction(async (tx) => {
      await lockCommunity(tx, id);
      const community = await tx.community.findUniqueOrThrow({ where: { id } });
      if (community.status !== "ACTIVE") throw AppError.conflict("Only active communities can accept new members");
      const existing = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: resolvedUserId } } });
      if (existing?.status === "banned") throw AppError.forbidden("You are banned from this community");
      // Joining never downgrades someone who is already an active member.
      if (existing?.status === "active") return { membership: existing, previousStatus: existing.status, communityName: community.name };
      const status = community.visibility === "public" ? "active" : "pending";
      const saved = await tx.communityMembership.upsert({
        where: { communityId_userId: { communityId: id, userId: resolvedUserId } },
        create: { communityId: id, userId: resolvedUserId, role: "member", status },
        update: { status },
      });
      await syncMemberCount(tx, id);
      return { membership: saved, previousStatus: existing?.status, communityName: community.name };
    });
    if (membership.status === "pending" && previousStatus !== "pending") await this.notifyJoinRequest(id, communityName);
    if (previousStatus !== "active") {
      await auditService.log("community.joined", { userId, targetTableName: "community_memberships", targetRecordId: membership.id, details: { communityId: id, status: membership.status } });
    }
    return { role: membership.role, status: membership.status };
  },

  /** Tells the owner and moderators that someone asked to join a private community. */
  async notifyJoinRequest(communityId: string, communityName: string) {
    const managers = await getPrisma().communityMembership.findMany({ where: { communityId, status: "active", role: { in: ["owner", "moderator"] } }, select: { userId: true } });
    await Promise.all(managers.map((manager) => notifySafely({
      userId: manager.userId,
      title: "New join request",
      message: `Someone asked to join “${communityName}”.`,
      type: "COMMUNITY_JOIN_REQUEST",
      targetKind: "community",
      targetId: communityId,
    })));
  },

  async leave(communityId: string, userId: string) {
    const [id, resolvedUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(userId)]);
    const removed = await getPrisma().$transaction(async (tx) => {
      await lockCommunity(tx, id);
      const membership = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: resolvedUserId } } });
      if (!membership) return null;
      if (membership.role === "owner") throw AppError.conflict("Transfer ownership to another member before leaving this community");
      await tx.communityMembership.delete({ where: { id: membership.id } });
      await syncMemberCount(tx, id);
      return membership;
    });
    if (!removed) return;
    await auditService.log("community.left", { userId, targetTableName: "community_memberships", targetRecordId: removed.id, details: { communityId: id } });
  },

  /** Manager view: every membership (including pending requests) with contact details. */
  async listMembers(communityId: string, actorId: string, actorRole?: UserRole) {
    const id = await resolveCommunityId(communityId);
    await assertCommunityModerator(id, actorId, actorRole);
    const memberships = await getPrisma().communityMembership.findMany({ where: { communityId: id }, orderBy: [{ createdAt: "asc" }] });
    const users = await getPrisma().user.findMany({ where: { id: { in: memberships.map((membership) => membership.userId) } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true, role: true, institution: true } });
    const byId = new Map(users.map((user) => [user.id, { ...user, id: publicDatabaseId(user), _id: publicDatabaseId(user) }]));
    return memberships
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
      .map((membership) => ({ ...membership, id: publicDatabaseId(membership), _id: publicDatabaseId(membership), userId: byId.get(membership.userId) }));
  },

  /** Member-facing roster: active members only, no email addresses. */
  async publicMembers(communityId: string, userId?: string, role?: UserRole) {
    const { community, viewerUserId } = await loadViewableCommunity(communityId, userId, role);
    if (community.visibility === "private" && role !== "admin") {
      const viewer = viewerUserId
        ? await getPrisma().communityMembership.findUnique({ where: { communityId_userId: { communityId: community.id, userId: viewerUserId } } })
        : null;
      if (viewer?.status !== "active") throw AppError.forbidden("This community is private");
    }
    const memberships = await getPrisma().communityMembership.findMany({ where: { communityId: community.id, status: "active" }, orderBy: [{ joinedAt: "asc" }], take: 200 });
    const users = await getPrisma().user.findMany({ where: { id: { in: memberships.map((membership) => membership.userId) } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, institution: true } });
    const byId = new Map(users.map((user) => [user.id, user]));
    return memberships
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
      .flatMap((membership) => {
        const user = byId.get(membership.userId);
        if (!user) return [];
        return [{ id: publicDatabaseId(user), fullName: user.fullName, avatarUrl: user.avatarUrl ?? undefined, institution: user.institution ?? undefined, role: membership.role, joinedAt: membership.joinedAt }];
      });
  },

  async updateMember(communityId: string, targetUserId: string, input: { role?: "moderator" | "member"; status?: MemberStatus }, actorId: string, actorRole?: UserRole) {
    const [id, resolvedTargetId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(targetUserId)]);
    const actorMembership = await assertCommunityModerator(id, actorId, actorRole);
    const { updated, target, communityName } = await getPrisma().$transaction(async (tx) => {
      await lockCommunity(tx, id);
      const membership = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: resolvedTargetId } } });
      if (!membership) throw AppError.notFound("Community membership not found");
      if (membership.role === "owner") throw AppError.badRequest("The owner membership cannot be changed here");
      // Only the owner (or an admin, who counts as owner) appoints and removes moderators.
      if (input.role !== undefined && actorMembership.role !== "owner") throw AppError.forbidden("Only the community owner or an administrator can assign or remove moderators");
      if (actorMembership.role === "moderator" && membership.role !== "member") throw AppError.forbidden("Community moderators can only manage regular members");
      const nextStatus = input.status ?? membership.status;
      if (input.role === "moderator" && nextStatus !== "active") throw AppError.badRequest("Only active members can become moderators");
      const result = await tx.communityMembership.update({ where: { id: membership.id }, data: input });
      await syncMemberCount(tx, id);
      const community = await tx.community.findUniqueOrThrow({ where: { id }, select: { name: true } });
      return { updated: result, target: membership, communityName: community.name };
    });
    await auditService.log("community.member.updated", { userId: actorId, targetTableName: "community_memberships", targetRecordId: target.id, details: input });
    if (input.status && input.status !== target.status && ["active", "declined", "banned"].includes(input.status)) {
      const copy = {
        active: { title: "Community request approved", message: `You can now take part in “${communityName}”.`, type: "COMMUNITY_MEMBER_APPROVED" },
        declined: { title: "Community request declined", message: `Your request to join “${communityName}” was declined.`, type: "COMMUNITY_MEMBER_DECLINED" },
        banned: { title: "Removed from a community", message: `You were banned from “${communityName}”.`, type: "COMMUNITY_MEMBER_BANNED" },
      }[input.status as "active" | "declined" | "banned"];
      await notifySafely({ userId: resolvedTargetId, ...copy, targetKind: "community", targetId: id });
    }
    return updated;
  },
};
