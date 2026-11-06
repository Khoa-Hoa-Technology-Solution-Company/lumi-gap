import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { screeningService as screening } from "../screening.service.js";
import { screeningCaseService as cases } from "../screening-case.service.js";
import { screeningObligationsService as tasks } from "../screening-obligations.js";
import { projectTasksService as manual } from "../project-tasks.service.js";
import { maintainScreeningCases } from "../screening-case-maintenance.js";
import type { ScreeningChoice } from "@trend/shared-types";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.SCREENING_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Isolated test DB required");
describe.skipIf(!enabled).sequential("automatic Screening obligation ledger", () => {
  const db = getPrisma(), key = () => randomUUID();
  let owner: string, a: string, b: string, judge: string;
  beforeAll(async () => {
    const ids = [];
    for (const fullName of ["Task owner", "Task reviewer A", "Task reviewer B", "Task judge"]) {
      const u = await db.user.create({ data: { fullName, email: `${key()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: u.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } }); ids.push(u.id);
    }
    [owner, a, b, judge] = ids as [string, string, string, string];
  });
  afterAll(disconnectPostgres);
  async function fixture(assign = true) {
    const p = await createProjectFixture({ data: { title: "Task handoff", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [a, b, judge].map(userId => ({ projectId: p.id, userId })) });
    const paper = await db.paper.create({ data: { title: "Screening source about university populations", abstractText: "A controlled university population study.", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: p.id, paperId: paper.id, addedById: owner } });
    await screening.configure(p.id, owner, { screeningMode: "SINGLE_STAGE", reviewMode: "INDEPENDENT", requiredReviewers: 2, consensusPolicy: "UNANIMOUS", expectedVersion: 0, aiAssisted: false, inclusionCriteria: ["University populations"], exclusionCriteria: ["Wrong population"], researchQuestions: [], preferredAdjudicatorId: judge, clientKey: key() });
    const start = await screening.start(p.id, owner, { paperIds: [paper.id], phase: "TITLE_ABSTRACT", confirmRescreen: false, clientKey: key() });
    const f = { id: p.id, paperId: paper.id, roundId: start.roundIds![0]! };
    if (assign) await screening.assign(f.id, owner, { roundIds: [f.roundId], reviewerIds: [a, b], mode: "MANUAL", dueAt: null, clientKey: key() });
    return f;
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function vote(f: Fixture, actor: string, decision: ScreeningChoice) {
    const r = await screening.detail(f.id, actor, f.roundId);
    return screening.submit(f.id, actor, f.roundId, { assignmentId: r.myAssignmentId!, expectedRevision: r.assignments.find(v => v.id === r.myAssignmentId)!.revision, decision, exclusionReason: decision === "EXCLUDE" ? "Wrong population" : "", comment: "Source checked against the population criterion", confirmed: true, clientKey: key() });
  }
  const active = async (f: Fixture, actor: string) => (await tasks.list(f.id, actor)).filter(t => !t.endedAt);
  async function open(f: Fixture) {
    const r = await screening.detail(f.id, a, f.roundId);
    return cases.request(f.id, a, f.roundId, { expectedVersion: r.version, confirmed: true, clientKey: key() });
  }
  async function statement(f: Fixture, actor: string) {
    const c = (await cases.view(f.id, actor, f.roundId)).case!;
    return cases.act(f.id, actor, f.roundId, { action: "STATEMENT", caseId: c.id, expectedPacketVersion: c.packetVersion, expectedStatementRevision: c.statements.find(s => s.reviewerId === actor)!.revision, useExisting: false, text: "My own independent source based position", clientKey: key() });
  }
  async function conflict() { const f = await fixture(); await vote(f, a, "INCLUDE"); await vote(f, b, "EXCLUDE"); return f; }

  it("claims create one TODO, opening does not change it, and submission completes only that person's obligation", async () => {
    const f = await fixture(false), clientKey = key();
    await Promise.all([1, 2].map(() => screening.claim(f.id, a, f.roundId, { clientKey })));
    const first = (await active(f, a))[0]!;
    expect(first).toMatchObject({ actionType: "REVIEW", status: "TODO" });
    await screening.detail(f.id, a, f.roundId); await screening.detail(f.id, a, f.roundId);
    expect((await active(f, a))[0]).toEqual(first);
    const submitted = await vote(f, a, "INCLUDE");
    expect(submitted).toHaveProperty("taskFeedback.completedAction", "Gửi phiếu đánh giá");
    expect(await active(f, a)).toHaveLength(0);
    expect((await tasks.list(f.id, a)).find(t => t.id === first.id)?.status).toBe("DONE");
    expect((await screening.workspaceSummary(f.id, a)).myEvaluations?.[0]).toMatchObject({ myDecision: "INCLUDE", groupStatus: "WAITING_REVIEWER" });
    expect(await db.screeningObligation.count({ where: { projectId: f.id, actionType: "REVIEW", assigneeId: a } })).toBe(1);
    expect((await db.screeningObligationEvent.findMany({ where: { obligationId: first.id }, orderBy: { createdAt: "asc" } })).map(event => event.status)).toEqual(["TODO", "DONE"]);
  });
  it("backfills a pre-existing ballot using its recorded submission time", async () => {
    const f = await fixture(); await vote(f, a, "INCLUDE");
    const ballot = await db.screeningAssignment.findUniqueOrThrow({ where: { roundId_reviewerId: { roundId: f.roundId, reviewerId: a } } });
    // Only in the isolated test DB, emulate a ballot that predates the task ledger.
    await db.screeningObligation.deleteMany({ where: { projectId: f.id } });
    const historical = (await tasks.list(f.id, a))[0]!;
    expect(historical.status).toBe("DONE");
    expect(historical.endedAt).toBe(ballot.submittedAt!.toISOString());
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(1);
  });
  it("keeps release and expiration distinct from completion and creates a new instance on reclaim", async () => {
    const f = await fixture(false);
    await screening.claim(f.id, a, f.roundId, { clientKey: key() });
    await screening.release(f.id, a, f.roundId, { clientKey: key() });
    expect((await tasks.list(f.id, a))[0]?.status).toBe("CANCELLED");
    await screening.claim(f.id, a, f.roundId, { clientKey: key() });
    await db.screeningAssignment.updateMany({ where: { roundId: f.roundId, reviewerId: a }, data: { dueAt: new Date(Date.now() - 1000) } });
    // The backend deadline is authoritative even before the lease cleanup job runs.
    await db.screeningObligation.updateMany({ where: { projectId: f.id, endedAt: null }, data: { dueAt: new Date(Date.now() - 1000) } });
    expect(await active(f, a)).toHaveLength(0);
    const rows = await tasks.list(f.id, a);
    expect(rows.map(t => t.status).sort()).toEqual(["CANCELLED", "EXPIRED"]);
    expect(rows.every(t => t.endedAt)).toBe(true);
    await screening.claim(f.id, a, f.roundId, { clientKey: key() });
    expect(await active(f, a)).toHaveLength(1);
    expect(await db.screeningObligation.count({ where: { projectId: f.id } })).toBe(3);
  });
  it("creates separate conflict tasks, then replaces them with separate statement obligations without duplicate cases", async () => {
    const f = await conflict();
    expect((await active(f, a))[0]?.actionType).toBe("DISCUSSION");
    expect((await active(f, b))[0]?.actionType).toBe("DISCUSSION");
    const r = await screening.detail(f.id, a, f.roundId);
    const requests = await Promise.all([a, b].map(actor => cases.request(f.id, actor, f.roundId, { expectedVersion: r.version, confirmed: true, clientKey: key() })));
    expect(requests[0].caseId).toBe(requests[1].caseId);
    for (const actor of [a, b]) {
      const rows = await tasks.list(f.id, actor);
      expect(rows.find(t => t.actionType === "DISCUSSION")).toMatchObject({ status: "REPLACED", reason: "Chuyển sang phân xử" });
      expect(rows.filter(t => !t.endedAt).map(t => t.actionType)).toEqual(["STATEMENT"]);
    }
    await statement(f, a);
    expect(await active(f, a)).toHaveLength(0); expect(await active(f, b)).toHaveLength(1);
    expect((await tasks.list(f.id, a)).find(t => t.actionType === "STATEMENT")?.status).toBe("DONE");
    const sealed = (await cases.view(f.id, b, f.roundId)).case!;
    expect(sealed.statements.find(s => s.reviewerId === a)).not.toHaveProperty("text");
  });
  it("expires a missing statement, seals the packet, directly assigns the judge and completes only on a valid decision", async () => {
    const f = await conflict(); const requested = await open(f); await statement(f, a);
    await db.screeningAdjudicationCase.update({ where: { id: requested.caseId }, data: { deadline: new Date(Date.now() - 1000) } });
    await maintainScreeningCases(requested.caseId);
    expect((await tasks.list(f.id, b)).find(t => t.actionType === "STATEMENT")?.status).toBe("EXPIRED");
    expect(await db.screeningAdjudicationStatement.count({ where: { caseId: requested.caseId, reviewerId: b } })).toBe(0);
    const before = (await active(f, judge))[0]!;
    expect(before).toMatchObject({ actionType: "ADJUDICATION", status: "TODO" });
    const packet = await cases.view(f.id, judge, f.roundId);
    expect(packet.case?.invitation?.status).toBe("ASSIGNED");
    const input = { expectedVersion: packet.version, expectedCaseVersion: packet.case!.version, decision: "EXCLUDED" as const, exclusionReason: "Wrong population", reason: "The actual source does not meet the population criterion", sourceMaterial: "Abstract paragraph 1 identifies a different population", confirmed: true as const, clientKey: key() };
    await expect(screening.resolve(f.id, judge, f.roundId, { ...input, reason: "" })).rejects.toBeDefined();
    expect((await active(f, judge))[0]?.status).toBe("TODO");
    await screening.resolve(f.id, judge, f.roundId, input);
    expect((await tasks.list(f.id, judge)).find(t => t.id === before.id)?.status).toBe("DONE");
    expect(await active(f, judge)).toHaveLength(0);
    const evaluation = (await screening.workspaceSummary(f.id, a)).myEvaluations![0]!;
    expect(evaluation).toMatchObject({ myDecision: "INCLUDE", groupStatus: "EXCLUDED", isAdjudicated: true });
    await expect(statement(f, b)).rejects.toBeDefined();
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    expect(await db.notification.count({ where: { userId: { in: [a, b] }, eventKey: { contains: `${requested.caseId}:COMPLETED` } } })).toBe(2);
  });
  it("agreement after discussion completes the conflict obligations without creating adjudication", async () => {
    const f = await conflict(), r = await screening.detail(f.id, b, f.roundId);
    await screening.reassess(f.id, b, f.roundId, { expectedRevision: r.version, decision: "INCLUDE", reason: "The population is eligible after source comparison", comment: "Confirmed the registered criteria", confirmed: true, clientKey: key() });
    expect(await active(f, a)).toHaveLength(0); expect(await active(f, b)).toHaveLength(0);
    expect((await tasks.list(f.id, b)).find(t => t.actionType === "DISCUSSION")?.status).toBe("DONE");
    expect(await db.screeningAdjudicationCase.count({ where: { projectId: f.id } })).toBe(0);
  });
  it("revocation cancels old authority and reassignment creates a different task", async () => {
    const f = await conflict(); await open(f); await statement(f, a); await statement(f, b);
    const previous = (await active(f, judge))[0]!;
    await db.projectMember.updateMany({ where: { projectId: f.id, userId: judge }, data: { status: "LEFT" } });
    await tasks.list(f.id, owner);
    expect((await db.screeningObligation.findUniqueOrThrow({ where: { id: previous.id } })).status).toBe("REPLACED");
    expect(await db.screeningObligation.count({ where: { projectId: f.id, actionType: "ADJUDICATION", endedAt: null } })).toBe(0);
    await expect(tasks.list(f.id, judge)).rejects.toMatchObject({ statusCode: 404 });
    await expect(cases.view(f.id, judge, f.roundId)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("automatic IDs cannot be moved through manual task endpoints; manual tasks still work", async () => {
    const f = await fixture(), automatic = (await active(f, a))[0]!;
    await expect(manual.move(f.id, a, automatic.id, { expectedVersion: 1, expectedBoardVersion: 1, status: "DONE", beforeId: null, blockedReason: "", clientKey: key() })).rejects.toMatchObject({ statusCode: 404 });
    const created = await manual.save(f.id, owner, { title: "Write the literature review", description: "", status: "TODO", blockedReason: "", assigneeId: a, milestoneId: null, dueAt: null, link: null, clientKey: key() });
    const board = await manual.board(f.id, a, { pageSize: 20, todoPage: 1, progressPage: 1, blockedPage: 1, donePage: 1, q: "", sort: "manual" });
    await manual.move(f.id, a, created.id, { expectedVersion: created.version, expectedBoardVersion: board.boardVersion, status: "DONE", beforeId: null, blockedReason: "", clientKey: key() });
    expect((await manual.detail(f.id, a, created.id, { page: 1, pageSize: 20 })).task.status).toBe("DONE");
    expect((await active(f, a))[0]?.status).toBe("TODO");
  });
  it("creates a coordinator obligation on a tied eligible pool and completes it on authorized direct selection", async () => {
    const f = await conflict(); await open(f);
    await db.projectPaper.update({ where: { projectId_paperId: { projectId: f.id, paperId: f.paperId } }, data: { addedById: b } });
    for (const fullName of ["Independent candidate 1", "Independent candidate 2"]) {
      const user = await db.user.create({ data: { fullName, email: `${key()}@example.org`, emailVerifiedAt: new Date() } });
      await db.projectMember.create({ data: { projectId: f.id, userId: user.id } });
    }
    await db.projectMember.updateMany({ where: { projectId: f.id, userId: judge }, data: { status: "LEFT" } });
    await statement(f, a); await statement(f, b);
    const coordinator = (await active(f, owner))[0]!;
    expect(coordinator).toMatchObject({ actionType: "COORDINATION", status: "TODO" });
    const cv = (await cases.view(f.id, owner, f.roundId)).case!;
    expect(cv.status).toBe("WAITING_ASSIGNMENT"); expect(cv.candidates).toHaveLength(2);
    const input = { action: "SELECT" as const, caseId: cv.id, expectedCaseVersion: cv.version, candidateId: cv.candidates[0]!.id, reason: "Independent candidate meets the project eligibility policy", clientKey: key() };
    await expect(cases.act(f.id, a, f.roundId, input)).rejects.toMatchObject({ statusCode: 403 });
    await cases.act(f.id, owner, f.roundId, input);
    expect((await tasks.list(f.id, owner)).find(t => t.id === coordinator.id)?.status).toBe("DONE");
    expect((await active(f, cv.candidates[0]!.id))[0]?.actionType).toBe("ADJUDICATION");
  });
  it("stores a real blocking reason for a conflict of interest and does not permit a decision", async () => {
    const f = await conflict(); await open(f); await statement(f, a); await statement(f, b);
    const cv = (await cases.view(f.id, a, f.roundId)).case!;
    await cases.act(f.id, a, f.roundId, { action: "REPORT_CONFLICT", caseId: cv.id, expectedCaseVersion: cv.version, invitationId: cv.invitation!.id, reason: "The assignee is an author on this source paper", clientKey: key() });
    expect((await active(f, judge))[0]).toMatchObject({ actionType: "ADJUDICATION", status: "BLOCKED", reason: "Chờ điều phối xem xét xung đột lợi ích" });
    const packet = await cases.view(f.id, judge, f.roundId);
    await expect(screening.resolve(f.id, judge, f.roundId, { expectedVersion: packet.version, expectedCaseVersion: packet.case!.version, decision: "INCLUDED", reason: "Attempted decision despite the unresolved conflict report", sourceMaterial: "Abstract paragraph 1, actual study scope", confirmed: true, clientKey: key() })).rejects.toBeDefined();
  });
});
