import { createHash, randomBytes } from "node:crypto";
import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { getActiveCommunityMembership, isCommunityModerator } from "../communities/community.service.js";
import { env } from "../../config/env.js";
import { authMailService } from "../auth/auth-mail.service.js";
import { assertForumPinCapacity } from "./forum-locks.js";
import { normalizeForumPostType } from "./forum.rules.js";

const REPORT_REASONS = ["SPAM", "HARASSMENT", "OFF_TOPIC", "PRIVACY", "PLAGIARISM_CONCERN", "COPYRIGHT_CONCERN", "INAPPROPRIATE_CONTENT", "OTHER"] as const;
const APPEALABLE_ACTIONS = ["HIDE_CONTENT", "REMOVE_CONTENT", "LOCK_THREAD", "PIN_THREAD", "RESTRICT_USER", "THREAD_HIDDEN", "THREAD_LOCKED", "THREAD_PINNED", "RESPONSE_HIDDEN"];
const requiresAdminReview = (report: { status: string; reason: string; escalatedAt: Date | null }) => report.status === "escalated" || Boolean(report.escalatedAt) || report.reason === "COPYRIGHT_CONCERN";
type TargetType = "THREAD" | "RESPONSE";
type Target = { type: TargetType; id: string; postId: string; authorId: string; communityId: string | null; title?: string; body: string; status: string; visibilityStatus: string };

const idWhere = (value: string) => {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
};
const uuidWhere = (value: string) => {
  const parsed = parseDatabaseId(value);
  if (!parsed || parsed.kind !== "uuid") throw AppError.badRequest("This resource requires a UUID identifier");
  return { id: parsed.value };
};

async function userId(value: string) {
  const row = await getPrisma().user.findUnique({ where: idWhere(value), select: { id: true } });
  if (!row) throw AppError.notFound("User not found");
  return row.id;
}

async function communityId(value: string) {
  const row = await getPrisma().community.findUnique({ where: idWhere(value), select: { id: true, status: true } });
  if (!row) throw AppError.notFound("Community not found");
  return row;
}

async function reportUuid(value: string) {
  const row = await getPrisma().contentReport.findUnique({ where: idWhere(value), select: { id: true } });
  if (!row) throw AppError.notFound("Report not found");
  return row.id;
}

async function target(type: "post" | "comment" | TargetType, value: string): Promise<Target> {
  const prisma = getPrisma();
  const normalized = type === "post" || type === "THREAD" ? "THREAD" : "RESPONSE";
  if (normalized === "THREAD") {
    const row = await prisma.forumPost.findUnique({ where: idWhere(value), select: { id: true, authorId: true, communityId: true, title: true, body: true, status: true, visibilityStatus: true } });
    if (!row) throw AppError.notFound("Forum discussion not found");
    return { type: normalized, id: row.id, postId: row.id, authorId: row.authorId, communityId: row.communityId, title: row.title, body: row.body, status: row.status, visibilityStatus: row.visibilityStatus };
  }
  const row = await prisma.forumComment.findUnique({ where: idWhere(value), select: { id: true, postId: true, authorId: true, body: true, status: true, visibilityStatus: true } });
  if (!row) throw AppError.notFound("Forum response not found");
  const post = await prisma.forumPost.findUnique({ where: { id: row.postId }, select: { communityId: true, title: true } });
  if (!post) throw AppError.notFound("Forum discussion not found");
  return { type: normalized, id: row.id, postId: row.postId, authorId: row.authorId, communityId: post.communityId, title: post.title, body: row.body, status: row.status, visibilityStatus: row.visibilityStatus };
}

async function assertScope(targetRow: Target, actorId: string, actorRole: UserRole, escalationOnly = false) {
  const actor = await userId(actorId);
  if (actorRole === "admin") return actor;
  if (!targetRow.communityId || !(await isCommunityModerator(targetRow.communityId, actor))) throw AppError.forbidden("Community moderator access is required for this content");
  if (escalationOnly) return actor;
  const [author, actorMembership] = await Promise.all([
    getPrisma().user.findUnique({ where: { id: targetRow.authorId }, select: { systemRole: true } }),
    getPrisma().communityMembership.findUnique({ where: { communityId_userId: { communityId: targetRow.communityId, userId: actor } }, select: { role: true, status: true } }),
  ]);
  if (targetRow.authorId === actor) throw AppError.forbidden("Moderators cannot take action on their own content");
  if (author?.systemRole && author.systemRole !== "USER") throw AppError.conflict("Content authored by an administrator requires Admin review");
  if (actorMembership?.role === "moderator") {
    const peer = await getPrisma().communityMembership.findFirst({ where: { communityId: targetRow.communityId, userId: targetRow.authorId, status: "active", role: { in: ["owner", "moderator"] } }, select: { id: true } });
    if (peer) throw AppError.conflict("A peer moderator report must be escalated to Admin");
  }
  return actor;
}

function snapshot(row: Target, revisionId?: string | null) {
  return { title: row.title ?? null, body: row.body, revisionId: revisionId ?? null, createdAt: new Date().toISOString() };
}

async function notify(user: string | null | undefined, title: string, message: string, targetId?: string) {
  if (!user) return;
  await notificationService.create({ userId: user, title, message, type: "FORUM_MODERATION", targetKind: targetId ? "forum_post" : undefined, targetId });
}

export const forumModerationService = {
  async assertModerationScope(targetType: "THREAD" | "RESPONSE", targetId: string, actorId: string, actorRole: UserRole) {
    const row = await target(targetType, targetId);
    await assertScope(row, actorId, actorRole);
    return row;
  },

  async assertForumRestriction(actor: string, restrictionType: "CREATE_THREAD" | "REPLY" | "POSTING" | "REPORTING", communityId?: string) {
    const uid = await userId(actor);
    const now = new Date();
    const scopeFilter = communityId ? { OR: [{ scope: "GLOBAL" }, { scope: "COMMUNITY", communityId }] } : { scope: "GLOBAL" };
    // POSTING is the umbrella restriction applied by the moderation queue. It
    // blocks new threads, replies and edits while still allowing reads/appeals.
    const restrictionTypes = restrictionType === "CREATE_THREAD" || restrictionType === "REPLY"
      ? [restrictionType, "POSTING"]
      : [restrictionType];
    const rows = await getPrisma().forumRestriction.findMany({ where: { userId: uid, restrictionType: { in: restrictionTypes }, revokedAt: null, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], AND: [scopeFilter] }, take: 1 });
    if (rows.length) throw AppError.forbidden("Your forum access is temporarily restricted");
  },

  async createReport(input: { targetType: "post" | "comment"; targetId: string; reason: string; description?: string }, reporter: string) {
    if (!REPORT_REASONS.includes(input.reason as never)) throw AppError.badRequest("Unsupported report reason");
    const row = await target(input.targetType, input.targetId);
    await this.assertForumRestriction(reporter, "REPORTING", row.communityId ?? undefined);
    if (!["active", "locked"].includes(row.status) || row.visibilityStatus !== "ACTIVE") throw AppError.notFound("Report target not found");
    const reporterId = await userId(reporter);
    if (row.communityId) {
      const [community, reporterUser, membership] = await Promise.all([
        getPrisma().community.findUniqueOrThrow({ where: { id: row.communityId }, select: { visibility: true } }),
        getPrisma().user.findUniqueOrThrow({ where: { id: reporterId }, select: { systemRole: true } }),
        getActiveCommunityMembership(row.communityId, reporterId),
      ]);
      if (community.visibility === "private" && reporterUser.systemRole !== "ADMIN" && !membership) throw AppError.forbidden("This community is private");
    }
    if (row.type === "RESPONSE") {
      const parent = await getPrisma().forumPost.findUniqueOrThrow({ where: { id: row.postId }, select: { status: true, visibilityStatus: true } });
      if (!["active", "locked"].includes(parent.status) || parent.visibilityStatus !== "ACTIVE") throw AppError.notFound("Report target not found");
    }
    const [author, authorMembership] = await Promise.all([
      getPrisma().user.findUniqueOrThrow({ where: { id: row.authorId }, select: { systemRole: true } }),
      row.communityId ? getActiveCommunityMembership(row.communityId, row.authorId) : null,
    ]);
    const status = input.reason === "COPYRIGHT_CONCERN" || author.systemRole !== "USER" || ["owner", "moderator"].includes(authorMembership?.role ?? "") ? "escalated" : "open";
    try {
      const created = await getPrisma().$transaction(async (tx) => {
        if (row.type === "RESPONSE") await tx.$queryRaw`SELECT id FROM forum_comments WHERE id = ${row.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${row.postId}::uuid FOR UPDATE`;
        const parent = await tx.forumPost.findUniqueOrThrow({ where: { id: row.postId } });
        const content = row.type === "THREAD" ? parent : await tx.forumComment.findUniqueOrThrow({ where: { id: row.id } });
        if (parent.communityId !== row.communityId) throw AppError.conflict("The discussion moved. Refresh before reporting");
        if (!["active", "locked"].includes(parent.status) || parent.visibilityStatus !== "ACTIVE" || !["active", "locked"].includes(content.status) || content.visibilityStatus !== "ACTIVE") throw AppError.notFound("Report target not found");
        const revision = row.type === "THREAD"
          ? await tx.forumPostRevision.findFirst({ where: { postId: row.id }, orderBy: { revision: "desc" }, select: { id: true } })
          : await tx.forumCommentRevision.findFirst({ where: { commentId: row.id }, orderBy: { revision: "desc" }, select: { id: true } });
        return tx.contentReport.create({ data: { reporterId, targetType: row.type, targetId: row.id, postId: row.postId, commentId: row.type === "RESPONSE" ? row.id : undefined, communityId: row.communityId, reason: input.reason, description: input.description?.trim() || undefined, status, escalatedAt: status === "escalated" ? new Date() : undefined, reportedRevisionId: revision?.id, contentSnapshot: snapshot({ ...row, title: parent.title, body: content.body, status: content.status, visibilityStatus: content.visibilityStatus }, revision?.id) } });
      });
      await notify(reporterId, "Report received", "Your report has been received.");
      const moderators = row.communityId && status !== "escalated" ? await getPrisma().communityMembership.findMany({ where: { communityId: row.communityId, status: "active", role: { in: ["owner", "moderator"] } }, select: { userId: true } }) : [];
      if (moderators.length) await Promise.all(moderators.map((moderator) => notify(moderator.userId, "New community report", "A forum report is waiting in your moderation queue.", row.postId)));
      else await notificationService.create({ role: "admin", title: "Forum report needs review", message: "A forum report was routed to the Admin moderation queue.", type: "FORUM_MODERATION" });
      await auditService.log("REPORT_CREATED", { userId: reporter, targetTableName: "forum_content_reports", targetRecordId: created.id, details: { targetType: row.type, targetId: row.id, reason: input.reason, routedTo: status === "escalated" ? "admin" : row.communityId ? "community" : "admin" } });
      return { id: publicDatabaseId(created), status: created.status, targetType: created.targetType, targetId: publicDatabaseId(row), createdAt: created.createdAt };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("You already have an active report for this content");
      throw error;
    }
  },

  async listQueue(actorId: string, actorRole: UserRole, status = "open", communityId?: string) {
    const actor = await userId(actorId);
    const scopeId = communityId ? (await getPrisma().community.findUniqueOrThrow({ where: idWhere(communityId), select: { id: true } })).id : undefined;
    let ids: string[] | undefined;
    if (actorRole !== "admin") ids = (await getPrisma().communityMembership.findMany({ where: { userId: actor, status: "active", role: { in: ["owner", "moderator"] }, ...(scopeId ? { communityId: scopeId } : {}) }, select: { communityId: true } })).map((r) => r.communityId);
    const where = { ...(status === "all" ? {} : { status }), ...(scopeId ? { communityId: scopeId } : ids ? { communityId: { in: ids } } : {}) };
    if (actorRole !== "admin" && !ids?.length) return [];
    const rows = await getPrisma().contentReport.findMany({ where, orderBy: [{ createdAt: "asc" }], take: 200 });
    const responses = await getPrisma().forumComment.findMany({ where: { id: { in: rows.flatMap((row) => row.commentId ? [row.commentId] : []) } }, select: { id: true, legacyMongoId: true, postId: true } });
    const responseById = new Map(responses.map((response) => [response.id, response]));
    const posts = await getPrisma().forumPost.findMany({ where: { id: { in: [...rows.flatMap((row) => row.postId ? [row.postId] : []), ...responses.map((response) => response.postId)] } }, select: { id: true, legacyMongoId: true } });
    const postById = new Map(posts.map((post) => [post.id, publicDatabaseId(post)]));
    return rows.map((row) => {
      const response = row.commentId ? responseById.get(row.commentId) : undefined;
      const postId = row.postId ?? response?.postId;
      return { ...row, id: publicDatabaseId(row), targetType: row.commentId ? "RESPONSE" : "THREAD", targetId: response ? publicDatabaseId(response) : postId ? postById.get(postId) ?? postId : row.targetId, postId: postId ? postById.get(postId) ?? postId : null, commentId: response ? publicDatabaseId(response) : row.commentId, reportedRevisionId: row.reportedRevisionId ? publicDatabaseId({ id: row.reportedRevisionId }) : null, reporterId: undefined, contentSnapshot: row.contentSnapshot };
    });
  },

  async claim(reportId: string, actorId: string, actorRole: UserRole, expectedVersion?: number) {
    const id = idWhere(reportId); const current = await getPrisma().contentReport.findUnique({ where: id, select: { id: true, version: true, status: true, reason: true, escalatedAt: true, communityId: true, assignedToId: true, claimExpiresAt: true } });
    if (!current) throw AppError.notFound("Report not found");
    if (actorRole !== "admin" && (!current.communityId || !(await isCommunityModerator(current.communityId, actorId)))) throw AppError.forbidden("Moderator access is required");
    if (["resolved", "dismissed", "reviewed"].includes(current.status)) throw AppError.conflict("Report is already resolved");
    if (requiresAdminReview(current) && actorRole !== "admin") throw AppError.forbidden("Escalated reports require Admin review");
    const now = new Date(); const version = expectedVersion ?? current.version; const actor = await userId(actorId);
    const changed = await getPrisma().contentReport.updateMany({
      where: {
        id: current.id,
        version,
        status: { in: ["open", "claimed", "under_review", "escalated"] },
        OR: [
          { status: { in: ["open", "escalated"] }, assignedToId: null },
          { assignedToId: actor },
          { claimExpiresAt: { lt: now } },
        ],
      },
      data: { status: "claimed", assignedToId: actor, assignedAt: now, claimExpiresAt: new Date(now.getTime() + env.FORUM_MODERATION_CLAIM_LEASE_MINUTES * 60_000), version: { increment: 1 } },
    });
    if (!changed.count) throw AppError.conflict("Report changed or is already claimed");
    await auditService.log("REPORT_CLAIMED", { userId: actorId, targetTableName: "forum_content_reports", targetRecordId: current.id, details: { version } });
    return getPrisma().contentReport.findUniqueOrThrow({ where: { id: current.id } });
  },

  async reassign(reportId: string, assigneeId: string, actorId: string, actorRole: UserRole, expectedVersion: number) {
    if (actorRole !== "admin") throw AppError.forbidden("Only Admin can reassign reports");
    const id = idWhere(reportId); const existing = await getPrisma().contentReport.findUnique({ where: id, select: { id: true, status: true, reason: true, escalatedAt: true, communityId: true } });
    if (!existing) throw AppError.notFound("Report not found");
    if (["resolved", "dismissed", "reviewed"].includes(existing.status)) throw AppError.conflict("Report is already resolved");
    const assignee = await userId(assigneeId); const actor = await userId(actorId);
    const assigneeUser = await getPrisma().user.findUnique({ where: { id: assignee }, select: { systemRole: true, accountStatus: true } });
    const communityModerator = existing.communityId ? await isCommunityModerator(existing.communityId, assignee) : false;
    if (!assigneeUser || assigneeUser.accountStatus !== "ACTIVE" || (assigneeUser.systemRole !== "ADMIN" && !communityModerator)) throw AppError.badRequest("Assignee must be an active Admin or a moderator for this community");
    if (requiresAdminReview(existing) && assigneeUser.systemRole !== "ADMIN") throw AppError.badRequest("Escalated reports must be assigned to an Admin");
    const changed = await getPrisma().contentReport.updateMany({ where: { id: existing.id, version: expectedVersion, status: { notIn: ["resolved", "dismissed", "reviewed"] } }, data: { assignedToId: assignee, assignedAt: new Date(), claimExpiresAt: new Date(Date.now() + env.FORUM_MODERATION_CLAIM_LEASE_MINUTES * 60_000), status: "claimed", version: { increment: 1 } } });
    if (!changed.count) throw AppError.conflict("Report changed. Refresh the queue and retry");
    await auditService.log("REASSIGN_REPORT", { userId: actorId, targetTableName: "forum_content_reports", targetRecordId: existing.id, details: { assignedToId: assignee, previousVersion: expectedVersion } });
    return { ...(await getPrisma().contentReport.findUniqueOrThrow({ where: { id: existing.id } })), assignedToId: assignee, actorId: actor };
  },

  async listRestrictions(actorId: string, actorRole: UserRole, targetUserId?: string) {
    if (actorRole !== "admin") throw AppError.forbidden("Only Admin can view global forum restrictions");
    const rows = await getPrisma().forumRestriction.findMany({ where: targetUserId ? { userId: await userId(targetUserId) } : {}, orderBy: { createdAt: "desc" }, take: 200 });
    const users = await getPrisma().user.findMany({ where: { id: { in: rows.map((row) => row.userId) } }, select: { id: true, fullName: true } });
    return rows.map((row) => ({ ...row, id: publicDatabaseId(row), user: users.find((user) => user.id === row.userId) }));
  },

  async revokeRestriction(restrictionId: string, actorId: string, actorRole: UserRole) {
    if (actorRole !== "admin") throw AppError.forbidden("Only Admin can revoke forum restrictions");
    const id = uuidWhere(restrictionId); const actor = await userId(actorId);
    const existing = await getPrisma().forumRestriction.findUnique({ where: id });
    if (!existing) throw AppError.notFound("Restriction not found");
    if (existing.revokedAt) return existing;
    const changed = await getPrisma().forumRestriction.updateMany({ where: { ...id, revokedAt: null }, data: { revokedAt: new Date(), revokedBy: actor } });
    const updated = await getPrisma().forumRestriction.findUniqueOrThrow({ where: id });
    if (!changed.count) return updated;
    await auditService.log("LIFT_RESTRICTION", { userId: actorId, targetTableName: "forum_restrictions", targetRecordId: updated.id, details: {} });
    return { ...updated, id: publicDatabaseId(updated) };
  },

  async applyAction(reportId: string, action: string, actorId: string, actorRole: UserRole, input: { reason?: string; destinationCommunityId?: string; expectedVersion?: number; policyRuleCode?: string; policyVersion?: string } = {}) {
    const report = await getPrisma().contentReport.findUnique({ where: idWhere(reportId) });
    if (!report) throw AppError.notFound("Report not found");
    const row = await target(report.commentId ? "RESPONSE" : "THREAD", report.commentId ?? report.targetId ?? report.postId ?? "");
    await assertScope(row, actorId, actorRole, action === "ESCALATE_REPORT");
    if (report.status === "dismissed" || report.status === "resolved") throw AppError.conflict("Report is already resolved");
    const expected = input.expectedVersion ?? report.version;
    const actor = await userId(actorId);
    const now = new Date();
    if (requiresAdminReview(report) && actorRole !== "admin") throw AppError.forbidden("Escalated reports require Admin review");
    if (actorRole !== "admin" && (report.assignedToId !== actor || !report.claimExpiresAt || report.claimExpiresAt <= now)) throw AppError.conflict("Claim this report before taking action");
    if (action === "MOVE_THREAD" && actorRole !== "admin") throw AppError.forbidden("Only Admin can move discussions between communities");
    if (action === "REMOVE_CONTENT" && actorRole !== "admin") throw AppError.forbidden("Only Admin can remove forum content");
    const destination = input.destinationCommunityId ? await communityId(input.destinationCommunityId) : undefined;
    if (destination && destination.status !== "ACTIVE") throw AppError.badRequest("Destination community is not active");
    if (action === "MOVE_THREAD" && !destination) throw AppError.badRequest("A destination community is required");
    const result = await getPrisma().$transaction(async (tx) => {
      // Lock content before reports so a move can update every report in this
      // discussion without waiting on a reviewer who is waiting on the thread.
      if (row.type === "RESPONSE") await tx.$queryRaw`SELECT id FROM forum_comments WHERE id = ${row.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${row.postId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM forum_content_reports WHERE id = ${report.id}::uuid FOR UPDATE`;
      const current = await tx.contentReport.findUnique({ where: { id: report.id } });
      if (!current || current.version !== expected) throw AppError.conflict("Report changed. Refresh and retry");
      if (["resolved", "dismissed", "reviewed"].includes(current.status)) throw AppError.conflict("Report is already resolved");
      if (actorRole !== "admin" && requiresAdminReview(current)) throw AppError.forbidden("Escalated reports require Admin review");
      if (actorRole !== "admin" && (current.assignedToId !== actor || !current.claimExpiresAt || current.claimExpiresAt <= new Date())) throw AppError.conflict("Claim this report before taking action");

      const thread = row.type === "THREAD" ? await tx.forumPost.findUnique({ where: { id: row.id } }) : null;
      const response = row.type === "RESPONSE" ? await tx.forumComment.findUnique({ where: { id: row.id } }) : null;
      if ((row.type === "THREAD" && !thread) || (row.type === "RESPONSE" && !response)) throw AppError.notFound("Forum content not found");
      const contentStatus = thread?.status ?? response!.status;
      const visibilityStatus = thread?.visibilityStatus ?? response!.visibilityStatus;
      const contentIsVisible = ["active", "locked"].includes(contentStatus) && visibilityStatus === "ACTIVE";
      if (thread && thread.communityId !== row.communityId) throw AppError.conflict("The discussion moved. Refresh the queue");
      if (response) {
        const parent = await tx.forumPost.findUniqueOrThrow({ where: { id: response.postId }, select: { communityId: true } });
        if (parent.communityId !== row.communityId) throw AppError.conflict("The discussion moved. Refresh the queue");
      }
      const acceptedCommentId = response ? (await tx.forumPost.findUniqueOrThrow({ where: { id: response.postId }, select: { acceptedCommentId: true } })).acceptedCommentId : null;
      const previousState = {
        status: contentStatus, visibilityStatus, isLocked: thread?.isLocked ?? false,
        isPinned: thread?.isPinned ?? false, pinnedAt: thread?.pinnedAt?.toISOString() ?? null,
        moderationVersion: thread?.moderationVersion ?? response!.moderationVersion,
        communityId: row.communityId, restrictionId: null as string | null,
        acceptedCommentId,
      };

      if (action === "MOVE_THREAD") {
        if (row.type !== "THREAD" || !destination) throw AppError.badRequest("A destination community is required");
        if (thread!.communityId === destination.id) throw AppError.conflict("Discussion is already in this community");
        // Moves can touch two community counters. Lock both in a stable order
        // before capacity checks or counter updates to avoid opposite moves.
        const communityIds = [thread!.communityId, destination.id].filter((id): id is string => Boolean(id)).sort();
        for (const id of communityIds) await tx.$queryRaw`SELECT id FROM communities WHERE id = ${id}::uuid FOR UPDATE`;
        if (contentIsVisible && thread!.isPinned) await assertForumPinCapacity(tx, destination.id, row.id);
        const responseIds = (await tx.forumComment.findMany({ where: { postId: row.id }, select: { id: true } })).map((response) => response.id);
        await tx.forumPost.update({ where: { id: row.id }, data: { communityId: destination.id, moderationVersion: { increment: 1 } } });
        await tx.contentReport.updateMany({ where: { OR: [{ postId: row.id }, { commentId: { in: responseIds } }] }, data: { communityId: destination.id, version: { increment: 1 } } });
        if (contentIsVisible) {
          if (thread!.communityId) await tx.community.updateMany({ where: { id: thread!.communityId, threadCount: { gt: 0 } }, data: { threadCount: { decrement: 1 } } });
          await tx.community.update({ where: { id: destination.id }, data: { threadCount: { increment: 1 } } });
        }
      } else if (["HIDE_CONTENT", "RESTORE_CONTENT", "REMOVE_CONTENT"].includes(action)) {
        const hidden = action === "HIDE_CONTENT"; const removed = action === "REMOVE_CONTENT";
        if (hidden && !contentIsVisible) throw AppError.conflict("Content is already hidden or removed");
        if (removed && visibilityStatus === "REMOVED") throw AppError.conflict("Content is already removed");
        if (removed && contentStatus === "deleted") throw AppError.conflict("Content was deleted by its author");
        if (action === "RESTORE_CONTENT" && contentStatus === "deleted") {
          if (actorRole !== "admin" || visibilityStatus !== "REMOVED") throw AppError.conflict("Author-deleted content cannot be restored");
          const removal = await tx.forumModerationAction.findFirst({ where: { action: "REMOVE_CONTENT", ...(row.type === "RESPONSE" ? { commentId: row.id } : { postId: row.id, commentId: null }) }, orderBy: { createdAt: "desc" }, select: { previousState: true } });
          const prior = removal?.previousState as { moderationVersion?: number } | null;
          if (typeof prior?.moderationVersion !== "number" || prior.moderationVersion + 1 !== (thread?.moderationVersion ?? response!.moderationVersion)) throw AppError.conflict("The removal requires manual review");
        }
        if (!hidden && !removed && !["hidden", "deleted"].includes(contentStatus) && !["HIDDEN", "REMOVED"].includes(visibilityStatus)) throw AppError.conflict("Content is already visible");
        if (row.type === "THREAD") {
          await tx.forumPost.update({ where: { id: row.id }, data: { status: removed ? "deleted" : hidden ? "hidden" : thread!.isLocked ? "locked" : "active", visibilityStatus: removed ? "REMOVED" : hidden ? "HIDDEN" : "ACTIVE", isPinned: hidden || removed ? false : undefined, pinnedAt: hidden || removed ? null : undefined, moderationVersion: { increment: 1 } } });
          if (row.communityId && contentIsVisible && (hidden || removed)) await tx.community.updateMany({ where: { id: row.communityId, threadCount: { gt: 0 } }, data: { threadCount: { decrement: 1 } } });
          if (row.communityId && !contentIsVisible && !hidden && !removed) await tx.community.update({ where: { id: row.communityId }, data: { threadCount: { increment: 1 } } });
        } else {
          await tx.forumComment.update({ where: { id: row.id }, data: { status: removed ? "deleted" : hidden ? "hidden" : "active", visibilityStatus: removed ? "REMOVED" : hidden ? "HIDDEN" : "ACTIVE", moderationVersion: { increment: 1 } } });
          if (contentIsVisible && (hidden || removed)) {
            await tx.forumPost.updateMany({ where: { id: row.postId, commentCount: { gt: 0 } }, data: { commentCount: { decrement: 1 } } });
            await tx.forumPost.updateMany({ where: { id: row.postId, acceptedCommentId: row.id }, data: { acceptedCommentId: null } });
          } else if (!contentIsVisible && !hidden && !removed) {
            await tx.forumPost.update({ where: { id: row.postId }, data: { commentCount: { increment: 1 } } });
          }
          const root = await tx.forumPost.findUnique({ where: { id: row.postId }, select: { createdAt: true, editedAt: true } });
          const latest = await tx.forumComment.aggregate({ where: { postId: row.postId, status: "active", visibilityStatus: "ACTIVE" }, _max: { createdAt: true, editedAt: true } });
          if (root) {
            const candidates = [root.createdAt, root.editedAt, latest._max.createdAt, latest._max.editedAt].filter((value): value is Date => Boolean(value));
            await tx.forumPost.update({ where: { id: row.postId }, data: { lastActivityAt: candidates.sort((a, b) => b.getTime() - a.getTime())[0] } });
          }
        }
      } else if (["LOCK_THREAD", "UNLOCK_THREAD"].includes(action)) {
        if (row.type !== "THREAD") throw AppError.badRequest("Only threads can be locked");
        if (action === "LOCK_THREAD" && contentStatus !== "active") throw AppError.conflict("Only an active discussion can be locked");
        if (action === "UNLOCK_THREAD" && contentStatus !== "locked") throw AppError.conflict("Discussion is not locked");
        await tx.forumPost.update({ where: { id: row.id }, data: { status: action === "LOCK_THREAD" ? "locked" : "active", isLocked: action === "LOCK_THREAD", moderationVersion: { increment: 1 } } });
      } else if (["PIN_THREAD", "UNPIN_THREAD"].includes(action)) {
        if (row.type !== "THREAD") throw AppError.badRequest("Only threads can be pinned");
        if (!contentIsVisible) throw AppError.conflict("Hidden discussions cannot be pinned");
        if (action === "PIN_THREAD" && thread!.isPinned) throw AppError.conflict("Discussion is already pinned");
        if (action === "UNPIN_THREAD" && !thread!.isPinned) throw AppError.conflict("Discussion is not pinned");
        if (action === "PIN_THREAD") {
          await assertForumPinCapacity(tx, row.communityId, row.id);
        }
        await tx.forumPost.update({ where: { id: row.id }, data: { isPinned: action === "PIN_THREAD", pinnedAt: action === "PIN_THREAD" ? new Date() : null, moderationVersion: { increment: 1 } } });
      } else if (action === "RESTRICT_USER") {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${row.authorId}::uuid FOR UPDATE`;
        const scopedCommunityId = actorRole === "admin" ? destination?.id ?? null : row.communityId;
        if (actorRole !== "admin" && !scopedCommunityId) throw AppError.forbidden("Community moderators cannot create global restrictions");
        const scope = scopedCommunityId ? "COMMUNITY" : "GLOBAL";
        const duplicate = await tx.forumRestriction.findFirst({ where: { userId: row.authorId, scope, communityId: scopedCommunityId, restrictionType: "POSTING", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { id: true } });
        if (duplicate) throw AppError.conflict("This user already has an active posting restriction in this scope");
        const restriction = await tx.forumRestriction.create({ data: { userId: row.authorId, scope, communityId: scopedCommunityId, restrictionType: "POSTING", reason: input.reason?.trim() || "Forum policy violation", createdBy: actor } });
        previousState.restrictionId = restriction.id;
      } else if (action === "LIFT_RESTRICTION") {
        const scope = actorRole === "admin" ? (destination ? { communityId: destination.id } : {}) : { communityId: row.communityId };
        const lifted = await tx.forumRestriction.updateMany({ where: { userId: row.authorId, revokedAt: null, ...scope }, data: { revokedAt: new Date(), revokedBy: actor } });
        if (!lifted.count) throw AppError.conflict("No active restriction exists in this scope");
      } else if (action !== "DISMISS_REPORT" && action !== "ESCALATE_REPORT") throw AppError.badRequest("Unsupported moderation action");
      const resolvedStatus = action === "DISMISS_REPORT" ? "dismissed" : action === "ESCALATE_REPORT" ? "escalated" : "resolved";
      await tx.contentReport.update({ where: { id: report.id }, data: { status: resolvedStatus, reviewedById: actor, reviewedAt: now, resolvedAt: resolvedStatus === "dismissed" || resolvedStatus === "resolved" ? now : null, resolutionNote: input.reason?.trim(), escalatedAt: resolvedStatus === "escalated" ? now : undefined, assignedToId: resolvedStatus === "escalated" ? null : undefined, assignedAt: resolvedStatus === "escalated" ? null : undefined, claimExpiresAt: resolvedStatus === "escalated" ? null : undefined, version: { increment: 1 } } });
      return tx.forumModerationAction.create({ data: { actorId: actor, communityId: row.communityId, postId: row.type === "THREAD" ? row.id : row.postId, commentId: row.type === "RESPONSE" ? row.id : null, reportId: report.id, targetType: row.type, targetId: row.id, userId: action === "RESTRICT_USER" || action === "LIFT_RESTRICTION" ? row.authorId : null, action, reason: input.reason?.trim(), policyRuleCode: input.policyRuleCode, policyVersion: input.policyVersion, previousState } });
    });
    await auditService.log(action, { userId: actorId, targetTableName: row.type === "THREAD" ? "forum_posts" : "forum_comments", targetRecordId: row.id, details: { reportId: report.id, communityId: row.communityId, destinationCommunityId: input.destinationCommunityId, policyRuleCode: input.policyRuleCode } });
    if (action === "MOVE_THREAD" && input.destinationCommunityId) {
      const destinationId = destination!.id;
      const moderators = await getPrisma().communityMembership.findMany({ where: { communityId: destinationId, status: "active", role: { in: ["owner", "moderator"] } }, select: { userId: true } });
      await Promise.all(moderators.map((moderator) => notify(moderator.userId, "Discussion moved to your community", "A forum discussion was moved into a community you moderate.", row.id)));
      await notify(row.authorId, "Discussion moved", "Your forum discussion was moved to another active community.", row.id);
    }
    if (["HIDE_CONTENT", "REMOVE_CONTENT", "LOCK_THREAD", "RESTRICT_USER"].includes(action) && row.authorId !== actor) await notify(row.authorId, "Forum moderation update", `Your ${row.type === "THREAD" ? "discussion" : "response"} was moderated under the Community Guidelines.`, row.postId);
    if (action === "ESCALATE_REPORT") {
      await notificationService.create({ role: "admin", title: "Forum report escalated", message: "A community moderator forwarded a report for Admin review.", type: "FORUM_MODERATION" });
      await notify(report.reporterId, "Report forwarded", "Your report was forwarded for Admin review.");
    } else await notify(report.reporterId, "Report reviewed", "Your report has been reviewed.");
    return result;
  },

  async submitAppeal(actionId: string, reason: string, appellant: string) {
    const actor = await userId(appellant); const action = await getPrisma().forumModerationAction.findUnique({ where: uuidWhere(actionId) });
    if (!action) throw AppError.notFound("Moderation action not found");
    if (!APPEALABLE_ACTIONS.includes(action.action)) throw AppError.badRequest("This action cannot be appealed");
    const affected = action.userId ?? (action.commentId ? (await getPrisma().forumComment.findUnique({ where: { id: action.commentId }, select: { authorId: true } }))?.authorId : action.postId ? (await getPrisma().forumPost.findUnique({ where: { id: action.postId }, select: { authorId: true } }))?.authorId : null);
    if (affected !== actor) throw AppError.forbidden("Only the affected user can appeal");
    const deadline = new Date((action.createdAt?.getTime() ?? Date.now()) + env.FORUM_APPEAL_SUBMISSION_WINDOW_DAYS * 86_400_000);
    if (new Date() > deadline) throw AppError.conflict("The appeal window has expired");
    if (await getPrisma().moderationAppeal.findUnique({ where: { moderationActionId: action.id } })) throw AppError.conflict("You already submitted an appeal for this decision");
    let row;
    try { row = await getPrisma().moderationAppeal.create({ data: { moderationActionId: action.id, appellantId: actor, reason: reason.trim().slice(0, 5000), submitDeadlineAt: deadline } }); }
    catch (error) { if ((error as { code?: string }).code === "P2002") throw AppError.conflict("You already submitted an appeal for this decision"); throw error; }
    await auditService.log("APPEAL_SUBMITTED", { userId: appellant, targetTableName: "moderation_appeals", targetRecordId: row.id, details: { moderationActionId: action.id } });
    await notificationService.create({ role: "admin", title: "Moderation appeal received", message: "A forum moderation decision is awaiting appeal review.", type: "FORUM_MODERATION" });
    return row;
  },

  async myModerationActions(actorId: string) {
    const actor = await userId(actorId);
    const [posts, responses] = await Promise.all([
      getPrisma().forumPost.findMany({ where: { authorId: actor }, select: { id: true } }),
      getPrisma().forumComment.findMany({ where: { authorId: actor }, select: { id: true, postId: true } }),
    ]);
    const rows = await getPrisma().forumModerationAction.findMany({ where: { action: { in: APPEALABLE_ACTIONS }, OR: [{ userId: actor }, { postId: { in: posts.map((post) => post.id) }, commentId: null }, { commentId: { in: responses.map((response) => response.id) } }] }, orderBy: { createdAt: "desc" }, take: 200 });
    const appeals = await getPrisma().moderationAppeal.findMany({ where: { moderationActionId: { in: rows.map((row) => row.id) }, appellantId: actor } });
    return rows.map((row) => {
      const appeal = appeals.find((item) => item.moderationActionId === row.id);
      const deadline = new Date(row.createdAt.getTime() + env.FORUM_APPEAL_SUBMISSION_WINDOW_DAYS * 86_400_000);
      return { id: row.id, action: row.action, reason: row.reason, createdAt: row.createdAt, postId: row.postId ?? responses.find((item) => item.id === row.commentId)?.postId, commentId: row.commentId, deadline, canAppeal: !appeal && deadline > new Date(), appeal: appeal ? { id: appeal.id, status: appeal.status, reason: appeal.reason, decisionReason: appeal.decisionReason, submittedAt: appeal.submittedAt } : null };
    });
  },

  async listAppeals(actorRole: UserRole, status = "SUBMITTED") {
    if (actorRole !== "admin") throw AppError.forbidden("Only Admin can view the appeal queue");
    const appeals = await getPrisma().moderationAppeal.findMany({ where: status === "all" ? {} : { status }, orderBy: { submittedAt: "asc" }, take: 200 });
    const actions = await getPrisma().forumModerationAction.findMany({ where: { id: { in: appeals.map((appeal) => appeal.moderationActionId) } } });
    const users = await getPrisma().user.findMany({ where: { id: { in: appeals.map((appeal) => appeal.appellantId) } }, select: { id: true, fullName: true } });
    return appeals.map((appeal) => ({ ...appeal, appellant: users.find((user) => user.id === appeal.appellantId), action: actions.find((action) => action.id === appeal.moderationActionId) }));
  },

  async reviewAppeal(appealId: string, decision: "UPHELD" | "OVERTURNED", decisionReason: string, reviewer: string, reviewerRole: UserRole) {
    if (reviewerRole !== "admin") throw AppError.forbidden("Only Admin can review appeals");
    const appeal = await getPrisma().moderationAppeal.findUnique({ where: uuidWhere(appealId) });
    if (!appeal || appeal.status !== "SUBMITTED") throw AppError.notFound("Appeal not found");
    const action = await getPrisma().forumModerationAction.findUnique({ where: { id: appeal.moderationActionId } });
    if (!action) throw AppError.notFound("Original moderation action not found");
    const reviewerId = await userId(reviewer); const admins = await getPrisma().user.count({ where: { systemRole: "ADMIN", accountStatus: "ACTIVE" } });
    const sole = action.actorId === reviewerId && admins <= 1;
    if (action.actorId === reviewerId && (!sole || !env.FORUM_ALLOW_SOLE_ADMIN_APPEAL_REVIEW)) throw AppError.forbidden("The original Admin cannot review this appeal");
    await getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM moderation_appeals WHERE id = ${appeal.id}::uuid FOR UPDATE`;
      const currentAppeal = await tx.moderationAppeal.findUniqueOrThrow({ where: { id: appeal.id } });
      if (currentAppeal.status !== "SUBMITTED") throw AppError.conflict("This appeal was already reviewed");
      if (decision === "OVERTURNED") {
        const inverse = ["HIDE_CONTENT", "REMOVE_CONTENT", "THREAD_HIDDEN", "RESPONSE_HIDDEN"].includes(action.action) ? "RESTORE_CONTENT"
          : ["LOCK_THREAD", "THREAD_LOCKED"].includes(action.action) ? "UNLOCK_THREAD"
            : ["PIN_THREAD", "THREAD_PINNED"].includes(action.action) ? "UNPIN_THREAD"
              : action.action === "RESTRICT_USER" ? "LIFT_RESTRICTION" : null;
        if (!inverse) throw AppError.conflict("This decision cannot be automatically overturned");
        const previous = action.previousState && typeof action.previousState === "object" && !Array.isArray(action.previousState) ? action.previousState as Record<string, unknown> : {};
        if (inverse === "LIFT_RESTRICTION") {
          if (typeof previous.restrictionId !== "string") throw AppError.conflict("The original restriction needs manual review");
          await tx.forumRestriction.updateMany({ where: { id: previous.restrictionId, userId: appeal.appellantId, revokedAt: null }, data: { revokedAt: new Date(), revokedBy: reviewerId } });
        } else {
          if (action.commentId) await tx.$queryRaw`SELECT id FROM forum_comments WHERE id = ${action.commentId}::uuid FOR UPDATE`;
          else if (action.postId) await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${action.postId}::uuid FOR UPDATE`;
          const content = action.commentId ? await tx.forumComment.findUniqueOrThrow({ where: { id: action.commentId } }) : action.postId ? await tx.forumPost.findUniqueOrThrow({ where: { id: action.postId } }) : null;
          if (!content) throw AppError.notFound("Moderated content not found");
          if (typeof previous.moderationVersion === "number" && content.moderationVersion !== previous.moderationVersion + 1) throw AppError.conflict("Content has another moderation decision. Review that decision first");
          const newer = await tx.forumModerationAction.findFirst({ where: { createdAt: { gt: action.createdAt }, ...(action.commentId ? { commentId: action.commentId } : { postId: action.postId, commentId: null }), action: { notIn: ["DISMISS_REPORT", "ESCALATE_REPORT", "RESTRICT_USER", "LIFT_RESTRICTION"] } }, select: { id: true } });
          if (newer) throw AppError.conflict("A later moderation decision must be reviewed first");
          if (inverse === "RESTORE_CONTENT") {
            const restoredStatus = typeof previous.status === "string" ? previous.status : content.isLocked ? "locked" : "active";
            const restoredVisibility = typeof previous.visibilityStatus === "string" ? previous.visibilityStatus : "ACTIVE";
            const wasVisible = ["active", "locked"].includes(content.status) && content.visibilityStatus === "ACTIVE";
            const becomesVisible = ["active", "locked"].includes(restoredStatus) && restoredVisibility === "ACTIVE";
            if (action.commentId) {
              await tx.forumComment.update({ where: { id: action.commentId }, data: { status: restoredStatus, visibilityStatus: restoredVisibility, moderationVersion: { increment: 1 } } });
              const postId = (content as { postId: string }).postId;
              await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${postId}::uuid FOR UPDATE`;
              if (!wasVisible && becomesVisible) await tx.forumPost.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
              const root = await tx.forumPost.findUniqueOrThrow({ where: { id: postId }, select: { createdAt: true, editedAt: true, type: true, acceptedCommentId: true } });
              if (becomesVisible && previous.acceptedCommentId === action.commentId && root.acceptedCommentId === null && normalizeForumPostType(root.type) === "QUESTION") await tx.forumPost.update({ where: { id: postId }, data: { acceptedCommentId: action.commentId } });
              const latest = await tx.forumComment.aggregate({ where: { postId, status: "active", visibilityStatus: "ACTIVE" }, _max: { createdAt: true, editedAt: true } });
              const dates = [root.createdAt, root.editedAt, latest._max.createdAt, latest._max.editedAt].filter((date): date is Date => Boolean(date));
              await tx.forumPost.update({ where: { id: postId }, data: { lastActivityAt: dates.sort((a, b) => b.getTime() - a.getTime())[0] } });
            } else if (action.postId) {
              if (!("communityId" in content)) throw AppError.conflict("Invalid discussion target");
              const shouldPin = previous.isPinned === true;
              if (shouldPin && becomesVisible) await assertForumPinCapacity(tx, content.communityId, action.postId);
              await tx.forumPost.update({ where: { id: action.postId }, data: { status: restoredStatus, visibilityStatus: restoredVisibility, isLocked: previous.isLocked === true || restoredStatus === "locked", isPinned: shouldPin, pinnedAt: shouldPin && typeof previous.pinnedAt === "string" ? new Date(previous.pinnedAt) : null, moderationVersion: { increment: 1 } } });
              if (!wasVisible && becomesVisible && content.communityId) await tx.community.update({ where: { id: content.communityId }, data: { threadCount: { increment: 1 } } });
            }
          } else if (action.postId && !action.commentId) {
            if (inverse === "UNLOCK_THREAD" && content.status !== "locked") throw AppError.conflict("This discussion is no longer locked");
            await tx.forumPost.update({ where: { id: action.postId }, data: inverse === "UNLOCK_THREAD" ? { status: "active", isLocked: false, moderationVersion: { increment: 1 } } : { isPinned: false, pinnedAt: null, moderationVersion: { increment: 1 } } });
          }
        }
        await tx.forumModerationAction.create({ data: { actorId: reviewerId, communityId: action.communityId, postId: action.postId, commentId: action.commentId, reportId: action.reportId, targetType: action.targetType, targetId: action.targetId, userId: action.userId, sourceAppealId: appeal.id, action: inverse, reason: decisionReason.trim() } });
      }
      await tx.moderationAppeal.update({ where: { id: appeal.id }, data: { status: decision, reviewedBy: reviewerId, reviewedAt: new Date(), decisionReason: decisionReason.trim(), soleAdminException: sole } });
    });
    await auditService.log(decision === "OVERTURNED" ? "APPEAL_OVERTURNED" : "APPEAL_UPHELD", { userId: reviewer, targetTableName: "moderation_appeals", targetRecordId: appeal.id, details: { moderationActionId: action.id, soleAdminException: sole } });
    await notify(appeal.appellantId, "Appeal reviewed", "Your moderation appeal has been reviewed.");
    return getPrisma().moderationAppeal.findUniqueOrThrow({ where: { id: appeal.id } });
  },

  async submitCopyrightClaim(input: { claimantName: string; claimantEmail: string; claimantOrganization?: string; targetType: "THREAD" | "RESPONSE"; targetId: string; copyrightedWorkDescription: string; ownershipBasis: string; originalSourceUrl?: string; details: string; sourceReportId?: string; honeypot?: string }) {
    if (input.honeypot) return { accepted: true };
    const email = input.claimantEmail.trim().toLowerCase();
    const row = await target(input.targetType, input.targetId);
    if (input.originalSourceUrl) { let parsed: URL; try { parsed = new URL(input.originalSourceUrl); } catch { throw AppError.badRequest("Invalid source URL"); } if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw AppError.badRequest("Invalid source URL"); }
    const sourceReportId = input.sourceReportId ? await reportUuid(input.sourceReportId) : undefined;
    if (sourceReportId) {
      const report = await getPrisma().contentReport.findUniqueOrThrow({ where: { id: sourceReportId } });
      if ((row.type === "RESPONSE" ? report.commentId : report.commentId ? null : report.postId) !== row.id) throw AppError.badRequest("The source report refers to different content");
    }
    const token = randomBytes(32).toString("hex"); const claim = await getPrisma().copyrightClaim.create({ data: { claimantName: input.claimantName.trim().slice(0, 200), claimantEmail: email.slice(0, 320), claimantOrganization: input.claimantOrganization?.trim().slice(0, 240), targetType: row.type, targetId: row.id, copyrightedWorkDescription: input.copyrightedWorkDescription.trim().slice(0, 10000), ownershipBasis: input.ownershipBasis.trim().slice(0, 5000), originalSourceUrl: input.originalSourceUrl, details: input.details.trim().slice(0, 10000), sourceReportId, emailVerificationTokenHash: createHash("sha256").update(token).digest("hex"), emailVerificationExpiresAt: new Date(Date.now() + env.FORUM_COPYRIGHT_EMAIL_VERIFICATION_MINUTES * 60_000) } });
    await authMailService.sendCopyrightVerification(email, token, claim.id);
    await auditService.log("COPYRIGHT_CLAIM_CREATED", { targetTableName: "copyright_claims", targetRecordId: claim.id, details: { targetType: row.type, targetId: row.id } });
    return { accepted: true, claimId: publicDatabaseId(claim) };
  },

  async verifyCopyrightClaim(token: string) {
    const hash = createHash("sha256").update(token).digest("hex"); const claim = await getPrisma().copyrightClaim.findFirst({ where: { emailVerificationTokenHash: hash, status: "PENDING_EMAIL_VERIFICATION", emailVerificationExpiresAt: { gt: new Date() } } });
    if (!claim) throw AppError.badRequest("Verification token is invalid or expired");
    const changed = await getPrisma().copyrightClaim.updateMany({ where: { id: claim.id, emailVerificationTokenHash: hash, status: "PENDING_EMAIL_VERIFICATION", emailVerificationExpiresAt: { gt: new Date() } }, data: { status: "RECEIVED", emailVerifiedAt: new Date(), emailVerificationTokenHash: null } });
    if (!changed.count) throw AppError.badRequest("Verification token is invalid or expired");
    await auditService.log("COPYRIGHT_CLAIM_VERIFIED", { targetTableName: "copyright_claims", targetRecordId: claim.id, details: {} });
    await notificationService.create({ role: "admin", title: "Copyright claim received", message: "A verified forum copyright claim is awaiting review.", type: "FORUM_MODERATION" });
    return { accepted: true, id: publicDatabaseId(claim) };
  },

  async listCopyrightClaims(actorRole: UserRole) {
    if (actorRole !== "admin") throw AppError.forbidden("Only Admin can view copyright claims");
    const claims = await getPrisma().copyrightClaim.findMany({ where: { emailVerifiedAt: { not: null } }, orderBy: { submittedAt: "desc" }, take: 200 });
    const comments = await getPrisma().forumComment.findMany({ where: { id: { in: claims.filter((claim) => claim.targetType === "RESPONSE").map((claim) => claim.targetId) } }, select: { id: true, postId: true } });
    return claims.map(({ emailVerificationTokenHash: _token, ...claim }) => ({ ...claim, postId: claim.targetType === "THREAD" ? claim.targetId : comments.find((comment) => comment.id === claim.targetId)?.postId }));
  },

  async reviewCopyrightClaim(claimId: string, status: "IN_REVIEW" | "RESOLVED" | "DISMISSED", reason: string, actorId: string, actorRole: UserRole) {
    if (actorRole !== "admin") throw AppError.forbidden("Only Admin can review copyright claims");
    const actor = await userId(actorId);
    const claim = await getPrisma().copyrightClaim.findUnique({ where: uuidWhere(claimId) });
    if (!claim || !claim.emailVerifiedAt) throw AppError.notFound("Verified claim not found");
    const changed = await getPrisma().copyrightClaim.updateMany({ where: { id: claim.id, status: { in: ["RECEIVED", "IN_REVIEW"] } }, data: { status, assignedTo: actor, resolutionNote: reason.trim(), resolvedAt: status === "IN_REVIEW" ? null : new Date() } });
    if (!changed.count) throw AppError.conflict("This claim was already resolved");
    await auditService.log("COPYRIGHT_CLAIM_REVIEWED", { userId: actorId, targetTableName: "copyright_claims", targetRecordId: claim.id, details: { status, reason } });
    return getPrisma().copyrightClaim.findUniqueOrThrow({ where: { id: claim.id } });
  },
};

export { idWhere };
