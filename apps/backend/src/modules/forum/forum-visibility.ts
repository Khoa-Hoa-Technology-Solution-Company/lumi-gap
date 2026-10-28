import type { UserRole } from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";

export type ForumViewer = { userId?: string; role?: UserRole };

/** Tokens carry either the UUID or a legacy Mongo id; an unknown user simply has no memberships. */
async function viewerUuid(value: string | undefined): Promise<string | undefined> {
  const parsed = value ? parseDatabaseId(value) : null;
  if (!parsed) return undefined;
  if (parsed.kind === "uuid") return parsed.value;
  return (await getPrisma().user.findUnique({ where: { legacyMongoId: parsed.value }, select: { id: true } }))?.id;
}

/**
 * Research communities whose posts this viewer must not see: every non-category community that is not
 * public (anything unknown fails closed) and that the viewer is not an active member of. Admins see all.
 * This is the single source of truth behind `forumPostVisibilityWhere` and `forumPostVisibilitySql`.
 */
export async function forumLockedResearchCommunityIds(viewer: ForumViewer): Promise<string[]> {
  if (viewer.role === "admin") return [];
  const prisma = getPrisma();
  const userId = await viewerUuid(viewer.userId);
  const memberships = userId
    ? await prisma.communityMembership.findMany({ where: { userId, status: "active" }, select: { communityId: true } })
    : [];
  const rows = await prisma.community.findMany({
    where: { isForumCategory: false, visibility: { not: "public" }, id: { notIn: memberships.map((row) => row.communityId) } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * The ONE visibility rule for forum posts scoped to a research community. Add it to the `where` of every
 * read of `forum_posts`: a post is visible when it has no research community, or when that community is
 * public or the viewer is an active member (admins see everything).
 */
export async function forumPostVisibilityWhere(viewer: ForumViewer): Promise<Prisma.ForumPostWhereInput> {
  const locked = await forumLockedResearchCommunityIds(viewer);
  return locked.length ? { OR: [{ researchCommunityId: null }, { researchCommunityId: { notIn: locked } }] } : {};
}

/** The same rule as a SQL fragment for raw `forum_posts` queries; `alias` is the table alias. */
export async function forumPostVisibilitySql(viewer: ForumViewer, alias: string): Promise<Prisma.Sql> {
  const locked = await forumLockedResearchCommunityIds(viewer);
  const column = Prisma.raw(`"${alias}"."research_community_id"`);
  return locked.length ? Prisma.sql`(${column} IS NULL OR ${column} <> ALL(${locked}::uuid[]))` : Prisma.sql`TRUE`;
}

/**
 * Keeps only the reports whose target post this viewer may read. A category moderator is not necessarily a member
 * of the research community the reported post belongs to, so the queue must not show them a private post's text.
 */
export async function filterReportsByPostVisibility<T extends { postId?: string | null; commentId?: string | null }>(reports: T[], viewer: ForumViewer): Promise<T[]> {
  if (viewer.role === "admin" || !reports.length) return reports;
  const prisma = getPrisma();
  const commentIds = reports.flatMap((report) => report.commentId ? [report.commentId] : []);
  const comments = commentIds.length ? await prisma.forumComment.findMany({ where: { id: { in: commentIds } }, select: { id: true, postId: true } }) : [];
  const postOfComment = new Map(comments.map((comment) => [comment.id, comment.postId]));
  const postIdOf = (report: T) => report.postId ?? (report.commentId ? postOfComment.get(report.commentId) : undefined) ?? null;
  const postIds = [...new Set(reports.flatMap((report) => { const id = postIdOf(report); return id ? [id] : []; }))];
  const visible = new Set((postIds.length ? await prisma.forumPost.findMany({ where: { AND: [{ id: { in: postIds } }, await forumPostVisibilityWhere(viewer)] }, select: { id: true } }) : []).map((post) => post.id));
  return reports.filter((report) => { const id = postIdOf(report); return !id || visible.has(id); });
}

/** Single-post gate built on the same rule; a locked post is reported as missing so its existence never leaks. */
export async function assertForumPostReadable(post: { id: string; researchCommunityId: string | null }, viewer: ForumViewer): Promise<void> {
  if (!post.researchCommunityId) return;
  const visible = await getPrisma().forumPost.findFirst({ where: { AND: [{ id: post.id }, await forumPostVisibilityWhere(viewer)] }, select: { id: true } });
  if (!visible) throw AppError.notFound("Forum post not found");
}

/** thread_count of a research community = its visible posts, recomputed under the row lock like member_count. */
export async function syncResearchThreadCount(tx: Prisma.TransactionClient, researchCommunityId: string | null | undefined): Promise<void> {
  if (!researchCommunityId) return;
  await tx.$queryRaw`SELECT id FROM communities WHERE id = ${researchCommunityId}::uuid FOR UPDATE`;
  const threadCount = await tx.forumPost.count({ where: { researchCommunityId, status: { in: ["active", "locked"] }, visibilityStatus: "ACTIVE" } });
  await tx.community.update({ where: { id: researchCommunityId }, data: { threadCount } });
}
