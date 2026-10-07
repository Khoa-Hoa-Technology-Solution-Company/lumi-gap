import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { communityRelatedService } from "../community-related.service.js";
import { communityService } from "../community.service.js";
import type { CommunityActor } from "../community.rules.js";
import { reviewSchema, type CommunityListQuery } from "../dto/community.schema.js";

// Community changes enqueue embedding jobs; keep tests from feeding a running dev worker.
vi.mock("../../../infrastructure/queue.js", () => ({ embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

const LIST_DEFAULTS: CommunityListQuery = { page: 1, pageSize: 50, sort: "recent", scope: "all" };

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
    await prisma.paper.deleteMany({ where: { id: researchIds.paper || undefined } });
    await prisma.researchGap.deleteMany({ where: { id: { in: [researchIds.gap, researchIds.privateGap].filter(Boolean) } } });
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { targetUuid: { in: communityIds } }] } });
    await prisma.communityMembership.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.academicProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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

    const roster = await communityService.publicMembers(community!.id, undefined, undefined);
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
