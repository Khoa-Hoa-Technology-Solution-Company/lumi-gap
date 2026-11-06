import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { screeningService as service } from "../screening.service.js";
import { screeningCaseService as cases } from "../screening-case.service.js";
import { projectSourcesService as sources } from "../project-sources.service.js";
import { projectMentorshipService as mentors } from "../project-mentorship.service.js";
import { mentorPresets } from "@trend/shared-types";
import { screeningObligationsService as obligations } from "../screening-obligations.js";
import type { ScreeningChoice, ScreeningStageMode } from "@trend/shared-types";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.SCREENING_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Isolated test DB required");
describe.skipIf(!enabled).sequential("versioned stage protocols on PostgreSQL", () => {
  const db = getPrisma();
  let owner: string, a: string, b: string, judge: string;
  const key = () => randomUUID();
  beforeAll(async () => {
    const ids = [];
    for (const name of ["Protocol owner", "Reviewer A", "Reviewer B", "Independent judge"]) {
      const u = await db.user.create({ data: { fullName: name, email: `${key()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: u.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } }); ids.push(u.id);
    }
    [owner, a, b, judge] = ids as [string, string, string, string];
  });
  afterAll(disconnectPostgres);
  async function fixture(mode: ScreeningStageMode = "SINGLE_STAGE", fulltext = false, criteria = ["Wrong population"]) {
    const project = await createProjectFixture({ data: { title: "Stage protocol", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [a, b, judge].map(userId => ({ projectId: project.id, userId })) });
    const paper = await db.paper.create({ data: { title: "Actual university population study", abstractText: "A controlled study of adult learners.", ...(fulltext ? { openAccessUrl: "https://example.org/paper.pdf" } : {}), publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: project.id, paperId: paper.id, addedById: owner } });
    await service.configure(project.id, owner, { screeningMode: mode, reviewMode: "INDEPENDENT", requiredReviewers: 2, consensusPolicy: "UNANIMOUS", expectedVersion: 0, aiAssisted: false, inclusionCriteria: ["Adult learners"], exclusionCriteria: criteria, researchQuestions: [], preferredAdjudicatorId: judge, clientKey: key() });
    const result = await service.start(project.id, owner, { paperIds: [paper.id], phase: "TITLE_ABSTRACT", confirmRescreen: false, clientKey: key() });
    const roundId = result.roundIds![0]!;
    await service.assign(project.id, owner, { roundIds: [roundId], reviewerIds: [a, b], mode: "MANUAL", dueAt: null, clientKey: key() });
    return { id: project.id, paperId: paper.id, roundId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function vote(f: Fixture, actor: string, decision: ScreeningChoice, exclusionReason = "Wrong population") {
    const round = await service.detail(f.id, actor, f.roundId), slot = round.assignments.find(x => x.id === round.myAssignmentId)!;
    await service.submit(f.id, actor, f.roundId, { assignmentId: slot.id, expectedRevision: slot.revision, decision, exclusionReason: decision === "EXCLUDE" ? exclusionReason : "", comment: "Evidence checked against the source", fullTextReference: round.phase === "FULL_TEXT" ? "Actual source PDF p. 3, population" : undefined, confirmed: true, clientKey: key() });
  }
  async function fulltextFixture(criteria = ["Wrong population"]) {
    const f = await fixture("TWO_STAGE", true, criteria);
    await vote(f, a, "INCLUDE"); await vote(f, b, "INCLUDE");
    const next = await db.screeningRound.findFirstOrThrow({ where: { projectId: f.id, paperId: f.paperId, active: true } });
    await service.assign(f.id, owner, { roundIds: [next.id], reviewerIds: [a, b], mode: "MANUAL", dueAt: null, clientKey: key() });
    return { ...f, parentId: f.roundId, roundId: next.id };
  }
  const choices: ScreeningChoice[] = ["INCLUDE", "EXCLUDE", "UNSURE"];
  const expected = {
    single: ["INCLUDED", "NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "NEEDS_RESOLUTION", "EXCLUDED", "NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "NEEDS_RESOLUTION", "NEEDS_MORE_INFO"],
    title: ["INCLUDED", "NEEDS_RESOLUTION", "INCLUDED", "NEEDS_RESOLUTION", "EXCLUDED", "NEEDS_RESOLUTION", "INCLUDED", "NEEDS_RESOLUTION", "INCLUDED"],
    full: ["INCLUDED", "NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "NEEDS_RESOLUTION", "EXCLUDED", "NEEDS_MORE_INFO", "NEEDS_MORE_INFO", "NEEDS_MORE_INFO", "NEEDS_MORE_INFO"],
  };
  for (const context of ["single", "title", "full"] as const) {
    for (const [i, first] of choices.entries()) for (const [j, second] of choices.entries()) {
      it(`${context}: ${first}+${second} persists the stage outcome and acceptance correctly`, async () => {
        const f = context === "full" ? await fulltextFixture() : await fixture(context === "title" ? "TWO_STAGE" : "SINGLE_STAGE", true);
        await vote(f, a, first);
        const partial = await service.detail(f.id, b, f.roundId);
        expect(partial.completed).toBe(1); expect(partial.hiddenReviews).toBe(true); expect(partial.reviews).toHaveLength(0); expect(partial.finalDecision).toBeNull();
        await vote(f, b, second);
        const round = await service.detail(f.id, a, f.roundId);
        expect(round.status).toBe(expected[context][i * 3 + j]); expect(round.completed).toBe(2);
        const summary = await service.workspaceSummary(f.id, a);
        const currentTasks = summary.automaticTasks!.filter(t => !t.endedAt);
        const needsClarification = ["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(round.status);
        expect(currentTasks.map(t => t.actionType)).toEqual(needsClarification ? ["DISCUSSION"] : []);
        expect(summary.acceptedPapers?.length).toBe(round.status === "INCLUDED" && context !== "title" ? 1 : 0);
        expect(summary.myEvaluations?.find(x => x.roundId === f.roundId)?.myDecision).toBe(first);
        expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(context === "full" ? 4 : 2);
      });
    }
  }
  it("waits for a real fulltext source, then resumes once with empty independent round 2 ballots", async () => {
    const f = await fixture("TWO_STAGE"); await vote(f, a, "UNSURE"); await vote(f, b, "INCLUDE");
    let row = await service.detail(f.id, owner, f.roundId);
    expect(row.status).toBe("WAITING_FULLTEXT"); expect(row.extractionReady).toBe(false);
    expect(await db.screeningRound.count({ where: { projectId: f.id } })).toBe(1);
    expect((await service.workspaceSummary(f.id, owner)).pendingInformation).toHaveLength(1);
    const command = () => ({ expectedVersion: row.version, reason: "Fulltext source attached and checked", confirmed: true as const, clientKey: key() });
    await expect(service.resumeFullText(f.id, a, f.roundId, command())).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.resumeFullText(f.id, owner, f.roundId, command())).rejects.toMatchObject({ statusCode: 409 });
    await sources.upload(f.id, owner, f.paperId, Buffer.from("%PDF-1.4\nactual fulltext\n%%EOF"));
    row = await service.detail(f.id, owner, f.roundId);
    const input = command();
    const [one, two] = await Promise.all([service.resumeFullText(f.id, owner, f.roundId, input), service.resumeFullText(f.id, owner, f.roundId, input)]);
    expect(one.roundId).toBe(two.roundId);
    const next = await service.detail(f.id, owner, one.roundId!);
    expect(next.phase).toBe("FULL_TEXT"); expect(next.completed).toBe(0); expect(next.assignments).toHaveLength(0); expect(next.settings.screeningMode).toBe("TWO_STAGE");
  });
  it("cannot auto exclude without saved criteria or actual source evidence", async () => {
    for (const missing of ["criteria", "source"]) {
      const f = await fixture("SINGLE_STAGE", false, missing === "criteria" ? [] : ["Wrong population"]);
      if (missing === "source") await db.paper.update({ where: { id: f.paperId }, data: { abstractText: null } });
      await vote(f, a, "EXCLUDE"); await vote(f, b, "EXCLUDE");
      const row = await service.detail(f.id, a, f.roundId);
      expect(row.status).toBe("NEEDS_MORE_INFO"); expect(row.classification).toBe("NEEDS_CLARIFICATION"); expect(row.finalDecision).toBeNull(); expect(row.canRequestAdjudication).toBe(true);
    }
  });
  it("revisions recompute current ballots, retain history, and cancel an unlocked case on agreement", async () => {
    const f = await fixture(); await vote(f, a, "INCLUDE"); await vote(f, b, "UNSURE");
    let row = await service.detail(f.id, a, f.roundId);
    const opened = await cases.request(f.id, a, f.roundId, { expectedVersion: row.version, confirmed: true, clientKey: key() });
    row = await service.detail(f.id, b, f.roundId);
    await service.reassess(f.id, b, f.roundId, { expectedRevision: row.version, decision: "INCLUDE", reason: "Confirmed the population from source", exclusionReason: "", comment: "", confirmed: true, clientKey: key() });
    row = await service.detail(f.id, a, f.roundId);
    expect(row.status).toBe("INCLUDED"); expect(row.resolutionType).toBe("CONSENSUS_AFTER_DISCUSSION");
    expect((await db.screeningAdjudicationCase.findUniqueOrThrow({ where: { id: opened.caseId } })).status).toBe("CANCELLED_AS_RESOLVED");
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
    await expect(service.reassess(f.id, a, f.roundId, { decision: "EXCLUDE", reason: "Changed after final conclusion", exclusionReason: "Wrong population", confirmed: true, clientKey: key() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("reopening a parent revokes dependent stage authority without deleting its ballots or decisions", async () => {
    const f = await fulltextFixture(); await vote(f, a, "INCLUDE"); await vote(f, b, "INCLUDE");
    const parent = await service.detail(f.id, owner, f.parentId);
    await service.reopen(f.id, owner, f.parentId, { expectedVersion: parent.version, assignmentId: parent.assignments[0]!.id, reason: "Recheck initial source population evidence", confirmed: true, clientKey: key() });
    expect((await db.screeningRound.findUniqueOrThrow({ where: { id: f.roundId } })).active).toBe(false);
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(0);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(4);
    expect(await db.screeningFinalDecision.count({ where: { projectId: f.id } })).toBe(2);
    expect(await db.screeningAudit.count({ where: { projectId: f.id, type: "DEPENDENCY_INVALIDATED" } })).toBe(1);
  });
  it("one common 48h case locks equal statements and requires evidence for the independent decision", async () => {
    const f = await fixture(); await vote(f, a, "INCLUDE"); await vote(f, b, "EXCLUDE");
    const row = await service.detail(f.id, a, f.roundId), started = Date.now();
    const requests = await Promise.all([a, b].map(actor => cases.request(f.id, actor, f.roundId, { expectedVersion: row.version, confirmed: true, clientKey: key() })));
    expect(requests[0]!.caseId).toBe(requests[1]!.caseId);
    let packet = await cases.view(f.id, a, f.roundId);
    expect(new Date(packet.case!.deadline).getTime() - started).toBeGreaterThan(47.99 * 3600000);
    await cases.act(f.id, a, f.roundId, { action: "STATEMENT", caseId: packet.case!.id, expectedPacketVersion: packet.case!.packetVersion, expectedStatementRevision: 0, useExisting: true, text: "", clientKey: key() });
    packet = await cases.view(f.id, b, f.roundId);
    expect(packet.case!.statements.find(s => s.reviewerId === a)?.hidden).toBe(true);
    await cases.act(f.id, b, f.roundId, { action: "STATEMENT", caseId: packet.case!.id, expectedPacketVersion: packet.case!.packetVersion, expectedStatementRevision: 0, useExisting: false, text: "Detailed independent opinion from reviewer B", clientKey: key() });
    const assigned = await cases.view(f.id, judge, f.roundId);
    expect(assigned.canResolve).toBe(true); expect(assigned.case!.invitation?.userId).toBe(judge);
    await expect(service.reassess(f.id, a, f.roundId, { decision: "UNSURE", reason: "Cannot edit a locked packet", exclusionReason: "", confirmed: true, clientKey: key() })).rejects.toMatchObject({ statusCode: 409 });
    const command = { expectedVersion: assigned.version, expectedCaseVersion: assigned.case!.version, decision: "EXCLUDED" as const, exclusionReason: "Wrong population", reason: "Population does not meet inclusion criteria", confirmed: true as const, clientKey: key() };
    await expect(service.resolve(f.id, judge, f.roundId, command)).rejects.toMatchObject({ statusCode: 400 });
    await service.resolve(f.id, judge, f.roundId, { ...command, sourceMaterial: "Abstract, paragraph 1, population description", clientKey: key() });
    const summary = await service.workspaceSummary(f.id, a);
    expect(summary.myEvaluations?.[0]).toMatchObject({ myDecision: "INCLUDE", groupStatus: "EXCLUDED", isAdjudicated: true });
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });

  it("reconciles a fulltext exclusion criterion by revising only the author's ballot", async () => {
    const f = await fulltextFixture(["Wrong population", "Wrong method"]);
    await vote(f, a, "EXCLUDE", "Wrong population"); await vote(f, b, "EXCLUDE", "Wrong method");
    const row = await service.detail(f.id, b, f.roundId);
    expect(row.status).toBe("NEEDS_RESOLUTION"); expect(row.classification).toBe("EXCLUSION_REASON_MISMATCH");
    await service.reassess(f.id, b, f.roundId, { expectedRevision: row.version, decision: "EXCLUDE", exclusionReason: "Wrong population", reason: "Population is the primary reason after source comparison", comment: "", fullTextReference: "Fulltext PDF p. 3, study participants", confirmed: true, clientKey: key() });
    const final = await service.detail(f.id, a, f.roundId);
    expect(final.status).toBe("EXCLUDED"); expect(final.reviewHistory).toHaveLength(3);
  });

  it("keeps an in-flight single-stage protocol immutable when future rounds change to two stages", async () => {
    const f = await fixture(); await vote(f, a, "INCLUDE");
    await service.configure(f.id, owner, { screeningMode: "TWO_STAGE", reviewMode: "INDEPENDENT", requiredReviewers: 2, consensusPolicy: "UNANIMOUS", expectedVersion: 1, aiAssisted: false, inclusionCriteria: ["New criteria"], exclusionCriteria: ["New exclusion"], researchQuestions: [], clientKey: key() });
    await vote(f, b, "INCLUDE");
    const row = await service.detail(f.id, a, f.roundId);
    expect(row.settings).toMatchObject({ version: 1, screeningMode: "SINGLE_STAGE", inclusionCriteria: ["Adult learners"] });
    expect(row.outcome).toBe("FINAL_INCLUDED"); expect(row.extractionReady).toBe(true);
    expect(await db.screeningRound.count({ where: { projectId: f.id } })).toBe(1);
  });

  it("deadline expiration records a missing response without consent and requires a binary adjudication", async () => {
    const f = await fixture(); await vote(f, a, "UNSURE"); await vote(f, b, "INCLUDE");
    const row = await service.detail(f.id, a, f.roundId);
    const request = await cases.request(f.id, a, f.roundId, { expectedVersion: row.version, confirmed: true, clientKey: key() });
    await db.screeningAdjudicationCase.update({ where: { id: request.caseId }, data: { deadline: new Date(Date.now() - 1000) } });
    await cases.view(f.id, a, f.roundId); // An existing participant reconciles the elapsed deadline before the new assignee gains access.
    const packet = await cases.view(f.id, judge, f.roundId);
    expect(packet.case!.lockedAt).not.toBeNull();
    expect(packet.case!.statements.every(s => !s.completed)).toBe(true);
    await expect(service.resolve(f.id, judge, f.roundId, { expectedVersion: packet.version, expectedCaseVersion: packet.case!.version, decision: "NEEDS_MORE_INFO", reason: "Retrieve participant inclusion details before deciding", sourceMaterial: "Abstract lacks a participant description", confirmed: true, clientKey: key() })).rejects.toMatchObject({ statusCode: 400 });
    expect((await service.workspaceSummary(f.id, owner)).pendingInformation ?? []).toHaveLength(0);
    expect(await cases.tasks(f.id, judge)).toHaveLength(1);
    await service.resolve(f.id, judge, f.roundId, { expectedVersion: packet.version, expectedCaseVersion: packet.case!.version, decision: "INCLUDED", reason: "Source population matches the registered inclusion criteria", sourceMaterial: "Abstract paragraph 1 describes adult learners", confirmed: true, clientKey: key() });
    expect((await service.detail(f.id, a, f.roundId)).finalDecision?.decision).toBe("INCLUDED");
    expect((await service.workspaceSummary(f.id, a)).pendingDiscussions).toHaveLength(0);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });

  it("assigns a Lecturer directly in their scoped workspace with stage-specific authority", async () => {
    const f = await fixture("TWO_STAGE");
    const lecturer = await db.user.create({ data: { fullName: "Independent lecturer", email: `${key()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: lecturer.id, academicRole: "LECTURER", primaryPosition: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", supportAvailability: { enabled: true } } });
    await db.project.update({ where: { id: f.id }, data: { mentorshipSummary: "A research project about university populations and controlled review methodology", mentorshipNeeds: "Independent methodology guidance", mentorshipDiscovery: "SEEKING_MENTOR" } });
    const request = await mentors.request(f.id, owner, { mentorUserId: lecturer.id, message: "Please advise our research methodology", idempotencyKey: key(), access: { preset: "ADVISOR", permissions: [...mentorPresets.ADVISOR], expiresAt: null } });
    await mentors.accept(f.id, request.id, lecturer.id, "Accepted research advisory role", request.accessPolicy?.version);
    await service.configure(f.id, owner, { screeningMode: "TWO_STAGE", reviewMode: "INDEPENDENT", requiredReviewers: 2, consensusPolicy: "UNANIMOUS", expectedVersion: 1, aiAssisted: false, inclusionCriteria: ["Adult learners"], exclusionCriteria: ["Wrong population"], researchQuestions: [], preferredAdjudicatorId: lecturer.id, clientKey: key() });
    // New round receives the newly versioned policy; do not mutate the old snapshot.
    const paper = await db.paper.create({ data: { title: "Second actual source for lecturer review", abstractText: "Study population needs verification.", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: f.id, paperId: paper.id, addedById: owner } });
    const start = await service.start(f.id, owner, { paperIds: [paper.id], phase: "TITLE_ABSTRACT", confirmRescreen: false, clientKey: key() });
    const current = { ...f, paperId: paper.id, roundId: start.roundIds![0]! };
    await service.assign(f.id, owner, { roundIds: [current.roundId], mode: "MANUAL", reviewerIds: [a, b], dueAt: null, clientKey: key() });
    await vote(current, a, "INCLUDE"); await vote(current, b, "EXCLUDE");
    const row = await service.detail(f.id, a, current.roundId);
    await cases.request(f.id, a, current.roundId, { expectedVersion: row.version, confirmed: true, clientKey: key() });
    for (const actor of [a, b]) {
      const cv = (await cases.view(f.id, actor, current.roundId)).case!;
      await cases.act(f.id, actor, current.roundId, { action: "STATEMENT", caseId: cv.id, expectedPacketVersion: cv.packetVersion, expectedStatementRevision: 0, useExisting: true, text: "", clientKey: key() });
    }
    expect(await cases.tasks(f.id, lecturer.id)).toEqual([expect.objectContaining({ roundId: current.roundId, caseStatus: "ASSIGNED" })]);
    const assignedTask = (await obligations.list(f.id, lecturer.id)).find(t => !t.endedAt)!;
    expect(assignedTask).toMatchObject({ actionType: "ADJUDICATION", status: "TODO", roundId: current.roundId });
    const packet = await cases.view(f.id, lecturer.id, current.roundId);
    expect(packet.packet.protocol?.screeningMode).toBe("TWO_STAGE"); expect(packet.canResolve).toBe(true);
    await service.resolve(f.id, lecturer.id, current.roundId, { expectedVersion: packet.version, expectedCaseVersion: packet.case!.version, decision: "INCLUDED", reason: "Eligible for fulltext evaluation based on the actual study scope", sourceMaterial: "Abstract paragraph 1 identifies the population", confirmed: true, clientKey: key() });
    const result = await service.detail(f.id, a, current.roundId);
    expect(result.status).toBe("WAITING_FULLTEXT"); expect(result.extractionReady).toBe(false);
    expect(await cases.tasks(f.id, lecturer.id)).toEqual([]);
    expect((await obligations.list(f.id, lecturer.id)).find(t => t.id === assignedTask.id)?.status).toBe("DONE");
    expect((await service.workspaceSummary(f.id, a)).acceptedPapers).toHaveLength(0);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });
});
