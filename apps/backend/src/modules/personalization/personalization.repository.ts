import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { PERSONALIZATION, type SignalKind } from "./personalization.constants.js";
import type { LabeledKey, Signal, WindowStats } from "./personalization.rules.js";
import type { StoredPostTopics } from "./personalization.topics.js";

/**
 * Raw-row fetching for "For you". Only parameterized `Prisma.sql`; every formula lives in the pure modules.
 * No vector columns are selected anywhere.
 */

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

export async function fetchSignals(userId: string, db: Db = getPrisma()): Promise<Signal[]> {
  const rows = await db.$queryRaw<Array<{ post_id: string; kind: SignalKind; at: Date; moderated: boolean }>>(Prisma.sql`
    SELECT s.post_id::text AS post_id, s.kind, s.at, (p."visibility_status" <> 'ACTIVE' OR p."status" = 'hidden') AS moderated
    FROM (
      SELECT "post_id", 'read' AS kind, "viewed_at" AS at FROM "forum_post_views" WHERE "viewer_key" = ${`user:${userId}`}
      UNION ALL SELECT "post_id", 'vote', "updated_at" FROM "forum_votes" WHERE "user_id" = ${userId}::uuid AND "value" > 0 AND "post_id" IS NOT NULL
      UNION ALL SELECT c."post_id", 'vote', v."updated_at" FROM "forum_votes" v JOIN "forum_comments" c ON c."id" = v."comment_id"
        WHERE v."user_id" = ${userId}::uuid AND v."value" > 0
      UNION ALL SELECT r."target_id", 'reaction', r."created_at" FROM "forum_reactions" r WHERE r."user_id" = ${userId}::uuid AND r."target_type" = 'post'
      UNION ALL SELECT c."post_id", 'reaction', r."created_at" FROM "forum_reactions" r JOIN "forum_comments" c ON c."id" = r."target_id"
        WHERE r."user_id" = ${userId}::uuid AND r."target_type" = 'comment'
      UNION ALL SELECT "post_id", 'follow', "created_at" FROM "forum_thread_follows" WHERE "user_id" = ${userId}::uuid
      UNION ALL SELECT "post_id", 'comment', "created_at" FROM "forum_comments"
        WHERE "author_id" = ${userId}::uuid AND (("status" = 'active' AND "visibility_status" = 'ACTIVE') OR "status" = 'deleted')
      UNION ALL SELECT "id", 'authored', "created_at" FROM "forum_posts" WHERE "author_id" = ${userId}::uuid
    ) s JOIN "forum_posts" p ON p."id" = s.post_id`);
  return rows.map((row) => ({ postId: row.post_id, kind: row.kind, at: new Date(row.at), moderated: row.moderated }));
}

/** Posts the user voted on in any direction (a downvote is no interest signal, but the post must not come back). */
export async function fetchVotedPostIds(userId: string, db: Db = getPrisma()): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ post_id: string }>>(Prisma.sql`
    SELECT "post_id"::text AS post_id FROM "forum_votes" WHERE "user_id" = ${userId}::uuid AND "post_id" IS NOT NULL
    UNION SELECT c."post_id"::text FROM "forum_votes" v JOIN "forum_comments" c ON c."id" = v."comment_id" WHERE v."user_id" = ${userId}::uuid`);
  return rows.map((row) => row.post_id);
}

export async function fetchStoredPostTopics(postIds: readonly string[], db: Db = getPrisma()): Promise<Map<string, StoredPostTopics>> {
  const result = new Map<string, StoredPostTopics>();
  if (postIds.length === 0) return result;
  const rows = await db.$queryRaw<Array<{ id: string; topic_keys: string[]; derived_topic_keys: string[]; derived_topic_weights: number[]; community_topics: string[] | null }>>(Prisma.sql`
    SELECT p."id"::text AS id, p."topic_keys", p."derived_topic_keys", p."derived_topic_weights", rc."research_topics" AS community_topics
    FROM "forum_posts" p LEFT JOIN "communities" rc ON rc."id" = p."research_community_id"
    WHERE p."id" = ANY(${postIds as string[]}::uuid[])`);
  for (const row of rows) {
    result.set(row.id, {
      topicKeys: row.topic_keys, derivedTopicKeys: row.derived_topic_keys,
      derivedTopicWeights: row.derived_topic_weights.map(Number), communityTopics: row.community_topics ?? [],
    });
  }
  return result;
}

export async function fetchFollows(userId: string, db: Db = getPrisma()): Promise<LabeledKey[]> {
  const rows = await db.userTopicFollow.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { topicKey: "asc" }], select: { topicKey: true, label: true } });
  return rows.map((row) => ({ key: row.topicKey, label: row.label }));
}

export async function fetchMutes(userId: string, db: Db = getPrisma()): Promise<LabeledKey[]> {
  const rows = await db.userTopicMute.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { topicKey: "asc" }], select: { topicKey: true, label: true } });
  return rows.map((row) => ({ key: row.topicKey, label: row.label }));
}

/** Read only (R1): the academic profile is never written from this module. */
export async function fetchProfileInterests(userId: string, db: Db = getPrisma()): Promise<string[]> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { researchInterests: true } });
  return row?.researchInterests ?? [];
}

/** Public, ACTIVE forum categories: the only categories a post may be shown from. */
async function visibleCategoryIds(db: Db): Promise<string[]> {
  const rows = await db.community.findMany({ where: { isForumCategory: true, visibility: "public", status: "ACTIVE" }, select: { id: true } });
  return rows.map((row) => row.id);
}

/** Research communities (not categories) whose topics may overlap the profile: ACTIVE ones only, archived are frozen. */
export async function fetchResearchCommunityTopics(db: Db = getPrisma()): Promise<Array<{ id: string; researchTopics: string[] }>> {
  return db.community.findMany({ where: { isForumCategory: false, status: "ACTIVE" }, select: { id: true, researchTopics: true } });
}

/** Active memberships of ACTIVE research communities with their topics (R6). Banned, archived and categories give nothing. */
export async function fetchActiveMemberships(userId: string, db: Db = getPrisma()): Promise<Array<{ communityId: string; name: string; joinedAt: Date; researchTopics: string[] }>> {
  const rows = await db.$queryRaw<Array<{ id: string; name: string; joined_at: Date; research_topics: string[] }>>(Prisma.sql`
    SELECT c."id"::text AS id, c."name", m."joined_at", c."research_topics"
    FROM "community_memberships" m JOIN "communities" c ON c."id" = m."community_id"
    WHERE m."user_id" = ${userId}::uuid AND m."status" = 'active' AND c."is_forum_category" = false AND c."status" = 'ACTIVE'`);
  return rows.map((row) => ({ communityId: row.id, name: row.name, joinedAt: new Date(row.joined_at), researchTopics: row.research_topics }));
}

/** Every community the user has a membership row for (active or banned): they are never suggested again. */
export async function fetchMembershipCommunityIds(userId: string, db: Db = getPrisma()): Promise<string[]> {
  const rows = await db.communityMembership.findMany({ where: { userId }, select: { communityId: true } });
  return rows.map((row) => row.communityId);
}

export interface CandidateRow extends WindowStats {
  id: string;
  bucketId: string;
  bucketName: string;
  createdAt: Date;
  lastActivityAt: Date;
  voteScore: number;
  commentCount: number;
  inJoinedCommunity: boolean;
  stored: StoredPostTopics;
}

export interface CandidateQuery {
  userId: string;
  /** The ONE visibility rule, already built by `forumPostVisibilitySql(viewer, "p")`. */
  visibilitySql: Prisma.Sql;
  /** Posts need last_activity_at at or after this. */
  since: Date;
  /** Start of the trending window: readers and repliers are counted from here. */
  windowSince: Date;
  /** Posts the user has any signal on (read, voted, commented, followed, authored). */
  excludePostIds: readonly string[];
  /** When set, only posts whose stored keys or research community overlap. Omit for the trending/new window. */
  overlap?: { keys: readonly string[]; communityIds: readonly string[] };
  limit: number;
}

/**
 * Posts the viewer may be shown: visible, active or locked, not authored by them, no signal from them, not in an
 * archived research community, not in one they are banned from. Window stats (R5) are computed per row:
 * readers = rows of forum_post_views since windowSince; repliers = distinct commenters since windowSince other than
 * the post's author; readerRepliers = repliers whose own view is also in the window.
 */
export async function fetchCandidates(query: CandidateQuery, db: Db = getPrisma()): Promise<CandidateRow[]> {
  const categories = await visibleCategoryIds(db);
  const overlap = query.overlap
    ? Prisma.sql`AND (p."topic_keys" && ${query.overlap.keys as string[]}::text[] OR p."derived_topic_keys" && ${query.overlap.keys as string[]}::text[]
        OR p."research_community_id" = ANY(${query.overlap.communityIds as string[]}::uuid[]))`
    : Prisma.empty;
  const rows = await db.$queryRaw<Array<{
    id: string; bucket_id: string | null; bucket_name: string | null; created_at: Date; last_activity_at: Date; vote_score: number; comment_count: number;
    readers: number; repliers: number; reader_repliers: number; in_joined: boolean;
    topic_keys: string[]; derived_topic_keys: string[]; derived_topic_weights: number[]; community_topics: string[] | null;
  }>>(Prisma.sql`
    SELECT p."id"::text AS id, COALESCE(p."research_community_id", p."community_id")::text AS bucket_id,
      COALESCE(rc."name", cat."name") AS bucket_name, p."created_at", p."last_activity_at", p."vote_score", p."comment_count",
      p."topic_keys", p."derived_topic_keys", p."derived_topic_weights", rc."research_topics" AS community_topics,
      (SELECT count(*) FROM "forum_post_views" v WHERE v."post_id" = p."id" AND v."viewed_at" >= ${query.windowSince})::int AS readers,
      (SELECT count(DISTINCT c."author_id") FROM "forum_comments" c WHERE c."post_id" = p."id" AND c."status" = 'active'
         AND c."visibility_status" = 'ACTIVE' AND c."created_at" >= ${query.windowSince} AND c."author_id" <> p."author_id")::int AS repliers,
      (SELECT count(DISTINCT c."author_id") FROM "forum_comments" c WHERE c."post_id" = p."id" AND c."status" = 'active'
         AND c."visibility_status" = 'ACTIVE' AND c."created_at" >= ${query.windowSince} AND c."author_id" <> p."author_id"
         AND EXISTS (SELECT 1 FROM "forum_post_views" v WHERE v."post_id" = p."id" AND v."viewed_at" >= ${query.windowSince}
           AND v."viewer_key" = 'user:' || c."author_id"::text))::int AS reader_repliers,
      EXISTS (SELECT 1 FROM "community_memberships" m WHERE m."community_id" = p."research_community_id"
         AND m."user_id" = ${query.userId}::uuid AND m."status" = 'active') AS in_joined
    FROM "forum_posts" p
    LEFT JOIN "communities" rc ON rc."id" = p."research_community_id"
    LEFT JOIN "communities" cat ON cat."id" = p."community_id"
    WHERE ${query.visibilitySql}
      AND p."status" IN ('active', 'locked') AND p."visibility_status" = 'ACTIVE'
      AND p."author_id" <> ${query.userId}::uuid
      AND p."last_activity_at" >= ${query.since}
      AND (p."community_id" IS NULL OR p."community_id" = ANY(${categories}::uuid[]))
      AND (rc."id" IS NULL OR rc."status" <> 'ARCHIVED')
      AND NOT (p."id" = ANY(${query.excludePostIds as string[]}::uuid[]))
      AND NOT EXISTS (SELECT 1 FROM "community_memberships" m WHERE m."community_id" = p."research_community_id"
            AND m."user_id" = ${query.userId}::uuid AND m."status" = 'banned')
      ${overlap}
    ORDER BY p."last_activity_at" DESC, p."id" ASC
    LIMIT ${query.limit}::int`);
  return rows.map((row) => ({
    id: row.id, bucketId: row.bucket_id ?? row.id, bucketName: row.bucket_name ?? "", createdAt: new Date(row.created_at),
    lastActivityAt: new Date(row.last_activity_at), voteScore: Number(row.vote_score), commentCount: Number(row.comment_count),
    readers: Number(row.readers), repliers: Number(row.repliers), readerRepliers: Number(row.reader_repliers), inJoinedCommunity: row.in_joined,
    stored: {
      topicKeys: row.topic_keys, derivedTopicKeys: row.derived_topic_keys, derivedTopicWeights: row.derived_topic_weights.map(Number),
      communityTopics: row.community_topics ?? [],
    },
  }));
}

/** Posts anyone can see with activity in the trending window, with their window stats (papers fallback). */
export async function fetchTrendingWindowPosts(visibilitySql: Prisma.Sql, since: Date, db: Db = getPrisma()): Promise<CandidateRow[]> {
  return fetchCandidates({
    userId: "00000000-0000-0000-0000-000000000000", visibilitySql, since, windowSince: since, excludePostIds: [],
    limit: PERSONALIZATION.CANDIDATE_LIMIT,
  }, db);
}
