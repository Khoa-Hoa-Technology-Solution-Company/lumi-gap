import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { publicForumActivity } from "../../academic-profiles/academic-forum-activity.service.js";
import { forumCategoryService } from "../forum-category.service.js";
import { forumService } from "../forum.service.js";
import { forumPostVisibilityWhere } from "../forum-visibility.js";
import { communitySummaryService } from "../../communities/community-summary.service.js";
import { forumModerationService } from "../forum-moderation.service.js";

// Community changes enqueue jobs; keep tests from feeding a running dev worker.
vi.mock("../../../infrastructure/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../infrastructure/queue.js")>();
  return { ...actual, embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } };
});

/**
 * Posts scoped to a research community (Phase 2). Every id used in a destructive call below was created by this
 * suite and every list is guarded, because these tests run against the dev database.
 */
describe.sequential("forum posts scoped to a research community", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const word = `zq${marker}`;
  const userIds: string[] = [];
  const communityIds: string[] = [];
  const postIds: string[] = [];
  const gapIds: string[] = [];
  const ids = { admin: "", author: "", writer: "", mod: "", otherMod: "", catMod: "", banned: "", bannedPriv: "", pendingPriv: "", outsider: "" };
  const c = { category: "", priv: "", pub: "", other: "" };
  const posts = { priv: "", pub: "", otherPriv: "", extra: "", adminPub: "" };
  const gaps = { outsider: "", author: "" };

  const makeUser = async (key: keyof typeof ids, data: Record<string, unknown> = {}) => {
    const user = await getPrisma().user.create({ data: { email: `frc-${key}-${marker}@example.test`, fullName: `Frc ${key}`, ...data } });
    userIds.push(user.id);
    ids[key] = user.id;
  };
  const makeCommunity = async (key: "priv" | "pub" | "other", data: Record<string, unknown>) => {
    const row = await getPrisma().community.create({ data: { name: `Frc ${key} ${marker}`, slug: `frc-${key}-${marker}`, ownerId: ids.author, status: "ACTIVE", ...data } as never });
    communityIds.push(row.id);
    c[key] = row.id;
  };
  const member = (communityId: string, userId: string, role = "member", status = "active") =>
    getPrisma().communityMembership.create({ data: { communityId, userId, role, status } });
  const createPost = async (key: keyof typeof posts, researchCommunityId: string, title: string, userId = ids.writer) => {
    const post = await forumService.createPost({ communityId: c.category, researchCommunityId, title, content: `Body ${title}`, tags: [`ztag-${marker}-${key}`] }, userId);
    postIds.push(post.id);
    posts[key] = post.id;
    return post;
  };
  const feedIds = async (viewer: string | undefined, role: "user" | "admin" | undefined, filter: Record<string, unknown> = {}) =>
    (await forumService.listPosts({ query: word, ...filter }, 1, 30, viewer, role)).data.map((row) => row.id);

  beforeAll(async () => {
    const prisma = getPrisma();
    await makeUser("admin", { role: "admin", systemRole: "ADMIN" });
    for (const key of ["author", "writer", "mod", "otherMod", "catMod", "banned", "bannedPriv", "pendingPriv", "outsider"] as const) await makeUser(key);
    await prisma.academicProfile.create({ data: { userId: ids.writer, profileVisibility: "PUBLIC" } });
    const category = await prisma.community.create({ data: { name: `Frc category ${marker}`, slug: `frc-category-${marker}`, ownerId: ids.admin, status: "ACTIVE", isForumCategory: true } });
    communityIds.push(category.id);
    c.category = category.id;
    await member(c.category, ids.catMod, "moderator");
    await makeCommunity("priv", { visibility: "private", researchTopics: [word] });
    await makeCommunity("pub", { visibility: "public" });
    await makeCommunity("other", { visibility: "private" });
    await Promise.all([
      member(c.priv, ids.author, "owner"), member(c.priv, ids.mod, "moderator"), member(c.priv, ids.writer), member(c.priv, ids.bannedPriv, "member", "banned"), member(c.priv, ids.pendingPriv, "member", "pending"),
      member(c.pub, ids.author, "owner"), member(c.pub, ids.writer), member(c.pub, ids.banned, "member", "banned"),
      member(c.other, ids.otherMod, "owner"), member(c.other, ids.author, "member"), member(c.other, ids.writer),
    ]);
    const gap = (userId: string) => prisma.researchGap.create({ data: { topic: `Frc topic ${marker}`, normalizedTopic: `frc-${marker}-${userId.slice(0, 6)}`, title: `Gap about ${word} things`, description: "Candidate gap", rationale: "Test", source: "user", userId, forumShareable: true } });
    gaps.outsider = (await gap(ids.outsider)).id;
    gaps.author = (await gap(ids.writer)).id;
    gapIds.push(gaps.outsider, gaps.author);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    // Only ids this suite created; an empty list must never reach a filter.
    if (postIds.length) {
      const commentIds = (await prisma.forumComment.findMany({ where: { postId: { in: postIds } }, select: { id: true } })).map((row) => row.id);
      await prisma.forumModerationAction.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.contentReport.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumVote.deleteMany({ where: { OR: [{ postId: { in: postIds } }, ...(commentIds.length ? [{ commentId: { in: commentIds } }] : [])] } });
      await prisma.forumReaction.deleteMany({ where: { targetId: { in: [...postIds, ...commentIds] } } });
      await prisma.forumThreadFollow.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPostTag.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPostGap.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumComment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
    }
    await prisma.forumTag.deleteMany({ where: { slug: { contains: marker } } });
    if (gapIds.length) await prisma.researchGap.deleteMany({ where: { id: { in: gapIds } } });
    if (communityIds.length) {
      await prisma.notification.deleteMany({ where: { targetUuid: { in: communityIds } } });
      await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
      await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    }
    if (userIds.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.academicProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it("only active members (and admins) may post into a community; categories are not research scopes", async () => {
    await expect(createPost("priv", c.priv, `Outsider ${word}`, ids.outsider)).rejects.toMatchObject({ statusCode: 403 });
    await expect(createPost("priv", c.category, `Category as scope ${word}`)).rejects.toMatchObject({ statusCode: 400 });
    await expect(createPost("pub", c.pub, `Banned ${word}`, ids.banned)).rejects.toMatchObject({ statusCode: 403 });
    await createPost("priv", c.priv, `Private topic ${word}`);
    await createPost("pub", c.pub, `Public topic ${word}`);
    await createPost("otherPriv", c.other, `Other private ${word}`);
    const adminPost = await createPost("adminPub", c.pub, `Admin topic ${word}`, ids.admin);
    expect(adminPost.researchCommunity).toMatchObject({ slug: `frc-pub-${marker}`, visibility: "public" });
    expect((await getPrisma().forumPost.findUniqueOrThrow({ where: { id: posts.priv } })).researchCommunityId).toBe(c.priv);
  });

  it("the database trigger refuses a forum category as the research scope", async () => {
    await expect(getPrisma().forumPost.update({ where: { id: posts.pub }, data: { researchCommunityId: c.category } })).rejects.toThrow(/research community/);
  });

  it("threadCount is recomputed from visible posts on create, hide, restore and delete", async () => {
    const threadCount = async () => (await getPrisma().community.findUniqueOrThrow({ where: { id: c.priv } })).threadCount;
    expect(await threadCount()).toBe(1);
    await forumService.moderatePost(posts.priv, "THREAD_HIDDEN", "test", ids.mod, "user");
    expect(await threadCount()).toBe(0);
    await forumService.moderatePost(posts.priv, "THREAD_RESTORED", "test", ids.mod, "user");
    expect(await threadCount()).toBe(1);
    const extra = await createPost("extra", c.priv, `Second private ${word}`);
    expect(await threadCount()).toBe(2);
    await forumService.deletePost(extra.id, ids.writer, "user");
    expect(await threadCount()).toBe(1);
  });

  describe("an outsider never sees a private community post", () => {
    it("feed and search", async () => {
      expect(await feedIds(ids.outsider, "user")).not.toContain(posts.priv);
      expect(await feedIds(undefined, undefined)).not.toContain(posts.priv);
      expect(await feedIds(ids.outsider, "user", { communityId: `frc-category-${marker}` })).not.toContain(posts.priv);
      expect(await feedIds(ids.outsider, "user")).toContain(posts.pub);
      for (const sort of ["latest", "popular", "unanswered"] as const) expect(await feedIds(ids.outsider, "user", { sort })).not.toContain(posts.priv);
      // Members, the community's moderators and admins do see it.
      for (const [viewer, role] of [[ids.author, "user"], [ids.mod, "user"], [ids.admin, "admin"]] as const) expect(await feedIds(viewer, role)).toContain(posts.priv);
      // A banned member is not an active member.
      expect(await feedIds(ids.banned, "user")).not.toContain(posts.otherPriv);
    });

    it("a banned or pending member is not a member: no feed, search, detail, comments or activity", async () => {
      for (const viewer of [ids.bannedPriv, ids.pendingPriv]) {
        expect(await feedIds(viewer, "user")).not.toContain(posts.priv);
        expect(await feedIds(viewer, "user", { sort: "latest", communityId: `frc-category-${marker}` })).not.toContain(posts.priv);
        await expect(forumService.getPost(posts.priv, viewer, "user")).rejects.toMatchObject({ statusCode: 404 });
        await expect(forumService.listComments(posts.priv, 1, 20, viewer, "user")).rejects.toMatchObject({ statusCode: 404 });
        await expect(forumService.listPosts({ researchCommunityId: `frc-priv-${marker}` }, 1, 20, viewer, "user")).rejects.toMatchObject({ statusCode: 403 });
        expect((await publicForumActivity(ids.writer, "topics", 1, viewer, "user")).items.map((item) => item.topicId)).not.toContain(posts.priv);
      }
    });

    it("community feed is members-only (403) and works for members", async () => {
      await expect(forumService.listPosts({ researchCommunityId: `frc-priv-${marker}` }, 1, 20, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 403 });
      await expect(forumService.listPosts({ researchCommunityId: `frc-priv-${marker}` }, 1, 20)).rejects.toMatchObject({ statusCode: 403 });
      expect((await forumService.listPosts({ researchCommunityId: `frc-priv-${marker}` }, 1, 20, ids.author, "user")).data.map((row) => row.id)).toEqual([posts.priv]);
      expect((await forumService.listPosts({ researchCommunityId: `frc-pub-${marker}` }, 1, 20, ids.outsider, "user")).data.map((row) => row.id)).toContain(posts.pub);
    });

    it("post detail, comments, views and reactions (404)", async () => {
      await expect(forumService.getPost(posts.priv, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
      await expect(forumService.getPost(posts.priv)).rejects.toMatchObject({ statusCode: 404 });
      await expect(forumService.listComments(posts.priv, 1, 20, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
      await expect(forumService.recentViews(posts.priv, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
      await expect(forumService.reactionPeople("topic", posts.priv, undefined, 1, 20, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
      await expect(forumService.listPostRevisions(posts.priv, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
      expect((await forumService.getPost(posts.priv, ids.author, "user")).id).toBe(posts.priv);
      expect((await forumService.getPost(posts.priv, ids.admin, "admin")).id).toBe(posts.priv);
    });

    it("writes: comment, vote, react and follow are refused as if the post did not exist", async () => {
      await expect(forumService.addComment(posts.priv, { content: "Let me in" }, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
      await expect(forumService.vote("post", posts.priv, 1, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
      await expect(forumService.react("post", posts.priv, "LIKE", true, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
      await expect(forumService.follow(posts.priv, ids.outsider, true)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("related threads and discovery", async () => {
      await expect(forumService.postDiscovery(posts.priv, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
      const asOutsider = await forumService.postDiscovery(posts.pub, ids.outsider, "user");
      const shown = [...asOutsider.related, ...asOutsider.suggested].map((row) => row.id);
      expect(shown).not.toContain(posts.priv);
      const asMember = await forumService.postDiscovery(posts.pub, ids.author, "user");
      expect([...asMember.related, ...asMember.suggested].map((row) => row.id)).toContain(posts.priv);
    });

    it("tag suggestions", async () => {
      const tag = `ztag-${marker}-priv`;
      expect((await forumService.tagOptions(tag, ids.outsider, "user")).map((row) => row.slug)).toEqual([]);
      expect((await forumService.tagOptions(tag, ids.author, "user")).length).toBe(1);
      expect((await forumService.tagOptions(`ztag-${marker}-pub`, ids.outsider, "user")).length).toBe(1);
    });

    it("user forum activity", async () => {
      const topicTitles = async (viewer?: string, role?: "user" | "admin") => (await publicForumActivity(ids.writer, "topics", 1, viewer, role)).items.map((item) => item.topicId);
      expect(await topicTitles(ids.outsider, "user")).not.toContain(posts.priv);
      expect(await topicTitles()).not.toContain(posts.priv);
      expect(await topicTitles(ids.outsider, "user")).toContain(posts.pub);
      expect(await topicTitles(ids.mod, "user")).toContain(posts.priv);
      expect(await topicTitles(ids.admin, "admin")).toContain(posts.priv);
    });

    it("category counters", async () => {
      const count = async (viewer?: string, role?: "user" | "admin") => (await forumCategoryService.list(false, role, viewer)).find((row) => row.id === c.category)?.topicCount;
      const outsiderCount = await count(ids.outsider, "user");
      const memberCount = await count(ids.author, "user");
      // priv and otherPriv are both private research communities the author belongs to.
      expect(memberCount! - outsiderCount!).toBe(2);
      expect(await count(ids.admin, "admin")).toBe(memberCount);
    });

    it("gap discussion drawer", async () => {
      const outsiderView = await forumService.gapDiscussionContext(gaps.outsider, ids.outsider, "user");
      const shown = outsiderView.discussions.map((row) => row.id);
      expect(shown).toContain(posts.pub);
      expect(shown).not.toContain(posts.priv);
      const memberView = await forumService.gapDiscussionContext(gaps.author, ids.writer, "user");
      expect(memberView.discussions.map((row) => row.id)).toContain(posts.priv);
    });

    it("the moderation queue hides reports of a private post from a category moderator who is not a member", async () => {
      await forumModerationService.createReport({ targetType: "post", targetId: posts.priv, reason: "SPAM" }, ids.author);
      await expect(forumModerationService.createReport({ targetType: "post", targetId: posts.priv, reason: "SPAM" }, ids.outsider)).rejects.toMatchObject({ statusCode: 404 });
      const targets = async (viewer: string, role: "user" | "admin") => (await forumModerationService.listQueue(viewer, role, "all", c.category)).map((row) => row.postId);
      const privPublicId = (await getPrisma().forumPost.findUniqueOrThrow({ where: { id: posts.priv } })).id;
      expect(await targets(ids.catMod, "user")).not.toContain(privPublicId);
      expect(await targets(ids.admin, "admin")).toContain(privPublicId);
      const listed = await forumService.listReports(c.category, "all", ids.catMod, "user");
      expect(listed.map((row) => row.postId)).not.toContain(privPublicId);
    });

    it("the builder is a no-op for admins and for posts without a research community", async () => {
      expect(await forumPostVisibilityWhere({ role: "admin" })).toEqual({});
      expect(await forumPostVisibilityWhere({ userId: ids.outsider, role: "user" })).toMatchObject({ OR: [{ researchCommunityId: null }, { researchCommunityId: { notIn: expect.arrayContaining([c.priv, c.other]) } }] });
    });
  });

  it("community moderators moderate their own community's posts but not another's", async () => {
    await expect(forumService.moderatePost(posts.otherPriv, "THREAD_HIDDEN", "no", ids.mod, "user")).rejects.toMatchObject({ statusCode: 403 });
    await expect(forumService.moderatePost(posts.priv, "THREAD_HIDDEN", "no", ids.otherMod, "user")).rejects.toMatchObject({ statusCode: 403 });
    await expect(forumService.moderatePost(posts.priv, "THREAD_HIDDEN", "no", ids.outsider, "user")).rejects.toMatchObject({ statusCode: 403 });
    const hidden = await forumService.moderatePost(posts.otherPriv, "THREAD_HIDDEN", "ok", ids.otherMod, "user");
    expect(hidden.status).toBe("hidden");
    await forumService.moderatePost(posts.otherPriv, "THREAD_RESTORED", "ok", ids.otherMod, "user");
    expect((await forumService.getPost(posts.priv, ids.mod, "user")).canModerate).toBe(true);
    expect((await forumService.getPost(posts.pub, ids.mod, "user")).canModerate).toBe(false);
  });

  it("a banned member cannot comment; members and outsiders of a public community can", async () => {
    await expect(forumService.addComment(posts.pub, { content: "banned reply" }, ids.banned, "user")).rejects.toMatchObject({ statusCode: 403 });
    await expect(forumService.react("post", posts.pub, "LIKE", true, ids.banned, "user")).rejects.toMatchObject({ statusCode: 403 });
    expect((await forumService.addComment(posts.pub, { content: "outsider reply" }, ids.outsider, "user")).content).toContain("outsider reply");
    expect((await forumService.addComment(posts.priv, { content: "member reply" }, ids.author, "user")).content).toContain("member reply");
  });

  it("comment notifications skip people who can no longer read a private post", async () => {
    await getPrisma().forumThreadFollow.create({ data: { postId: posts.priv, userId: ids.outsider, notificationLevel: "WATCHING" } });
    await forumService.addComment(posts.priv, { content: "notify the readers only" }, ids.mod, "user");
    const notified = await getPrisma().notification.findMany({ where: { targetUuid: posts.priv, userId: { in: [ids.outsider, ids.writer] } }, select: { userId: true } });
    expect(notified.map((row) => row.userId)).toContain(ids.writer);
    expect(notified.map((row) => row.userId)).not.toContain(ids.outsider);
  });

  it("community summary reads the community's own posts", async () => {
    const status = await communitySummaryService.status(c.priv, ids.author, "user");
    expect(status.postCount).toBeGreaterThanOrEqual(1);
    const other = await communitySummaryService.status(c.pub, ids.author, "user");
    expect(other.postCount).toBeGreaterThanOrEqual(1);
  });

  it("archiving the community freezes its posts: no new posts, comments, votes or reactions", async () => {
    await getPrisma().community.update({ where: { id: c.pub }, data: { status: "ARCHIVED" } });
    await expect(createPost("pub", c.pub, `After archive ${word}`)).rejects.toMatchObject({ statusCode: 409 });
    await expect(forumService.addComment(posts.pub, { content: "too late" }, ids.author, "user")).rejects.toMatchObject({ statusCode: 409 });
    await expect(forumService.vote("post", posts.pub, 1, ids.author, "user")).rejects.toMatchObject({ statusCode: 409 });
    await expect(forumService.react("post", posts.pub, "LIKE", true, ids.author, "user")).rejects.toMatchObject({ statusCode: 409 });
    // Still readable.
    expect((await forumService.getPost(posts.pub, ids.outsider, "user")).id).toBe(posts.pub);
    expect((await forumService.getPost(posts.pub, ids.outsider, "user")).canReply).toBe(false);
    await getPrisma().community.update({ where: { id: c.pub }, data: { status: "ACTIVE" } });
  });

  it("leaving a private community hides its posts from that member immediately", async () => {
    await member(c.priv, ids.outsider);
    expect(await feedIds(ids.outsider, "user")).toContain(posts.priv);
    await getPrisma().communityMembership.deleteMany({ where: { communityId: c.priv, userId: ids.outsider } });
    expect(await feedIds(ids.outsider, "user")).not.toContain(posts.priv);
    await expect(forumService.getPost(posts.priv, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("hard-deleting a community that still has posts is refused, and the posts stay private", async () => {
    await expect(getPrisma().community.delete({ where: { id: c.priv } })).rejects.toThrow();
    expect((await getPrisma().forumPost.findUniqueOrThrow({ where: { id: posts.priv } })).researchCommunityId).toBe(c.priv);
    expect(await feedIds(ids.outsider, "user")).not.toContain(posts.priv);
    await expect(forumService.getPost(posts.priv, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("migration data step moves leftover posts to the default category and keeps the research scope", async () => {
    const prisma = getPrisma();
    const leftover = await prisma.community.create({ data: { name: `Frc leftover ${marker}`, slug: `frc-leftover-${marker}`, ownerId: ids.author, status: "ACTIVE" } });
    communityIds.push(leftover.id);
    const post = await prisma.forumPost.create({ data: { authorId: ids.author, communityId: leftover.id, title: `Leftover ${word}`, body: "seed" } });
    postIds.push(post.id);
    const hadDefault = Boolean(await prisma.community.findFirst({ where: { slug: "general-research", isForumCategory: true }, select: { id: true } }));
    // Replay the migration's data step, scoped to the row this test created (the real one is table-wide).
    const sql = readFileSync(fileURLToPath(new URL("../../../../prisma/migrations/20261028120000_forum_post_research_community/migration.sql", import.meta.url)), "utf8");
    const step = sql.slice(sql.indexOf('UPDATE "forum_posts" p'), sql.indexOf("-- thread_count of a research community"));
    expect(step).toContain('WHERE p."research_community_id" IS NULL');
    if (hadDefault) {
      await prisma.$executeRawUnsafe(step.replace('WHERE p."research_community_id" IS NULL', 'WHERE p."id" = $1::uuid AND p."research_community_id" IS NULL'), post.id);
      const moved = await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id } });
      expect(moved.researchCommunityId).toBe(leftover.id);
      const category = await prisma.community.findUniqueOrThrow({ where: { id: moved.communityId! } });
      expect(category).toMatchObject({ slug: "general-research", isForumCategory: true });
      expect(await prisma.forumPost.count({ where: { id: post.id, communityId: null } })).toBe(0);
    }
  });
});
