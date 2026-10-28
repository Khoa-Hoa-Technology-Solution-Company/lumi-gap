import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { notificationService } from "../../notifications/notification.service.js";
import { communityRelatedService } from "../community-related.service.js";
import { communityService, translateNameConflict } from "../community.service.js";
import type { CommunityActor } from "../community.rules.js";
import { reviewSchema, updateMemberSchema, type CommunityListQuery } from "../dto/community.schema.js";

// Community changes enqueue embedding jobs; keep tests from feeding a running dev worker.
vi.mock("../../../infrastructure/queue.js", () => ({ embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

// In-memory cache so cooldown tests never depend on a real Redis; `failing` simulates an outage.
const cacheMock = vi.hoisted(() => ({ store: new Map<string, unknown>(), failing: false }));
vi.mock("../../../infrastructure/cache.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../infrastructure/cache.js")>();
  return {
    ...actual,
    cache: {
      get: async (key: string) => { if (cacheMock.failing) throw new Error("redis down"); return cacheMock.store.get(key) ?? null; },
      set: async (key: string, value: unknown) => { if (cacheMock.failing) throw new Error("redis down"); cacheMock.store.set(key, value); },
      del: async (key: string) => { cacheMock.store.delete(key); },
    },
  };
});

const LIST_DEFAULTS: CommunityListQuery = { page: 1, pageSize: 50, sort: "recent", scope: "all" };

async function removeCreatedPaper(paperId: string) {
  // Prisma omits undefined filters, so an uncreated fixture must skip deletion.
  if (paperId) await getPrisma().paper.deleteMany({ where: { id: paperId } });
}

describe.sequential("research community lifecycle, permissions and counters", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const ids = { admin: "", lecturer: "", unverified: "", student: "", member: "", outsider: "" };
  const communityIds: string[] = [];
  const extraUserIds: string[] = [];
  const researchIds = { paper: "", gap: "", privateGap: "" };

  const actor = (key: keyof typeof ids, extra: Partial<CommunityActor> = {}): CommunityActor => ({ sub: ids[key], role: "user", systemRole: "USER", ...extra });
  const admin = (): CommunityActor => ({ sub: ids.admin, role: "admin", systemRole: "ADMIN" });
  const lecturer = (): CommunityActor => actor("lecturer", { academicProfileType: "lecturer" });
  const track = <T extends { id: string }>(community: T): T => { communityIds.push(community.id); return community; };
  const activeCount = (communityId: string) => getPrisma().communityMembership.count({ where: { communityId, status: "active" } });

  beforeAll(async () => {
    const prisma = getPrisma();
    const make = (key: string, data: Record<string, unknown> = {}) => prisma.user.create({ data: { email: `community-${key}-${marker}@example.test`, fullName: `Community ${key}`, ...data } });
    const [adminUser, lecturerUser, unverifiedUser, studentUser, memberUser, outsiderUser] = await Promise.all([
      make("admin", { role: "admin", systemRole: "ADMIN" }),
      make("lecturer", { academicProfileType: "lecturer" }),
      make("unverified", { academicProfileType: "lecturer" }),
      make("student", { academicProfileType: "student" }),
      make("member"),
      make("outsider"),
    ]);
    Object.assign(ids, { admin: adminUser.id, lecturer: lecturerUser.id, unverified: unverifiedUser.id, student: studentUser.id, member: memberUser.id, outsider: outsiderUser.id });
    await prisma.academicProfile.create({ data: { userId: lecturerUser.id, academicRole: "LECTURER", roleVerificationStatus: "VERIFIED" } });
    await prisma.academicProfile.create({ data: { userId: unverifiedUser.id, academicRole: "LECTURER", roleVerificationStatus: "SELF_DECLARED" } });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    const userIds = [...Object.values(ids), ...extraUserIds].filter(Boolean);
    await removeCreatedPaper(researchIds.paper);
    await prisma.researchGap.deleteMany({ where: { id: { in: [researchIds.gap, researchIds.privateGap].filter(Boolean) } } });
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { targetUuid: { in: communityIds } }] } });
    await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.academicProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("limits paper cleanup to an explicitly created fixture", async () => {
    const prisma = getPrisma();
    const paperIds = [crypto.randomUUID(), crypto.randomUUID()];
    await prisma.paper.createMany({ data: paperIds.map((id) => ({ id, title: `Cleanup safety ${id}`, publicationYear: 2026, primaryProvider: "user" })) });
    try {
      await removeCreatedPaper("");
      expect(await prisma.paper.count({ where: { id: { in: paperIds } } })).toBe(2);
      await removeCreatedPaper(paperIds[0]!);
      expect(await prisma.paper.findUnique({ where: { id: paperIds[0]! } })).toBeNull();
      expect(await prisma.paper.findUnique({ where: { id: paperIds[1]! } })).not.toBeNull();
    } finally {
      await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
    }
  });

  it("only admins and verified lecturers may create; proposals wait for approval", async () => {
    await expect(communityService.create({ name: `Student ${marker}` }, actor("student", { academicProfileType: "student" }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(communityService.create({ name: `Unverified ${marker}` }, actor("unverified", { academicProfileType: "lecturer" }))).rejects.toMatchObject({ statusCode: 403 });

    const proposal = track(await communityService.create({ name: `Graph Learning ${marker}`, description: "Graph neural networks", researchField: "Machine Learning", researchTopics: ["gnn"] }, lecturer()));
    expect(proposal.status).toBe("PENDING_APPROVAL");
    expect(proposal.viewerMembership).toEqual({ role: "owner", status: "active" });

    const direct = track(await communityService.create({ name: `Admin Made ${marker}` }, admin()));
    expect(direct.status).toBe("ACTIVE");
  });

  it("hides proposals from everyone except the owner and admins", async () => {
    const proposal = (await communityService.list(ids.lecturer, { ...LIST_DEFAULTS, q: `graph learning ${marker}` }, "user")).data[0];
    expect(proposal?.name).toContain("Graph Learning");
    const outsiderList = await communityService.list(ids.outsider, { ...LIST_DEFAULTS, q: `graph learning ${marker}` }, "user");
    expect(outsiderList.data).toHaveLength(0);
    await expect(communityService.get(proposal!.slug, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 404 });
    expect((await communityService.get(proposal!.slug, ids.admin, "admin")).status).toBe("PENDING_APPROVAL");
    await expect(communityService.join(proposal!.id, ids.member)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects duplicate names ignoring case and accents, and caps pending proposals", async () => {
    await expect(communityService.create({ name: `  GRAPH  learning ${marker}` }, lecturer())).rejects.toMatchObject({ statusCode: 409, details: { existing: { name: `Graph Learning ${marker}` } } });
    await expect(communityService.create({ name: `Ádmin Made ${marker}` }, admin())).rejects.toMatchObject({ statusCode: 409 });

    track(await communityService.create({ name: `Quota B ${marker}` }, lecturer()));
    track(await communityService.create({ name: `Quota C ${marker}` }, lecturer()));
    await expect(communityService.create({ name: `Quota D ${marker}` }, lecturer())).rejects.toMatchObject({ statusCode: 409 });
  });

  it("requires a note to reject, then lets the owner revise and resubmit", async () => {
    expect(reviewSchema.safeParse({ decision: "reject" }).success).toBe(false);
    expect(reviewSchema.safeParse({ decision: "reject", note: "Too broad" }).success).toBe(true);

    const [proposal] = (await communityService.list(ids.lecturer, { ...LIST_DEFAULTS, q: `graph learning ${marker}` }, "user")).data;
    await expect(communityService.review(proposal!.id, { decision: "reject", note: "Too broad" }, ids.lecturer, "user")).rejects.toMatchObject({ statusCode: 403 });
    const rejected = await communityService.review(proposal!.id, { decision: "reject", note: "Too broad" }, ids.admin, "admin");
    expect(rejected.status).toBe("REJECTED");

    await expect(communityService.resubmit(proposal!.id, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 403 });
    await communityService.update(proposal!.id, { description: "Narrowed to graph neural networks for citation data" }, ids.lecturer, "user");
    const resubmitted = await communityService.resubmit(proposal!.id, ids.lecturer, "user");
    expect(resubmitted.status).toBe("PENDING_APPROVAL");
    expect(resubmitted.reviewNote).toBeUndefined();

    const approved = await communityService.review(proposal!.id, { decision: "approve" }, ids.admin, "admin");
    expect(approved.status).toBe("ACTIVE");
    await expect(communityService.review(proposal!.id, { decision: "approve" }, ids.admin, "admin")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("supports public and private joins, declines, re-requests and bans", async () => {
    const publicCommunity = (await communityService.list(ids.member, { ...LIST_DEFAULTS, q: `graph learning ${marker}` }, "user")).data[0]!;
    expect(await communityService.join(publicCommunity.id, ids.member)).toMatchObject({ role: "member", status: "active" });
    expect(await communityService.join(publicCommunity.id, ids.member)).toMatchObject({ status: "active" });
    expect(await activeCount(publicCommunity.id)).toBe(2);

    const privateCommunity = track(await communityService.create({ name: `Closed Lab ${marker}`, visibility: "private" }, admin()));
    await communityService.update(privateCommunity.id, { description: "Members only" }, ids.admin, "admin");
    expect(await communityService.join(privateCommunity.id, ids.member)).toMatchObject({ status: "pending" });
    expect((await communityService.get(privateCommunity.id, ids.member, "user")).contentRestricted).toBe(true);
    await communityService.updateMember(privateCommunity.id, ids.member, { status: "declined" }, ids.admin, "admin");
    expect(await communityService.join(privateCommunity.id, ids.member)).toMatchObject({ status: "pending" });
    await communityService.updateMember(privateCommunity.id, ids.member, { status: "active" }, ids.admin, "admin");
    expect((await communityService.get(privateCommunity.id, ids.member, "user")).contentRestricted).toBe(false);
    expect(await communityService.join(privateCommunity.id, ids.member)).toMatchObject({ status: "active" }); // never downgraded

    await communityService.updateMember(privateCommunity.id, ids.member, { status: "banned" }, ids.admin, "admin");
    await expect(communityService.join(privateCommunity.id, ids.member)).rejects.toMatchObject({ statusCode: 403 });
    expect(await activeCount(privateCommunity.id)).toBe(1);
    expect((await getPrisma().community.findUniqueOrThrow({ where: { id: privateCommunity.id } })).memberCount).toBe(1);
  });

  it("keeps memberCount exact under concurrent joins and leaves", async () => {
    const community = track(await communityService.create({ name: `Concurrent ${marker}` }, admin()));
    const prisma = getPrisma();
    const users = await Promise.all(Array.from({ length: 6 }, (_, index) => prisma.user.create({ data: { email: `community-bulk-${index}-${marker}@example.test`, fullName: `Bulk ${index}` } })));
    extraUserIds.push(...users.map((user) => user.id));

    await Promise.all(users.map((user) => communityService.join(community.id, user.id)));
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).memberCount).toBe(7);

    await Promise.all(users.slice(0, 3).map((user) => communityService.leave(community.id, user.id)));
    expect((await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).memberCount).toBe(4);
    expect(await activeCount(community.id)).toBe(4);
  });

  it("blocks the owner from leaving, transfers ownership and exposes a public roster without emails", async () => {
    const [community] = (await communityService.list(ids.lecturer, { ...LIST_DEFAULTS, q: `graph learning ${marker}` }, "user")).data;
    await expect(communityService.leave(community!.id, ids.lecturer)).rejects.toMatchObject({ statusCode: 409 });
    await expect(communityService.transferOwnership(community!.id, ids.outsider, ids.lecturer, "user")).rejects.toMatchObject({ statusCode: 409 }); // not a member
    await expect(communityService.transferOwnership(community!.id, ids.member, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 403 }); // not the owner

    await communityService.updateMember(community!.id, ids.member, { role: "moderator" }, ids.lecturer, "user"); // owners appoint moderators
    const transferred = await communityService.transferOwnership(community!.id, ids.member, ids.lecturer, "user");
    expect(transferred.isOwner).toBe(false);
    const roles = Object.fromEntries((await getPrisma().communityMembership.findMany({ where: { communityId: community!.id } })).map((row) => [row.userId, row.role]));
    expect(roles[ids.member]).toBe("owner");
    expect(roles[ids.lecturer]).toBe("moderator");
    await communityService.leave(community!.id, ids.lecturer);

    const { data: roster } = await communityService.publicMembers(community!.id, undefined, undefined);
    expect(roster.length).toBeGreaterThan(0);
    expect(JSON.stringify(roster)).not.toContain("@example.test");
  });

  it("searches without regard to case or accents and scopes to joined communities", async () => {
    const upper = await communityService.list(ids.outsider, { ...LIST_DEFAULTS, q: `ADMIN MADE ${marker}`.toUpperCase() }, "user");
    expect(upper.data.map((item) => item.name)).toContain(`Admin Made ${marker}`);
    const accented = await communityService.list(ids.outsider, { ...LIST_DEFAULTS, q: `Ádmin Máde ${marker}` }, "user");
    expect(accented.data.map((item) => item.name)).toContain(`Admin Made ${marker}`);

    const mine = await communityService.list(ids.member, { ...LIST_DEFAULTS, scope: "mine", q: marker }, "user");
    expect(mine.data.length).toBeGreaterThan(0);
    expect(mine.data.every((item) => item.viewerMembership?.status === "active")).toBe(true);
    expect((await communityService.list(ids.outsider, { ...LIST_DEFAULTS, scope: "mine", q: marker }, "user")).data).toHaveLength(0);
  });

  it("links papers and shareable research gaps to a community by topic", async () => {
    const prisma = getPrisma();
    const topic = `zebrafish${marker}`;
    const [paper, gap, privateGap] = await Promise.all([
      prisma.paper.create({ data: { title: `Advances in ${topic} imaging`, publicationYear: 2026, primaryProvider: "user", paperStatus: "downloaded", dataStatus: "active", citationCount: 12 } }),
      prisma.researchGap.create({ data: { topic, normalizedTopic: topic, title: `Open question on ${topic}`, description: "Candidate gap", rationale: "Test evidence", source: "user", userId: ids.lecturer, forumShareable: true } }),
      prisma.researchGap.create({ data: { topic, normalizedTopic: topic, title: `Private ${topic} note`, description: "Not shared", rationale: "Test evidence", source: "user", userId: ids.lecturer, forumShareable: false } }),
    ]);
    researchIds.paper = paper.id; researchIds.gap = gap.id; researchIds.privateGap = privateGap.id;

    const community = track(await communityService.create({ name: `Zebrafish ${marker}`, researchTopics: [topic] }, admin()));
    const papers = await communityRelatedService.papers(community.id, undefined, undefined);
    expect(papers.map((item) => item.title)).toContain(`Advances in ${topic} imaging`);
    const gaps = await communityRelatedService.gaps(community.id, undefined, undefined);
    expect(gaps.map((item) => item.title)).toEqual([`Open question on ${topic}`]); // the unshared gap stays out
  });
});

describe.sequential("community logic fixes (ban bypass, naming races, roster, join spam, facets)", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const communityIds: string[] = [];
  let adminId = "";
  let lecturerId = "";
  let memberId = "";

  const admin = (): CommunityActor => ({ sub: adminId, role: "admin", systemRole: "ADMIN" });
  const lecturer = (): CommunityActor => ({ sub: lecturerId, role: "user", systemRole: "USER", academicProfileType: "lecturer" });
  const track = <T extends { id: string }>(community: T): T => { communityIds.push(community.id); return community; };
  const makeUser = async (key: string, data: Record<string, unknown> = {}) => {
    const user = await getPrisma().user.create({ data: { email: `cfix-${key}-${marker}@example.test`, fullName: `Cfix ${key}`, ...data } });
    userIds.push(user.id);
    return user;
  };
  const memberCount = async (id: string) => (await getPrisma().community.findUniqueOrThrow({ where: { id } })).memberCount;

  beforeAll(async () => {
    adminId = (await makeUser("admin", { role: "admin", systemRole: "ADMIN" })).id;
    lecturerId = (await makeUser("lecturer", { academicProfileType: "lecturer" })).id;
    memberId = (await makeUser("member")).id;
    await getPrisma().academicProfile.create({ data: { userId: lecturerId, academicRole: "LECTURER", roleVerificationStatus: "VERIFIED" } });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    // Only ids this suite created; an empty list must never reach a filter.
    if (communityIds.length) {
      await prisma.notification.deleteMany({ where: { targetUuid: { in: communityIds } } });
      await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
      await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    }
    if (userIds.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.communityMembership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.academicProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it("A1: a banned member cannot leave to clear the ban", async () => {
    const community = track(await communityService.create({ name: `Ban Lab ${marker}` }, admin()));
    await communityService.join(community.id, memberId);
    await communityService.updateMember(community.id, memberId, { status: "banned" }, adminId, "admin");
    const before = await memberCount(community.id);
    await expect(communityService.leave(community.id, memberId)).rejects.toMatchObject({ statusCode: 403 });
    const row = await getPrisma().communityMembership.findFirst({ where: { communityId: community.id, userId: memberId } });
    expect(row?.status).toBe("banned");
    await expect(communityService.join(community.id, memberId)).rejects.toMatchObject({ statusCode: 403 });
    expect(await memberCount(community.id)).toBe(before);
  });

  it("B1: restoring an archived community checks its name is still free", async () => {
    const name = `Restore Lab ${marker}`;
    const first = track(await communityService.create({ name }, admin()));
    await communityService.setStatus(first.id, "ARCHIVED", adminId, "admin");
    track(await communityService.create({ name }, admin()));
    await expect(communityService.setStatus(first.id, "ACTIVE", adminId, "admin")).rejects.toMatchObject({ statusCode: 409 });
    expect((await getPrisma().community.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("ARCHIVED");
  });

  it("B2: concurrent creates cannot duplicate a name or exceed the proposal quota", async () => {
    const name = `Race Name ${marker}`;
    const same = await Promise.allSettled(Array.from({ length: 5 }, () => communityService.create({ name }, admin())));
    for (const result of same) if (result.status === "fulfilled") track(result.value);
    expect(same.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of same) if (result.status === "rejected") expect(result.reason).toMatchObject({ statusCode: 409 });

    const different = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => communityService.create({ name: `Race Quota ${index} ${marker}` }, lecturer())));
    for (const result of different) if (result.status === "fulfilled") track(result.value);
    expect(different.filter((result) => result.status === "fulfilled")).toHaveLength(3);
  });

  it("B3: the public roster keeps the owner and moderators even beyond 200 members", async () => {
    const prisma = getPrisma();
    const community = track(await communityService.create({ name: `Big Roster ${marker}` }, admin()));
    const users = await Promise.all(Array.from({ length: 205 }, (_, index) => makeUser(`bulk-${index}`)));
    const start = Date.now() + 60_000;
    await prisma.communityMembership.createMany({
      data: users.map((user, index) => ({ communityId: community.id, userId: user.id, role: "member", status: "active", joinedAt: new Date(start + index * 1000) })),
    });
    const newest = users[users.length - 1]!;
    await communityService.transferOwnership(community.id, newest.id, adminId, "admin");

    // Staff (the new owner and the demoted admin) sit on page 1 ahead of the first page of regular members.
    const { data: roster } = await communityService.publicMembers(community.id, undefined, undefined, { page: 1, pageSize: 50 });
    expect(roster).toHaveLength(52);
    expect(roster[0]).toMatchObject({ role: "owner", fullName: newest.fullName });
  });

  it("C1: a declined user re-requesting does not notify moderators again", async () => {
    const community = track(await communityService.create({ name: `Join Spam ${marker}`, visibility: "private" }, admin()));
    const spy = vi.spyOn(notificationService, "create");
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(await communityService.join(community.id, memberId)).toMatchObject({ status: "pending" });
        if (attempt < 2) await communityService.updateMember(community.id, memberId, { status: "declined" }, adminId, "admin");
      }
      const requests = spy.mock.calls.filter(([input]) => input.type === "COMMUNITY_JOIN_REQUEST" && input.targetId === community.id);
      expect(requests).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("C2: the member endpoint cannot move someone back to pending", () => {
    expect(updateMemberSchema.safeParse({ status: "pending" }).success).toBe(false);
    for (const status of ["active", "declined", "banned"]) expect(updateMemberSchema.safeParse({ status }).success).toBe(true);
  });

  it("D1: research-field facets merge case variants into one chip", async () => {
    track(await communityService.create({ name: `Facet Upper ${marker}`, researchField: `Qfield${marker}` }, admin()));
    track(await communityService.create({ name: `Facet Lower ${marker}`, researchField: `qfield${marker}` }, admin()));
    const chips = (await communityService.facets(adminId, "admin")).filter((chip) => chip.name.toLowerCase() === `qfield${marker}`);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.count).toBe(2);
  });
});

describe.sequential("community fixes round 2 (private content, join cooldown, moderator rechecks, roster paging, unique names)", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const communityIds: string[] = [];
  let adminId = "";
  let lecturerId = "";
  let modId = "";
  let targetId = "";
  let outsiderId = "";
  let pendingUserId = "";
  let activeUserId = "";

  const admin = (): CommunityActor => ({ sub: adminId, role: "admin", systemRole: "ADMIN" });
  const lecturer = (): CommunityActor => ({ sub: lecturerId, role: "user", systemRole: "USER", academicProfileType: "lecturer" });
  const track = <T extends { id: string }>(community: T): T => { communityIds.push(community.id); return community; };
  const makeUser = async (key: string, data: Record<string, unknown> = {}) => {
    const user = await getPrisma().user.create({ data: { email: `cfix2-${key}-${marker}@example.test`, fullName: `Cfix2 ${key}`, ...data } });
    userIds.push(user.id);
    return user;
  };
  const joinRequests = (spy: { mock: { calls: Array<[{ type?: string; targetId?: string }]> } }, communityId: string) =>
    spy.mock.calls.filter(([input]) => input.type === "COMMUNITY_JOIN_REQUEST" && input.targetId === communityId).length;

  beforeAll(async () => {
    adminId = (await makeUser("admin", { role: "admin", systemRole: "ADMIN" })).id;
    lecturerId = (await makeUser("lecturer", { academicProfileType: "lecturer" })).id;
    modId = (await makeUser("mod")).id;
    targetId = (await makeUser("target")).id;
    outsiderId = (await makeUser("outsider")).id;
    pendingUserId = (await makeUser("pending")).id;
    activeUserId = (await makeUser("active")).id;
    await getPrisma().academicProfile.create({ data: { userId: lecturerId, academicRole: "LECTURER", roleVerificationStatus: "VERIFIED" } });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    // Only ids this suite created; an empty list must never reach a filter.
    if (communityIds.length) {
      await prisma.notification.deleteMany({ where: { targetUuid: { in: communityIds } } });
      await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
      await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    }
    if (userIds.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.communityMembership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.academicProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it("E4: outsiders of a private community see only the join-page basics", async () => {
    const privateCommunity = track(await communityService.create({ name: `Hidden Lab ${marker}`, description: "Closed group", visibility: "private", rules: ["No sharing"], researchTopics: ["secret-topic"] }, admin()));
    const publicCommunity = track(await communityService.create({ name: `Open Lab ${marker}`, rules: ["Be kind"], researchTopics: ["open-topic"] }, admin()));
    await communityService.join(privateCommunity.id, pendingUserId); // private join => pending
    await communityService.join(privateCommunity.id, activeUserId);
    await communityService.updateMember(privateCommunity.id, activeUserId, { status: "active" }, adminId, "admin");

    const asOutsider = await communityService.get(privateCommunity.id, outsiderId, "user");
    expect(asOutsider).toMatchObject({ name: `Hidden Lab ${marker}`, description: "Closed group", memberCount: 2, contentRestricted: true });
    expect(asOutsider.rules).toEqual([]);
    expect(asOutsider.researchTopics).toEqual([]);
    expect(asOutsider.moderators).toEqual([]);

    const asPending = await communityService.get(privateCommunity.id, pendingUserId, "user");
    expect(asPending.rules).toEqual([]);

    for (const viewer of [outsiderId, pendingUserId]) {
      await expect(communityRelatedService.papers(privateCommunity.id, viewer, "user")).rejects.toMatchObject({ statusCode: 403 });
      await expect(communityRelatedService.gaps(privateCommunity.id, viewer, "user")).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(communityRelatedService.papers(privateCommunity.id, undefined, undefined)).rejects.toMatchObject({ statusCode: 403 });

    const asMember = await communityService.get(privateCommunity.id, activeUserId, "user");
    expect(asMember.rules).toEqual(["No sharing"]);
    expect(asMember.researchTopics).toEqual(["secret-topic"]);
    expect(asMember.moderators.length).toBeGreaterThan(0);
    await expect(communityRelatedService.papers(privateCommunity.id, activeUserId, "user")).resolves.toBeInstanceOf(Array);

    const asAdmin = await communityService.get(privateCommunity.id, adminId, "admin");
    expect(asAdmin.rules).toEqual(["No sharing"]);
    await expect(communityRelatedService.gaps(privateCommunity.id, adminId, "admin")).resolves.toBeInstanceOf(Array);

    const publicView = await communityService.get(publicCommunity.id, outsiderId, "user");
    expect(publicView.rules).toEqual(["Be kind"]);
    expect(publicView.researchTopics).toEqual(["open-topic"]);
    expect(publicView.moderators.length).toBeGreaterThan(0);
    await expect(communityRelatedService.papers(publicCommunity.id, outsiderId, "user")).resolves.toBeInstanceOf(Array);
  });

  it("E4: the owner of a private proposal still sees everything", async () => {
    const proposal = track(await communityService.create({ name: `Hidden Proposal ${marker}`, visibility: "private", rules: ["Owner rule"], researchTopics: ["owner-topic"] }, lecturer()));
    expect(proposal.status).toBe("PENDING_APPROVAL");
    expect(proposal.rules).toEqual(["Owner rule"]);
    const view = await communityService.get(proposal.id, lecturerId, "user");
    expect(view.rules).toEqual(["Owner rule"]);
    expect(view.researchTopics).toEqual(["owner-topic"]);
    expect(view.moderators.length).toBeGreaterThan(0);
    await expect(communityRelatedService.papers(proposal.id, lecturerId, "user")).resolves.toBeInstanceOf(Array);
  });

  it("E1: join requests notify once per 24h even through request-cancel-request", async () => {
    const community = track(await communityService.create({ name: `Cooldown Lab ${marker}`, visibility: "private" }, admin()));
    const spy = vi.spyOn(notificationService, "create");
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(await communityService.join(community.id, targetId)).toMatchObject({ status: "pending" });
        if (attempt < 2) await communityService.leave(community.id, targetId);
      }
      expect(joinRequests(spy, community.id)).toBe(1); // one manager (the owner), one notification

      // Once the cooldown has passed, asking again notifies again.
      for (const key of [...cacheMock.store.keys()]) if (key.includes(community.id)) cacheMock.store.delete(key);
      await communityService.leave(community.id, targetId);
      await communityService.join(community.id, targetId);
      expect(joinRequests(spy, community.id)).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("E1: a cache outage fails open (still notifies, join still succeeds)", async () => {
    const community = track(await communityService.create({ name: `Cooldown Outage ${marker}`, visibility: "private" }, admin()));
    const spy = vi.spyOn(notificationService, "create");
    cacheMock.failing = true;
    try {
      expect(await communityService.join(community.id, outsiderId)).toMatchObject({ status: "pending" });
      expect(joinRequests(spy, community.id)).toBe(1);
    } finally {
      cacheMock.failing = false;
      spy.mockRestore();
    }
  });

  it("E5: moderator rights are rechecked at write time", async () => {
    const community = track(await communityService.create({ name: `Mod Recheck ${marker}` }, admin()));
    await communityService.join(community.id, modId);
    await communityService.join(community.id, targetId);
    await communityService.updateMember(community.id, modId, { role: "moderator" }, adminId, "admin");
    expect(await communityService.updateMember(community.id, targetId, { status: "banned" }, modId, "user")).toMatchObject({ status: "banned" });
    await communityService.updateMember(community.id, targetId, { status: "active" }, modId, "user");

    // Demoted: may no longer manage members or assign moderators.
    await communityService.updateMember(community.id, modId, { role: "member" }, adminId, "admin");
    await expect(communityService.updateMember(community.id, targetId, { role: "moderator" }, modId, "user")).rejects.toMatchObject({ statusCode: 403 });
    await expect(communityService.updateMember(community.id, targetId, { status: "banned" }, modId, "user")).rejects.toMatchObject({ statusCode: 403 });

    // Banned moderator: no access at all.
    await communityService.updateMember(community.id, modId, { role: "moderator" }, adminId, "admin");
    await communityService.updateMember(community.id, modId, { status: "banned" }, adminId, "admin");
    await expect(communityService.updateMember(community.id, targetId, { status: "banned" }, modId, "user")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("E3: the public roster pages regular members while staff stay on page 1", async () => {
    const prisma = getPrisma();
    const community = track(await communityService.create({ name: `Paged Roster ${marker}` }, admin()));
    const users = await Promise.all(Array.from({ length: 132 }, (_, index) => makeUser(`paged-${index}`)));
    const start = Date.now() + 120_000;
    await prisma.communityMembership.createMany({
      data: users.map((user, index) => ({ communityId: community.id, userId: user.id, role: index < 2 ? "moderator" : "member", status: "active", joinedAt: new Date(start + index * 1000) })),
    });

    const page = (n: number) => communityService.publicMembers(community.id, undefined, undefined, { page: n, pageSize: 50 });
    const [first, second, third] = [await page(1), await page(2), await page(3)];
    expect(first.data).toHaveLength(53); // owner + 2 moderators + 50 members
    expect(first.data.slice(0, 3).map((row) => row.role)).toEqual(["owner", "moderator", "moderator"]);
    expect(first.meta).toEqual({ page: 1, pageSize: 50, total: 130, totalPages: 3 });
    expect(second.data).toHaveLength(50);
    expect(second.data.every((row) => row.role === "member")).toBe(true);
    expect(third.data).toHaveLength(30);
    expect(third.data.every((row) => row.role === "member")).toBe(true);

    const everyone = [...first.data, ...second.data, ...third.data].map((row) => row.id);
    expect(new Set(everyone).size).toBe(133);
    expect(third.data[third.data.length - 1]!.fullName).toBe(users[users.length - 1]!.fullName);
  });

  it("E2: the database refuses two live communities with the same normalized name", async () => {
    const prisma = getPrisma();
    const base = { ownerId: adminId, status: "ACTIVE" } as const;
    const first = track(await prisma.community.create({ data: { ...base, name: `Unique Lab ${marker}`, slug: `unique-lab-a-${marker}` } }));
    // Track the row even when the insert wrongly succeeds, so a red run still cleans up after itself.
    const duplicate = await prisma.community.create({ data: { ...base, name: `  ÚNIQUE   lab ${marker}`, slug: `unique-lab-b-${marker}` } }).then((row) => track(row), () => null);
    expect(duplicate).toBeNull();
    // Archived rows do not hold the name.
    const archived = track(await prisma.community.create({ data: { ownerId: adminId, status: "ARCHIVED", name: `Unique Lab ${marker}`, slug: `unique-lab-c-${marker}` } }));
    expect(archived.id).not.toBe(first.id);
  });

  it("E2: a unique-name violation from the database becomes a 409, not a 500", async () => {
    const prisma = getPrisma();
    track(await prisma.community.create({ data: { ownerId: adminId, status: "ACTIVE", name: `Mapped Lab ${marker}`, slug: `mapped-lab-a-${marker}` } }));
    const error = await prisma.community.create({ data: { ownerId: adminId, status: "ACTIVE", name: `Mapped Lab ${marker}`, slug: `mapped-lab-b-${marker}` } }).then((row) => { track(row); return null; }, (caught: unknown) => caught);
    expect(error).not.toBeNull();
    expect(() => translateNameConflict(error)).toThrowError(expect.objectContaining({ statusCode: 409, message: "A community with this name already exists" }));
    const other = new Error("boom");
    expect(() => translateNameConflict(other)).toThrow(other);
  });
});

const activeCountOf = (communityId: string) => getPrisma().communityMembership.count({ where: { communityId, status: "active" } });

describe.sequential("community flow consistency (private discoverable, archive frozen, private->public approves)", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const communityIds: string[] = [];
  const ids = { admin: "", owner: "", mod: "", member: "", outsider: "", pendingA: "", pendingB: "" };
  const topic = `zqtopic${marker}`;

  const makeUser = async (key: keyof typeof ids, data: Record<string, unknown> = {}) => {
    const user = await getPrisma().user.create({ data: { email: `cflow-${key}-${marker}@example.test`, fullName: `Cflow ${key}`, ...data } });
    userIds.push(user.id);
    ids[key] = user.id;
  };
  /** Active community owned by a regular user (admin-created ones would be owned by the admin). */
  const fixture = async (key: string, data: Record<string, unknown> = {}) => {
    const prisma = getPrisma();
    const community = await prisma.community.create({ data: { name: `Cflow ${key} ${marker}`, slug: `cflow-${key}-${marker}`, ownerId: ids.owner, status: "ACTIVE", memberCount: 3, ...data } as never });
    communityIds.push(community.id);
    await prisma.communityMembership.createMany({ data: [
      { communityId: community.id, userId: ids.owner, role: "owner", status: "active" },
      { communityId: community.id, userId: ids.mod, role: "moderator", status: "active" },
      { communityId: community.id, userId: ids.member, role: "member", status: "active" },
    ] });
    return community;
  };
  const listFor = async (viewer: string | undefined, role: "user" | "admin", extra: Partial<CommunityListQuery> = {}) =>
    (await communityService.list(viewer, { ...LIST_DEFAULTS, q: marker, ...extra }, role)).data;
  const named = <T extends { name: string }>(rows: T[], key: string) => rows.find((row) => row.name === `Cflow ${key} ${marker}`);

  beforeAll(async () => {
    await makeUser("admin", { role: "admin", systemRole: "ADMIN" });
    for (const key of ["owner", "mod", "member", "outsider", "pendingA", "pendingB"] as const) await makeUser(key);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    // Only ids this suite created; an empty list must never reach a filter.
    if (communityIds.length) {
      await prisma.notification.deleteMany({ where: { targetUuid: { in: communityIds } } });
      await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
      await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    }
    if (userIds.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.communityMembership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it("an outsider lists a private ACTIVE community, with its content locked", async () => {
    await fixture("privlist", { visibility: "private", description: "Closed group", rules: ["Secret rule"], researchTopics: [topic] });
    const row = named(await listFor(ids.outsider, "user"), "privlist");
    expect(row).toMatchObject({ visibility: "private", status: "ACTIVE", contentRestricted: true, researchTopics: [], rules: [], description: "Closed group", memberCount: 3 });
    expect(named(await listFor(undefined, "user"), "privlist")?.contentRestricted).toBe(true);
    expect(named(await listFor(ids.member, "user"), "privlist")).toMatchObject({ contentRestricted: false, rules: ["Secret rule"], researchTopics: [topic] });
  });

  it("text search does not leak the topics of a private community to outsiders", async () => {
    await fixture("pubtopic", { visibility: "public", researchTopics: [topic] });
    const find = async (viewer: string, role: "user" | "admin" = "user") => (await communityService.list(viewer, { ...LIST_DEFAULTS, q: topic }, role)).data.map((row) => row.name);
    const asOutsider = await find(ids.outsider);
    expect(asOutsider).toContain(`Cflow pubtopic ${marker}`);
    expect(asOutsider).not.toContain(`Cflow privlist ${marker}`);
    expect(await find(ids.member)).toContain(`Cflow privlist ${marker}`);
    expect(await find(ids.admin, "admin")).toContain(`Cflow privlist ${marker}`);
    // Name, description and field stay searchable for outsiders.
    const byName = await communityService.list(ids.outsider, { ...LIST_DEFAULTS, q: `privlist ${marker}` }, "user");
    expect(byName.data.map((row) => row.name)).toContain(`Cflow privlist ${marker}`);
  });

  it("the roster and related research of a private community stay 403 for outsiders", async () => {
    const privateCommunity = await getPrisma().community.findUniqueOrThrow({ where: { slug: `cflow-privlist-${marker}` } });
    await expect(communityService.publicMembers(privateCommunity.id, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 403 });
    await expect(communityRelatedService.papers(privateCommunity.id, ids.outsider, "user")).rejects.toMatchObject({ statusCode: 403 });
    await expect(communityService.publicMembers(privateCommunity.id, ids.member, "user")).resolves.toMatchObject({ meta: { page: 1 } });
  });

  it("an archived public community stays reachable by link, leaves discovery, and stays in its members' lists", async () => {
    const community = await fixture("archpub", { visibility: "public", rules: ["Be kind"] });
    await communityService.setStatus(community.id, "ARCHIVED", ids.admin, "admin");
    expect(await communityService.get(community.slug, ids.outsider, "user")).toMatchObject({ status: "ARCHIVED", rules: ["Be kind"] });
    expect(await communityService.get(community.slug, undefined, undefined)).toMatchObject({ status: "ARCHIVED" });
    expect(named(await listFor(ids.outsider, "user"), "archpub")).toBeUndefined();
    expect(named(await listFor(ids.outsider, "user", { status: "ARCHIVED" }), "archpub")).toBeUndefined();
    expect(named(await listFor(ids.member, "user"), "archpub")).toMatchObject({ status: "ARCHIVED" });
    expect(named(await listFor(ids.admin, "admin"), "archpub")).toMatchObject({ status: "ARCHIVED" });
  });

  it("an archived private community shows basics to outsiders and everything to members", async () => {
    const community = await fixture("archpriv", { visibility: "private", rules: ["Members only"] });
    await communityService.setStatus(community.id, "ARCHIVED", ids.admin, "admin");
    expect(await communityService.get(community.slug, ids.outsider, "user")).toMatchObject({ status: "ARCHIVED", contentRestricted: true, rules: [] });
    expect(await communityService.get(community.slug, ids.member, "user")).toMatchObject({ status: "ARCHIVED", contentRestricted: false, rules: ["Members only"] });
  });

  it("archived communities are frozen: no join, no member changes (except admins), members may leave", async () => {
    const community = await fixture("frozen", { visibility: "public" });
    await getPrisma().communityMembership.create({ data: { communityId: community.id, userId: ids.pendingA, role: "member", status: "active" } });
    await communityService.setStatus(community.id, "ARCHIVED", ids.admin, "admin");

    await expect(communityService.join(community.id, ids.outsider)).rejects.toMatchObject({ statusCode: 409 });
    await expect(communityService.updateMember(community.id, ids.member, { status: "banned" }, ids.mod)).rejects.toMatchObject({ statusCode: 409 });
    await expect(communityService.update(community.id, { description: "new" }, ids.owner, "user")).rejects.toMatchObject({ statusCode: 409 });
    await expect(communityService.transferOwnership(community.id, ids.mod, ids.owner, "user")).rejects.toMatchObject({ statusCode: 409 });
    expect(await getPrisma().communityMembership.findFirstOrThrow({ where: { communityId: community.id, userId: ids.member } })).toMatchObject({ status: "active" });

    await expect(communityService.updateMember(community.id, ids.member, { status: "banned" }, ids.admin, "admin")).resolves.toMatchObject({ status: "banned" });
    await expect(communityService.leave(community.id, ids.pendingA)).resolves.toBeUndefined();
    expect(await getPrisma().communityMembership.findFirst({ where: { communityId: community.id, userId: ids.pendingA } })).toBeNull();
  });

  it("archiving declines this community's pending requests only, and notifies the requesters", async () => {
    const spy = vi.spyOn(notificationService, "create");
    try {
      const target = await fixture("closing", { visibility: "private" });
      const other = await fixture("staying", { visibility: "private" });
      await communityService.join(target.id, ids.pendingA);
      await communityService.join(other.id, ids.pendingB);
      spy.mockClear();

      await communityService.setStatus(target.id, "ARCHIVED", ids.admin, "admin");
      const status = (communityId: string, userId: string) => getPrisma().communityMembership.findFirstOrThrow({ where: { communityId, userId } }).then((row) => row.status);
      expect(await status(target.id, ids.pendingA)).toBe("declined");
      expect(await status(other.id, ids.pendingB)).toBe("pending");
      const declined = spy.mock.calls.map(([input]) => input).filter((input) => input.type === "COMMUNITY_MEMBER_DECLINED");
      expect(declined).toHaveLength(1);
      expect(declined[0]).toMatchObject({ userId: ids.pendingA, title: "Community archived", targetId: target.id });
      // Active members are untouched.
      expect(await activeCountOf(target.id)).toBe(3);
    } finally {
      spy.mockRestore();
    }
  });

  it("private -> public approves every pending request and recounts members; public -> private changes nothing", async () => {
    const spy = vi.spyOn(notificationService, "create");
    try {
      const community = await fixture("opening", { visibility: "private" });
      await communityService.join(community.id, ids.pendingA);
      await communityService.join(community.id, ids.pendingB);
      const declinedBefore = await getPrisma().communityMembership.create({ data: { communityId: community.id, userId: ids.outsider, role: "member", status: "declined" } });
      spy.mockClear();

      await communityService.update(community.id, { visibility: "public" }, ids.admin, "admin");
      const rows = await getPrisma().communityMembership.findMany({ where: { communityId: community.id } });
      expect(rows.filter((row) => row.status === "pending")).toHaveLength(0);
      expect(rows.find((row) => row.userId === ids.pendingA)?.status).toBe("active");
      expect(rows.find((row) => row.userId === ids.pendingB)?.status).toBe("active");
      expect(rows.find((row) => row.id === declinedBefore.id)?.status).toBe("declined");
      const refreshed = await getPrisma().community.findUniqueOrThrow({ where: { id: community.id } });
      expect(refreshed.memberCount).toBe(await activeCountOf(community.id));
      expect(refreshed.memberCount).toBe(5);
      const approved = spy.mock.calls.map(([input]) => input).filter((input) => input.type === "COMMUNITY_MEMBER_APPROVED").map((input) => input.userId);
      expect(approved.sort()).toEqual([ids.pendingA, ids.pendingB].sort());

      await communityService.update(community.id, { visibility: "private" }, ids.admin, "admin");
      expect(await activeCountOf(community.id)).toBe(5);
    } finally {
      spy.mockRestore();
    }
  });
});
