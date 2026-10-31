import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { syncResearchThreadCount } from "./forum-visibility.js";

type Tx = Prisma.TransactionClient;

/** Who hides the content: a moderator (`THREAD_HIDDEN` / `RESPONSE_HIDDEN`) or the system after enough reports (`AUTO_HIDDEN`, no actor). */
export type HideInput = { actorId: string | null; action: "THREAD_HIDDEN" | "RESPONSE_HIDDEN" | "AUTO_HIDDEN"; reason?: string };

export function latestDate(...values: Array<Date | null | undefined>) {
  return values.filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0];
}

/**
 * The single "hide a discussion" path, used by the moderator action and by auto-hide. Runs inside the caller's
 * transaction, takes the post row lock, keeps the category and research-community counters exact, and records the action.
 */
export async function hidePostInTx(
  tx: Tx,
  post: { id: string; communityId: string | null; researchCommunityId: string | null; status: string; visibilityStatus: string; isLocked: boolean; isPinned: boolean; pinnedAt: Date | null; moderationVersion: number },
  input: HideInput,
) {
  await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${post.id}::uuid FOR UPDATE`;
  const changed = await tx.forumPost.updateMany({
    where: { id: post.id, moderationVersion: post.moderationVersion, status: post.status, isPinned: post.isPinned },
    data: { status: "hidden", visibilityStatus: "HIDDEN", isPinned: false, pinnedAt: null, moderationVersion: { increment: 1 } },
  });
  if (!changed.count) throw AppError.conflict("This discussion changed. Please try again");
  const row = await tx.forumPost.findUniqueOrThrow({ where: { id: post.id } });
  if (post.communityId) await tx.community.updateMany({ where: { id: post.communityId, threadCount: { gt: 0 } }, data: { threadCount: { decrement: 1 } } });
  await syncResearchThreadCount(tx, post.researchCommunityId);
  await tx.forumModerationAction.create({
    data: {
      actorId: input.actorId, communityId: post.communityId, postId: post.id, action: input.action, reason: input.reason,
      previousState: { status: post.status, visibilityStatus: post.visibilityStatus, isLocked: post.isLocked, isPinned: post.isPinned, pinnedAt: post.pinnedAt?.toISOString() ?? null, moderationVersion: post.moderationVersion },
    },
  });
  return row;
}

/** The single "hide a response" path (same contract as `hidePostInTx`). `post` is the discussion as the caller read it. */
export async function hideCommentInTx(
  tx: Tx,
  comment: { id: string; status: string; visibilityStatus: string; moderationVersion: number },
  post: { id: string; communityId: string | null; createdAt: Date; editedAt: Date | null },
  input: HideInput,
) {
  await tx.$queryRaw`SELECT id FROM forum_comments WHERE id = ${comment.id}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${post.id}::uuid FOR UPDATE`;
  const root = await tx.forumPost.findUniqueOrThrow({ where: { id: post.id } });
  if (root.communityId !== post.communityId) throw AppError.conflict("The discussion moved. Refresh and retry");
  const changed = await tx.forumComment.updateMany({
    where: { id: comment.id, status: comment.status, moderationVersion: comment.moderationVersion },
    data: { status: "hidden", visibilityStatus: "HIDDEN", moderationVersion: { increment: 1 } },
  });
  if (!changed.count) throw AppError.conflict("This response changed. Please try again");
  const row = await tx.forumComment.findUniqueOrThrow({ where: { id: comment.id } });
  await tx.forumPost.updateMany({ where: { id: post.id, commentCount: { gt: 0 } }, data: { commentCount: { decrement: 1 } } });
  await tx.forumPost.updateMany({ where: { id: post.id, acceptedCommentId: comment.id }, data: { acceptedCommentId: null } });
  const latestReply = await tx.forumComment.aggregate({ where: { postId: post.id, status: "active" }, _max: { createdAt: true, editedAt: true } });
  await tx.forumPost.update({ where: { id: post.id }, data: { lastActivityAt: latestDate(post.editedAt, post.createdAt, latestReply._max.createdAt, latestReply._max.editedAt)! } });
  await tx.forumModerationAction.create({
    data: {
      actorId: input.actorId, communityId: post.communityId, postId: post.id, commentId: comment.id, targetType: "RESPONSE", targetId: comment.id, action: input.action, reason: input.reason,
      previousState: { status: comment.status, visibilityStatus: comment.visibilityStatus, moderationVersion: comment.moderationVersion, acceptedCommentId: root.acceptedCommentId },
    },
  });
  return row;
}

/** True when the system ever auto-hid this content. A moderator who restores it then exempts it from being auto-hidden again. */
export async function wasAutoHidden(tx: Tx, target: { postId: string; commentId?: string | null }): Promise<boolean> {
  const count = await tx.forumModerationAction.count({
    where: { action: "AUTO_HIDDEN", ...(target.commentId ? { commentId: target.commentId } : { postId: target.postId, commentId: null }) },
  });
  return count > 0;
}
