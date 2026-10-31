import { randomBytes } from "node:crypto";
import type { Community, CommunityRecommendation, CommunityStatus as SharedCommunityStatus, CommunitySuggestion, UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { Prisma } from "../../generated/prisma/client.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
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
import { enqueueCommunityEmbedding, nearestCommunityIds } from "./community-embedding.service.js";
import type { CommunityListQuery } from "./dto/community.schema.js";

type CommunityContent = {
  name: string;
  description?: string;
  rules?: string[];
  researchTopics?: string[];
  researchField?: string;
  icon?: string;
};
export type CommunityStatus = "ACTIVE" | "ARCHIVED" | "PENDING_APPROVAL" | "REJECTED";
type MemberStatus = "active" | "banned";
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
/** Edits to these fields change what a community is "about", so its embedding must be recomputed. */
const EMBEDDED_FIELDS = ["name", "description", "researchField", "researchTopics"] as const;

/** Embeds free text for a semantic lookup; null when the provider fails so callers can degrade gracefully. */
async function embedQuerySafely(text: string): Promise<number[] | null> {
  try {
    return await getEmbeddingProvider().embed(text);
  } catch (error) {
    logger.warn({ error }, "community query embedding failed; skipping semantic matching");
    return null;
  }
}

/**
 * Admins see everything. Everyone else sees every ACTIVE or ARCHIVED community (all research communities are
 * public; archived ones stay readable) and their own pending/rejected proposals.
 */
function visibleWhere(role: UserRole | undefined, viewerUserId: string | undefined) {
  if (role === "admin") return { isForumCategory: false };
  return {
    isForumCategory: false,
    OR: [
      { status: { in: ["ACTIVE", "ARCHIVED"] } },
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

/**
 * Upserts an `active` membership and refreshes the member count. The CALLER must already hold the community row
 * lock (`lockCommunity`, or `SELECT ... FOR UPDATE` on the row) and has checked that the community is joinable.
 * Banned users are refused; an existing active membership (any role) is returned untouched.
 */
export async function joinInTx(tx: Tx, communityId: string, userId: string) {
  const existing = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId, userId } } });
  if (existing?.status === "banned") throw AppError.forbidden("You are banned from this community");
  if (existing?.status === "active") return { membership: existing, previousStatus: existing.status };
  const membership = await tx.communityMembership.upsert({
    where: { communityId_userId: { communityId, userId } },
    create: { communityId, userId, role: "member", status: "active" },
    update: { status: "active" },
  });
  await syncMemberCount(tx, communityId);
  return { membership, previousStatus: existing?.status };
}

/** Serializes name checks so two requests cannot both pass `assertNameAvailable` for the same name. Held until the transaction ends. */
async function lockNaming(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('communities:name'))`;
}

/** Serializes one proposer's quota check against their other concurrent proposals. Always take `lockNaming` first. */
async function lockProposer(tx: Tx, ownerId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('communities:proposer:' || ${ownerId}::text))`;
}

/**
 * Turns a violation of the `communities_active_name_key` unique index (a race the advisory lock missed, or a
 * writer that bypassed it) into the same 409 as `assertNameAvailable`. Anything else is rethrown untouched.
 */
export function translateNameConflict(error: unknown): never {
  const detail = error instanceof Error ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? {})} ${String((error as { cause?: unknown }).cause ?? "")}` : "";
  if (detail.includes("communities_active_name_key")) throw AppError.conflict("A community with this name already exists");
  throw error;
}

/** Names must be unique (ignoring case, accents and spacing) among live and pending communities. Mirrors the `communities_active_name_key` index. */
async function assertNameAvailable(name: string, excludeId?: string, db: Tx = getPrisma()): Promise<void> {
  const rows = await db.$queryRaw<Array<{ id: string; slug: string; name: string }>>(Prisma.sql`
    SELECT "id", "slug", "name" FROM "communities"
    WHERE "status" IN (${Prisma.join(PROPOSAL_STATUSES)})
      AND regexp_replace(lower("immutable_unaccent"(btrim("name"))), '\\s+', ' ', 'g') = regexp_replace(lower("immutable_unaccent"(btrim(${name}::text))), '\\s+', ' ', 'g')
      ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}::uuid` : Prisma.empty}
    LIMIT 1`);
  const existing = rows[0];
  if (existing) throw AppError.conflict("A community with this name already exists", { existing: { id: existing.id, slug: existing.slug, name: existing.name } });
}

async function assertProposalQuota(ownerId: string, db: Tx = getPrisma()): Promise<void> {
  const pending = await db.community.count({ where: { ownerId, status: REVIEW_PENDING_STATUS } });
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
  return (OWNER_ONLY_STATUSES.includes(community.status) && community.ownerId !== viewerUserId);
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

const COMMUNITY_STATUS_VALUES: readonly SharedCommunityStatus[] = ["ACTIVE", "ARCHIVED", "PENDING_APPROVAL", "REJECTED"];

/** Unknown DB values fail closed: read-only ARCHIVED, never ACTIVE (joinable/postable). */
export function narrowStatus(value: string): SharedCommunityStatus {
  const known = COMMUNITY_STATUS_VALUES.find((status) => status === value);
  if (known) return known;
  logger.warn({ status: value }, "unknown community status; presenting as ARCHIVED");
  return "ARCHIVED";
}

/** Unknown DB values fail closed: anything other than "public" is treated as private. */
export function narrowVisibility(value: string): "public" | "private" {
  if (value === "public") return "public";
  if (value !== "private") logger.warn({ visibility: value }, "unknown community visibility; treating as private");
  return "private";
}

function presentCommunity(community: {
  id: string; legacyMongoId: string | null; name: string; slug: string; description: string;
  researchTopics: string[]; researchField: string | null; icon: string | null; status: string;
  rules: string[]; memberCount: number; threadCount: number;
  ownerId: string; reviewNote: string | null; reviewedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}, membership?: MembershipSummary | null, actorRole?: UserRole, viewerUserId?: string): Community {
  const activeMembership = membership?.status === "active";
  const isAdmin = actorRole === "admin";
  const isOwner = viewerUserId !== undefined && viewerUserId === community.ownerId;
  return {
    id: publicDatabaseId(community), name: community.name, slug: community.slug,
    description: community.description, researchTopics: community.researchTopics, researchField: community.researchField ?? undefined, icon: community.icon ?? undefined,
    status: narrowStatus(community.status), rules: community.rules, memberCount: community.memberCount, threadCount: community.threadCount,
    viewerMembership: membership ? { role: membership.role, status: membership.status } : undefined,
    canManage: isAdmin || Boolean(activeMembership && ["owner", "moderator"].includes(membership!.role)),
    canEditCommunity: isAdmin || isOwner,
    isOwner,
    isAdmin,
    reviewNote: isAdmin || isOwner ? community.reviewNote ?? undefined : undefined,
    reviewedAt: isAdmin || isOwner ? community.reviewedAt?.toISOString() : undefined,
    createdAt: community.createdAt.toISOString(), updatedAt: community.updatedAt.toISOString(),
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
    }
    const slugBase = slugify(input.name);
    if (!slugBase) throw AppError.badRequest("Community name must contain letters or numbers");
    const slug = `${slugBase}-${randomBytes(3).toString("hex")}`;
    const community = await getPrisma().$transaction(async (tx) => {
      // Check and write under the same locks, otherwise concurrent requests all pass the check.
      await lockNaming(tx);
      if (!isCommunityAdmin(actor)) {
        await lockProposer(tx, ownerId);
        await assertProposalQuota(ownerId, tx);
      }
      await assertNameAvailable(input.name, undefined, tx);
      const created = await tx.community.create({ data: { ...input, slug, ownerId, memberCount: 1, status: initialCommunityStatus(actor) } });
      await tx.communityMembership.create({ data: { communityId: created.id, userId: ownerId, role: "owner", status: "active" } });
      return created;
    }).catch(translateNameConflict);
    await auditService.log("community.created", { userId: actor.sub, targetTableName: "communities", targetRecordId: community.id, details: { status: community.status } });
    if (community.status === "ACTIVE") enqueueCommunityEmbedding();
    if (community.status === REVIEW_PENDING_STATUS) {
      await notifySafely({ role: "admin", title: "New community proposal", message: `“${community.name}” is waiting for approval.`, type: "COMMUNITY_PROPOSED", targetKind: "community", targetId: community.id });
    }
    return presentCommunity(community, { role: "owner", status: "active" }, actor.role, ownerId);
  },

  async list(userId: string | undefined, query: CommunityListQuery, role?: UserRole) {
    const prisma = getPrisma();
    const { page, pageSize, status, q, field, sort, scope, activeOnly } = query;
    const resolvedUserId = userId ? await resolveUserId(userId) : undefined;
    const conditions: object[] = [visibleWhere(role, resolvedUserId)];
    if (status) conditions.push({ status });
    // The directory hides archived communities unless asked for explicitly; "mine" keeps showing them.
    else if (scope !== "mine") conditions.push({ status: { not: "ARCHIVED" } });
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
    // Admins reviewing proposals see who is asking: name, academic profile type and verification status.
    const proposers = new Map<string, { id: string; fullName: string; academicProfileType?: string; roleVerificationStatus?: string }>();
    if (role === "admin" && status === "PENDING_APPROVAL" && communities.length > 0) {
      const owners = await prisma.user.findMany({ where: { id: { in: communities.map((item) => item.ownerId) } }, select: { id: true, legacyMongoId: true, fullName: true, academicProfileType: true } });
      const profiles = await prisma.academicProfile.findMany({ where: { userId: { in: owners.map((owner) => owner.id) } }, select: { userId: true, roleVerificationStatus: true } });
      const statusByUser = new Map(profiles.map((profile) => [profile.userId, profile.roleVerificationStatus]));
      for (const owner of owners) proposers.set(owner.id, { id: publicDatabaseId(owner), fullName: owner.fullName, academicProfileType: owner.academicProfileType ?? undefined, roleVerificationStatus: statusByUser.get(owner.id) ?? undefined });
    }
    return { data: communities.map((community) => ({ ...presentCommunity(community, byCommunity.get(community.id), role, resolvedUserId), ...(proposers.has(community.ownerId) ? { proposer: proposers.get(community.ownerId) } : {}) })), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  /** Research-field chips for the list filter, counted over what the viewer can see. */
  async facets(userId: string | undefined, role?: UserRole) {
    const resolvedUserId = userId ? await resolveUserId(userId) : undefined;
    const groups = await getPrisma().community.groupBy({
      by: ["researchField"],
      where: { AND: [visibleWhere(role, resolvedUserId), { status: "ACTIVE" }, { researchField: { not: null } }] },
      _count: { _all: true },
    });
    // `list` filters case-insensitively, so "AI" and "ai" must be one chip. Show the most common spelling.
    const merged = new Map<string, { total: number; best: { name: string; count: number } }>();
    for (const group of groups) {
      if (!group.researchField) continue;
      const count = group._count._all;
      const key = group.researchField.toLowerCase();
      const entry = merged.get(key);
      if (!entry) { merged.set(key, { total: count, best: { name: group.researchField, count } }); continue; }
      entry.total += count;
      if (count > entry.best.count || (count === entry.best.count && group.researchField.localeCompare(entry.best.name) < 0)) entry.best = { name: group.researchField, count };
    }
    return [...merged.values()]
      .map((entry) => ({ name: entry.best.name, count: entry.total }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 30);
  },

  /** Suggests ACTIVE communities whose topics overlap the viewer's research interests, then fills up with semantic neighbours. */
  async recommend(userId: string, limit = 6): Promise<CommunityRecommendation[]> {
    const resolvedUserId = await resolveUserId(userId);
    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: resolvedUserId }, select: { researchInterests: true } });
    const interests = prepareInterests(user.researchInterests);
    if (interests.length === 0) return [];
    const [joined, candidates] = await Promise.all([
      prisma.communityMembership.findMany({ where: { userId: resolvedUserId }, select: { communityId: true } }),
      prisma.community.findMany({ where: { status: "ACTIVE", isForumCategory: false }, orderBy: [{ memberCount: "desc" }, { id: "asc" }], take: 300 }),
    ]);
    const excluded = new Set(joined.map((row) => row.communityId));
    const topicMatches = candidates
      .filter((community) => !excluded.has(community.id))
      .map((community) => ({ community, matchedInterests: matchInterests(interests, community) }))
      .filter((entry) => entry.matchedInterests.length > 0)
      .sort((a, b) => b.matchedInterests.length - a.matchedInterests.length || b.community.memberCount - a.community.memberCount)
      .slice(0, limit);
    const byTopic = topicMatches.map(({ community, matchedInterests }) => ({
      ...presentCommunity(community, null, undefined, resolvedUserId),
      matchedInterests,
      matchReason: "topic" as const,
    }));
    if (byTopic.length >= limit) return byTopic;

    // Not enough string matches: fill the rest with communities close in meaning to the interests.
    const vector = await embedQuerySafely(interests.join(", "));
    if (!vector) return byTopic;
    const matchedIds = topicMatches.map((entry) => entry.community.id);
    const nearest = await nearestCommunityIds(vector, {
      limit: limit - byTopic.length,
      excludeIds: [...excluded, ...matchedIds],
    });
    if (nearest.length === 0) return byTopic;
    const similarityById = new Map(nearest.map((row) => [row.id, row.similarity]));
    const rows = await prisma.community.findMany({ where: { id: { in: nearest.map((row) => row.id) }, status: "ACTIVE", isForumCategory: false } });
    const semantic = rows
      .sort((a, b) => (similarityById.get(b.id) ?? 0) - (similarityById.get(a.id) ?? 0))
      .map((community) => ({
        ...presentCommunity(community, null, undefined, resolvedUserId),
        matchedInterests: [] as string[],
        matchReason: "semantic" as const,
        similarity: Math.round((similarityById.get(community.id) ?? 0) * 100) / 100,
      }));
    return [...byTopic, ...semantic];
  },

  /** Semantic "did you mean" for a free-text query; empty when nothing is close or embedding is unavailable. */
  async suggest(q: string, userId?: string, role?: UserRole, limit = 5): Promise<CommunitySuggestion[]> {
    const resolvedUserId = userId ? await resolveUserId(userId) : undefined;
    const vector = await embedQuerySafely(q);
    if (!vector) return [];
    const nearest = await nearestCommunityIds(vector, { limit });
    if (nearest.length === 0) return [];
    const similarityById = new Map(nearest.map((row) => [row.id, row.similarity]));
    // `nearestCommunityIds` only returns ACTIVE communities; re-applying the viewer rules is defence in depth.
    const communities = await getPrisma().community.findMany({ where: { AND: [visibleWhere(role, resolvedUserId), { status: "ACTIVE" }, { id: { in: nearest.map((row) => row.id) } }] } });
    const memberships = resolvedUserId && communities.length > 0
      ? await getPrisma().communityMembership.findMany({ where: { userId: resolvedUserId, communityId: { in: communities.map((item) => item.id) } } })
      : [];
    const byCommunity = new Map(memberships.map((item) => [item.communityId, item as MembershipSummary]));
    return communities
      .sort((a, b) => (similarityById.get(b.id) ?? 0) - (similarityById.get(a.id) ?? 0))
      .map((community) => ({
        ...presentCommunity(community, byCommunity.get(community.id), role, resolvedUserId),
        similarity: Math.round((similarityById.get(community.id) ?? 0) * 100) / 100,
      }));
  },

  async get(idOrSlug: string, userId?: string, role?: UserRole) {
    const { community, viewerUserId } = await loadViewableCommunity(idOrSlug, userId, role);
    const prisma = getPrisma();
    const membership = viewerUserId ? await prisma.communityMembership.findUnique({ where: { communityId_userId: { communityId: community.id, userId: viewerUserId } } }) : null;
    const presented = presentCommunity(community, membership as MembershipSummary | null, role, viewerUserId);
    const moderatorMemberships = await prisma.communityMembership.findMany({ where: { communityId: community.id, role: { in: ["owner", "moderator"] }, status: "active" }, select: { userId: true } });
    const moderators = moderatorMemberships.length ? await prisma.user.findMany({ where: { id: { in: moderatorMemberships.map((item) => item.userId) } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true } }) : [];
    return { ...presented, moderators: moderators.map((moderator) => ({ id: publicDatabaseId(moderator), fullName: moderator.fullName, avatarUrl: moderator.avatarUrl ?? undefined })) };
  },

  /** Owner or admin edits content fields. Status changes go through `setStatus`/`review`. */
  async update(communityId: string, input: Partial<CommunityContent>, actorId: string, actorRole?: UserRole) {
    const [id, actorUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(actorId)]);
    const current = await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { ownerId: true, status: true, name: true, isForumCategory: true } });
    if (current.isForumCategory) throw AppError.forbidden("Use forum category administration to manage this category");
    const admin = actorRole === "admin";
    if (!admin && current.ownerId !== actorUserId) throw AppError.forbidden("Only the community owner or an administrator can edit this community");
    if (current.status === "ARCHIVED" && !admin) throw AppError.conflict("Archived communities are read-only");
    const renaming = Boolean(input.name && input.name.trim() !== current.name);
    const contentChanged = EMBEDDED_FIELDS.some((field) => input[field] !== undefined);
    await getPrisma().$transaction(async (tx) => {
      if (renaming) {
        await lockNaming(tx);
        await assertNameAvailable(input.name!, id, tx);
      }
      await tx.community.update({ where: { id }, data: input });
      // Invalidate the stale vector in the same transaction; the worker recomputes it.
      if (contentChanged) await tx.$executeRaw`UPDATE "communities" SET "embedding" = NULL, "embedding_updated_at" = NULL WHERE "id" = ${id}::uuid`;
    }).catch(translateNameConflict);
    if (contentChanged) enqueueCommunityEmbedding();
    await auditService.log("community.updated", { userId: actorId, targetTableName: "communities", targetRecordId: id, details: { fields: Object.keys(input) } });
    return this.get(id, actorId, actorRole);
  },

  /** Admin-only archive / restore of a live community. */
  async setStatus(communityId: string, status: "ACTIVE" | "ARCHIVED", actorId: string, actorRole?: UserRole) {
    if (actorRole !== "admin") throw AppError.forbidden("Only administrators can archive or restore research communities");
    const id = await resolveCommunityId(communityId);
    const current = await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { status: true, name: true, isForumCategory: true } });
    if (current.isForumCategory) throw AppError.forbidden("Use forum category administration to manage this category");
    if (OWNER_ONLY_STATUSES.includes(current.status)) throw AppError.conflict("Use the review endpoint to approve or reject a proposed community");
    await getPrisma().$transaction(async (tx) => {
      // The name may have been reused while this community was archived.
      if (status === "ACTIVE") {
        await lockNaming(tx);
        await assertNameAvailable(current.name, id, tx);
      }
      await tx.community.update({ where: { id }, data: { status } });
    }).catch(translateNameConflict);
    if (status === "ACTIVE") enqueueCommunityEmbedding();
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
    if (input.decision === "approve") enqueueCommunityEmbedding();
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
    if (community.isForumCategory) throw AppError.forbidden("Forum categories do not support community proposals");
    if (community.ownerId !== actorUserId) throw AppError.forbidden("Only the community owner can resubmit a proposal");
    if (community.status !== "REJECTED") throw AppError.conflict("Only rejected proposals can be resubmitted");
    await getPrisma().$transaction(async (tx) => {
      await lockNaming(tx);
      await lockProposer(tx, actorUserId);
      await assertProposalQuota(actorUserId, tx);
      await assertNameAvailable(community.name, id, tx);
      const changed = await tx.community.updateMany({
        where: { id, status: "REJECTED", ownerId: actorUserId },
        data: { status: REVIEW_PENDING_STATUS, reviewNote: null, reviewedById: null, reviewedAt: null },
      });
      if (!changed.count) throw AppError.conflict("This proposal can no longer be resubmitted");
    }).catch(translateNameConflict);
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
      if (community.isForumCategory) throw AppError.forbidden("Forum categories are managed by administrators");
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
    const { membership, previousStatus } = await getPrisma().$transaction(async (tx) => {
      await lockCommunity(tx, id);
      const community = await tx.community.findUniqueOrThrow({ where: { id }, select: { isForumCategory: true, status: true } });
      if (community.isForumCategory) throw AppError.conflict("Forum categories do not require membership");
      if (community.status !== "ACTIVE") throw AppError.conflict("Only active communities can accept new members");
      return joinInTx(tx, id, resolvedUserId);
    });
    if (previousStatus !== "active") {
      await auditService.log("community.joined", { userId, targetTableName: "community_memberships", targetRecordId: membership.id, details: { communityId: id, status: membership.status } });
    }
    return { role: membership.role, status: membership.status };
  },

  async leave(communityId: string, userId: string) {
    const [id, resolvedUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(userId)]);
    const removed = await getPrisma().$transaction(async (tx) => {
      await lockCommunity(tx, id);
      const community = await tx.community.findUniqueOrThrow({ where: { id }, select: { isForumCategory: true } });
      if (community.isForumCategory) throw AppError.conflict("Forum categories do not require membership");
      const membership = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: resolvedUserId } } });
      if (!membership) return null;
      // Deleting a banned row would erase the ban and let the user rejoin.
      if (membership.status === "banned") throw AppError.forbidden("You are banned from this community");
      if (membership.role === "owner") throw AppError.conflict("Transfer ownership to another member before leaving this community");
      await tx.communityMembership.delete({ where: { id: membership.id } });
      await syncMemberCount(tx, id);
      return membership;
    });
    if (!removed) return;
    await auditService.log("community.left", { userId, targetTableName: "community_memberships", targetRecordId: removed.id, details: { communityId: id } });
  },

  /** Manager view: every membership with contact details. */
  async listMembers(communityId: string, actorId: string, actorRole?: UserRole) {
    const id = await resolveCommunityId(communityId);
    await assertCommunityModerator(id, actorId, actorRole);
    const memberships = await getPrisma().communityMembership.findMany({ where: { communityId: id }, orderBy: [{ createdAt: "asc" }] });
    const users = await getPrisma().user.findMany({ where: { id: { in: memberships.map((membership) => membership.userId) } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, avatarUrl: true, role: true, institution: true } });
    const byId = new Map(users.map((user) => [user.id, { ...user, id: publicDatabaseId(user), _id: publicDatabaseId(user) }]));
    const now = new Date();
    const restrictions = await getPrisma().forumRestriction.findMany({
      where: { scope: "COMMUNITY", communityId: id, userId: { in: memberships.map((membership) => membership.userId) }, revokedAt: null, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true, userId: true, restrictionType: true, expiresAt: true },
    });
    return memberships
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
      .map((membership) => ({
        ...membership, id: publicDatabaseId(membership), _id: publicDatabaseId(membership), userId: byId.get(membership.userId),
        restrictions: restrictions.filter((row) => row.userId === membership.userId).map((row) => ({ id: row.id, type: row.restrictionType, expiresAt: row.expiresAt?.toISOString() })),
      }));
  },

  /**
   * Restricts a member from starting threads, replying or posting in THIS research community only, for 1, 7 or 30 days,
   * without going through a report. Owners and moderators may restrict regular members; only the owner (or an admin)
   * may restrict a moderator. The owner and administrators can never be restricted here.
   */
  async restrictMember(communityId: string, targetUserId: string, input: { type: "CREATE_THREAD" | "REPLY" | "POSTING"; durationDays: 1 | 7 | 30; reason: string }, actorId: string, actorRole?: UserRole) {
    const [id, targetId, actorUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(targetUserId), resolveUserId(actorId)]);
    await assertCommunityModerator(id, actorId, actorRole);
    if (targetId === actorUserId) throw AppError.badRequest("You cannot restrict yourself");
    const { restriction, communityName } = await getPrisma().$transaction(async (tx) => {
      await lockCommunity(tx, id);
      // The actor may have been banned or demoted since the check above: use their live role.
      let actorMemberRole: MembershipSummary["role"] = "owner"; // admins act as owner
      if (actorRole !== "admin") {
        const live = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: actorUserId } } });
        if (live?.status !== "active" || !["owner", "moderator"].includes(live.role)) throw AppError.forbidden("Community moderator access is required");
        actorMemberRole = live.role as MembershipSummary["role"];
      }
      const community = await tx.community.findUniqueOrThrow({ where: { id }, select: { name: true, isForumCategory: true, status: true } });
      if (community.isForumCategory) throw AppError.forbidden("Use forum category administration to restrict users in a category");
      if (community.status !== "ACTIVE" && actorRole !== "admin") throw AppError.conflict("Archived communities are read-only");
      const membership = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: targetId } } });
      if (!membership || membership.status !== "active") throw AppError.notFound("Active community member not found");
      if (membership.role === "owner") throw AppError.forbidden("The community owner cannot be restricted");
      if (membership.role === "moderator" && actorMemberRole !== "owner") throw AppError.forbidden("Only the community owner or an administrator can restrict a moderator");
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { systemRole: true } });
      if (!target || target.systemRole !== "USER") throw AppError.forbidden("Administrators cannot be restricted here");
      const now = new Date();
      const duplicate = await tx.forumRestriction.findFirst({
        where: { userId: targetId, scope: "COMMUNITY", communityId: id, restrictionType: input.type, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { id: true },
      });
      if (duplicate) throw AppError.conflict("This member already has an active restriction of this type");
      const created = await tx.forumRestriction.create({
        data: { userId: targetId, scope: "COMMUNITY", communityId: id, restrictionType: input.type, reason: input.reason, createdBy: actorUserId, expiresAt: new Date(now.getTime() + input.durationDays * 86_400_000) },
      });
      return { restriction: created, communityName: community.name };
    });
    await auditService.log("community.member.restricted", { userId: actorId, targetTableName: "forum_restrictions", targetRecordId: restriction.id, details: { communityId: id, memberId: targetId, type: input.type, durationDays: input.durationDays } });
    const until = restriction.expiresAt!.toISOString().slice(0, 10);
    await notifySafely({ userId: targetId, title: "Restricted in a community", message: `You cannot ${input.type === "REPLY" ? "reply" : input.type === "CREATE_THREAD" ? "start discussions" : "post"} in “${communityName}” until ${until}.`, type: "COMMUNITY_MEMBER_RESTRICTED", targetKind: "community", targetId: id });
    return { id: restriction.id, type: restriction.restrictionType, expiresAt: restriction.expiresAt!.toISOString() };
  },

  /** Lifts a restriction early. Same rights as `restrictMember`: moderators lift restrictions on regular members. */
  async liftRestriction(communityId: string, targetUserId: string, restrictionId: string, actorId: string, actorRole?: UserRole) {
    const [id, targetId, actorUserId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(targetUserId), resolveUserId(actorId)]);
    const actorMembership = await assertCommunityModerator(id, actorId, actorRole);
    const existing = await getPrisma().forumRestriction.findFirst({ where: { id: restrictionId, userId: targetId, scope: "COMMUNITY", communityId: id }, select: { id: true, revokedAt: true } });
    if (!existing) throw AppError.notFound("Restriction not found");
    if (actorMembership.role === "moderator") {
      const membership = await getPrisma().communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: targetId } }, select: { role: true } });
      if (membership && membership.role !== "member") throw AppError.forbidden("Only the community owner or an administrator can lift a moderator's restriction");
    }
    const lifted = await getPrisma().forumRestriction.updateMany({ where: { id: existing.id, revokedAt: null }, data: { revokedAt: new Date(), revokedBy: actorUserId } });
    if (!lifted.count) return { id: existing.id, lifted: false };
    await auditService.log("community.member.restriction_lifted", { userId: actorId, targetTableName: "forum_restrictions", targetRecordId: existing.id, details: { communityId: id, memberId: targetId } });
    const community = await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { name: true } });
    await notifySafely({ userId: targetId, title: "Restriction lifted", message: `You can take part in “${community.name}” again.`, type: "COMMUNITY_MEMBER_RESTRICTION_LIFTED", targetKind: "community", targetId: id });
    return { id: existing.id, lifted: true };
  },

  /** Member-facing roster for signed-in users: active members only, no email addresses. */
  /** Owner and moderators always lead page 1 and are not paged; `meta.total` counts regular members only. */
  async publicMembers(communityId: string, userId?: string, role?: UserRole, paging: { page: number; pageSize: number } = { page: 1, pageSize: 50 }) {
    const { community } = await loadViewableCommunity(communityId, userId, role);
    const { page, pageSize } = paging;
    const prisma = getPrisma();
    const regularWhere = { communityId: community.id, status: "active", role: "member" };
    const [staff, regulars, total] = await Promise.all([
      page === 1
        ? prisma.communityMembership.findMany({ where: { communityId: community.id, status: "active", role: { in: ["owner", "moderator"] } }, orderBy: [{ joinedAt: "asc" }, { id: "asc" }] })
        : Promise.resolve([]),
      prisma.communityMembership.findMany({ where: regularWhere, orderBy: [{ joinedAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.communityMembership.count({ where: regularWhere }),
    ]);
    const memberships = [...staff, ...regulars];
    const users = await prisma.user.findMany({ where: { id: { in: memberships.map((membership) => membership.userId) } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, institution: true } });
    const byId = new Map(users.map((user) => [user.id, user]));
    const data = memberships
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
      .flatMap((membership) => {
        const user = byId.get(membership.userId);
        if (!user) return [];
        return [{ id: publicDatabaseId(user), fullName: user.fullName, avatarUrl: user.avatarUrl ?? undefined, institution: user.institution ?? undefined, role: membership.role, joinedAt: membership.joinedAt }];
      });
    return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async updateMember(communityId: string, targetUserId: string, input: { role?: "moderator" | "member"; status?: MemberStatus }, actorId: string, actorRole?: UserRole) {
    const [id, resolvedTargetId] = await Promise.all([resolveCommunityId(communityId), resolveUserId(targetUserId)]);
    // Fail fast outside the transaction; the rights are read again under the lock below.
    await assertCommunityModerator(id, actorId, actorRole);
    const actorUserId = await resolveUserId(actorId);
    const { updated, target, communityName } = await getPrisma().$transaction(async (tx) => {
      await lockCommunity(tx, id);
      // The actor may have been banned or demoted since the check above: use their live role.
      let actorMemberRole: MembershipSummary["role"] = "owner"; // admins act as owner
      if (actorRole !== "admin") {
        const live = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: actorUserId } } });
        if (live?.status !== "active" || !["owner", "moderator"].includes(live.role)) throw AppError.forbidden("Community moderator access is required");
        actorMemberRole = live.role as MembershipSummary["role"];
      }
      const category = await tx.community.findUniqueOrThrow({ where: { id }, select: { isForumCategory: true, status: true } });
      if (category.isForumCategory) throw AppError.forbidden("Use forum category administration to assign moderators");
      if (category.status !== "ACTIVE" && actorRole !== "admin") throw AppError.conflict("Archived communities are read-only");
      const membership = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: id, userId: resolvedTargetId } } });
      if (!membership) throw AppError.notFound("Community membership not found");
      if (membership.role === "owner") throw AppError.badRequest("The owner membership cannot be changed here");
      // Only the owner (or an admin, who counts as owner) appoints and removes moderators.
      if (input.role !== undefined && actorMemberRole !== "owner") throw AppError.forbidden("Only the community owner or an administrator can assign or remove moderators");
      if (actorMemberRole === "moderator" && membership.role !== "member") throw AppError.forbidden("Community moderators can only manage regular members");
      const nextStatus = input.status ?? membership.status;
      if (input.role === "moderator" && nextStatus !== "active") throw AppError.badRequest("Only active members can become moderators");
      const assignmentChanged = input.role !== undefined && input.role !== membership.role;
      const now = new Date();
      const result = await tx.communityMembership.update({ where: { id: membership.id }, data: {
        ...input,
        ...(assignmentChanged && input.role === "moderator" ? { assignedById: actorUserId, assignedAt: now, revokedAt: null } : {}),
        ...(assignmentChanged && input.role === "member" ? { revokedAt: now } : {}),
      } });
      await syncMemberCount(tx, id);
      const community = await tx.community.findUniqueOrThrow({ where: { id }, select: { name: true } });
      return { updated: result, target: membership, communityName: community.name };
    });
    await auditService.log("community.member.updated", { userId: actorId, targetTableName: "community_memberships", targetRecordId: target.id, details: input });
    if (input.status && input.status !== target.status && ["active", "banned"].includes(input.status)) {
      const copy = {
        active: { title: "Community access restored", message: `You can take part in “${communityName}” again.`, type: "COMMUNITY_MEMBER_APPROVED" },
        banned: { title: "Removed from a community", message: `You were banned from “${communityName}”.`, type: "COMMUNITY_MEMBER_BANNED" },
      }[input.status as "active" | "banned"];
      await notifySafely({ userId: resolvedTargetId, ...copy, targetKind: "community", targetId: id });
    }
    if (input.role !== undefined && input.role !== target.role) {
      await auditService.log(input.role === "moderator" ? "ASSIGN_MODERATOR" : "REVOKE_MODERATOR", { userId: actorId, targetTableName: "community_memberships", targetRecordId: target.id, details: { communityId: id, moderatorId: resolvedTargetId } });
    }
    return updated;
  },
};
