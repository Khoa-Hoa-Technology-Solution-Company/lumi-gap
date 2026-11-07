import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { AppError } from "../../../common/exceptions/app-error.js";
import { forumService } from "../../forum/forum.service.js";
import { personalizationService } from "../personalization.service.js";
import { loadTopicContext, recomputeAllPostTopics, refreshPostTopics } from "../personalization-topics.service.js";

// Follows enqueue a recompute job; keep tests from feeding a running dev worker.
vi.mock("../../../infrastructure/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../infrastructure/queue.js")>();
  return { ...actual, taggingQueue: { add: vi.fn().mockResolvedValue(undefined) }, embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } };
});

/**
 * "For you" against the real schema. These run on the dev database, so every destructive call below filters by ids
 * this suite created (collected in the arrays) and is skipped when the array is empty.
 */
describe.sequential("personalization persistence", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const topic = (name: string) => `zq${marker} ${name}`;
  const TOPIC = topic("graphs");
  const userIds: string[] = [];
  const communityIds: string[] = [];
  const postIds: string[] = [];
  const paperIds: string[] = [];
  const ids = { me: "", other: "", category: "", live: "", archived: "", bannedIn: "" };
  const posts: Record<string, string> = {};
  const MANY_TOPICS = Array.from({ length: 21 }, (_, index) => topic(`many ${index}`));
  const PROFILE_INTEREST = topic("profile interest");

  async function makePost(key: string, data: Record<string, unknown>) {
    const row = await getPrisma().forumPost.create({
      data: { authorId: ids.other, communityId: ids.category, title: `Persistence ${key} ${marker}`, body: `Body ${key}`, status: "active", ...data } as never,
    });
    postIds.push(row.id);
    posts[key] = row.id;
    await getPrisma().forumPostDailyView.create({ data: { postId: row.id, day: new Date(), count: 100_000 } });
    return row;
  }

  beforeAll(async () => {
    const prisma = getPrisma();
    const me = await prisma.user.create({ data: { email: `pers-me-${marker}@example.test`, fullName: "Pers Me", emailVerifiedAt: new Date(), researchInterests: [PROFILE_INTEREST, "Blockchain"] } });
    const other = await prisma.user.create({ data: { email: `pers-other-${marker}@example.test`, fullName: "Pers Other", emailVerifiedAt: new Date() } });
    userIds.push(me.id, other.id);
    ids.me = me.id;
    ids.other = other.id;
    const category = await prisma.community.create({ data: { name: `Pers category ${marker}`, slug: `pers-category-${marker}`, ownerId: other.id, status: "ACTIVE", isForumCategory: true, visibility: "public" } });
    const research = (key: "live" | "archived" | "bannedIn", status: string, topics: string[]) =>
      prisma.community.create({ data: { name: `Pers ${key} ${marker}`, slug: `pers-${key}-${marker}`, ownerId: other.id, status, researchTopics: topics } });
    const live = await research("live", "ACTIVE", [TOPIC, PROFILE_INTEREST, ...MANY_TOPICS]);
    const archived = await research("archived", "ARCHIVED", [TOPIC]);
    const bannedIn = await research("bannedIn", "ACTIVE", [TOPIC]);
    communityIds.push(category.id, live.id, archived.id, bannedIn.id);
    Object.assign(ids, { category: category.id, live: live.id, archived: archived.id, bannedIn: bannedIn.id });
    await prisma.communityMembership.create({ data: { communityId: bannedIn.id, userId: me.id, role: "member", status: "banned" } });

    const recent = new Date(Date.now() - 3600_000);
    // The title carries the topic: the shared dev database may have a live tagging worker that recomputes every post's
    // topics at any moment, and it must derive the same topic for this fixture as the explicit key set here.
    await makePost("match", { title: `Persistence match ${marker} about ${TOPIC}`, topicKeys: [TOPIC], lastActivityAt: recent });
    await makePost("own", { authorId: me.id, topicKeys: [TOPIC], lastActivityAt: recent });
    await makePost("read", { topicKeys: [TOPIC], lastActivityAt: recent });
    await makePost("downvoted", { topicKeys: [TOPIC], lastActivityAt: recent });
    await makePost("hidden", { topicKeys: [TOPIC], lastActivityAt: recent, visibilityStatus: "HIDDEN", status: "hidden" });
    await makePost("archivedCommunity", { researchCommunityId: archived.id, topicKeys: [TOPIC], lastActivityAt: recent });
    await makePost("bannedCommunity", { researchCommunityId: bannedIn.id, topicKeys: [TOPIC], lastActivityAt: recent });
    for (const key of ["filler1", "filler2", "filler3", "filler4"]) await makePost(key, { lastActivityAt: recent });
    await makePost("old", { topicKeys: [TOPIC], lastActivityAt: new Date(Date.now() - 200 * 86_400_000) });
    await prisma.forumPostView.create({ data: { postId: posts.read!, viewerKey: `user:${me.id}` } });
    await prisma.forumVote.create({ data: { postId: posts.downvoted!, userId: me.id, value: -1 } });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    // Every filter is an explicit id list created above; an empty list deletes nothing.
    if (postIds.length) {
      await prisma.forumPostView.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumVote.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPostPaper.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
    }
    if (communityIds.length) {
      await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
      await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    }
    if (paperIds.length) {
      await prisma.paperKeyword.deleteMany({ where: { paperId: { in: paperIds } } });
      await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
    }
    if (userIds.length) {
      await prisma.userTopicFollow.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userTopicMute.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  const researchInterests = async () => (await getPrisma().user.findUniqueOrThrow({ where: { id: ids.me }, select: { researchInterests: true } })).researchInterests;
  const topicOf = async (key: string) => (await personalizationService.interests(ids.me)).topics.find((item) => item.key === key);

  it("29. a paper keyword without keyword_id still feeds the post topics (r = 0.6)", async () => {
    const prisma = getPrisma();
    const paper = await prisma.paper.create({ data: { title: `Persistence paper ${marker}`, publicationYear: 2026, primaryProvider: "user", dataStatus: "active" } });
    paperIds.push(paper.id);
    await prisma.paperKeyword.create({ data: { paperId: paper.id, keywordId: null, keywordName: TOPIC.toUpperCase(), position: 0 } });
    const row = await makePost("withPaper", { linkedPaperId: paper.id, lastActivityAt: new Date() });
    const context = await loadTopicContext({ fresh: true });
    await refreshPostTopics(prisma, row.id, context);
    const stored = await prisma.forumPost.findUniqueOrThrow({ where: { id: row.id }, select: { topicKeys: true, derivedTopicKeys: true, derivedTopicWeights: true } });
    expect(stored.derivedTopicKeys).toEqual([TOPIC]);
    expect(stored.derivedTopicWeights.map((value) => Math.round(value * 10) / 10)).toEqual([0.6]);
  });

  it("25. following writes user_topic_follows and leaves users.research_interests byte-identical", async () => {
    const before = JSON.stringify(await researchInterests());
    await personalizationService.follow(ids.me, TOPIC);
    expect(await getPrisma().userTopicFollow.findUnique({ where: { userId_topicKey: { userId: ids.me, topicKey: TOPIC } } })).not.toBeNull();
    expect(JSON.stringify(await researchInterests())).toBe(before);
    expect(await topicOf(TOPIC)).toMatchObject({ source: "followed", matchable: true });
  });

  it("18 + 24. candidates exclude own, read, voted, hidden, archived-community, banned-community and out-of-window posts", async () => {
    // What a live worker would do at any moment: recompute this post's topics from its text.
    await recomputeAllPostTopics({ onlyIds: [posts.match!] });
    const feed = await personalizationService.forYou(ids.me, "user");
    const feedIds = feed.posts.map((post) => post.id);
    expect(feedIds).toContain(posts.match);
    for (const key of ["own", "read", "downvoted", "hidden", "archivedCommunity", "bannedCommunity", "old"]) expect(feedIds, key).not.toContain(posts[key]);
    // Only this suite's own fixtures are asserted: other dev data may add posts, so no index, length or global order.
    expect(feed.posts.find((post) => post.id === posts.match)).toMatchObject({ reasonKind: "followed", reasonTopic: { key: TOPIC } });
    expect(feed.postsBasis).toBe("personal");
  });

  it("B1/B2. limit 20 returns at most 20 distinct posts, still starts with the personal match and never an out-of-window post", async () => {
    const feed = await personalizationService.forYou(ids.me, "user", 20);
    const feedIds = feed.posts.map((post) => post.id);
    expect(feedIds.length).toBeLessThanOrEqual(20);
    expect(new Set(feedIds).size).toBe(feedIds.length);
    expect(feedIds).toContain(posts.match);
    expect(feedIds).not.toContain(posts.old);
    // the default stays five
    expect((await personalizationService.forYou(ids.me, "user")).posts.length).toBeLessThanOrEqual(5);
  });

  it("21. interests but no matching post: postsBasis explore with 5 trending or new posts", async () => {
    await personalizationService.mute(ids.me, TOPIC);
    await personalizationService.unfollow(ids.me, PROFILE_INTEREST);
    const feed = await personalizationService.forYou(ids.me, "user");
    // The profile still has a matchable interest (the academic profile one), but no visible post uses it.
    expect((await personalizationService.interests(ids.me)).topics.some((item) => item.matchable)).toBe(true);
    expect(feed.postsBasis).toBe("explore");
    expect(feed.posts.length).toBeGreaterThan(0);
    expect(feed.posts.every((post) => post.reasonKind === "trending" || post.reasonKind === "new")).toBe(true);
    expect(feed.posts.every((post) => post.id !== posts.own && post.id !== posts.read)).toBe(true);
    await personalizationService.unmute(ids.me, TOPIC);
  });

  it("26. unfollowing a profile interest keeps it as source profile; muting hides it; the academic profile is unchanged", async () => {
    const before = JSON.stringify(await researchInterests());
    const typed = `zq${marker} Profile Interest`;
    await personalizationService.follow(ids.me, typed);
    // A followed topic keeps the user's own spelling, not the lowercase curated label.
    expect(await topicOf(PROFILE_INTEREST)).toMatchObject({ source: "followed", label: typed });
    await personalizationService.unfollow(ids.me, PROFILE_INTEREST.toLowerCase());
    expect(await topicOf(PROFILE_INTEREST.toLowerCase())).toMatchObject({ source: "profile", label: PROFILE_INTEREST });
    await personalizationService.mute(ids.me, PROFILE_INTEREST);
    const after = await personalizationService.interests(ids.me);
    expect(after.topics.find((item) => item.key === PROFILE_INTEREST.toLowerCase())).toBeUndefined();
    expect(after.muted.map((item) => item.key)).toContain(PROFILE_INTEREST.toLowerCase());
    expect(JSON.stringify(await researchInterests())).toBe(before);
    await personalizationService.unmute(ids.me, PROFILE_INTEREST);
  });

  it("GET /forum/posts?topic= inside one research community matches stored keys only, not the community's own topics", async () => {
    const tagged = await makePost("topicTagged", { researchCommunityId: ids.live, topicKeys: [TOPIC], lastActivityAt: new Date() });
    const untagged = await makePost("topicUntagged", { researchCommunityId: ids.live, lastActivityAt: new Date() });
    // The community lists TOPIC in researchTopics, so a join on community topics would return both posts.
    const inCommunity = await forumService.listPosts({ researchCommunityId: ids.live, topic: TOPIC }, 1, 30, ids.me, "user");
    const found = inCommunity.data.map((row) => row.id);
    expect(found).toContain(tagged.id);
    expect(found).not.toContain(untagged.id);
  });

  it("a single-word profile interest is listed but not matchable", async () => {
    expect(await topicOf("blockchain")).toMatchObject({ source: "profile", matchable: false });
  });

  it("28. following a term outside the vocabulary gives 422 and the 21st follow gives 409", async () => {
    await expect(personalizationService.follow(ids.me, `nothing here ${marker}`)).rejects.toMatchObject({ statusCode: 422, code: "TOPIC_NOT_IN_VOCABULARY" });
    const existing = await getPrisma().userTopicFollow.count({ where: { userId: ids.me } });
    for (const name of MANY_TOPICS.slice(0, 20 - existing)) await personalizationService.follow(ids.me, name);
    expect(await getPrisma().userTopicFollow.count({ where: { userId: ids.me } })).toBe(20);
    const overflow = await personalizationService.follow(ids.me, MANY_TOPICS[20]!).catch((error: unknown) => error);
    expect(overflow).toBeInstanceOf(AppError);
    expect((overflow as AppError).statusCode).toBe(409);
  });
});
