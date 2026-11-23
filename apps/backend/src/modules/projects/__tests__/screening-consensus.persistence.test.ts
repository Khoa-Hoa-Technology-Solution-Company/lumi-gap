import * as Y from "yjs";
import { evidenceEligibility } from "../evidence-eligibility.js";
import { projectAnalysisSetService, validateAnalysisSet } from "../project-analysis-set.service.js";
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

vi.mock("../../../infrastructure/queue.js", () => {
  const queue = () => ({ add: vi.fn().mockResolvedValue({}), getJob: vi.fn().mockResolvedValue(null) });
  return { QUEUE_NAMES: {}, notificationQueue: queue(), aiJobsQueue: queue(), apiSyncQueue: queue(), openAlexIngestQueue: queue(), corpusValidationQueue: queue(), embeddingQueue: queue(), paperAnalysisQueue: queue(), reportQueue: queue(), gapsQueue: queue(), taggingQueue: queue(), topicBackfillQueue: queue(), manuscriptCompileQueue: queue(), communitySummaryQueue: queue(), hasLiveJob: vi.fn().mockResolvedValue(false) };
});
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
  async function fixture(hours = 48, screeningMode?: "TWO_STAGE") {
    const project = await createProjectFixture({ data: { title: "Consensus isolated fixture", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [a, b].map(userId => ({ projectId: project.id, userId })) });
    const paper = await db.paper.create({ data: { title: "Research paper about medical image analysis", abstractText: "A study with transparent methods.", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner } });
    await service.configure(project.id, owner, { ...(screeningMode ? { screeningMode } : {}), reviewMode: "INDEPENDENT", requiredReviewers: 2, consensusWindowHours: hours, consensusPolicy: "UNANIMOUS", expectedVersion: 0,
      aiAssisted: false, inclusionCriteria: ["Medical images"], exclusionCriteria: [], researchQuestions: [], clientKey: key() });
    const result = await service.start(project.id, owner, { paperIds: [paper.id], phase: "TITLE_ABSTRACT", confirmRescreen: false, clientKey: key() });
    const roundId = result.roundIds![0]!;
    await service.assign(project.id, owner, { roundIds: [roundId], reviewerIds: [a, b], mode: "MANUAL", dueAt: null, clientKey: key() });
    return { id: project.id, paperId: paper.id, roundId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function vote(f: Fixture, actor: string, decision: ScreeningChoice) {
    const round = await service.detail(f.id, actor, f.roundId), assignment = round.assignments.find(x => x.id === round.myAssignmentId)!;
    return service.submit(f.id, actor, f.roundId, { assignmentId: assignment.id, expectedRevision: assignment.revision, decision, ...(round.phase === "FULL_TEXT" ? { scope: "FULL_TEXT" as const, fullTextReference: "Pinned project PDF, Methods and Results sections" } : {}), comment: "Reason grounded in project criteria", exclusionReason: "Outside the project scope", confirmed: true, clientKey: key() });
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
  it("cannot bypass the current consensus deadline through main's legacy commands", async () => {
    const f = await dispute(); const row = await service.detail(f.id, a, f.roundId);
    await expect(service.extendDiscussion(f.id, owner, f.roundId, { expectedVersion: row.version, hours: 24, reason: "Attempt to reset the deadline", clientKey: key() })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.closeUnresolved(f.id, owner, f.roundId, { expectedVersion: row.version, reason: "DEADLINE_EXPIRED", clientKey: key() })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.requestMoreInfo(f.id, a, f.roundId, { expectedVersion: row.version, reason: "Attempt to leave consensus", clientKey: key() })).rejects.toMatchObject({ statusCode: 409 });
    const after = await service.detail(f.id, a, f.roundId);
    expect(after.consensus?.deadline).toBe(row.consensus?.deadline); expect(after.status).toBe(row.status);
    expect(after.version).toBe(row.version); expect(after.finalDecision).toBeNull();
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
  it("keeps overdue disagreement open and preserves ballots, discussion and original history", async () => {
    const f = await dispute(); await service.comment(f.id, a, f.roundId, { comment: "An unresolved methodological question", shareWithAdjudicator: false, clientKey: key() }); await expire(f);
    await maintainScreeningCases(); await maintainScreeningCases();
    const row = await service.detail(f.id, a, f.roundId);
    expect(row.status).toBe("CONSENSUS_IN_PROGRESS"); expect(row.finalDecision).toBeNull();
    expect(row.consensus?.canUpdate).toBe(true);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(0);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    expect((await service.history(f.id, a, f.roundId, 1, "DISCUSSION")).items).toHaveLength(1);
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(0);
    await service.comment(f.id, a, f.roundId, { comment: "A comment after expiry", shareWithAdjudicator: false, clientKey: key() });
  });
  it("accepts a reasoned evaluation update after the discussion due date", async () => {
    const f = await dispute(); await expire(f); const result = await revise(f, b, "INCLUDE");
    expect(result.expired).toBe(false); expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
    expect((await service.detail(f.id, b, f.roundId)).status).toBe("INCLUDED");
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
  async function propose(f: Fixture, actor = a, clientKey = key()) {
    const row = await service.detail(f.id, actor, f.roundId);
    return service.proposeAgreement(f.id, actor, f.roundId, { expectedVersion: row.version, decision: "CLOSED_UNRESOLVED",
      reason: "Hai người có cách diễn giải tiêu chí khác nhau sau khi đối chiếu nguồn", reviewIds: row.reviews.map(r => r.id), confirmed: true, retrieveFullText: false, clientKey });
  }
  async function respond(f: Fixture, proposalId: string, actor = b, accept = true, clientKey = key()) {
    const row = await service.detail(f.id, actor, f.roundId);
    const input = { expectedVersion: row.version, proposalId, confirmed: true as const, reason: "Cần tiếp tục đối chiếu căn cứ nghiên cứu", clientKey };
    return accept ? service.confirmAgreement(f.id, actor, f.roundId, input) : service.declineAgreement(f.id, actor, f.roundId, input);
  }
  it("proposal waits for the other reviewer; overdue maintenance never decides on their behalf", async () => {
    const f = await dispute(); const proposal = await propose(f); await expire(f); await maintainScreeningCases();
    const row = await service.detail(f.id, b, f.roundId);
    expect(row.finalDecision).toBeNull(); expect(row.agreement).toMatchObject({ id: proposal.id, decision: "CLOSED_UNRESOLVED", canConfirm: true, canDecline: true });
    expect((await service.detail(f.id, a, f.roundId)).agreement?.canConfirm).toBe(false);
    expect((await screeningObligationsService.list(f.id, b)).filter(t => !t.endedAt).map(t => t.actionType)).toEqual(["CONSENSUS"]);
    expect((await service.workspaceSummary(f.id, b)).pendingConsensus).toHaveLength(1);
    expect(await db.notification.count({ where: { userId: b, targetUuid: f.id, title: "Có đề nghị kết thúc đánh giá cần bạn xác nhận" } })).toBe(1);
  });
  it("recipient acceptance records closed without consensus and keeps the two ballots", async () => {
    const f = await dispute(), proposal = await propose(f); await respond(f, proposal.id!);
    const row = await service.detail(f.id, b, f.roundId);
    expect(row.status).toBe("CLOSED_UNRESOLVED"); expect(row.finalDecision?.decision).toBe("CLOSED_UNRESOLVED");
    expect(row.finalDecision?.exclusionReason).toBeUndefined(); expect(row.closureDetails?.actorType).toBe("REVIEWERS");
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    expect((await screeningObligationsService.list(f.id, b)).filter(t => !t.endedAt)).toHaveLength(0);
    expect(await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: f.id, paperId: f.paperId } } })).toMatchObject({ screeningStatus: "MAYBE", exclusionReason: null });
  });
  it("recipient can reject closure and continue discussion/reassessment", async () => {
    const f = await dispute(), p = await propose(f); await respond(f, p.id!, b, false);
    expect((await service.detail(f.id, a, f.roundId)).agreement).toBeNull();
    await revise(f, b, "INCLUDE"); expect((await service.detail(f.id, a, f.roundId)).status).toBe("INCLUDED");
  });
  it("sender, owner, outsider and a foreign round cannot approve closure", async () => {
    const f = await dispute(), p = await propose(f), other = await dispute();
    await expect(respond(f, p.id!, a)).rejects.toMatchObject({ statusCode: 409 });
    await expect(respond(f, p.id!, owner)).rejects.toMatchObject({ statusCode: 403 });
    await expect(respond(f, p.id!, stranger)).rejects.toMatchObject({ statusCode: 404 });
    await expect(respond(other, p.id!)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("any changed ballot invalidates a pending proposal, even if disagreement remains", async () => {
    const f = await dispute(), p = await propose(f); await revise(f, a, "INCLUDE");
    expect((await service.detail(f.id, b, f.roundId)).agreement).toBeNull();
    await expect(respond(f, p.id!)).rejects.toMatchObject({ statusCode: 409 });
    const fresh = await propose(f); expect(fresh.id).not.toBe(p.id);
  });
  it("resolved disagreement cannot be closed by an old proposal", async () => {
    const f = await dispute(), p = await propose(f); await revise(f, b, "INCLUDE");
    await expect(respond(f, p.id!)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.detail(f.id, a, f.roundId)).status).toBe("INCLUDED");
  });
  it("serializes competing proposals and duplicate approvals", async () => {
    const f = await dispute(); const proposals = await Promise.allSettled([propose(f), propose(f, b)]);
    expect(proposals.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const view = await service.detail(f.id, a, f.roundId), p = view.agreement!;
    const recipient = p.proposedById === a ? b : a;
    const responses = await Promise.allSettled([respond(f, p.id, recipient), respond(f, p.id, recipient)]);
    expect(responses.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
  });
  for (const initial of ["INCLUDED", "EXCLUDED", "CLOSED_UNRESOLVED"] as const) it(`re-screens ${initial} and preserves published result until the next final`, async () => {
    const f = await fixture();
    await vote(f, a, initial === "EXCLUDED" ? "EXCLUDE" : "INCLUDE");
    await vote(f, b, initial === "INCLUDED" ? "INCLUDE" : "EXCLUDE");
    if (initial === "CLOSED_UNRESOLVED") { const p = await propose(f); await respond(f, p.id!); }
    const old = await service.detail(f.id, owner, f.roundId);
    const link = await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: f.id, paperId: f.paperId } } });
    const result = await service.reopenUnresolved(f.id, owner, f.roundId, { expectedVersion: old.version, reason: "Có thông tin toàn văn mới cần xem lại", clientKey: key() });
    const next = { ...f, roundId: result.roundId! };
    const newView = await service.detail(f.id, a, next.roundId);
    expect(newView.rescreening).toBe(true); expect(newView.publishedResult?.status).toBe(initial);
    expect(newView.assignments.map(a => a.reviewerId).sort()).toEqual([a,b].sort());
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(initial === "INCLUDED" ? 1 : 0);
    expect((await db.projectPaper.findUniqueOrThrow({ where: { id: link.id } })).updatedAt).toEqual(link.updatedAt);
    expect((await service.detail(f.id, a, f.roundId)).finalDecision).toEqual(old.finalDecision);
    const newDecision = initial === "INCLUDED" ? "EXCLUDE" : "INCLUDE";
    await vote(next, a, newDecision); await vote(next, b, newDecision);
    expect((await service.detail(f.id, a, next.roundId)).status).toBe(initial === "INCLUDED" ? "EXCLUDED" : "INCLUDED");
    expect(await db.screeningRound.count({ where: { projectId: f.id } })).toBe(2);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(4);
    expect((await service.rounds(f.id, a, f.paperId)).items).toHaveLength(2);
  });
  it("keeps included selection while a new attempt disagrees, and serializes rescreen creation", async () => {
    const f = await fixture(); await vote(f, a, "INCLUDE"); await vote(f, b, "INCLUDE");
    const row = await service.detail(f.id, owner, f.roundId);
    const attempts = await Promise.allSettled([1,2].map(() => service.reopenUnresolved(f.id, owner, f.roundId, { expectedVersion: row.version, reason: "Nghiên cứu có nguồn mới", clientKey: key() })));
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const active = await db.screeningRound.findFirstOrThrow({ where: { projectId: f.id, active: true } });
    const next = { ...f, roundId: active.id }; await vote(next, a, "INCLUDE"); await vote(next, b, "EXCLUDE");
    expect((await service.detail(f.id, a, active.id)).status).toBe("CONSENSUS_REQUIRED");
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(1);
    expect(await db.screeningRound.count({ where: { projectId: f.id, active: true } })).toBe(1);
  });

  it("pending overdue assignments stay assigned, writable, blinded and visible in tasks", async () => {
    const f = await fixture(); await vote(f, a, "INCLUDE");
    await db.screeningAssignment.updateMany({ where: { roundId: f.roundId, reviewerId: b }, data: { dueAt: new Date(Date.now() - 3600000) } });
    await maintainScreeningCases();
    const view = await service.detail(f.id, b, f.roundId);
    expect(view.canReview).toBe(true); expect(view.hiddenReviews).toBe(true); expect(view.reviews).toEqual([]);
    expect(view.assignments.find(x => x.reviewerId === b)?.overdue).toBe(true);
    expect((await service.workspaceSummary(f.id, b)).myActiveClaims).toHaveLength(1);
    expect((await screeningObligationsService.list(f.id, b)).filter(t => !t.endedAt).map(t => t.actionType)).toEqual(["REVIEW"]);
    await vote(f, b, "INCLUDE"); expect((await service.detail(f.id, b, f.roundId)).status).toBe("INCLUDED");
  });
  it("mutual closure retries preserve one final decision and deduplicate notifications", async () => {
    const f = await dispute(), proposalKey = key(); const p = await propose(f, a, proposalKey);
    // Same command payload/key is replayable; a new proposal while pending is refused.
    await expect(propose(f, b)).rejects.toMatchObject({ statusCode: 409 });
    const row = await service.detail(f.id, b, f.roundId), input = { expectedVersion: row.version, proposalId: p.id!, confirmed: true as const, clientKey: key() };
    const first = await service.confirmAgreement(f.id, b, f.roundId, input);
    expect(await service.confirmAgreement(f.id, b, f.roundId, input)).toEqual(first);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
    expect(await db.notification.count({ where: { targetUuid: f.id, title: "Hai reviewer đã xác nhận không đạt đồng thuận", userId: a } })).toBe(1);
  });
  it("keeps evidence, LaTeX citations, BibTeX and historical report snapshots when a result changes", async () => {
    const f = await fixture(); await vote(f, a, "INCLUDE"); await vote(f, b, "INCLUDE");
    const other = await db.paper.create({ data: { title: "Second included analysis source", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: f.id, paperId: other.id, screeningStatus: "INCLUDED", addedById: owner } });
    // Give the second source a proper, independent final decision through the real service.
    const started = await service.start(f.id, owner, { paperIds: [other.id], phase: "TITLE_ABSTRACT", confirmRescreen: true, clientKey: key() });
    const otherF = { id: f.id, paperId: other.id, roundId: started.roundIds![0]! };
    await service.assign(f.id, owner, { roundIds: [otherF.roundId], reviewerIds: [a,b], mode: "MANUAL", dueAt: null, clientKey: key() });
    await vote(otherF, a, "INCLUDE"); await vote(otherF, b, "INCLUDE");
    const evidence = await db.projectEvidenceItem.create({ data: { projectId: f.id, paperId: f.paperId, claim: "Retain this extraction and its quotation", quotation: "Original evidence quotation", origin: "HUMAN", reviewState: "ACCEPTED", reviewRationale: "Checked against the original source", extractedById: a, reviewedById: a, reviewedAt: new Date(), clientKey: key() } });
    const workspace = await db.draftWorkspace.create({ data: { projectId: f.id, name: "Citation preservation test", createdById: owner, writingMode: "LATEX" } });
    const files = [];
    for (const [path, content] of [["main.tex", String.raw`\documentclass{article}\begin{document}\cite{source2025}\end{document}`], ["references.bib", "@article{source2025, title={Retained source}}"]]) {
      const doc = new Y.Doc(); doc.getText("source").insert(0, content!);
      files.push(await db.manuscriptFile.create({ data: { workspaceId: workspace.id, path: path!, kind: "TEXT", crdtState: Buffer.from(Y.encodeStateAsUpdate(doc)), createdById: owner } })); doc.destroy();
    }
    const report = await projectAnalysisSetService.create(f.id, owner, { mode: "OFFICIAL", paperIds: [f.paperId, other.id], topic: "Reproducible source selection", clientKey: key() });
    const saved = await projectAnalysisSetService.get(f.id, owner, report.id!);
    const old = await service.detail(f.id, owner, f.roundId);
    const attempt = await service.reopenUnresolved(f.id, owner, f.roundId, { expectedVersion: old.version, reason: "Có thông tin mới về quần thể nghiên cứu", clientKey: key() });
    expect((await withWorkspace(f.id, owner, {}, c => evidenceEligibility(c.tx, f.id, [f.paperId]))).get(f.paperId)?.eligible).toBe(true);
    // Stage dependency/progress metadata may increment the old round; its immutable published decision is unchanged.
    await db.screeningRound.update({ where: { id: f.roundId }, data: { version: { increment: 1 } } });
    expect(await withWorkspace(f.id, owner, {}, c => validateAnalysisSet(c, report.id!, [f.paperId, other.id]))).toEqual(saved);
    expect((await db.projectEvidenceItem.findUniqueOrThrow({ where: { id: evidence.id } })).reviewState).toBe("ACCEPTED");
    const next = { ...f, roundId: attempt.roundId! }; await vote(next, a, "EXCLUDE"); await vote(next, b, "EXCLUDE");
    const retained = await db.projectEvidenceItem.findUniqueOrThrow({ where: { id: evidence.id } });
    expect(retained).toMatchObject({ claim: evidence.claim, quotation: evidence.quotation, reviewState: "PENDING" });
    expect((await withWorkspace(f.id, owner, {}, c => evidenceEligibility(c.tx, f.id, [f.paperId]))).get(f.paperId)?.eligible).toBe(false);
    expect(await projectAnalysisSetService.get(f.id, owner, report.id!)).toEqual(saved);
    for (const file of files) expect((await db.manuscriptFile.findUniqueOrThrow({ where: { id: file.id } })).crdtState).toEqual(file.crdtState);
    const counts = (await service.analytics(f.id, owner)).publishedSelection!;
    expect(counts.TITLE_ABSTRACT).toEqual({ included: 1, excludedByCriteria: 1, closedUnresolved: 0 });
  });
  it("counts closure separately from criteria exclusion and retains original disagreement statistics", async () => {
    const f = await dispute(), p = await propose(f); await respond(f, p.id!);
    const metrics = await service.analytics(f.id, owner);
    expect(metrics.publishedSelection!.TITLE_ABSTRACT).toEqual({ included: 0, excludedByCriteria: 0, closedUnresolved: 1 });
    expect(metrics.exclusionReasons).toEqual([]);
    const other = await dispute(); await revise(other, b, "INCLUDE");
    const after = await service.analytics(other.id, owner); expect(after.agreements).toBe(0); expect(after.disagreements).toBe(1);
  });

  it.skipIf(process.env.SCREENING_BROWSER !== "1")("browser: signed API authorization and two-reviewer workflow through the complete application", async () => {
    const f = await dispute();
    const { screeningConsentBrowser } = await import("./screening-consent.browser.js");
    await screeningConsentBrowser(db, { projectId: f.id, roundId: f.roundId, paperId: f.paperId, owner, a, b, stranger });
  }, 240000);

  it("closure binds exact ballot revisions without treating a new chat message as stale evidence", async () => {
    const f = await dispute(), row = await service.detail(f.id, a, f.roundId);
    await service.comment(f.id, b, f.roundId, { comment: "A newer message does not change the underlying ballot pair", shareWithAdjudicator: false, clientKey: key() });
    const input = { expectedVersion: row.version, decision: "CLOSED_UNRESOLVED" as const, reason: "Chưa thống nhất sau khi đã đối chiếu nguồn", reviewIds: row.reviews.map(r => r.id), confirmed: true as const, retrieveFullText: false, clientKey: key() };
    const proposal = await service.proposeAgreement(f.id, a, f.roundId, input);
    const bView = await service.detail(f.id, b, f.roundId);
    await service.comment(f.id, a, f.roundId, { comment: "Discussion can continue while awaiting a response", shareWithAdjudicator: false, clientKey: key() });
    await service.confirmAgreement(f.id, b, f.roundId, { expectedVersion: bView.version, proposalId: proposal.id!, confirmed: true, clientKey: key() });
    expect((await service.detail(f.id, a, f.roundId)).status).toBe("CLOSED_UNRESOLVED");
    const other = await dispute();
    await expect(service.proposeAgreement(other.id, a, other.roundId, { ...input, clientKey: key() })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("two-stage: resolving title/abstract discussion creates full-text work without final acceptance", async () => {
    const f = await fixture(48, "TWO_STAGE");
    await db.paper.update({ where: { id: f.paperId }, data: { openAccessUrl: "https://example.invalid/pinned-fulltext.pdf" } });
    await vote(f, a, "INCLUDE"); await vote(f, b, "EXCLUDE"); await revise(f, b, "INCLUDE");
    const next = await db.screeningRound.findFirstOrThrow({ where: { projectId: f.id, active: true } });
    expect(next.phase).toBe("FULL_TEXT"); expect(next.id).not.toBe(f.roundId);
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(0);
    expect((await withWorkspace(f.id, owner, {}, c => evidenceEligibility(c.tx, f.id))).get(f.paperId)?.eligible).toBe(false);
  });
  it("two-stage: a complete re-screen keeps the old inclusion through both stages until a new final decision", async () => {
    const f = await fixture(48, "TWO_STAGE");
    await db.paper.update({ where: { id: f.paperId }, data: { openAccessUrl: "https://example.invalid/pinned-fulltext.pdf" } });
    await vote(f, a, "INCLUDE"); await vote(f, b, "INCLUDE");
    const full = await db.screeningRound.findFirstOrThrow({ where: { projectId: f.id, active: true } });
    await service.assign(f.id, owner, { roundIds: [full.id], reviewerIds: [a,b], mode: "MANUAL", dueAt: null, clientKey: key() });
    const fullF = { ...f, roundId: full.id }; await vote(fullF, a, "INCLUDE"); await vote(fullF, b, "INCLUDE");
    const published = await service.detail(f.id, a, full.id);
    const opened = await service.reopenUnresolved(f.id, a, full.id, { expectedVersion: published.version, targetPhase: "TITLE_ABSTRACT", reason: "Đã cập nhật thông tin nghiên cứu cần xem lại hai giai đoạn", clientKey: key() });
    const pending = { ...f, roundId: opened.roundId! };
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(1);
    await vote(pending, a, "INCLUDE"); await vote(pending, b, "INCLUDE");
    const nextFull = await db.screeningRound.findFirstOrThrow({ where: { projectId: f.id, active: true } });
    expect(nextFull.phase).toBe("FULL_TEXT"); expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(1);
    expect((await withWorkspace(f.id, owner, {}, c => evidenceEligibility(c.tx, f.id))).get(f.paperId)?.eligible).toBe(true);
    await service.assign(f.id, owner, { roundIds: [nextFull.id], reviewerIds: [a,b], mode: "MANUAL", dueAt: null, clientKey: key() });
    const finalF = { ...f, roundId: nextFull.id }; await vote(finalF, a, "EXCLUDE"); await vote(finalF, b, "EXCLUDE");
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(0);
    expect((await service.analytics(f.id, owner)).prismaSummary?.excludedByStage.FULL_TEXT.count).toBe(1);
    expect(await db.screeningRound.count({ where: { projectId: f.id } })).toBe(4);
  });

});
