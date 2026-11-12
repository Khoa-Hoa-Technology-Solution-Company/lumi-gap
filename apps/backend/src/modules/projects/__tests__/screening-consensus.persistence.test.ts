import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { screeningService as service } from "../screening.service.js";
import { screeningCaseService } from "../screening-case.service.js";
import { screeningObligationsService } from "../screening-obligations.js";
import { maintainScreeningCases } from "../screening-case-maintenance.js";
import { settleConsensus, maintainProjectConsensus } from "../screening-consensus.js";
import { screeningReassessSchema } from "../dto/screening.schema.js";
import { withWorkspace } from "../workspace-access.js";
import { casePacket } from "../screening-case-context.js";
import type { ScreeningChoice } from "@trend/shared-types";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.SCREENING_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Isolated test DB required");
describe.skipIf(!enabled).sequential("two-reviewer consensus, PostgreSQL", () => {
  const db = getPrisma(), key = () => randomUUID();
  let owner: string, a: string, b: string, stranger: string;
  beforeAll(async () => {
    const ids = [];
    for (const name of ["Consensus owner", "Reviewer A", "Reviewer B", "Outside user"]) {
      const user = await db.user.create({ data: { fullName: name, email: `${key()}@example.invalid`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: user.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } });
      ids.push(user.id);
    }
    [owner, a, b, stranger] = ids as [string, string, string, string];
  });
  afterAll(disconnectPostgres);
  async function fixture(hours = 48) {
    const project = await createProjectFixture({ data: { title: "Consensus isolated fixture", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [a, b].map(userId => ({ projectId: project.id, userId })) });
    const paper = await db.paper.create({ data: { title: "Research paper about medical image analysis", abstractText: "A study with transparent methods.", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner } });
    await service.configure(project.id, owner, { reviewMode: "INDEPENDENT", requiredReviewers: 2, consensusWindowHours: hours, consensusPolicy: "UNANIMOUS", expectedVersion: 0,
      aiAssisted: false, inclusionCriteria: ["Medical images"], exclusionCriteria: [], researchQuestions: [], clientKey: key() });
    const result = await service.start(project.id, owner, { paperIds: [paper.id], phase: "TITLE_ABSTRACT", confirmRescreen: false, clientKey: key() });
    const roundId = result.roundIds![0]!;
    await service.assign(project.id, owner, { roundIds: [roundId], reviewerIds: [a, b], mode: "MANUAL", dueAt: null, clientKey: key() });
    return { id: project.id, paperId: paper.id, roundId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function vote(f: Fixture, actor: string, decision: ScreeningChoice) {
    const round = await service.detail(f.id, actor, f.roundId), assignment = round.assignments.find(x => x.id === round.myAssignmentId)!;
    return service.submit(f.id, actor, f.roundId, { assignmentId: assignment.id, expectedRevision: assignment.revision, decision, comment: "Reason grounded in project criteria", exclusionReason: "Outside the project scope", confirmed: true, clientKey: key() });
  }
  async function dispute(hours = 48) { const f = await fixture(hours); await vote(f, a, "INCLUDE"); await vote(f, b, "EXCLUDE"); return f; }
  async function revise(f: Fixture, actor: string, decision: "INCLUDE" | "EXCLUDE", clientKey = key(), expectedRevision?: number) {
    const row = await service.detail(f.id, actor, f.roundId);
    return service.reassess(f.id, actor, f.roundId, { decision, reason: "Căn cứ mới sau khi đối chiếu tiêu chí", expectedRevision: expectedRevision ?? row.myReview?.revision ?? 1, exclusionReason: decision === "EXCLUDE" ? "Outside project scope after discussion" : "", comment: "", confirmed: true, clientKey });
  }
  async function expire(f: Fixture) {
    await db.screeningRound.update({ where: { id: f.roundId }, data: { consensusStartedAt: new Date(Date.now() - 49 * 3600000), consensusDeadline: new Date(Date.now() - 3600000) } });
  }
  for (const decision of ["INCLUDE", "EXCLUDE"] as const) it(`matching initial ${decision} votes finalize and lock`, async () => {
    const f = await fixture(); await vote(f, a, decision);
    const blind = await service.detail(f.id, b, f.roundId);
    expect(blind.hiddenReviews).toBe(true); expect(blind.reviews).toHaveLength(0); expect(blind.finalDecision).toBeNull();
    await vote(f, b, decision);
    const row = await service.detail(f.id, a, f.roundId);
    expect(row.status).toBe(decision === "INCLUDE" ? "INCLUDED" : "EXCLUDED");
    expect(row.canReview).toBe(false); expect(row.canReassess).toBe(false);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(decision === "INCLUDE" ? 1 : 0);
  });
  it("opens direct discussion with a frozen 48-hour deadline and no arbitration request", async () => {
    const f = await dispute(), row = await service.detail(f.id, a, f.roundId);
    expect(row.status).toBe("CONSENSUS_REQUIRED"); expect(row.consensus?.canUpdate).toBe(true); expect(row.consensus?.canConfirm).toBe(false);
    expect(Date.parse(row.consensus!.deadline) - Date.parse(row.consensus!.startedAt)).toBe(48 * 3600000);
    expect(row.canRequestAdjudication).toBe(false); expect(row.canReassess).toBe(true);
    expect(await db.screeningAdjudicationCase.count({ where: { roundId: f.roundId } })).toBe(0);
    expect((await screeningObligationsService.list(f.id, a)).filter(t => !t.endedAt).map(t => t.actionType)).toEqual(["DISCUSSION"]);
  });
  it("neither comments, evaluation revisions nor future settings reset the deadline", async () => {
    const f = await dispute(6), initial = await service.detail(f.id, a, f.roundId);
    await service.comment(f.id, a, f.roundId, { comment: "Please compare the methodology", shareWithAdjudicator: false, clientKey: key() });
    await revise(f, a, "INCLUDE");
    await db.screeningSettings.update({ where: { projectId: f.id }, data: { consensusWindowHours: 72 } });
    const row = await service.detail(f.id, a, f.roundId);
    expect(row.consensus?.deadline).toBe(initial.consensus?.deadline); expect(row.consensus?.canUpdate).toBe(true);
    expect(Date.parse(row.consensus!.deadline) - Date.parse(row.consensus!.startedAt)).toBe(6 * 3600000);
    expect((await service.workspaceSummary(f.id, a)).pendingDiscussions).toHaveLength(1);
  });
  for (const decision of ["INCLUDE", "EXCLUDE"] as const) it(`one reviewer revision reaches ${decision} consensus from the latest two ballots`, async () => {
    const f = await dispute(), actor = decision === "INCLUDE" ? b : a;
    await revise(f, actor, decision);
    const row = await service.detail(f.id, actor, f.roundId);
    expect(row.status).toBe(decision === "INCLUDE" ? "INCLUDED" : "EXCLUDED");
    expect(row.reviews.every(r => r.decision === decision)).toBe(true); expect(row.resolutionType).toBe("CONSENSUS_AFTER_DISCUSSION");
    expect(row.reviewHistory?.filter(r => r.revision === 1).map(r => r.decision).sort()).toEqual(["EXCLUDE", "INCLUDE"]);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
    expect((await screeningObligationsService.list(f.id, actor)).filter(t => !t.endedAt)).toHaveLength(0);
    const notifications = await db.notification.findMany({ where: { targetUuid: f.id, title: "Đã ghi kết quả thống nhất của hai reviewer" } });
    expect(new Set(notifications.map(n => n.userId))).toEqual(new Set([a, b, owner]));
    const final = await db.screeningFinalDecision.findFirstOrThrow({ where: { roundId: f.roundId } });
    expect(new Set(final.reviewIds)).toEqual(new Set(row.reviews.map(r => r.id)));
  });
  it("still-disagreeing reviewers can revise their own reasons repeatedly until resolution", async () => {
    const f = await dispute(); await revise(f, a, "INCLUDE"); await revise(f, a, "INCLUDE");
    const row = await service.detail(f.id, a, f.roundId);
    expect(row.status).toBe("CONSENSUS_IN_PROGRESS"); expect(row.finalDecision).toBeNull();
    expect(row.myReview?.revision).toBe(3); expect(row.consensus?.canUpdate).toBe(true);
    expect(row.reviews.find(r => r.reviewerId === b)?.revision).toBe(1);
  });
  it("comments are chronological, notify the peer once and reject other members and outsiders", async () => {
    const f = await dispute(), clientKey = key();
    const input = { comment: "Compare this method against the inclusion criteria", shareWithAdjudicator: false, clientKey };
    await service.comment(f.id, a, f.roundId, input); await service.comment(f.id, a, f.roundId, input);
    await service.comment(f.id, b, f.roundId, { ...input, comment: "I will check the comparison table", clientKey: key() });
    expect((await service.history(f.id, a, f.roundId, 1, "DISCUSSION")).items).toHaveLength(2);
    expect(await db.notification.count({ where: { targetUuid: f.id, userId: b, type: "SCREENING_DISCUSSION_MESSAGE" } })).toBe(1);
    await expect(service.comment(f.id, owner, f.roundId, { ...input, clientKey: key() })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.comment(f.id, stranger, f.roundId, { ...input, clientKey: key() })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("a revision notifies only the peer, and its idempotent retry creates no duplicate ballot or notification", async () => {
    const f = await dispute(), clientKey = key();
    await revise(f, a, "INCLUDE", clientKey, 1); await revise(f, a, "INCLUDE", clientKey, 1);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
    expect(await db.notification.count({ where: { targetUuid: f.id, title: "Reviewer còn lại đã cập nhật đánh giá", userId: b } })).toBe(1);
    expect(await db.notification.count({ where: { targetUuid: f.id, title: "Reviewer còn lại đã cập nhật đánh giá", userId: owner } })).toBe(0);
  });
  it("unauthorized actors cannot revise and a payload cannot choose another reviewer or assignment", async () => {
    const f = await dispute();
    await expect(revise(f, owner, "INCLUDE")).rejects.toMatchObject({ statusCode: 403 });
    await expect(revise(f, stranger, "INCLUDE")).rejects.toMatchObject({ statusCode: 404 });
    for (const field of ["reviewerId", "assignmentId"]) expect(screeningReassessSchema.safeParse({ decision: "INCLUDE", reason: "A complete justification", expectedRevision: 1, clientKey: key(), [field]: b }).success).toBe(false);
    expect((await service.detail(f.id, b, f.roundId)).myReview?.revision).toBe(1);
  });
  it("requires a fresh own revision and a written justification", async () => {
    const f = await dispute(); await revise(f, a, "INCLUDE");
    await expect(revise(f, a, "INCLUDE", key(), 1)).rejects.toMatchObject({ statusCode: 409 });
    expect(screeningReassessSchema.safeParse({ decision: "INCLUDE", reason: "   ", expectedRevision: 2, clientKey: key() }).success).toBe(false);
  });
  it("concurrent changes by the same reviewer accept one version and preserve the other review", async () => {
    const f = await dispute();
    const results = await Promise.allSettled([revise(f, a, "INCLUDE", key(), 1), revise(f, a, "INCLUDE", key(), 1)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
    expect((await service.detail(f.id, b, f.roundId)).myReview?.revision).toBe(1);
  });
  it("competing consensus-making updates serialize to one matching pair and one final result", async () => {
    const f = await dispute();
    const results = await Promise.allSettled([revise(f, a, "EXCLUDE", key(), 1), revise(f, b, "INCLUDE", key(), 1)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const row = await service.detail(f.id, a, f.roundId);
    expect(["INCLUDED", "EXCLUDED"]).toContain(row.status);
    expect(new Set(row.reviews.map(r => r.decision)).size).toBe(1);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
  });
  it("rejects expired disagreement once and preserves ballots, discussion and original history", async () => {
    const f = await dispute(); await service.comment(f.id, a, f.roundId, { comment: "An unresolved methodological question", shareWithAdjudicator: false, clientKey: key() }); await expire(f);
    await maintainScreeningCases(); await maintainScreeningCases();
    const row = await service.detail(f.id, a, f.roundId);
    expect(row.status).toBe("EXCLUDED"); expect(row.resolutionType).toBe("CONSENSUS_NOT_REACHED");
    expect(row.finalDecision?.reason).toContain("Hai Reviewer không thống nhất");
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    expect((await service.history(f.id, a, f.roundId, 1, "DISCUSSION")).items).toHaveLength(1);
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(0);
    await expect(service.comment(f.id, a, f.roundId, { comment: "A comment after expiry", shareWithAdjudicator: false, clientKey: key() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("does not save late evaluation changes", async () => {
    const f = await dispute(); await expire(f); const result = await revise(f, b, "INCLUDE");
    expect(result.expired).toBe(true); expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    expect((await service.detail(f.id, b, f.roundId)).status).toBe("EXCLUDED");
  });
  it("keeps a matching pair submitted immediately before the deadline even if maintenance runs later", async () => {
    const f = await dispute();
    const row = await db.screeningRound.findUniqueOrThrow({ where: { id: f.roundId } });
    const assignment = await db.screeningAssignment.findUniqueOrThrow({ where: { roundId_reviewerId: { roundId: f.roundId, reviewerId: b } } });
    const time = new Date(row.consensusDeadline!.getTime() - 1);
    const review = await db.screeningReview.create({ data: { projectId: f.id, assignmentId: assignment.id, revision: 2, decision: "INCLUDE", comment: "Timely match at the boundary", submittedAt: time } });
    await db.screeningAssignment.update({ where: { id: assignment.id }, data: { revision: 2, submittedAt: time } });
    await withWorkspace(f.id, owner, {}, c => settleConsensus(c, row, new Date(row.consensusDeadline!.getTime() + 1)));
    const final = await service.detail(f.id, a, f.roundId);
    expect(final.status).toBe("INCLUDED"); expect(final.finalDecision).not.toBeNull();
    expect(await db.screeningFinalDecision.findFirstOrThrow({ where: { roundId: f.roundId } })).toMatchObject({ reviewIds: expect.arrayContaining([review.id]) });
  });
  it("blocks updates after finalization while accepting an identical successful request retry", async () => {
    const f = await dispute(), clientKey = key(); await revise(f, b, "INCLUDE", clientKey, 1); await revise(f, b, "INCLUDE", clientKey, 1);
    await expect(revise(f, b, "EXCLUDE")).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
  });
  it("sends at most one approaching-deadline reminder per reviewer", async () => {
    const f = await dispute();
    await db.screeningRound.update({ where: { id: f.roundId }, data: { consensusStartedAt: new Date(Date.now() - 46 * 3600000), consensusDeadline: new Date(Date.now() + 2 * 3600000) } });
    await withWorkspace(f.id, owner, {}, maintainProjectConsensus); await withWorkspace(f.id, owner, {}, maintainProjectConsensus);
    expect(await db.notification.count({ where: { targetUuid: f.id, title: "Sắp hết hạn thảo luận đánh giá" } })).toBe(2);
  });
  it("historical separate confirmations cannot override the latest disagreeing ballots", async () => {
    const f = await dispute(), row = await service.detail(f.id, a, f.roundId);
    await db.screeningAudit.createMany({ data: [a, b].map(actorId => ({ projectId: f.id, roundId: f.roundId, actorId, type: "CONSENSUS_CONFIRMED", details: { startedAt: row.consensus!.startedAt, decision: "INCLUDE", reason: "Old confirmation retained as history" } })) });
    expect((await service.detail(f.id, a, f.roundId)).finalDecision).toBeNull();
    await expect(service.confirmConsensus(f.id, a, f.roundId, { decision: "INCLUDE", reason: "Old action is retired", confirmed: true, clientKey: key() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("works with exactly two people without an arbitrator", async () => {
    const f = await fixture();
    await db.projectMember.update({ where: { projectId_userId: { projectId: f.id, userId: b } }, data: { status: "REMOVED" } });
    await db.screeningAssignment.update({ where: { roundId_reviewerId: { roundId: f.roundId, reviewerId: b } }, data: { active: false } });
    await service.assign(f.id, owner, { roundIds: [f.roundId], reviewerIds: [owner, a], mode: "MANUAL", dueAt: null, clientKey: key() });
    await vote(f, owner, "INCLUDE"); await vote(f, a, "EXCLUDE"); await revise(f, a, "INCLUDE");
    expect((await service.detail(f.id, owner, f.roundId)).status).toBe("INCLUDED");
  });
  it("keeps archived projects read-only and refuses new arbitration", async () => {
    const f = await dispute();
    await expect(screeningCaseService.request(f.id, a, f.roundId, { expectedVersion: 1, clientKey: key() })).rejects.toMatchObject({ statusCode: 409 });
    await db.project.update({ where: { id: f.id }, data: { status: "ARCHIVED" } }); await expire(f);
    expect((await service.detail(f.id, a, f.roundId)).consensus?.canUpdate).toBe(false);
    await expect(revise(f, a, "EXCLUDE")).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(0);
  });
  it("keeps historical arbitration packets and private statements accessible read-only", async () => {
    const f = await dispute();
    await db.screeningRound.update({ where: { id: f.roundId }, data: { status: "NEEDS_RESOLUTION" } });
    const packet = await withWorkspace(f.id, owner, {}, async c => casePacket(c, await c.tx.screeningRound.findUniqueOrThrow({ where: { id: f.roundId } })));
    await db.screeningRound.update({ where: { id: f.roundId }, data: { status: "CONSENSUS_REQUIRED" } });
    const legacy = await db.screeningAdjudicationCase.create({ data: { projectId: f.id, roundId: f.roundId, reviewerIds: [a, b], requestedByIds: [a], deadline: new Date(Date.now() + 3600000), packet: JSON.parse(JSON.stringify(packet)) } });
    await db.screeningAdjudicationStatement.create({ data: { projectId: f.id, caseId: legacy.id, reviewerId: a, packetVersion: 1, revision: 1, useExisting: false, text: "Historical statement retained" } });
    await service.detail(f.id, a, f.roundId);
    const history = await screeningCaseService.view(f.id, a, f.roundId, legacy.id);
    expect(history.case?.active).toBe(false); expect(history.case?.canResolve).toBe(false);
    expect(history.packet.reviews).toHaveLength(2);
    expect(await db.screeningAdjudicationStatement.count({ where: { caseId: legacy.id } })).toBe(1);
  });
});
