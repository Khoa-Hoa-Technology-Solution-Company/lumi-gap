import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../generated/prisma/client.js";
import { cache } from "../../../infrastructure/cache.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { communityService } from "../../communities/community.service.js";
import { forumService } from "../../forum/forum.service.js";
import { profileCacheKey, readProfileVersion } from "../personalization.cache.js";
import { fetchCandidates } from "../personalization.repository.js";
import { tierOf } from "../personalization.rules.js";
import { personalizationService } from "../personalization.service.js";

// Joins and follows enqueue jobs; keep tests from feeding a running dev worker.
vi.mock("../../../infrastructure/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../infrastructure/queue.js")>();
  return { ...actual, taggingQueue: { add: vi.fn().mockResolvedValue(undefined) }, embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } };
});
// Community suggestions try an embedding when topic matches do not fill the list: it must degrade, never fail.
vi.mock("../../embeddings/embedding.factory.js", () => ({
  getEmbeddingProvider: () => ({ embed: async () => { throw new Error("embedding unavailable in test"); } }),
}));

/**
 * Revision 2 against the real schema. Dev database: every destructive call filters by ids this suite created and is
 * skipped when the list is empty.
 */
describe.sequential("personalization revision 2 persistence", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const term = (name: string) => `zq${marker} ${name}`;
  const userIds: string[] = [];
  const communityIds: string[] = [];
  const postIds: string[] = [];
  const ids = { me: "", other: "", reader: "", replier: "", admin: "", category: "" };
  const c = { joined: "", archived: "", banned: "", joinable: "", posting: "", big: "", small: "", mutedOnly: "" };

  const makeUser = async (key: keyof typeof ids, data: Record<string, unknown> = {}) => {
    const user = await getPrisma().user.create({ data: { email: `r2-${key}-${marker}@example.test`, fullName: `R2 ${key}`, emailVerifiedAt: new Date(), ...data } });
    userIds.push(user.id);
    ids[key] = user.id;
  };
  const makeCommunity = async (key: keyof typeof c, topics: string[], data: Record<string, unknown> = {}) => {
    const row = await getPrisma().community.create({ data: { name: `R2 ${key} ${marker}`, slug: `r2-${key}-${marker}`, ownerId: ids.other, status: "ACTIVE", researchTopics: topics, ...data } as never });
    communityIds.push(row.id);
    c[key] = row.id;
  };
  const member = (communityId: string, userId: string, status = "active") => getPrisma().communityMembership.create({ data: { communityId, userId, role: "member", status } });
  // The entry of the CURRENT profile version: an invalidation bumps the version, so the new key starts empty.
  const cached = async () => cache.get<unknown>(profileCacheKey(ids.me, (await readProfileVersion(ids.me)) ?? -1));

  beforeAll(async () => {
    const prisma = getPrisma();
    await makeUser("admin", { role: "admin", systemRole: "ADMIN" });
    for (const key of ["me", "other", "reader", "replier"] as const) await makeUser(key);
    const category = await prisma.community.create({ data: { name: `R2 category ${marker}`, slug: `r2-category-${marker}`, ownerId: ids.admin, status: "ACTIVE", isForumCategory: true, visibility: "public" } });
    communityIds.push(category.id);
    ids.category = category.id;
    await makeCommunity("joined", [term("alpha"), term("beta")]);
    await makeCommunity("archived", [term("gamma")], { status: "ARCHIVED" });
    await makeCommunity("banned", [term("delta")]);
    await makeCommunity("joinable", [term("epsilon")]);
    await makeCommunity("posting", [term("zeta")]);
    await makeCommunity("big", [term("alpha")], { memberCount: 20 });
    await makeCommunity("small", [term("alpha")], { memberCount: 10 });
    await makeCommunity("mutedOnly", [term("beta")], { memberCount: 30 });
    await member(c.joined, ids.me);
    await member(c.archived, ids.me);
    await member(c.banned, ids.me, "banned");
  });

  afterAll(async () => {
    const prisma = getPrisma();
    if (postIds.length) {
      await prisma.forumComment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPostView.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
    }
    if (communityIds.length) {
      await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
      await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    }
    if (userIds.length) {
      await prisma.userTopicFollow.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userTopicMute.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it("34. a banned membership and an archived community give no community topics; an active one does", async () => {
    const topics = (await personalizationService.interests(ids.me)).topics;
    const bySource = (source: string) => topics.filter((item) => item.source === source).map((item) => item.key);
    expect(bySource("community").sort()).toEqual([term("alpha"), term("beta")].sort());
    expect(topics.find((item) => item.key === term("alpha"))).toMatchObject({ weight: 0.5, viaCommunity: { id: c.joined, name: `R2 joined ${marker}` } });
    expect(topics.some((item) => item.key === term("gamma") || item.key === term("delta"))).toBe(false);
  });

  it("37. joining, leaving and posting into a community each clear the cached profile", async () => {
    await personalizationService.interests(ids.me);
    expect(await cached(), "the profile must be cached before each action (is Redis up?)").not.toBeNull();
    await communityService.join(c.joinable, ids.me);
    expect(await cached()).toBeNull();

    await personalizationService.interests(ids.me);
    expect(await cached()).not.toBeNull();
    await communityService.leave(c.joinable, ids.me);
    expect(await cached()).toBeNull();

    await personalizationService.interests(ids.me);
    expect(await cached()).not.toBeNull();
    const post = await forumService.createPost({ communityId: ids.category, researchCommunityId: c.posting, title: `R2 auto join ${marker}`, content: `Body ${marker}` }, ids.me);
    postIds.push(post.id);
    expect(await getPrisma().communityMembership.count({ where: { communityId: c.posting, userId: ids.me, status: "active" } })).toBe(1);
    expect(await cached()).toBeNull();
  });

  it("37b. banning and unbanning a member clears the cached profile", async () => {
    await personalizationService.interests(ids.me);
    expect(await cached()).not.toBeNull();
    await communityService.updateMember(c.joined, ids.me, { status: "banned" }, ids.admin, "admin");
    expect(await cached()).toBeNull();
    expect((await personalizationService.interests(ids.me)).topics.some((item) => item.key === term("alpha") && item.source === "community")).toBe(false);
    await communityService.updateMember(c.joined, ids.me, { status: "active" }, ids.admin, "admin");
    expect(await cached()).toBeNull();
  });

  it("38-39. window stats: a re-reading viewer is one reader; the author's own replies do not count; a reader who replied counts once", async () => {
    const prisma = getPrisma();
    const post = await prisma.forumPost.create({ data: { authorId: ids.other, communityId: ids.category, title: `R2 stats ${marker}`, body: "Body", status: "active" } });
    postIds.push(post.id);
    // One row per viewer however often they come back.
    await prisma.forumPostView.create({ data: { postId: post.id, viewerKey: `user:${ids.reader}` } });
    await prisma.forumPostView.update({ where: { postId_viewerKey: { postId: post.id, viewerKey: `user:${ids.reader}` } }, data: { viewedAt: new Date() } });
    await prisma.forumPostView.update({ where: { postId_viewerKey: { postId: post.id, viewerKey: `user:${ids.reader}` } }, data: { viewedAt: new Date() } });
    const stats = async () => (await fetchCandidates({
      userId: ids.me, visibilitySql: Prisma.sql`TRUE`, since: new Date(Date.now() - 14 * 86_400_000), windowSince: new Date(Date.now() - 14 * 86_400_000),
      excludePostIds: [], limit: 500,
    })).find((row) => row.id === post.id)!;

    const first = await stats();
    expect([first.readers, first.repliers]).toEqual([1, 0]);
    expect(tierOf(first, new Date())).toBe("new");

    await prisma.forumComment.create({ data: { postId: post.id, postNumber: 2, authorId: ids.other, body: "The author replies to themself" } });
    expect((await stats()).repliers).toBe(0);

    await prisma.forumComment.create({ data: { postId: post.id, postNumber: 3, authorId: ids.reader, body: "A reader replies" } });
    const mixed = await stats();
    expect([mixed.readers, mixed.repliers, mixed.readerRepliers]).toEqual([1, 1, 1]);
    // heat = 1 + 2 = 3 but only one participant: still not trending.
    expect(tierOf(mixed, new Date())).toBe("new");

    await prisma.forumComment.create({ data: { postId: post.id, postNumber: 4, authorId: ids.replier, body: "Another person replies" } });
    const busy = await stats();
    expect([busy.repliers, busy.readerRepliers]).toEqual([2, 1]);
    expect(tierOf(busy, new Date())).toBe("trending");
  });

  it("44. suggests only communities with no membership row, ignores muted topics, orders by sum of W then member count, and survives an embedding failure", async () => {
    await personalizationService.follow(ids.me, term("alpha"));
    await personalizationService.mute(ids.me, term("beta"));
    const suggestions = await personalizationService.communities(ids.me);
    const ours = suggestions.filter((item) => item.name.endsWith(marker));
    expect(ours.map((item) => item.name)).toEqual([`R2 big ${marker}`, `R2 small ${marker}`]);
    expect(ours.every((item) => item.matchReason === "topic" && item.matchedTopics.some((topic) => topic.key === term("alpha")))).toBe(true);
    // joined (active), archived, banned and muted-only communities are never offered
    for (const hidden of ["joined", "archived", "banned", "mutedOnly"]) expect(ours.some((item) => item.name === `R2 ${hidden} ${marker}`), hidden).toBe(false);
    expect(suggestions.length).toBeLessThanOrEqual(6);
    await personalizationService.unmute(ids.me, term("beta"));
  });
});
