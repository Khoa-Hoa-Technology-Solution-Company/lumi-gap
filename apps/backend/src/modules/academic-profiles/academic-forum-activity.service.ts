import type { ForumActivityFilter, PublicForumActivity, PublicForumActivityItem, UserRole } from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { academicProfileService } from "./academic-profile.service.js";

type ActivityRow = Omit<PublicForumActivityItem, "createdAt"> & { createdAt: Date };
const present = (row: ActivityRow): PublicForumActivityItem => ({ ...row, createdAt: row.createdAt.toISOString() });

// Every list, ranking and aggregate uses the same visibility scope. Profile
// access is checked first; hidden/deleted content never reaches this endpoint.
export async function publicForumActivity(userId: string, filter: ForumActivityFilter, page: number, viewerId?: string, role?: UserRole): Promise<PublicForumActivity> {
  const profile = await academicProfileService.getPublic(userId, viewerId);
  const ownerId = profile.userId;
  const prisma = getPrisma();
  const pageSize = 20;
  const scope = Prisma.sql`
    WITH visible_posts AS (
      SELECT p.*, c.name AS community_name, c.slug AS community_slug
      FROM forum_posts p LEFT JOIN communities c ON c.id = p.community_id
      WHERE p.status IN ('active', 'locked') AND p.visibility_status = 'ACTIVE'
        AND (p.community_id IS NULL OR (c.status = 'ACTIVE' AND (
          c.visibility = 'public' OR ${role === "admin"} OR EXISTS (
            SELECT 1 FROM community_memberships m WHERE m.community_id = c.id
              AND m.user_id = ${viewerId ?? null}::uuid AND m.status = 'active'
          )
        )))
    ), visible_comments AS (
      SELECT r.* FROM forum_comments r JOIN visible_posts p ON p.id = r.post_id
      WHERE r.status = 'active' AND r.visibility_status = 'ACTIVE'
    ), visible_reactions AS (
      SELECT r.*, p.id AS topic_id, 1 AS post_number, p.body AS target_body, p.author_id AS target_author
      FROM forum_reactions r JOIN visible_posts p ON r.target_type = 'post' AND r.target_id = p.id
      UNION ALL
      SELECT r.*, c.post_id AS topic_id, c.post_number, c.body AS target_body, c.author_id AS target_author
      FROM forum_reactions r JOIN visible_comments c ON r.target_type = 'comment' AND r.target_id = c.id
    ), activity AS (
      SELECT p.id::text AS id, 'topic'::text AS kind, p.id AS "topicId",
        COALESCE(p.public_slug, p.id::text) AS "topicSlug", p.title AS "topicTitle",
        1 AS "postNumber", LEFT(p.body, 400) AS excerpt,
        p.community_name AS "communityName", p.community_slug AS "communitySlug",
        p.created_at AS "createdAt", NULL::text AS reaction,
        (SELECT COUNT(*)::int FROM visible_reactions r WHERE r.target_type = 'post' AND r.target_id = p.id) AS "reactionCount",
        false AS accepted
      FROM visible_posts p WHERE p.author_id = ${ownerId}::uuid
      UNION ALL
      SELECT c.id::text, 'reply', p.id, COALESCE(p.public_slug, p.id::text), p.title, c.post_number,
        LEFT(c.body, 400), p.community_name, p.community_slug, c.created_at, NULL::text,
        (SELECT COUNT(*)::int FROM visible_reactions r WHERE r.target_type = 'comment' AND r.target_id = c.id),
        COALESCE(p.accepted_comment_id = c.id, false)
      FROM visible_comments c JOIN visible_posts p ON p.id = c.post_id WHERE c.author_id = ${ownerId}::uuid
      UNION ALL
      SELECT r.id::text, 'reaction', p.id, COALESCE(p.public_slug, p.id::text), p.title, r.post_number,
        LEFT(r.target_body, 400), p.community_name, p.community_slug, r.created_at, r.reaction, 0, false
      FROM visible_reactions r JOIN visible_posts p ON p.id = r.topic_id WHERE r.user_id = ${ownerId}::uuid
    )`;
  const kind = { all: null, topics: "topic", replies: "reply", reactions: "reaction" }[filter];
  const selection = kind ? Prisma.sql`WHERE kind = ${kind}` : Prisma.empty;
  type StatsRow = Omit<PublicForumActivity["stats"], "joinedAt" | "lastContributionAt"> & { lastContributionAt: Date | null };
  const [statsRows, items, top, user] = await Promise.all([
    prisma.$queryRaw<StatsRow[]>(Prisma.sql`${scope} SELECT
      (SELECT COUNT(*)::int FROM activity WHERE kind = 'topic') AS "topicsCreated",
      (SELECT COUNT(*)::int FROM activity WHERE kind = 'reply') AS "repliesCreated",
      (SELECT COUNT(*)::int FROM activity WHERE kind = 'reaction') AS "reactionsGiven",
      (SELECT COUNT(*)::int FROM visible_reactions WHERE target_author = ${ownerId}::uuid) AS "reactionsReceived",
      (SELECT COUNT(*)::int FROM activity WHERE kind = 'reply' AND accepted) AS "acceptedResponses",
      (SELECT COALESCE(SUM(view_count), 0)::int FROM visible_posts WHERE author_id = ${ownerId}::uuid) AS "topicViews",
      (SELECT MAX("createdAt") FROM activity WHERE kind IN ('topic', 'reply')) AS "lastContributionAt"`),
    prisma.$queryRaw<ActivityRow[]>(Prisma.sql`${scope} SELECT * FROM activity ${selection}
      ORDER BY "createdAt" DESC, id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    prisma.$queryRaw<ActivityRow[]>(Prisma.sql`${scope} SELECT id, kind, "topicId", "topicSlug", "topicTitle", "postNumber", excerpt,
      "communityName", "communitySlug", "createdAt", reaction, "reactionCount", accepted
      FROM (SELECT activity.*, ROW_NUMBER() OVER (PARTITION BY kind ORDER BY "reactionCount" DESC, "createdAt" DESC, id DESC) AS rank
        FROM activity WHERE kind IN ('topic', 'reply')) ranked WHERE rank <= 3
      ORDER BY kind, rank`),
    prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { createdAt: true } }),
  ]);
  const stats = statsRows[0]!;
  const total = kind === "topic" ? stats.topicsCreated : kind === "reply" ? stats.repliesCreated : kind === "reaction" ? stats.reactionsGiven : stats.topicsCreated + stats.repliesCreated + stats.reactionsGiven;
  return {
    stats: { ...stats, joinedAt: user.createdAt.toISOString(), lastContributionAt: stats.lastContributionAt?.toISOString() },
    items: items.map(present), topTopics: top.filter((row) => row.kind === "topic").map(present), topReplies: top.filter((row) => row.kind === "reply").map(present),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
