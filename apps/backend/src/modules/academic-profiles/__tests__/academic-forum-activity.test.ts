import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { publicForumActivity } from "../academic-forum-activity.service.js";
import { PublicForumActivityQuerySchema } from "../dto/academic-profile.schema.js";

describe.sequential("Public forum activity visibility and pagination", () => {
  const prisma = getPrisma();
  const ownerId = randomUUID(), viewerId = randomUUID(), publicId = randomUUID(), privateId = randomUUID();
  const marker = randomUUID();
  const publicPost = randomUUID(), privatePost = randomUUID(), hiddenPost = randomUUID(), replyId = randomUUID();
  const postIds = [publicPost, privatePost, hiddenPost];
  beforeAll(async () => {
    await prisma.user.createMany({ data: [ownerId, viewerId].map((id) => ({ id, email: `${id}@activity-test.invalid`, fullName: "Activity test member" })) });
    await prisma.academicProfile.create({ data: { userId: ownerId, profileVisibility: "PUBLIC" } });
    await prisma.community.createMany({ data: [
      { id: publicId, ownerId, name: "Public activity test", slug: `activity-public-${marker}`, visibility: "public" },
      { id: privateId, ownerId, name: "Private activity test", slug: `activity-private-${marker}`, visibility: "private" },
    ] });
    await prisma.communityMembership.create({ data: { communityId: privateId, userId: viewerId, status: "active" } });
    await prisma.forumPost.createMany({ data: [
      { id: publicPost, authorId: ownerId, communityId: publicId, title: "Visible topic", body: "Public content", viewCount: 12 },
      { id: privatePost, authorId: ownerId, communityId: privateId, title: "Private topic", body: "Private content", viewCount: 99 },
      { id: hiddenPost, authorId: ownerId, communityId: publicId, title: "Hidden topic", body: "Hidden content", visibilityStatus: "HIDDEN" },
    ] });
    await prisma.forumComment.createMany({ data: [
      { id: replyId, postId: publicPost, postNumber: 2, authorId: ownerId, body: "Accepted public reply" },
      { postId: privatePost, postNumber: 2, authorId: ownerId, body: "Private reply" },
      { postId: publicPost, postNumber: 3, authorId: ownerId, body: "Removed reply", visibilityStatus: "REMOVED" },
    ] });
    await prisma.forumPost.update({ where: { id: publicPost }, data: { acceptedCommentId: replyId } });
    await prisma.forumReaction.createMany({ data: [
      { targetType: "post", targetId: publicPost, userId: viewerId, reaction: "LIKE" },
      { targetType: "post", targetId: privatePost, userId: ownerId, reaction: "LIKE" },
      { targetType: "comment", targetId: replyId, userId: ownerId, reaction: "INSIGHTFUL" },
      { targetType: "post", targetId: hiddenPost, userId: ownerId, reaction: "LIKE" },
    ] });
  });
  afterAll(async () => {
    await prisma.forumReaction.deleteMany({ where: { userId: { in: [ownerId, viewerId] } } });
    await prisma.forumComment.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
    await prisma.communityMembership.deleteMany({ where: { communityId: { in: [publicId, privateId] } } });
    await prisma.community.deleteMany({ where: { id: { in: [publicId, privateId] } } });
    await prisma.academicProfile.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } });
  });
  it("excludes private, hidden and removed content from lists, stats and rankings", async () => {
    const result = await publicForumActivity(ownerId, "all", 1);
    expect(result.stats).toMatchObject({ topicsCreated: 1, repliesCreated: 1, reactionsGiven: 1, reactionsReceived: 2, acceptedResponses: 1, topicViews: 12 });
    expect(result.meta.total).toBe(3);
    expect(result.items.every((item) => item.topicId === publicPost)).toBe(true);
    expect(result.topTopics.map((item) => item.topicId)).toEqual([publicPost]);
    expect(result.topReplies[0]).toMatchObject({ id: replyId, accepted: true, postNumber: 2, reactionCount: 1 });
  });
  it("includes private contributions only for active community members", async () => {
    const member = await publicForumActivity(ownerId, "all", 1, viewerId);
    expect(member.stats).toMatchObject({ topicsCreated: 2, repliesCreated: 2, reactionsGiven: 2, topicViews: 111 });
    await prisma.communityMembership.update({ where: { communityId_userId: { communityId: privateId, userId: viewerId } }, data: { status: "banned" } });
    const banned = await publicForumActivity(ownerId, "all", 1, viewerId);
    expect(banned.stats.topicsCreated).toBe(1);
  });
  it("filters reactions and keeps accurate totals on empty later pages", async () => {
    const reactions = await publicForumActivity(ownerId, "reactions", 1);
    expect(reactions.meta.total).toBe(1);
    expect(reactions.items.map((item) => item.kind)).toEqual(["reaction"]);
    const later = await publicForumActivity(ownerId, "replies", 2);
    expect(later.items).toEqual([]);
    expect(later.meta.total).toBe(1);
  });
  it("enforces private profile access before querying contributions", async () => {
    await prisma.academicProfile.update({ where: { userId: ownerId }, data: { profileVisibility: "PRIVATE" } });
    await expect(publicForumActivity(ownerId, "all", 1)).rejects.toThrow("Academic profile not found");
    const owner = await publicForumActivity(ownerId, "all", 1, ownerId);
    expect(owner.stats.topicsCreated).toBe(1);
  });
  it("rejects arbitrary filters and unbounded page inputs", () => {
    for (const query of [{ filter: "private" }, { page: -1 }, { page: 1.2 }, { page: 10001 }]) expect(PublicForumActivityQuerySchema.safeParse(query).success).toBe(false);
  });
});
