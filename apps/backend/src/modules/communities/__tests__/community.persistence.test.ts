import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { once } from "node:events";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { communityRelatedService } from "../community-related.service.js";
import { communityRouter } from "../community.routes.js";
import { communityService, translateNameConflict } from "../community.service.js";
import type { CommunityActor } from "../community.rules.js";
import { communityCreateSchema, communityUpdateSchema, reviewSchema, updateMemberSchema, type CommunityListQuery } from "../dto/community.schema.js";

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

  it("shows the proposer (name, profile type, verification) to admins listing proposals, and to nobody else", async () => {
    const query = { ...LIST_DEFAULTS, status: "PENDING_APPROVAL" as const, q: `graph learning ${marker}` };
    const asAdmin = (await communityService.list(ids.admin, query, "admin")).data[0] as { proposer?: { id: string; fullName: string; academicProfileType?: string; roleVerificationStatus?: string } } | undefined;
    expect(asAdmin?.proposer).toMatchObject({ id: ids.lecturer, fullName: "Community lecturer", academicProfileType: "lecturer", roleVerificationStatus: "VERIFIED" });
    const asOwner = (await communityService.list(ids.lecturer, query, "user")).data[0];
    expect(asOwner).toBeDefined();
    expect(asOwner).not.toHaveProperty("proposer");
    const active = (await communityService.list(ids.admin, { ...LIST_DEFAULTS, status: "ACTIVE", q: `admin made ${marker}` }, "admin")).data[0];
    expect(active).not.toHaveProperty("proposer");
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

  it("joins instantly and idempotently, and refuses banned users", async () => {
    const community = (await communityService.list(ids.member, { ...LIST_DEFAULTS, q: `graph learning ${marker}` }, "user")).data[0]!;
    expect(await communityService.join(community.id, ids.member)).toMatchObject({ role: "member", status: "active" });
    expect(await communityService.join(community.id, ids.member)).toMatchObject({ status: "active" });
    expect(await activeCount(community.id)).toBe(2);

    await communityService.updateMember(community.id, ids.member, { status: "banned" }, ids.admin, "admin");
    await expect(communityService.join(community.id, ids.member)).rejects.toMatchObject({ statusCode: 403 });
    expect(await activeCount(community.id)).toBe(1);
    expect((await getPrisma().community.findUniqueOrThrow({ where: { id: community.id } })).memberCount).toBe(1);
    await communityService.updateMember(community.id, ids.member, { status: "active" }, ids.admin, "admin");
    expect(await activeCount(community.id)).toBe(2);
  });

  it("rejects a visibility field: research communities are always public", () => {
    expect(communityCreateSchema.safeParse({ name: "Open Lab", visibility: "private" }).success).toBe(false);
    expect(communityUpdateSchema.safeParse({ visibility: "public" }).success).toBe(false);
    expect(communityCreateSchema.safeParse({ name: "Open Lab" }).success).toBe(true);
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

  it("C2: the member endpoint only accepts active and banned", () => {
    for (const status of ["pending", "declined"]) expect(updateMemberSchema.safeParse({ status }).success).toBe(false);
    for (const status of ["active", "banned"]) expect(updateMemberSchema.safeParse({ status }).success).toBe(true);
  });

  it("D1: research-field facets merge case variants into one chip", async () => {
    track(await communityService.create({ name: `Facet Upper ${marker}`, researchField: `Qfield${marker}` }, admin()));
    track(await communityService.create({ name: `Facet Lower ${marker}`, researchField: `qfield${marker}` }, admin()));
    const chips = (await communityService.facets(adminId, "admin")).filter((chip) => chip.name.toLowerCase() === `qfield${marker}`);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.count).toBe(2);
  });
});

describe.sequential("community fixes round 2 (open content, instant join, moderator rechecks, roster paging, unique names)", () => {
  const marker = crypto.randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const communityIds: string[] = [];
  let adminId = "";
  let lecturerId = "";
  let modId = "";
  let targetId = "";
  let outsiderId = "";

  const admin = (): CommunityActor => ({ sub: adminId, role: "admin", systemRole: "ADMIN" });
  const lecturer = (): CommunityActor => ({ sub: lecturerId, role: "user", systemRole: "USER", academicProfileType: "lecturer" });
  const track = <T extends { id: string }>(community: T): T => { communityIds.push(community.id); return community; };
  const makeUser = async (key: string, data: Record<string, unknown> = {}) => {
    const user = await getPrisma().user.create({ data: { email: `cfix2-${key}-${marker}@example.test`, fullName: `Cfix2 ${key}`, ...data } });
    userIds.push(user.id);
    return user;
  };
  const memberCountOf = async (id: string) => (await getPrisma().community.findUniqueOrThrow({ where: { id } })).memberCount;

  beforeAll(async () => {
    adminId = (await makeUser("admin", { role: "admin", systemRole: "ADMIN" })).id;
    lecturerId = (await makeUser("lecturer", { academicProfileType: "lecturer" })).id;
    modId = (await makeUser("mod")).id;
    targetId = (await makeUser("target")).id;
    outsiderId = (await makeUser("outsider")).id;
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

  it("E4: anonymous viewers read topics, rules, moderators and related research of an ACTIVE community", async () => {
    const community = track(await communityService.create({ name: `Open Lab ${marker}`, description: "Open group", rules: ["Be kind"], researchTopics: ["open-topic"] }, admin()));
    const anonymous = await communityService.get(community.id, undefined, undefined);
    expect(anonymous).toMatchObject({ name: `Open Lab ${marker}`, description: "Open group", status: "ACTIVE" });
    expect(anonymous.rules).toEqual(["Be kind"]);
    expect(anonymous.researchTopics).toEqual(["open-topic"]);
    expect(anonymous.moderators.length).toBeGreaterThan(0);
    expect(JSON.stringify(anonymous)).not.toMatch(/restricted|pendingRequest|visibility/i);
    await expect(communityRelatedService.papers(community.id, undefined, undefined)).resolves.toBeInstanceOf(Array);
    await expect(communityRelatedService.gaps(community.id, undefined, undefined)).resolves.toBeInstanceOf(Array);
  });

  it("E4: the owner of a pending proposal sees it, outsiders get 404", async () => {
    const proposal = track(await communityService.create({ name: `Hidden Proposal ${marker}`, rules: ["Owner rule"], researchTopics: ["owner-topic"] }, lecturer()));
    expect(proposal.status).toBe("PENDING_APPROVAL");
    const view = await communityService.get(proposal.id, lecturerId, "user");
    expect(view.rules).toEqual(["Owner rule"]);
    expect(view.researchTopics).toEqual(["owner-topic"]);
    await expect(communityService.get(proposal.id, outsiderId, "user")).rejects.toMatchObject({ statusCode: 404 });
    await expect(communityRelatedService.papers(proposal.id, outsiderId, "user")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("E4: join is instant, banned is refused, a second join is idempotent", async () => {
    const community = track(await communityService.create({ name: `Instant Join ${marker}` }, admin()));
    expect(await communityService.join(community.id, targetId)).toMatchObject({ role: "member", status: "active" });
    expect(await communityService.join(community.id, targetId)).toMatchObject({ role: "member", status: "active" });
    expect(await memberCountOf(community.id)).toBe(2);
    await communityService.updateMember(community.id, targetId, { status: "banned" }, adminId, "admin");
    await expect(communityService.join(community.id, targetId)).rejects.toMatchObject({ statusCode: 403 });
    expect(await memberCountOf(community.id)).toBe(1);
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

describe.sequential("community flow consistency (public only, archive frozen but readable)", () => {
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

  it("an anonymous viewer lists an ACTIVE community with its topics and rules", async () => {
    await fixture("pubtopic", { description: "Open group", rules: ["Be kind"], researchTopics: [topic] });
    expect(named(await listFor(undefined, "user"), "pubtopic")).toMatchObject({ status: "ACTIVE", researchTopics: [topic], rules: ["Be kind"], description: "Open group", memberCount: 3 });
    expect(named(await listFor(ids.outsider, "user"), "pubtopic")).toMatchObject({ researchTopics: [topic] });
  });

  it("text search by topic matches for an anonymous viewer", async () => {
    const names = (await communityService.list(undefined, { ...LIST_DEFAULTS, q: topic }, undefined)).data.map((row) => row.name);
    expect(names).toContain(`Cflow pubtopic ${marker}`);
  });

  it("the roster requires a signed-in viewer (401 over HTTP); a signed-in non-member gets it", async () => {
    const community = await getPrisma().community.findUniqueOrThrow({ where: { slug: `cflow-pubtopic-${marker}` } });
    await expect(communityService.publicMembers(community.id, ids.outsider, "user")).resolves.toMatchObject({ meta: { page: 1 } });
    const app = express(); app.use("/communities", communityRouter);
    app.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => res.status(error.statusCode ?? 500).json({ success: false }));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Test server did not bind");
    try {
      expect((await fetch(`http://127.0.0.1:${address.port}/communities/${community.id}/members/public`)).status).toBe(401);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("an archived community is readable by anyone, hidden from the default directory, listed by status, and not joinable", async () => {
    const community = await fixture("archpub", { rules: ["Be kind"] });
    await communityService.setStatus(community.id, "ARCHIVED", ids.admin, "admin");
    expect(await communityService.get(community.slug, ids.outsider, "user")).toMatchObject({ status: "ARCHIVED", rules: ["Be kind"] });
    expect(await communityService.get(community.slug, undefined, undefined)).toMatchObject({ status: "ARCHIVED", rules: ["Be kind"] });
    for (const [viewer, role] of [[ids.outsider, "user"], [ids.member, "user"], [ids.admin, "admin"]] as const) {
      expect(named(await listFor(viewer, role), "archpub")).toBeUndefined();
      expect(named(await listFor(viewer, role, { status: "ARCHIVED" }), "archpub")).toMatchObject({ status: "ARCHIVED" });
    }
    expect(named(await listFor(ids.member, "user", { scope: "mine" }), "archpub")).toMatchObject({ status: "ARCHIVED" });
    await expect(communityService.join(community.id, ids.outsider)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("archived communities are frozen: no join, no member changes (except admins), members may leave", async () => {
    const community = await fixture("frozen");
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

  it("archiving leaves memberships and member counts untouched", async () => {
    const target = await fixture("closing");
    await communityService.setStatus(target.id, "ARCHIVED", ids.admin, "admin");
    expect(await activeCountOf(target.id)).toBe(3);
    expect((await getPrisma().community.findUniqueOrThrow({ where: { id: target.id } })).memberCount).toBe(3);
  });
});
