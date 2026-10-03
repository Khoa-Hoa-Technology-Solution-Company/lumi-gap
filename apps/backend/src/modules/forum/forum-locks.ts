import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";

// Call after locking the discussion: all pin/restore paths use thread → scope.
export async function assertForumPinCapacity(tx: Prisma.TransactionClient, communityId: string | null, postId: string) {
  if (communityId) await tx.$queryRaw`SELECT id FROM communities WHERE id = ${communityId}::uuid FOR UPDATE`;
  else await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(641727, 0)`;
  const count = await tx.forumPost.count({ where: { communityId, id: { not: postId }, isPinned: true, status: { in: ["active", "locked"] }, visibilityStatus: "ACTIVE" } });
  if (count >= env.FORUM_MAX_PINNED_THREADS_PER_COMMUNITY) throw AppError.conflict("This community has reached its pinned thread limit");
}
