import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cache } from "../../../infrastructure/cache.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { auditService } from "../../audit/audit.service.js";
import { communityService } from "../../communities/community.service.js";
import { readProfileVersion } from "../personalization.cache.js";
import { personalizationService } from "../personalization.service.js";

const mocks = vi.hoisted(() => ({ recompute: vi.fn(), embedding: vi.fn() }));
vi.mock("../../../infrastructure/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../infrastructure/queue.js")>();
  return { ...actual, taggingQueue: { add: vi.fn().mockResolvedValue(undefined) }, embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } };
});
vi.mock("../personalization-topics.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../personalization-topics.service.js")>()),
  enqueueRecomputeForumTopics: mocks.recompute,
}));
vi.mock("../../communities/community-embedding.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../communities/community-embedding.service.js")>()),
  enqueueCommunityEmbedding: mocks.embedding,
}));

/**
 * Revision 4 (community status changes) against the real schema. Dev database: only fixtures created here are touched,
 * every destructive call filters by their ids and is skipped when the list is empty. The audit log is stubbed so no
 * audit rows are written.
 */
describe.sequential("personalization revision 4 persistence", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const term = `zq${marker} status term`;
  const userIds: string[] = [];
  const communityIds: string[] = [];
  const ids = { admin: "", owner: "", member: "", member2: "", banned: "" };
  const audit = vi.spyOn(auditService, "log");
  let incrSpy: ReturnType<typeof vi.spyOn> | undefined;

  const version = async (userId: string) => (await readProfileVersion(userId)) ?? -1;
  const versions = async (...users: string[]) => Promise.all(users.map(version));
  const makeCommunity = async (key: string, data: Record<string, unknown> = {}) => {
    const row = await getPrisma().community.create({ data: { name: `R4 ${key} ${marker}`, slug: `r4-${key}-${marker}`, ownerId: ids.owner, status: "ACTIVE", researchTopics: [term], ...data } as never });
    communityIds.push(row.id);
    return row.id;
  };
  const join = (communityId: string, userId: string, status = "active") => getPrisma().communityMembership.create({ data: { communityId, userId, role: "member", status } });
  const statusOf = async (id: string) => (await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

  beforeAll(async () => {
    const prisma = getPrisma();
    for (const key of ["admin", "owner", "member", "member2", "banned"] as const) {
      const user = await prisma.user.create({ data: { email: `r4-${key}-${marker}@example.test`, fullName: `R4 ${key}`, emailVerifiedAt: new Date(), ...(key === "admin" ? { role: "admin", systemRole: "ADMIN" } : {}) } });
      userIds.push(user.id);
      ids[key] = user.id;
    }
  });

  beforeEach(() => {
    mocks.recompute.mockReset().mockResolvedValue(undefined);
    mocks.embedding.mockReset();
    audit.mockReset().mockResolvedValue(undefined as never);
  });

  afterEach(() => { incrSpy?.mockRestore(); incrSpy = undefined; });

  afterAll(async () => {
    const prisma = getPrisma();
    if (communityIds.length) {
      await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
      await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("52. ACTIVE -> ARCHIVED recomputes, invalidates active members only, skips embedding, audits from/to", async () => {
    const id = await makeCommunity("archive");
    await join(id, ids.member);
    await join(id, ids.member2);
    await join(id, ids.banned, "banned");
    const before = await versions(ids.member, ids.member2, ids.banned);
    await communityService.setStatus(id, "ARCHIVED", ids.admin, "admin");
    const after = await versions(ids.member, ids.member2, ids.banned);
    expect(await statusOf(id)).toBe("ARCHIVED");
    expect(after[0]).toBe(before[0]! + 1);
    expect(after[1]).toBe(before[1]! + 1);
    expect(after[2]).toBe(before[2]);
    expect(mocks.recompute).toHaveBeenCalledTimes(1);
    expect(mocks.embedding).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith("community.status_changed", expect.objectContaining({ details: { from: "ACTIVE", to: "ARCHIVED" } }));
  });

  it("53. ARCHIVED -> ACTIVE recomputes, enqueues the embedding and invalidates active members", async () => {
    const id = await makeCommunity("restore", { status: "ARCHIVED" });
    await join(id, ids.member);
    await join(id, ids.banned, "banned");
    const before = await versions(ids.member, ids.banned);
    await communityService.setStatus(id, "ACTIVE", ids.admin, "admin");
    const after = await versions(ids.member, ids.banned);
    expect(await statusOf(id)).toBe("ACTIVE");
    expect(after[0]).toBe(before[0]! + 1);
    expect(after[1]).toBe(before[1]);
    expect(mocks.recompute).toHaveBeenCalledTimes(1);
    expect(mocks.embedding).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith("community.status_changed", expect.objectContaining({ details: { from: "ARCHIVED", to: "ACTIVE" } }));
  });

  it("54. the same status is an idempotent no-op: no write, no enqueue, no invalidation, no audit", async () => {
    for (const status of ["ARCHIVED", "ACTIVE"] as const) {
      const id = await makeCommunity(`noop-${status.toLowerCase()}`, { status });
      await join(id, ids.member);
      const row = await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
      const before = await version(ids.member);
      const result = await communityService.setStatus(id, status, ids.admin, "admin");
      expect(result.status).toBe(status);
      expect(await version(ids.member)).toBe(before);
      expect((await getPrisma().community.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt).toEqual(row.updatedAt);
      expect(mocks.recompute).not.toHaveBeenCalled();
      expect(mocks.embedding).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    }
  });

  it("55. approve invalidates active members and recomputes; reject does neither", async () => {
    const pending = await makeCommunity("approve", { status: "PENDING_APPROVAL" });
    await join(pending, ids.owner);
    await join(pending, ids.banned, "banned");
    const before = await versions(ids.owner, ids.banned);
    await communityService.review(pending, { decision: "approve" }, ids.admin, "admin");
    const after = await versions(ids.owner, ids.banned);
    expect(after[0]).toBe(before[0]! + 1);
    expect(after[1]).toBe(before[1]);
    expect(mocks.recompute).toHaveBeenCalledTimes(1);
    expect(mocks.embedding).toHaveBeenCalledTimes(1);

    mocks.recompute.mockClear();
    mocks.embedding.mockClear();
    const rejected = await makeCommunity("reject", { status: "PENDING_APPROVAL" });
    await join(rejected, ids.member);
    const memberBefore = await version(ids.member);
    await communityService.review(rejected, { decision: "reject", note: "no" }, ids.admin, "admin");
    expect(await statusOf(rejected)).toBe("REJECTED");
    expect(await version(ids.member)).toBe(memberBefore);
    expect(mocks.recompute).not.toHaveBeenCalled();
    expect(mocks.embedding).not.toHaveBeenCalled();
  });

  it("56. archiving removes the community-source topic from the next profile load; restoring brings it back", async () => {
    // A topic of its own: the other fixtures of this suite also carry `term` and the same member.
    const own = `zq${marker} profile term`;
    const id = await makeCommunity("profile", { researchTopics: [own] });
    await join(id, ids.member);
    const communityTopics = async () => (await personalizationService.interests(ids.member)).topics.filter((item) => item.source === "community" && item.key === own);
    expect(await communityTopics()).toHaveLength(1);
    // the profile is cached now; a second load serves it
    expect(await communityTopics()).toHaveLength(1);
    await communityService.setStatus(id, "ARCHIVED", ids.admin, "admin");
    expect(await communityTopics()).toHaveLength(0);
    await communityService.setStatus(id, "ACTIVE", ids.admin, "admin");
    expect(await communityTopics()).toHaveLength(1);
  });

  it("57. Redis failing during invalidation still returns 200 with the status committed", async () => {
    const id = await makeCommunity("redis-down");
    await join(id, ids.member);
    incrSpy = vi.spyOn(cache, "incr").mockRejectedValue(new Error("redis down"));
    const result = await communityService.setStatus(id, "ARCHIVED", ids.admin, "admin");
    expect(result.status).toBe("ARCHIVED");
    expect(await statusOf(id)).toBe("ARCHIVED");
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("58. two concurrent archive calls produce one audit entry and one set of side effects", async () => {
    const id = await makeCommunity("concurrent");
    await join(id, ids.member);
    const before = await version(ids.member);
    const results = await Promise.allSettled([
      communityService.setStatus(id, "ARCHIVED", ids.admin, "admin"),
      communityService.setStatus(id, "ARCHIVED", ids.admin, "admin"),
    ]);
    expect(results.map((item) => item.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await statusOf(id)).toBe("ARCHIVED");
    expect(audit).toHaveBeenCalledTimes(1);
    expect(mocks.recompute).toHaveBeenCalledTimes(1);
    expect(await version(ids.member)).toBe(before + 1);
  });
});
