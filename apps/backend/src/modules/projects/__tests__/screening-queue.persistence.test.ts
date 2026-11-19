import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { screeningService as service } from "../screening.service.js";
import { screeningPageSchema } from "../dto/screening.schema.js";
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.SCREENING_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Isolated test database required");

describe.skipIf(!enabled).sequential("review queue end-to-end, PostgreSQL", () => {
  const db = getPrisma(), key = () => ({ clientKey: randomUUID() });
  let owner: string, a: string, b: string, c: string, outside: string;
  beforeAll(async () => {
    const ids: string[] = [];
    for (const name of ["Queue owner", "Reviewer A", "Reviewer B", "Reviewer C", "Outside reviewer"]) {
      const user = await db.user.create({ data: { fullName: name, email: `${randomUUID()}@example.invalid`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: user.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } }); ids.push(user.id);
    }
    [owner, a, b, c, outside] = ids as [string, string, string, string, string];
  });
  afterAll(disconnectPostgres);
  const queue = (project: string, actor = c, query = {}) => service.board(project, actor, screeningPageSchema.parse({ filter: "QUEUE", pageSize: 12, ...query }));
  async function add(project: string, title = "Queue research paper") {
    const paper = await db.paper.create({ data: { title, abstractText: "A study of transparent review methods.", publicationYear: 2025, primaryProvider: "user", dataStatus: "active", doi: `10.1000/${randomUUID()}` } });
    await db.projectPaper.create({ data: { projectId: project, paperId: paper.id, addedById: owner, proposalReason: "Relevant to the project method" } });
    const round = await service.begin(project, a, paper.id, { confirmRescreen: false, ...key() });
    return { id: project, paperId: paper.id, roundId: round.roundId!, doi: paper.doi! };
  }
  async function fixture() {
    const project = await createProjectFixture({ data: { title: "Queue integration fixture", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [a, b, c].map(userId => ({ projectId: project.id, userId })) });
    await service.configure(project.id, owner, { reviewMode: "INDEPENDENT", requiredReviewers: 2, expectedVersion: 0, consensusPolicy: "UNANIMOUS", aiAssisted: false, screeningMode: "SINGLE_STAGE", inclusionCriteria: ["Research methods"], exclusionCriteria: ["Wrong population"], researchQuestions: [], ...key() });
    return add(project.id);
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const claim = (f: Fixture, actor: string, input = key()) => service.claim(f.id, actor, f.roundId, input);
  async function vote(f: Fixture, actor: string, decision: "INCLUDE" | "EXCLUDE" = "INCLUDE") {
    const round = await service.detail(f.id, actor, f.roundId), assignment = round.assignments.find(x => x.id === round.myAssignmentId)!;
    await service.submit(f.id, actor, f.roundId, { assignmentId: assignment.id, expectedRevision: assignment.revision, decision, comment: `Private reasoning from ${actor}`, exclusionReason: decision === "EXCLUDE" ? "Wrong population" : "", confirmed: true, ...key() });
  }
  it("distinguishes empty, held, submitted and full slots without leaking decisions", async () => {
    const f = await fixture();
    expect((await queue(f.id)).items[0]!.round).toMatchObject({ assigned: 0, completed: 0, canClaim: true });
    await claim(f, a);
    expect((await queue(f.id)).items[0]!.round).toMatchObject({ assigned: 1, completed: 0 });
    await vote(f, a);
    const waiting = await queue(f.id);
    expect(waiting.items[0]!.round).toMatchObject({ assigned: 1, completed: 1, reviews: [], myReview: null, hiddenReviews: true });
    expect(JSON.stringify(waiting)).not.toContain(`Private reasoning from ${a}`);
    await claim(f, b); expect((await queue(f.id)).total).toBe(0);
    expect((await service.board(f.id, c, screeningPageSchema.parse({ filter: "ALL" }))).total).toBe(1);
  });
  it("serializes simultaneous final-slot claims and refuses a third reviewer", async () => {
    const f = await fixture(); await claim(f, a);
    const result = await Promise.allSettled([claim(f, b), claim(f, c)]);
    expect(result.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(result.find(x => x.status === "rejected")).toMatchObject({ reason: { statusCode: 409 } });
    expect(await db.screeningAssignment.count({ where: { roundId: f.roundId, active: true } })).toBe(2);
  });
  it("keeps duplicate claims idempotent without renewing the server deadline", async () => {
    const f = await fixture(), input = key(), first = await claim(f, a, input);
    expect(await claim(f, a, input)).toEqual(first);
    expect(await claim(f, a)).toEqual(first);
    expect(await db.screeningAssignment.count({ where: { roundId: f.roundId, active: true } })).toBe(1);
    expect((await service.workspaceSummary(f.id, a)).myActiveClaims).toHaveLength(1);
  });
  it("refuses outsiders, proposer self-review and cross-project claims", async () => {
    const f = await fixture(), other = await fixture();
    await expect(claim(f, outside)).rejects.toBeDefined();
    await expect(claim(f, owner)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.claim(other.id, a, f.roundId, key())).rejects.toMatchObject({ statusCode: 404 });
    expect((await queue(f.id, owner)).queueSummary?.available).toBe(0);
    expect((await service.claimNext(f.id, owner, key())).paperId).toBeNull();
  });
  it("reopens expired unfinished slots while submitted reviews keep their slot", async () => {
    const f = await fixture(); await claim(f, a); await claim(f, b); await vote(f, a);
    await db.screeningAssignment.update({ where: { roundId_reviewerId: { roundId: f.roundId, reviewerId: b } }, data: { dueAt: new Date(Date.now() - 1000) } });
    expect((await queue(f.id)).items[0]!.round).toMatchObject({ assigned: 1, completed: 1 });
    expect((await service.workspaceSummary(f.id, b)).myActiveClaims).toHaveLength(0);
    await expect(service.extend(f.id, b, f.roundId, key())).rejects.toBeDefined();
    await claim(f, c); await vote(f, c);
    expect((await service.detail(f.id, c, f.roundId)).status).toBe("INCLUDED");
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });
  it("extends by exactly 24h and releases only the actor's unfinished claim", async () => {
    const f = await fixture(), first = await claim(f, a); await claim(f, b);
    const extended = await service.extend(f.id, a, f.roundId, key());
    expect(Date.parse(extended.dueAt!) - Date.parse(first.dueAt!)).toBe(86400000);
    await service.release(f.id, a, f.roundId, key());
    expect((await queue(f.id, a)).items[0]!.round).toMatchObject({ assigned: 1, completed: 0 });
    await vote(f, b);
    await expect(service.release(f.id, b, f.roundId, key())).rejects.toMatchObject({ statusCode: 409 });
  });
  it("prioritizes the second submitted review and uses the same ordering for claim-next", async () => {
    const empty = await fixture(), held = await add(empty.id, "Held paper"), submitted = await add(empty.id, "Submitted paper");
    await claim(held, a); await claim(submitted, a); await vote(submitted, a);
    const rows = await queue(empty.id);
    expect(rows.items.map(x => x.paperId)).toEqual([submitted.paperId, held.paperId, empty.paperId]);
    expect(rows.queueSummary).toEqual({ available: 3, unclaimed: 1, lastSlot: 2, awaitingSecondReview: 1 });
    const input = key(), next = await service.claimNext(empty.id, c, input);
    expect(next.paperId).toBe(submitted.paperId); expect(await service.claimNext(empty.id, c, input)).toEqual(next);
  });
  it("returns consistent global counts while filtering slots and searching", async () => {
    const empty = await fixture(), held = await add(empty.id, "Last slot target"); await claim(held, a);
    expect((await queue(empty.id, c, { slots: "UNCLAIMED" })).items.map(x => x.paperId)).toEqual([empty.paperId]);
    const last = await queue(empty.id, c, { slots: "LAST_SLOT", q: "LAST SLOT" });
    expect(last.total).toBe(1); expect(last.items[0]!.paperId).toBe(held.paperId);
    expect(last.queueSummary).toMatchObject({ available: 2, unclaimed: 1, lastSlot: 1 });
    const none = await queue(empty.id, c, { slots: "UNCLAIMED", q: "missing term" });
    expect(none.total).toBe(0); expect(none.queueSummary?.available).toBe(2);
  });
  it("searches title, author, DOI and keywords case-insensitively", async () => {
    const f = await fixture();
    await db.paperAuthor.create({ data: { paperId: f.paperId, position: 0, displayName: "Nguyen Queue Author" } });
    await db.paperKeyword.create({ data: { paperId: f.paperId, position: 0, keywordName: "Medical Retrieval" } });
    for (const q of ["queue research", "NGUYEN QUEUE", f.doi, "medical retrieval"]) expect((await queue(f.id, c, { q })).items.map(x => x.paperId)).toEqual([f.paperId]);
  });
  it("opening the reader changes neither slots nor the frozen protocol", async () => {
    const f = await fixture(), before = await db.screeningRound.findUniqueOrThrow({ where: { id: f.roundId } });
    await service.detail(f.id, c, f.roundId); await service.board(f.id, c, screeningPageSchema.parse({ source: f.paperId }));
    expect(await db.screeningAssignment.count({ where: { roundId: f.roundId } })).toBe(0);
    await claim(f, c); await service.extend(f.id, c, f.roundId, key()); await service.release(f.id, c, f.roundId, key());
    expect((await db.screeningRound.findUniqueOrThrow({ where: { id: f.roundId } })).settings).toEqual(before.settings);
  });
  it("integrates submissions with My Work, discussion and read-only finalized history", async () => {
    const f = await fixture(); await claim(f, a); await claim(f, b); await vote(f, a);
    const own = await service.workspaceSummary(f.id, a);
    expect(own.myActiveClaims).toHaveLength(0); expect(own.myEvaluations?.some(x => x.roundId === f.roundId)).toBe(true);
    await vote(f, b, "EXCLUDE");
    expect((await service.detail(f.id, a, f.roundId)).status).toBe("CONSENSUS_REQUIRED");
    expect((await service.workspaceSummary(f.id, a)).automaticTasks?.some(x => x.actionType === "DISCUSSION" && !x.endedAt)).toBe(true);
    expect((await queue(f.id)).total).toBe(0);
    const accepted = await fixture(); await claim(accepted, a); await claim(accepted, b); await vote(accepted, a); await vote(accepted, b);
    expect((await service.detail(accepted.id, a, accepted.roundId))).toMatchObject({ status: "INCLUDED", canReview: false });
    expect(await db.screeningRound.count({ where: { projectId: accepted.id } })).toBe(1);
    await expect(claim(accepted, c)).rejects.toMatchObject({ statusCode: 409 });
  });
  it.each(["ARCHIVED", "COMPLETED"])("has no actionable queue for a %s project", async status => {
    const f = await fixture(); await db.project.update({ where: { id: f.id }, data: { status } });
    expect((await queue(f.id)).queueSummary?.available).toBe(0);
    await expect(claim(f, a)).rejects.toBeDefined();
  });
});
