import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { forumModerationService as moderation } from "../forum-moderation.service.js";
import { forumService } from "../forum.service.js";
import { auditService } from "../../audit/audit.service.js";
import { notificationService } from "../../notifications/notification.service.js";
import { authMailService } from "../../auth/auth-mail.service.js";
import { env } from "../../../config/env.js";

describe.sequential("forum report decisions, restrictions and appeals", () => {
  const marker = crypto.randomUUID();
  let admin = "", reviewer = "", moderator = "", author = "", reporter = "", outsider = "";
  let community = "", destination = "";
  let userIds: string[] = [];
  const createdPostIds: string[] = [];
  const prisma = getPrisma();

  beforeAll(async () => {
    vi.spyOn(auditService, "log").mockResolvedValue(undefined);
    vi.spyOn(notificationService, "create").mockResolvedValue(undefined as never);
    vi.spyOn(authMailService, "sendCopyrightVerification").mockResolvedValue(undefined);
    const users = await Promise.all(["admin", "reviewer", "moderator", "author", "reporter", "outsider"].map((name) => prisma.user.create({ data: { fullName: name, email: "moderation-" + name + "-" + marker + "@example.test", ...(name === "admin" || name === "reviewer" ? { role: "admin", systemRole: "ADMIN" } : {}) } })));
    userIds = users.map((user) => user.id);
    [admin, reviewer, moderator, author, reporter, outsider] = userIds;
    const communities = await Promise.all(["source", "destination"].map((name) => prisma.community.create({ data: { name: "Moderation " + name, slug: "moderation-" + name + "-" + marker, ownerId: moderator, isForumCategory: true } })));
    [community, destination] = communities.map((row) => row.id);
    await prisma.communityMembership.createMany({ data: [community, destination].flatMap((communityId) => [moderator, author, reporter].map((userId) => ({ communityId, userId, status: "active", role: userId === moderator ? "owner" : "member" }))) });
  });

  afterAll(async () => {
    const posts = await prisma.forumPost.findMany({ where: { OR: [{ communityId: { in: [community, destination].filter(Boolean) } }, { id: { in: createdPostIds } }] }, select: { id: true } });
    const postIds = posts.map((row) => row.id);
    const actions = await prisma.forumModerationAction.findMany({ where: { actorId: { in: userIds } }, select: { id: true } });
    await prisma.moderationAppeal.deleteMany({ where: { moderationActionId: { in: actions.map((row) => row.id) } } });
    await prisma.copyrightClaim.deleteMany({ where: { targetId: { in: postIds } } });
    await prisma.forumRestriction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.forumModerationAction.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.contentReport.deleteMany({ where: { OR: [{ postId: { in: postIds } }, { communityId: { in: [community, destination].filter(Boolean) } }] } });
    await prisma.forumThreadFollow.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.forumReference.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.forumPostTag.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.forumComment.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
    await prisma.communityMembership.deleteMany({ where: { communityId: { in: [community, destination].filter(Boolean) } } });
    await prisma.community.deleteMany({ where: { id: { in: [community, destination].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    vi.restoreAllMocks();
  });

  async function topic(communityId: string | null = community) {
    const post = await prisma.forumPost.create({ data: { communityId, authorId: author, title: "Decision fixture " + crypto.randomUUID(), body: "Content requiring contextual review" } });
    createdPostIds.push(post.id);
    if (communityId) await prisma.community.update({ where: { id: communityId }, data: { threadCount: { increment: 1 } } });
    return post;
  }
  async function report(postId: string, reason = "SPAM", actor = reporter) {
    return moderation.createReport({ targetType: "post", targetId: postId, reason }, actor);
  }

  it("allows only one concurrent claim and rejects stale versions and ordinary assignees", async () => {
    const post = await topic(); const item = await report(post.id);
    const claims = await Promise.allSettled([moderation.claim(item.id, admin, "admin", 0), moderation.claim(item.id, reviewer, "admin", 0)]);
    expect(claims.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(claims.filter((result) => result.status === "rejected")).toHaveLength(1);
    const current = await prisma.contentReport.findUniqueOrThrow({ where: { id: item.id } });
    await expect(moderation.reassign(item.id, outsider, admin, "admin", current.version)).rejects.toMatchObject({ statusCode: 400 });
    await expect(moderation.applyAction(item.id, "DISMISS_REPORT", admin, "admin", { expectedVersion: 0, reason: "Stale decision" })).rejects.toMatchObject({ statusCode: 409 });
    await moderation.applyAction(item.id, "DISMISS_REPORT", admin, "admin", { expectedVersion: current.version, reason: "No policy violation" });
    await expect(moderation.claim(item.id, admin, "admin")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("keeps escalation restricted to Admin after claiming and lease expiry", async () => {
    const post = await topic(); const item = await report(post.id, "COPYRIGHT_CONCERN");
    expect(item.status).toBe("escalated");
    await moderation.claim(item.id, admin, "admin", 0);
    await prisma.contentReport.update({ where: { id: item.id }, data: { claimExpiresAt: new Date(0) } });
    await expect(moderation.claim(item.id, moderator, "user", 1)).rejects.toMatchObject({ statusCode: 403 });
    await expect(moderation.reassign(item.id, moderator, admin, "admin", 1)).rejects.toMatchObject({ statusCode: 400 });
    await expect(moderation.applyAction(item.id, "HIDE_CONTENT", moderator, "user", { reason: "Needs review", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(forumService.reviewReport(item.id, { status: "dismissed" }, moderator, "user")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("does not let outsiders report member-only content", async () => {
    const post = await topic();
    await prisma.community.update({ where: { id: community }, data: { visibility: "private", isForumCategory: false } });
    try {
      await expect(report(post.id, "SPAM", outsider)).rejects.toMatchObject({ statusCode: 403 });
      expect(await report(post.id)).toMatchObject({ status: "open" });
    } finally { await prisma.community.update({ where: { id: community }, data: { visibility: "public", isForumCategory: true } }); }
  });

  it("presents a response report as a response and retains the discussion URL", async () => {
    const post = await topic(); const response = await prisma.forumComment.create({ data: { postId: post.id, postNumber: 2, authorId: author, body: "Reported response, distinct from the opening post" } });
    const item = await moderation.createReport({ targetType: "comment", targetId: response.id, reason: "OFF_TOPIC" }, reporter);
    const rows = await forumService.listReports(community, "open", admin, "admin");
    expect(rows.find((row) => row.id === item.id)).toMatchObject({ targetType: "comment", targetId: response.id, postId: post.id, version: 0, target: { excerpt: response.body } });
  });

  it("does not decrement counts twice when two reports concern the same content", async () => {
    const post = await topic(); const a = await report(post.id); const b = await report(post.id, "OTHER", outsider);
    const before = (await prisma.community.findUniqueOrThrow({ where: { id: community } })).threadCount;
    await moderation.applyAction(a.id, "HIDE_CONTENT", admin, "admin", { expectedVersion: 0, reason: "Confirmed issue" });
    await expect(moderation.applyAction(b.id, "HIDE_CONTENT", admin, "admin", { expectedVersion: 0, reason: "Second report" })).rejects.toMatchObject({ statusCode: 409 });
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community } })).threadCount).toBe(before - 1);
    expect((await prisma.contentReport.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("open");
  });

  it("restores only the response when its appeal is overturned", async () => {
    const post = await topic(); const response = await prisma.forumComment.create({ data: { postId: post.id, postNumber: 2, authorId: author, body: "Appealable response" } });
    await prisma.forumPost.update({ where: { id: post.id }, data: { type: "QUESTION", status: "locked", isLocked: true, acceptedCommentId: response.id, commentCount: 1, lastActivityAt: response.createdAt } });
    const item = await moderation.createReport({ targetType: "comment", targetId: response.id, reason: "OTHER" }, reporter);
    const action = await moderation.applyAction(item.id, "HIDE_CONTENT", admin, "admin", { reason: "Original decision", expectedVersion: 0 });
    expect((await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } })).acceptedCommentId).toBeNull();
    await expect(moderation.submitAppeal(action.id, "Unrelated user", outsider)).rejects.toMatchObject({ statusCode: 403 });
    const appeal = await moderation.submitAppeal(action.id, "Please check the full context", author);
    await expect(moderation.submitAppeal(action.id, "Duplicate appeal", author)).rejects.toMatchObject({ statusCode: 409 });
    expect((await moderation.myModerationActions(author)).find((row) => row.id === action.id)).toMatchObject({ postId: post.id, commentId: response.id, canAppeal: false, appeal: { status: "SUBMITTED" } });
    expect((await moderation.myModerationActions(outsider)).some((row) => row.id === action.id)).toBe(false);
    await expect(moderation.reviewAppeal(appeal.id, "OVERTURNED", "I issued the original decision", admin, "admin")).rejects.toMatchObject({ statusCode: 403 });
    await moderation.reviewAppeal(appeal.id, "OVERTURNED", "The response does not violate policy", reviewer, "admin");
    expect(await prisma.forumComment.findUniqueOrThrow({ where: { id: response.id } })).toMatchObject({ status: "active", visibilityStatus: "ACTIVE" });
    expect(await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({ status: "locked", isLocked: true, acceptedCommentId: response.id, commentCount: 1, lastActivityAt: response.createdAt });
    await expect(moderation.reviewAppeal(appeal.id, "OVERTURNED", "Retry", reviewer, "admin")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps a newer moderation decision intact when reviewing an older appeal", async () => {
    const post = await topic(); const item = await report(post.id);
    const action = await moderation.applyAction(item.id, "HIDE_CONTENT", admin, "admin", { reason: "Original hide", expectedVersion: 0 });
    const appeal = await moderation.submitAppeal(action.id, "Review context", author);
    await forumService.moderatePost(post.id, "THREAD_RESTORED", "New decision", reviewer, "admin");
    await expect(moderation.reviewAppeal(appeal.id, "OVERTURNED", "Older decision overturned", reviewer, "admin")).rejects.toMatchObject({ statusCode: 409 });
    expect((await prisma.moderationAppeal.findUniqueOrThrow({ where: { id: appeal.id } })).status).toBe("SUBMITTED");
    expect((await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("active");
  });

  it("limits moderator posting restrictions to their community and lifts the exact appealed restriction", async () => {
    const post = await topic(); const item = await report(post.id);
    const claim = await moderation.claim(item.id, moderator, "user", 0);
    const action = await moderation.applyAction(item.id, "RESTRICT_USER", moderator, "user", { reason: "Repeated policy violation", expectedVersion: claim.version });
    const restriction = await prisma.forumRestriction.findFirstOrThrow({ where: { userId: author, revokedAt: null } });
    expect(restriction).toMatchObject({ scope: "COMMUNITY", communityId: community, restrictionType: "POSTING" });
    try {
      await expect(forumService.createPost({ communityId: community, title: "Restricted attempt", content: "Cannot post" }, author)).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.addComment(post.id, { content: "Cannot reply" }, author)).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.updatePost(post.id, { content: "Cannot edit" }, author)).rejects.toMatchObject({ statusCode: 403 });
      const outside = await forumService.createPost({ communityId: destination, title: "Other scope", content: "Allowed" }, author);
      expect(await prisma.forumPost.findUniqueOrThrow({ where: { id: outside.id } })).toMatchObject({ communityId: destination });
      const appeal = await moderation.submitAppeal(action.id, "Please reconsider this restriction", author);
      await moderation.reviewAppeal(appeal.id, "OVERTURNED", "Restriction no longer justified", reviewer, "admin");
      expect((await prisma.forumRestriction.findUniqueOrThrow({ where: { id: restriction.id } })).revokedAt).not.toBeNull();
      await moderation.assertForumRestriction(author, "CREATE_THREAD", community);
    } finally { await prisma.forumRestriction.updateMany({ where: { userId: author, revokedAt: null }, data: { revokedAt: new Date() } }); }
  });

  it("moves discussion counters and report scope together", async () => {
    const post = await topic(); const item = await report(post.id);
    const response = await prisma.forumComment.create({ data: { postId: post.id, authorId: author, postNumber: 2, body: "Legacy report move fixture" } });
    const legacy = await prisma.contentReport.create({ data: { commentId: response.id, reporterId: reporter, communityId: community, reason: "OTHER" } });
    const before = await Promise.all([community, destination].map((id) => prisma.community.findUniqueOrThrow({ where: { id } })));
    await moderation.applyAction(item.id, "MOVE_THREAD", admin, "admin", { reason: "Better suited to another community", expectedVersion: 0, destinationCommunityId: destination });
    expect(await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({ communityId: destination, moderationVersion: 1 });
    expect(await prisma.contentReport.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ communityId: destination, status: "resolved" });
    expect(await prisma.contentReport.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({ communityId: destination, postId: null, version: 1 });
    const after = await Promise.all([community, destination].map((id) => prisma.community.findUniqueOrThrow({ where: { id } })));
    expect(after[0]!.threadCount).toBe(before[0]!.threadCount - 1);
    expect(after[1]!.threadCount).toBe(before[1]!.threadCount + 1);
  });

  it("rejects copyright source reports referring to a different target", async () => {
    const post = await topic(); const other = await topic(); const item = await report(other.id);
    await expect(moderation.submitCopyrightClaim({ claimantName: "Fixture claimant", claimantEmail: "fixture@example.test", targetType: "THREAD", targetId: post.id, copyrightedWorkDescription: "Fixture original work", ownershipBasis: "Fixture ownership", details: "Fixture context", sourceReportId: item.id })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("routes reports about Admin and community moderators directly to Admin", async () => {
    for (const authorId of [admin, moderator]) {
      const post = await topic();
      await prisma.forumPost.update({ where: { id: post.id }, data: { authorId } });
      const item = await report(post.id);
      expect(item.status).toBe("escalated");
      await expect(moderation.claim(item.id, moderator, "user", 0)).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it("lets moderators escalate legacy own, peer and Admin reports without permitting content decisions", async () => {
    await prisma.communityMembership.create({ data: { communityId: community, userId: outsider, status: "active", role: "moderator" } });
    try {
      for (const authorId of [outsider, moderator, admin]) {
        const post = await topic();
        await prisma.forumPost.update({ where: { id: post.id }, data: { authorId } });
        const item = await prisma.contentReport.create({ data: { postId: post.id, reporterId: reporter, communityId: community, reason: "OTHER" } });
        const claim = await moderation.claim(item.id, outsider, "user", 0);
        await expect(moderation.applyAction(item.id, "HIDE_CONTENT", outsider, "user", { expectedVersion: claim.version })).rejects.toMatchObject({ statusCode: authorId === outsider ? 403 : 409 });
        await expect(forumService.reviewReport(item.id, { status: "dismissed" }, outsider, "user")).rejects.toMatchObject({ statusCode: authorId === outsider ? 403 : 409 });
        await moderation.applyAction(item.id, "ESCALATE_REPORT", outsider, "user", { expectedVersion: claim.version, reason: "Independent Admin review is required" });
        expect(await prisma.contentReport.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: "escalated", assignedToId: null, claimExpiresAt: null });
        expect((await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("active");
      }
      expect(notificationService.create).toHaveBeenCalledWith(expect.objectContaining({ role: "admin", title: "Forum report escalated" }));
      expect(notificationService.create).toHaveBeenCalledWith(expect.objectContaining({ userId: reporter, title: "Report forwarded" }));
    } finally { await prisma.communityMembership.delete({ where: { communityId_userId: { communityId: community, userId: outsider } } }); }
  });

  it("requires a live claim when a community moderator uses the legacy review endpoint", async () => {
    const post = await topic(); const item = await report(post.id);
    await expect(forumService.reviewReport(item.id, { status: "dismissed" }, moderator, "user")).rejects.toMatchObject({ statusCode: 409 });
    await moderation.claim(item.id, moderator, "user", 0);
    await prisma.contentReport.update({ where: { id: item.id }, data: { claimExpiresAt: new Date(0) } });
    await expect(forumService.reviewReport(item.id, { status: "dismissed" }, moderator, "user")).rejects.toMatchObject({ statusCode: 409 });
    await moderation.claim(item.id, moderator, "user", 1);
    expect(await forumService.reviewReport(item.id, { status: "dismissed" }, moderator, "user")).toMatchObject({ status: "dismissed" });
  });

  it("resolves legacy response queue identifiers to the parent discussion", async () => {
    const post = await topic(); const response = await prisma.forumComment.create({ data: { postId: post.id, authorId: author, postNumber: 2, legacyMongoId: "aaaa11112222333344445555", body: "Legacy response" } });
    const item = await prisma.contentReport.create({ data: { commentId: response.id, reporterId: reporter, communityId: community, reason: "OTHER" } });
    const queue = await moderation.listQueue(admin, "admin", "open", community);
    expect(queue.find((row) => row.id === item.id)).toMatchObject({ targetType: "RESPONSE", targetId: response.legacyMongoId, commentId: response.legacyMongoId, postId: post.id });
  });

  it("verifies a copyright token once under concurrent requests", async () => {
    const post = await topic();
    await moderation.submitCopyrightClaim({ claimantName: "Fixture claimant", claimantEmail: "fixture@example.test", targetType: "THREAD", targetId: post.id, copyrightedWorkDescription: "Fixture original work", ownershipBasis: "Fixture ownership", details: "Fixture context" });
    const token = vi.mocked(authMailService.sendCopyrightVerification).mock.calls.at(-1)![1];
    vi.mocked(notificationService.create).mockClear(); vi.mocked(auditService.log).mockClear();
    const results = await Promise.allSettled([moderation.verifyCopyrightClaim(token), moderation.verifyCopyrightClaim(token)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(vi.mocked(notificationService.create).mock.calls.filter(([input]) => input.title === "Copyright claim received")).toHaveLength(1);
    expect(vi.mocked(auditService.log).mock.calls.filter(([action]) => action === "COPYRIGHT_CLAIM_VERIFIED")).toHaveLength(1);
    await expect(moderation.verifyCopyrightClaim(token)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("does not restore content deleted by its author or relabel it as moderation removal", async () => {
    const post = await topic(); const item = await report(post.id);
    await forumService.moderatePost(post.id, "THREAD_HIDDEN", "Review pending", admin, "admin");
    await forumService.deletePost(post.id, author, "user");
    await expect(moderation.applyAction(item.id, "RESTORE_CONTENT", admin, "admin", { expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(moderation.applyAction(item.id, "REMOVE_CONTENT", admin, "admin", { expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 409 });
    const parent = await topic(); const response = await prisma.forumComment.create({ data: { postId: parent.id, authorId: author, postNumber: 2, body: "Owner-deleted response" } });
    const responseReport = await moderation.createReport({ targetType: "comment", targetId: response.id, reason: "OTHER" }, reporter);
    await forumService.deleteComment(response.id, author, "user");
    await expect(moderation.applyAction(responseReport.id, "RESTORE_CONTENT", admin, "admin", { expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("allows Admin to restore a recorded moderation removal", async () => {
    const post = await topic(); const removal = await report(post.id); const restore = await report(post.id, "OTHER", outsider);
    await moderation.applyAction(removal.id, "REMOVE_CONTENT", admin, "admin", { expectedVersion: 0, reason: "Removal decision" });
    await moderation.applyAction(restore.id, "RESTORE_CONTENT", reviewer, "admin", { expectedVersion: 0, reason: "Removal reconsidered" });
    expect(await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({ status: "active", visibilityStatus: "ACTIVE" });
  });

  it("preserves a newly accepted answer when overturning a response hide", async () => {
    const post = await topic();
    const responses = await Promise.all([2, 3].map((postNumber) => prisma.forumComment.create({ data: { postId: post.id, postNumber, authorId: author, body: "Answer " + postNumber } })));
    await prisma.forumPost.update({ where: { id: post.id }, data: { type: "QUESTION", commentCount: 2, acceptedCommentId: responses[0]!.id } });
    await forumService.moderateComment(responses[0]!.id, "RESPONSE_HIDDEN", "Context requires review", admin, "admin");
    const action = await prisma.forumModerationAction.findFirstOrThrow({ where: { commentId: responses[0]!.id, action: "RESPONSE_HIDDEN" } });
    await forumService.acceptAnswer(post.id, responses[1]!.id, author, "user");
    const appeal = await moderation.submitAppeal(action.id, "Please check full context", author);
    await moderation.reviewAppeal(appeal.id, "OVERTURNED", "Response allowed", reviewer, "admin");
    expect(await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({ acceptedCommentId: responses[1]!.id, commentCount: 2 });
  });

  it("serializes direct and report-based pins and enforces the same community limit", async () => {
    const posts = await Promise.all(Array.from({ length: env.FORUM_MAX_PINNED_THREADS_PER_COMMUNITY + 1 }, () => topic()));
    try {
      for (const post of posts.slice(0, -2)) await forumService.moderatePost(post.id, "THREAD_PINNED", "Fixture pin", admin, "admin");
      const direct = posts.at(-2)!; const advanced = posts.at(-1)!; const item = await report(advanced.id);
      const results = await Promise.allSettled([forumService.moderatePost(direct.id, "THREAD_PINNED", "Direct pin", admin, "admin"), moderation.applyAction(item.id, "PIN_THREAD", reviewer, "admin", { expectedVersion: 0, reason: "Queue pin" })]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(await prisma.forumPost.count({ where: { communityId: community, isPinned: true } })).toBe(env.FORUM_MAX_PINNED_THREADS_PER_COMMUNITY);
    } finally { await prisma.forumPost.updateMany({ where: { id: { in: posts.map((post) => post.id) } }, data: { isPinned: false, pinnedAt: null } }); }
  });

  it("uses the global pin scope for discussions outside a community", async () => {
    const post = await topic(null);
    const existing = await prisma.forumPost.count({ where: { communityId: null, isPinned: true, status: { in: ["active", "locked"] }, visibilityStatus: "ACTIVE" } });
    try {
      const attempt = forumService.moderatePost(post.id, "THREAD_PINNED", "Global fixture pin", admin, "admin");
      if (existing >= env.FORUM_MAX_PINNED_THREADS_PER_COMMUNITY) await expect(attempt).rejects.toMatchObject({ statusCode: 409 });
      else expect(await attempt).toMatchObject({ isPinned: true });
    } finally { await prisma.forumPost.update({ where: { id: post.id }, data: { isPinned: false, pinnedAt: null } }); }
  });

  it("does not move a pinned topic into a full destination pin scope", async () => {
    const pinned = await Promise.all(Array.from({ length: env.FORUM_MAX_PINNED_THREADS_PER_COMMUNITY }, () => topic(destination)));
    const post = await topic(); const item = await report(post.id);
    try {
      for (const target of pinned) await forumService.moderatePost(target.id, "THREAD_PINNED", "Destination fixture pin", admin, "admin");
      await forumService.moderatePost(post.id, "THREAD_PINNED", "Source fixture pin", admin, "admin");
      await expect(moderation.applyAction(item.id, "MOVE_THREAD", admin, "admin", { expectedVersion: 0, destinationCommunityId: destination, reason: "Move pinned topic" })).rejects.toMatchObject({ statusCode: 409 });
      expect(await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } })).toMatchObject({ communityId: community, isPinned: true });
      expect(await prisma.contentReport.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: "open", version: 0, communityId: community });
    } finally { await prisma.forumPost.updateMany({ where: { id: { in: [post.id, ...pinned.map((row) => row.id)] } }, data: { isPinned: false, pinnedAt: null } }); }
  });

  it("serializes a move and a decision on a different report for the same discussion", async () => {
    const post = await topic(); const move = await report(post.id); const decision = await report(post.id, "OTHER", outsider);
    const attempts = await Promise.allSettled([
      moderation.applyAction(move.id, "MOVE_THREAD", admin, "admin", { expectedVersion: 0, destinationCommunityId: destination, reason: "Move discussion" }),
      moderation.applyAction(decision.id, "HIDE_CONTENT", reviewer, "admin", { expectedVersion: 0, reason: "Review the reported content" }),
    ]);
    for (const attempt of attempts) if (attempt.status === "rejected") expect(attempt.reason).toMatchObject({ statusCode: 409 });
    expect(attempts.some((attempt) => attempt.status === "fulfilled")).toBe(true);
    const current = await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } });
    const reports = await prisma.contentReport.findMany({ where: { postId: post.id } });
    expect(reports.every((row) => row.communityId === current.communityId)).toBe(true);
    for (const id of [community, destination]) {
      const count = await prisma.forumPost.count({ where: { communityId: id, status: { in: ["active", "locked"] }, visibilityStatus: "ACTIVE" } });
      expect((await prisma.community.findUniqueOrThrow({ where: { id } })).threadCount).toBe(count);
    }
  });

  it("keeps a concurrently created report in the discussion's current community", async () => {
    const post = await topic(); const move = await report(post.id);
    const results = await Promise.allSettled([
      moderation.applyAction(move.id, "MOVE_THREAD", admin, "admin", { expectedVersion: 0, destinationCommunityId: destination, reason: "Move while reporting" }),
      report(post.id, "OTHER", outsider),
    ]);
    expect(results[0]!.status).toBe("fulfilled");
    if (results[1]!.status === "rejected") expect(results[1]!.reason).toMatchObject({ statusCode: 409 });
    const rows = await prisma.contentReport.findMany({ where: { postId: post.id } });
    expect(rows.every((row) => row.communityId === destination)).toBe(true);
  });
});
