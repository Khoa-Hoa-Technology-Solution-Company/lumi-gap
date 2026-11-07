import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cache } from "../../../infrastructure/cache.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { loadVocabulary, recomputeAllPostTopics } from "../personalization-topics.service.js";
import { invalidatePersonalizationProfile, profileCacheKey, readProfileVersion } from "../personalization.cache.js";
import { personalizationService } from "../personalization.service.js";

vi.mock("../../../infrastructure/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../infrastructure/queue.js")>();
  return { ...actual, taggingQueue: { add: vi.fn().mockResolvedValue(undefined) }, embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } };
});

/** Dev database: every destructive call filters by ids this suite created and is skipped when the list is empty. */
describe.sequential("personalization revision 3 persistence", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const term = `zq${marker} race term`;
  const userIds: string[] = [];
  const communityIds: string[] = [];
  const postIds: string[] = [];
  const ids = { me: "", other: "", muter: "", racer: "", category: "" };

  beforeAll(async () => {
    const prisma = getPrisma();
    for (const key of ["me", "other", "muter", "racer"] as const) {
      const user = await prisma.user.create({ data: { email: `r3-${key}-${marker}@example.test`, fullName: `R3 ${key}`, emailVerifiedAt: new Date() } });
      userIds.push(user.id);
      ids[key] = user.id;
    }
    const category = await prisma.community.create({ data: { name: `R3 category ${marker}`, slug: `r3-category-${marker}`, ownerId: ids.other, status: "ACTIVE", isForumCategory: true, visibility: "public" } });
    const research = await prisma.community.create({ data: { name: `R3 research ${marker}`, slug: `r3-research-${marker}`, ownerId: ids.other, status: "ACTIVE", researchTopics: [term] } });
    communityIds.push(category.id, research.id);
    ids.category = category.id;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    if (postIds.length) await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
    if (communityIds.length) await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    if (userIds.length) {
      await prisma.userTopicMute.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userTopicFollow.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it("48. a post edited between the read and the write is not overwritten", async () => {
    const prisma = getPrisma();
    const post = await prisma.forumPost.create({ data: { authorId: ids.other, communityId: ids.category, title: `About ${term} today`, body: "Body", status: "active" } });
    postIds.push(post.id);
    expect((await loadVocabulary()).has(term)).toBe(true);

    // The first write of the job is preceded by an edit: it bumps updated_at and stores the edit's own topics.
    let edited = false;
    const racing = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property === "$executeRaw") {
          return async (...args: unknown[]) => {
            if (!edited) {
              edited = true;
              await prisma.forumPost.update({ where: { id: post.id }, data: { title: `Edited ${term}` } });
              await prisma.$executeRaw`UPDATE "forum_posts" SET "topic_keys" = ARRAY['topics-from-the-edit']::text[] WHERE "id" = ${post.id}::uuid`;
            }
            return (target.$executeRaw as (...inner: unknown[]) => Promise<number>)(...args);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const result = await recomputeAllPostTopics({ db: racing as typeof prisma, onlyIds: [post.id] });
    expect(result).toMatchObject({ scanned: 1, skippedConcurrent: 1, updated: 0 });
    const stored = await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id }, select: { topicKeys: true, derivedTopicKeys: true } });
    expect(stored.topicKeys).toEqual(["topics-from-the-edit"]);
    expect(stored.derivedTopicKeys).toEqual([]);

    // Without a concurrent edit the same job does write, and leaves updated_at alone.
    const before = (await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id }, select: { updatedAt: true } })).updatedAt;
    const second = await recomputeAllPostTopics({ onlyIds: [post.id] });
    expect(second).toMatchObject({ skippedConcurrent: 0, updated: 1 });
    const after = await prisma.forumPost.findUniqueOrThrow({ where: { id: post.id }, select: { updatedAt: true, derivedTopicKeys: true } });
    expect(after.derivedTopicKeys).toEqual([term]);
    expect(after.updatedAt.getTime()).toBe(before.getTime());
  });

  it("49. a stale profile written under an old version is never read after an invalidation", async () => {
    const readFirst = await personalizationService.interests(ids.me);
    expect(readFirst.topics).toEqual([]);
    const oldVersion = await readProfileVersion(ids.me);
    expect(oldVersion, "Redis must be up for this test").not.toBeNull();
    await personalizationService.follow(ids.me, term);
    expect(await readProfileVersion(ids.me)).toBeGreaterThan(oldVersion!);

    // A slow build that started before the change finishes now and writes its stale result under the OLD version.
    await cache.set(profileCacheKey(ids.me, oldVersion!), { profile: { activity: 0, topics: [] }, muted: [] }, 60);
    const next = await personalizationService.interests(ids.me);
    expect(next.topics.map((item) => item.key)).toEqual([term]);

    await invalidatePersonalizationProfile(ids.me);
    expect((await personalizationService.interests(ids.me)).topics.map((item) => item.key)).toEqual([term]);
  });

  it("50. 100 mutes are fine, the 101st is 409, re-muting at the limit is idempotent", async () => {
    const prisma = getPrisma();
    await prisma.userTopicMute.createMany({ data: Array.from({ length: 99 }, (_, index) => ({ userId: ids.muter, topicKey: `zq${marker} m${index}`, label: `m${index}` })) });
    await expect(personalizationService.mute(ids.muter, `zq${marker} hundredth`)).resolves.toBeUndefined();
    expect(await prisma.userTopicMute.count({ where: { userId: ids.muter } })).toBe(100);
    await expect(personalizationService.mute(ids.muter, `zq${marker} overflow`)).rejects.toMatchObject({ statusCode: 409 });
    await expect(personalizationService.mute(ids.muter, `zq${marker} m3`)).resolves.toBeUndefined();
    expect(await prisma.userTopicMute.count({ where: { userId: ids.muter } })).toBe(100);
    // unmuting frees a slot
    await personalizationService.unmute(ids.muter, `zq${marker} m4`);
    await expect(personalizationService.mute(ids.muter, `zq${marker} overflow`)).resolves.toBeUndefined();
  });

  it("50. concurrent mutes cannot pass the limit", async () => {
    const prisma = getPrisma();
    await prisma.userTopicMute.createMany({ data: Array.from({ length: 97 }, (_, index) => ({ userId: ids.racer, topicKey: `zq${marker} r${index}`, label: `r${index}` })) });
    const settled = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => personalizationService.mute(ids.racer, `zq${marker} racing ${index}`)));
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(3);
    expect(settled.filter((item) => item.status === "rejected").every((item) => (item as PromiseRejectedResult).reason?.statusCode === 409)).toBe(true);
    expect(await prisma.userTopicMute.count({ where: { userId: ids.racer } })).toBe(100);
  });
});
