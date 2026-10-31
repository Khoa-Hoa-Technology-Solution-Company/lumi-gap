import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { env } from "../../../config/env.js";
import { communityService } from "../../communities/community.service.js";
import { forumModerationService } from "../forum-moderation.service.js";
import { forumService } from "../forum.service.js";

// Community changes enqueue jobs; keep tests from feeding a running dev worker.
vi.mock("../../../infrastructure/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../infrastructure/queue.js")>();
  return { ...actual, embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } };
});

const HOUR = 3_600_000;

/**
 * Anti-spam and community moderation (email gate, community restrictions, auto-hide, link limit, duplicates, report queue).
 * Runs against the dev database: every destructive call below is scoped to ids this suite created and is skipped when the list is empty.
 */
describe.sequential("forum anti-spam and community moderation", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const communityIds: string[] = [];
  const postIds: string[] = [];
  const ids = { admin: "", author: "", unverified: "", ownerA: "", modA: "", ownerB: "", banned: "", newbie: "", r1: "", r2: "", r3: "", r4: "", freshReporter: "", unverifiedReporter: "" };
  const c = { category: "", a: "", b: "" };

  const makeUser = async (key: keyof typeof ids, data: Record<string, unknown> = {}) => {
    const user = await getPrisma().user.create({ data: { email: `fas-${key}-${marker}@example.test`, fullName: `Fas ${key}`, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 72 * HOUR), ...data } });
    userIds.push(user.id);
    ids[key] = user.id;
  };
  const member = (communityId: string, userId: string, role = "member", status = "active") => getPrisma().communityMembership.upsert({
    where: { communityId_userId: { communityId, userId } }, create: { communityId, userId, role, status }, update: { role, status },
  });
  const post = async (communityKey: "a" | "b", title: string, userId = ids.author, content = `Body of ${title} ${marker}`) => {
    const created = await forumService.createPost({ communityId: c.category, researchCommunityId: c[communityKey], title, content }, userId);
    postIds.push(created.id);
    return created;
  };
  const report = (postId: string, reporter: string) => forumModerationService.createReport({ targetType: "post", targetId: postId, reason: "SPAM" }, reporter);
  const row = (postId: string) => getPrisma().forumPost.findUniqueOrThrow({ where: { id: postId } });

  beforeAll(async () => {
    const prisma = getPrisma();
    await makeUser("admin", { role: "admin", systemRole: "ADMIN" });
    for (const key of ["author", "ownerA", "modA", "ownerB", "banned", "r1", "r2", "r3", "r4"] as const) await makeUser(key);
    await makeUser("unverified", { emailVerifiedAt: null });
    await makeUser("newbie", { createdAt: new Date() });
    await makeUser("freshReporter", { createdAt: new Date() });
    await makeUser("unverifiedReporter", { emailVerifiedAt: null });
    const category = await prisma.community.create({ data: { name: `Fas category ${marker}`, slug: `fas-category-${marker}`, ownerId: ids.admin, status: "ACTIVE", isForumCategory: true } });
    communityIds.push(category.id);
    c.category = category.id;
    for (const key of ["a", "b"] as const) {
      const community = await prisma.community.create({ data: { name: `Fas ${key} ${marker}`, slug: `fas-${key}-${marker}`, ownerId: key === "a" ? ids.ownerA : ids.ownerB, status: "ACTIVE" } });
      communityIds.push(community.id);
      c[key] = community.id;
    }
    await Promise.all([
      member(c.a, ids.ownerA, "owner"), member(c.a, ids.modA, "moderator"), member(c.a, ids.banned, "member", "banned"),
      member(c.b, ids.ownerB, "owner"),
    ]);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    if (postIds.length) {
      await prisma.forumModerationAction.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.contentReport.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumThreadFollow.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumComment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
    }
    if (userIds.length) await prisma.forumRestriction.deleteMany({ where: { userId: { in: userIds } } });
    if (communityIds.length) {
      await prisma.notification.deleteMany({ where: { targetUuid: { in: [...communityIds, ...postIds] } } });
      await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
      await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    }
    if (userIds.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  describe("email verification gate", () => {
    it("blocks a community thread for an unverified author, allows a verified one, and still allows an unverified comment", async () => {
      await expect(post("a", `Unverified ${marker}`, ids.unverified)).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("Verify your email") });
      expect(await getPrisma().communityMembership.findFirst({ where: { communityId: c.a, userId: ids.unverified } })).toBeNull(); // no auto-join either
      const created = await post("a", `Verified ${marker}`, ids.author);
      expect(created.researchCommunity).toMatchObject({ slug: `fas-a-${marker}` });
      // A discussion in a category only (no research community) does not need the gate.
      const plain = await forumService.createPost({ communityId: c.category, title: `Plain ${marker}`, content: `Plain body ${marker}` }, ids.unverified);
      postIds.push(plain.id);
      await expect(forumService.addComment(created.id, { content: `Unverified reply ${marker}` }, ids.unverified)).resolves.toMatchObject({ content: expect.stringContaining("Unverified reply") });
    });
  });

  describe("community restrictions", () => {
    it("blocks creating and replying only in the restricted research community, expires, and can be lifted", async () => {
      const inA = await post("a", `Restriction source A ${marker}`, ids.ownerA);
      const inB = await post("b", `Restriction source B ${marker}`, ids.ownerB);
      const restrict = (type: "CREATE_THREAD" | "REPLY" | "POSTING", actor = ids.ownerA) => communityService.restrictMember(c.a, ids.author, { type, durationDays: 1, reason: "Spamming links" }, actor, "user");

      await member(c.a, ids.author);
      const thread = await restrict("CREATE_THREAD");
      await expect(post("a", `Blocked ${marker}`, ids.author)).rejects.toMatchObject({ statusCode: 403 });
      await expect(post("b", `Allowed elsewhere ${marker}`, ids.author)).resolves.toBeDefined(); // community B is not restricted
      await expect(forumService.addComment(inA.id, { content: `Reply is still fine ${marker}` }, ids.author)).resolves.toBeDefined();
      await expect(restrict("CREATE_THREAD")).rejects.toMatchObject({ statusCode: 409 });

      const reply = await restrict("REPLY");
      await expect(forumService.addComment(inA.id, { content: `Blocked reply ${marker}` }, ids.author)).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.addComment(inB.id, { content: `Reply in B ${marker}` }, ids.author)).resolves.toBeDefined();

      const members = await communityService.listMembers(c.a, ids.ownerA, "user");
      expect(members.find((item) => item.userId?.id === ids.author)?.restrictions?.map((item) => item.id).sort()).toEqual([thread.id, reply.id].sort());

      // Expiry: the restriction stops applying by itself.
      await getPrisma().forumRestriction.update({ where: { id: thread.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await expect(post("a", `After expiry ${marker}`, ids.author)).resolves.toBeDefined();
      // Lifting by a moderator.
      await communityService.liftRestriction(c.a, ids.author, reply.id, ids.modA, "user");
      await expect(forumService.addComment(inA.id, { content: `Reply after lift ${marker}` }, ids.author)).resolves.toBeDefined();
      expect((await communityService.listMembers(c.a, ids.ownerA, "user")).find((item) => item.userId?.id === ids.author)?.restrictions).toEqual([]);
    });

    it("never lets a moderator restrict the owner, a peer moderator or an administrator", async () => {
      const input = { type: "POSTING" as const, durationDays: 7 as const, reason: "Testing the rules" };
      await member(c.a, ids.admin);
      await expect(communityService.restrictMember(c.a, ids.ownerA, input, ids.modA, "user")).rejects.toMatchObject({ statusCode: 403 });
      await expect(communityService.restrictMember(c.a, ids.admin, input, ids.modA, "user")).rejects.toMatchObject({ statusCode: 403 });
      await expect(communityService.restrictMember(c.a, ids.modA, input, ids.modA, "user")).rejects.toMatchObject({ statusCode: 400 });
      await expect(communityService.restrictMember(c.a, ids.author, input, ids.ownerB, "user")).rejects.toMatchObject({ statusCode: 403 }); // moderator of another community
      // The owner may restrict a moderator.
      const onMod = await communityService.restrictMember(c.a, ids.modA, input, ids.ownerA, "user");
      await communityService.liftRestriction(c.a, ids.modA, onMod.id, ids.ownerA, "user");
    });

    it("applies a report-based restriction from a research-community moderator to that community only", async () => {
      const source = await post("a", `Report restriction source ${marker}`, ids.newbie);
      await getPrisma().communityMembership.updateMany({ where: { communityId: c.a, userId: ids.newbie }, data: { status: "active" } });
      const item = await report(source.id, ids.r1);
      const claim = await forumModerationService.claim(item.id, ids.ownerA, "user", 0);
      await forumModerationService.applyAction(item.id, "RESTRICT_USER", ids.ownerA, "user", { reason: "Repeated spam", expectedVersion: claim.version, durationDays: 7 });
      const restriction = await getPrisma().forumRestriction.findFirstOrThrow({ where: { userId: ids.newbie, revokedAt: null } });
      expect(restriction).toMatchObject({ scope: "COMMUNITY", communityId: c.a, restrictionType: "POSTING" }); // the research community, not the category
      await expect(post("a", `Newbie blocked in A ${marker}`, ids.newbie)).rejects.toMatchObject({ statusCode: 403 });
      await expect(post("b", `Newbie fine in B ${marker}`, ids.newbie)).resolves.toBeDefined();
      await getPrisma().forumRestriction.updateMany({ where: { id: restriction.id }, data: { revokedAt: new Date() } });
    });
  });

  describe("editing and replying under a ban or an archive", () => {
    it("lets a banned author delete but not edit, and reports canReply=false", async () => {
      await member(c.b, ids.banned, "member", "active");
      const mine = await post("b", `Banned author source ${marker}`, ids.banned);
      const comment = await forumService.addComment(mine.id, { content: `Comment before ban ${marker}` }, ids.banned);
      await communityService.updateMember(c.b, ids.banned, { status: "banned" }, ids.ownerB, "user");
      await expect(forumService.updatePost(mine.id, { content: `Edited ${marker}` }, ids.banned)).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.updateComment(comment.id, { content: `Edited comment ${marker}` }, ids.banned)).rejects.toMatchObject({ statusCode: 403 });
      expect((await forumService.getPost(mine.id, ids.banned, "user")).canReply).toBe(false);
      expect((await forumService.getPost(mine.id, ids.ownerB, "user")).canReply).toBe(true);
      await expect(forumService.deleteComment(comment.id, ids.banned, "user")).resolves.toBeUndefined();
      await expect(forumService.deletePost(mine.id, ids.banned, "user")).resolves.toBeUndefined();
    });

    it("freezes editing in an archived community, while deleting still works", async () => {
      const mine = await post("b", `Archived edit source ${marker}`, ids.author);
      const comment = await forumService.addComment(mine.id, { content: `Comment before archive ${marker}` }, ids.author);
      await getPrisma().community.update({ where: { id: c.b }, data: { status: "ARCHIVED" } });
      try {
        await expect(forumService.updatePost(mine.id, { content: `Edited ${marker}` }, ids.author)).rejects.toMatchObject({ statusCode: 409 });
        await expect(forumService.updateComment(comment.id, { content: `Edited comment ${marker}` }, ids.author)).rejects.toMatchObject({ statusCode: 409 });
        await expect(forumService.deleteComment(comment.id, ids.author, "user")).resolves.toBeUndefined();
        await expect(forumService.deletePost(mine.id, ids.author, "user")).resolves.toBeUndefined();
      } finally { await getPrisma().community.update({ where: { id: c.b }, data: { status: "ACTIVE" } }); }
    });
  });

  describe("auto-hide on reports", () => {
    it("hides a post after the threshold of distinct eligible reporters, ignoring new and unverified accounts", async () => {
      expect(env.FORUM_AUTO_HIDE_REPORT_THRESHOLD).toBe(3);
      const target = await post("a", `Auto hide ${marker}`, ids.author);
      const before = (await getPrisma().community.findUniqueOrThrow({ where: { id: c.a } })).threadCount;
      await member(c.a, ids.freshReporter);
      await report(target.id, ids.r1);
      await report(target.id, ids.r2);
      expect((await row(target.id)).status).toBe("active");
      // A fresh account and an unverified account report too, but neither counts.
      await report(target.id, ids.freshReporter);
      await report(target.id, ids.unverifiedReporter);
      expect((await row(target.id)).status).toBe("active");

      const third = await report(target.id, ids.r3);
      expect(third).toMatchObject({ autoHidden: true });
      expect(await row(target.id)).toMatchObject({ status: "hidden", visibilityStatus: "HIDDEN" });
      const action = await getPrisma().forumModerationAction.findFirstOrThrow({ where: { postId: target.id, action: "AUTO_HIDDEN" } });
      expect(action).toMatchObject({ actorId: null, reason: "Hidden automatically after 3 reports" });
      expect((await getPrisma().community.findUniqueOrThrow({ where: { id: c.a } })).threadCount).toBe(before - 1);

      // A moderator restores it: from then on it is exempt from auto-hide.
      await forumService.moderatePost(target.id, "THREAD_RESTORED", "Not spam", ids.ownerA, "user");
      expect((await row(target.id)).autoHideExemptAt).not.toBeNull();
      const fourth = await report(target.id, ids.r4);
      expect(fourth).toMatchObject({ autoHidden: false });
      expect((await row(target.id)).status).toBe("active");
    });

    it("keeps counting a report after a moderator claims it", async () => {
      const target = await post("a", `Claimed counts ${marker}`, ids.author);
      const first = await report(target.id, ids.r1);
      await report(target.id, ids.r2);
      await forumModerationService.claim(first.id, ids.ownerA, "user", 0); // r1's report is now "claimed", not "open"
      expect((await row(target.id)).status).toBe("active");
      const third = await report(target.id, ids.r3);
      expect(third).toMatchObject({ autoHidden: true });
      expect((await row(target.id)).status).toBe("hidden");
    });

    it("never auto-hides a post written by a community moderator or an administrator", async () => {
      const byMod = await post("a", `Moderator post ${marker}`, ids.modA);
      const byAdmin = await post("b", `Admin post ${marker}`, ids.admin);
      for (const target of [byMod, byAdmin]) {
        for (const reporter of [ids.r1, ids.r2, ids.r3]) await report(target.id, reporter);
        expect((await row(target.id)).status).toBe("active");
      }
    });

    it("hides a response the same way", async () => {
      const root = await post("a", `Comment root ${marker}`, ids.ownerA);
      const comment = await forumService.addComment(root.id, { content: `A spammy reply ${marker}` }, ids.author);
      const before = (await getPrisma().forumPost.findUniqueOrThrow({ where: { id: root.id } })).commentCount;
      for (const reporter of [ids.r1, ids.r2]) await forumModerationService.createReport({ targetType: "comment", targetId: comment.id, reason: "SPAM" }, reporter);
      expect((await getPrisma().forumComment.findUniqueOrThrow({ where: { id: comment.id } })).status).toBe("active");
      await forumModerationService.createReport({ targetType: "comment", targetId: comment.id, reason: "SPAM" }, ids.r3);
      expect(await getPrisma().forumComment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({ status: "hidden", visibilityStatus: "HIDDEN" });
      expect((await getPrisma().forumPost.findUniqueOrThrow({ where: { id: root.id } })).commentCount).toBe(before - 1);
      expect(await getPrisma().forumModerationAction.findFirst({ where: { commentId: comment.id, action: "AUTO_HIDDEN", actorId: null } })).not.toBeNull();
    });

    it("hides exactly once under concurrent reports", async () => {
      const target = await post("a", `Concurrent reports ${marker}`, ids.author);
      const results = await Promise.allSettled([ids.r1, ids.r2, ids.r3, ids.r4].map((reporter) => report(target.id, reporter)));
      expect(await getPrisma().forumModerationAction.count({ where: { postId: target.id, action: "AUTO_HIDDEN" } })).toBe(1);
      expect((await row(target.id)).status).toBe("hidden");
      for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ statusCode: 404 }); // the post was already hidden
    });
  });

  describe("link limit and duplicates", () => {
    it("limits raw links for a new account, but not DOI links or an older account", async () => {
      const links = (count: number) => Array.from({ length: count }, (_, index) => `https://example.org/page-${index}`).join(" ");
      await member(c.a, ids.newbie);
      await expect(post("a", `Too many links ${marker}`, ids.newbie, `See ${links(env.FORUM_NEW_ACCOUNT_MAX_LINKS + 1)} ${marker}`)).rejects.toMatchObject({ statusCode: 400, message: `New accounts can include at most ${env.FORUM_NEW_ACCOUNT_MAX_LINKS} links` });
      await expect(post("a", `Few links ${marker}`, ids.newbie, `See ${links(env.FORUM_NEW_ACCOUNT_MAX_LINKS)} ${marker}`)).resolves.toBeDefined();
      const doi = Array.from({ length: 5 }, (_, index) => `https://doi.org/10.1000/test${index}`).join(" ");
      await expect(post("a", `DOI links ${marker}`, ids.newbie, `Sources ${doi} ${marker}`)).resolves.toBeDefined();
      await expect(post("a", `Old account links ${marker}`, ids.author, `See ${links(6)} ${marker}`)).resolves.toBeDefined();
      const root = await post("a", `Link comment root ${marker}`, ids.author);
      await expect(forumService.addComment(root.id, { content: `Spam ${links(env.FORUM_NEW_ACCOUNT_MAX_LINKS + 1)}` }, ids.newbie)).rejects.toMatchObject({ statusCode: 400 });
      await expect(forumService.addComment(root.id, { content: `Fine ${doi}` }, ids.newbie)).resolves.toBeDefined();
    });

    it("rejects the same body within the window and accepts it after", async () => {
      const body = `Exactly the same text, posted twice. ${marker}`;
      const first = await post("a", `Duplicate one ${marker}`, ids.author, body);
      await expect(post("a", `Duplicate two ${marker}`, ids.author, `  ${body.toUpperCase()}  `)).rejects.toMatchObject({ statusCode: 409 }); // case and whitespace are normalized
      await expect(post("a", `Other author same text ${marker}`, ids.ownerA, body)).resolves.toBeDefined(); // another author may say the same thing
      await getPrisma().forumPost.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - (env.FORUM_DUPLICATE_WINDOW_MINUTES + 5) * 60_000) } });
      await expect(post("a", `Duplicate three ${marker}`, ids.author, body)).resolves.toBeDefined();
    });
  });

  describe("report queue for research-community moderators", () => {
    it("shows and lets a research-community moderator claim reports of their community only", async () => {
      const inA = await post("a", `Queue A ${marker}`, ids.author);
      const inB = await post("b", `Queue B ${marker}`, ids.author);
      const reportA = await report(inA.id, ids.r1);
      const reportB = await report(inB.id, ids.r1);
      const seen = async (moderator: string, scope?: string) => (await forumModerationService.listQueue(moderator, "user", "all", scope)).map((item) => item.id);
      expect(await seen(ids.modA)).toContain(reportA.id);
      expect(await seen(ids.modA)).not.toContain(reportB.id);
      expect(await seen(ids.ownerB)).toContain(reportB.id);
      expect(await seen(ids.ownerB)).not.toContain(reportA.id);
      expect(await seen(ids.modA, c.a)).toContain(reportA.id);
      await expect(forumModerationService.claim(reportB.id, ids.modA, "user", 0)).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumModerationService.claim(reportA.id, ids.modA, "user", 0)).resolves.toMatchObject({ status: "claimed" });
    });
  });
});
