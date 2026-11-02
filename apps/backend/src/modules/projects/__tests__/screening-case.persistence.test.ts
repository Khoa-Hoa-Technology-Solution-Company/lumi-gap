import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { screeningService as service } from "../screening.service.js";
import { maintainScreeningCases } from "../screening-case-maintenance.js";
import { screeningCaseService as cases } from "../screening-case.service.js";
import { projectMentorshipService as mentors } from "../project-mentorship.service.js";
import { mentorPresets } from "@trend/shared-types";
import { libraryAssessmentService } from "../library-assessment.service.js";
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn() }, aiJobsQueue: { add: vi.fn() } }));
const enabled = process.env.SCREENING_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated test database");
describe.skipIf(!enabled).sequential("sealed packets and direct adjudication on PostgreSQL", () => {
  const db = getPrisma();
  let owner: string, a: string, b: string, candidate: string, second: string, proposer: string, outsider: string;
  beforeAll(async () => {
    const ids = [];
    for (const fullName of ["Coordinator", "Reviewer A", "Reviewer B", "Independent member", "Second member", "Proposer", "Outsider"]) {
      const u = await db.user.create({ data: { email: `case-${randomUUID()}@example.org`, fullName, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: u.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } });
      ids.push(u.id);
    }
    [owner, a, b, candidate, second, proposer, outsider] = ids as [string, string, string, string, string, string, string];
  });
  afterAll(disconnectPostgres);
  async function fixture(options: { preferred?: string | null; candidates?: string[]; reviewers?: string[]; proposer?: string; discuss?: boolean; criteria?: boolean; coordinators?: string[] } = {}) {
    const p = await createProjectFixture({ data: { title: "Adjudication fixture", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [...new Set([a, b, proposer, ...options.candidates ?? [candidate]])].filter(id => id !== owner).map(userId => ({ projectId: p.id, userId })) });
    const paper = await db.paper.create({ data: { title: "Independent population study", abstractText: "The study examines human university participants.", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: p.id, paperId: paper.id, addedById: options.proposer ?? proposer } });
    await service.configure(p.id, owner, { preferredAdjudicatorId: options.preferred ?? null, adjudicationCoordinatorIds: options.coordinators ?? [], statementWindowHours: 48, expectedVersion: 0, requiredReviewers: 2, consensusPolicy: "UNANIMOUS", aiAssisted: false, reviewMode: "INDEPENDENT", inclusionCriteria: ["University participants"], exclusionCriteria: options.criteria === false ? [] : ["Wrong population"], researchQuestions: ["Does the method help university students?"], stages: ["TITLE_ABSTRACT"], clientKey: randomUUID() });
    const start = await service.start(p.id, owner, { paperIds: [paper.id], phase: "TITLE_ABSTRACT", confirmRescreen: false, clientKey: randomUUID() });
    const roundId = start.roundIds![0]!;
    await service.assign(p.id, owner, { roundIds: [roundId], mode: "MANUAL", reviewerIds: options.reviewers ?? [a, b], dueAt: null, clientKey: randomUUID() });
    const f = { id: p.id, roundId, paperId: paper.id, reviewers: options.reviewers ?? [a, b] };
    for (const [i, actor] of f.reviewers.entries()) {
      const r = await service.detail(f.id, actor, roundId);
      await service.submit(f.id, actor, roundId, { assignmentId: r.myAssignmentId!, expectedRevision: r.assignments.find(v => v.reviewerId === actor)!.revision, decision: i === 0 ? "INCLUDE" : "EXCLUDE", comment: `Independent view of ${actor}`, exclusionReason: i === 0 ? "" : "Wrong population", confirmed: true, clientKey: randomUUID() });
    }
    if (options.discuss !== false) for (const actor of f.reviewers) await service.comment(f.id, actor, roundId, { comment: "Compare the population to the registered protocol", clientKey: randomUUID() });
    return f;
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const view = (f: Fixture, actor = a) => cases.view(f.id, actor, f.roundId);
  async function open(f: Fixture, actor = f.reviewers[0]!) {
    const r = await service.detail(f.id, actor, f.roundId);
    return cases.request(f.id, actor, f.roundId, { expectedVersion: r.version, confirmed: true, clientKey: randomUUID() });
  }
  async function statement(f: Fixture, actor: string, text = "", useExisting = true) {
    const v = (await view(f, actor)).case!;
    return cases.act(f.id, actor, f.roundId, { action: "STATEMENT", caseId: v.id, expectedPacketVersion: v.packetVersion, expectedStatementRevision: v.statements.find(s => s.reviewerId === actor)!.revision, text, useExisting, clientKey: randomUUID() });
  }
  async function ready(f: Fixture) { await open(f); for (const reviewer of f.reviewers) await statement(f, reviewer); }
  it("workspace reminder follows only the caller's current packet statement and stops at lock or expiry", async () => {
    const f = await fixture(); await open(f);
    const task = async (actor: string) => (await service.workspaceSummary(f.id, actor)).myTrackedDisputes!.find(t => t.roundId === f.roundId);
    expect(await task(a)).toMatchObject({ needsMyStatement: true });
    expect(await task(b)).toMatchObject({ needsMyStatement: true });
    await statement(f, a, "Private source based reasoning for reviewer A", false);
    expect(await task(a)).toMatchObject({ needsMyStatement: false });
    expect(await task(b)).toMatchObject({ needsMyStatement: true });
    expect(JSON.stringify(await task(b))).not.toContain("Private source based reasoning");
    const packet = (await view(f)).case!;
    // Old-packet statements must not dismiss a fresh request for the caller's opinion.
    await db.screeningAdjudicationCase.update({ where: { id: packet.id }, data: { packetVersion: { increment: 1 } } });
    expect(await task(a)).toMatchObject({ needsMyStatement: true });
    await db.screeningAdjudicationCase.update({ where: { id: packet.id }, data: { deadline: new Date(Date.now() - 1000) } });
    expect(await task(a)).toMatchObject({ needsMyStatement: false });
    expect(await task(b)).toMatchObject({ needsMyStatement: false });
    const g = await fixture(); await ready(g);
    expect((await service.workspaceSummary(g.id, a)).myTrackedDisputes!.find(t => t.roundId === g.roundId)).toMatchObject({ needsMyStatement: false });
  });
  async function resolve(f: Fixture, actor = candidate, extra = {}) {
    const v = await view(f, actor);
    return service.resolve(f.id, actor, f.roundId, { expectedVersion: v.version, expectedCaseVersion: v.case!.version, decision: "INCLUDED", reason: "The source population meets the registered criteria", sourceMaterial: "Stored abstract: human university participants", confirmed: true, clientKey: randomUUID(), ...extra });
  }
  it("preserves each reviewer's original and revised ballots after discussion and automatically agrees", async () => {
    const f = await fixture({ discuss: false });
    for (const actor of f.reviewers) await service.comment(f.id, actor, f.roundId, { comment: "Compare the study population with the protocol", clientKey: randomUUID() });
    const r = await service.detail(f.id, b, f.roundId);
    await service.reassess(f.id, b, f.roundId, { expectedRevision: r.version, decision: "INCLUDE", reason: "After discussion I verified the population", confirmed: true, clientKey: randomUUID() });
    expect(await service.detail(f.id, a, f.roundId)).toMatchObject({ status: "INCLUDED", resolutionType: "CONSENSUS_AFTER_DISCUSSION" });
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
  });
  it.each([0, 1])("reviewer %s can request immediately with no discussion or waiting period", async index => {
    const f = await fixture({ discuss: false });
    const actor = f.reviewers[index]!;
    const r = await service.detail(f.id, actor, f.roundId);
    expect(r).toMatchObject({ canRequestAdjudication: true, discussionReady: false });
    await open(f, actor);
    const updated = await service.detail(f.id, actor, f.roundId);
    expect(updated).toMatchObject({ canRequestAdjudication: false, adjudicationCase: { ready: false, status: "COLLECTING", assignedAdjudicator: null } });
    const other = await service.detail(f.id, f.reviewers.find(id => id !== actor)!, f.roundId);
    expect(other.adjudicationCase).toEqual(updated.adjudicationCase);
    expect(other.canRequestAdjudication).toBe(false);
    expect(updated.adjudicationCase?.disputePoints).toEqual([]);
    const packet = await view(f, actor);
    expect(packet.case?.myReviewerId).toBe(actor);
    expect((await view(f, f.reviewers.find(id => id !== actor)!)).case?.myReviewerId).toBe(f.reviewers.find(id => id !== actor));
    expect(packet.packet.reviews).toHaveLength(2);
    expect(packet.packet.discussion).toHaveLength(0);
    expect(Date.parse(updated.adjudicationCase!.deadline!) - Date.now()).toBeGreaterThan(47.9 * 3600000);
  });
  it("rejects incomplete or matching ballots and requests after a final decision", async () => {
    const f = await fixture({ discuss: false });
    const assignment = await db.screeningAssignment.findUniqueOrThrow({ where: { roundId_reviewerId: { roundId: f.roundId, reviewerId: b } } });
    await db.screeningAssignment.update({ where: { id: assignment.id }, data: { submittedAt: null } });
    expect((await service.detail(f.id, a, f.roundId)).canRequestAdjudication).toBe(false);
    await expect(open(f)).rejects.toMatchObject({ statusCode: 409 });
    await db.screeningAssignment.update({ where: { id: assignment.id }, data: { submittedAt: assignment.submittedAt, revision: assignment.revision + 1 } });
    await db.screeningReview.create({ data: { projectId: f.id, assignmentId: assignment.id, revision: assignment.revision + 1, decision: "INCLUDE", comment: "Append a matching current ballot, preserving the original", exclusionReason: "", scope: "TITLE_ABSTRACT" } });
    expect((await service.detail(f.id, a, f.roundId)).canRequestAdjudication).toBe(false);
    await expect(open(f)).rejects.toMatchObject({ statusCode: 409 });
    const g = await fixture({ discuss: false }); await ready(g); await resolve(g);
    for (const actor of [a, b]) await expect(open(g, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.screeningAdjudicationCase.count({ where: { roundId: g.roundId } })).toBe(1);
  });
  it("an eligible legacy collaborative pair uses the same sealed case without third-review or direct-assignment bypasses", async () => {
    const f = await fixture({ discuss: false });
    const row = await db.screeningRound.findUniqueOrThrow({ where: { id: f.roundId } });
    await db.screeningRound.update({ where: { id: f.roundId }, data: { settings: { ...(row.settings as object), workflowVersion: 2, reviewMode: "COLLABORATIVE" } } });
    expect(await service.detail(f.id, a, f.roundId)).toMatchObject({ canRequestAdjudication: true, canReassess: true });
    await open(f);
    await expect(libraryAssessmentService.assess(f.id, owner, f.paperId, { roundId: f.roundId, settingsVersion: 1, expectedRevision: 0, decision: "INCLUDE", comment: "Cannot add a third opinion to an open case", exclusionReason: "", clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.finalizer(f.id, owner, f.roundId, { expectedVersion: (await service.detail(f.id, owner, f.roundId)).version, finalizerId: owner, reason: "Cannot replace the invitation policy", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await statement(f, a); await statement(f, b); await resolve(f);
    expect(await service.detail(f.id, b, f.roundId)).toMatchObject({ resolutionType: "ADJUDICATION", adjudicationCase: { status: "COMPLETED" } });
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });
  it("concurrent requests open one collecting case; exact retry is idempotent", async () => {
    const f = await fixture({ discuss: false }); const r = await service.detail(f.id, a, f.roundId);
    const payload = { expectedVersion: r.version, confirmed: true as const, clientKey: randomUUID() };
    const results = await Promise.all([cases.request(f.id, a, f.roundId, payload), cases.request(f.id, b, f.roundId, { ...payload, clientKey: randomUUID() })]);
    expect(results[0].caseId).toBe(results[1].caseId);
    expect(await cases.request(f.id, a, f.roundId, payload)).toEqual(results[0]);
    expect(await db.screeningAdjudicationCase.count({ where: { roundId: f.roundId, active: true } })).toBe(1);
    expect(await db.screeningAdjudicationInvitation.count({ where: { caseId: results[0].caseId } })).toBe(0);
    expect((await view(f)).case?.requestedByIds.sort()).toEqual([a, b].sort());
    await expect(cases.request(f.id, a, f.roundId, { ...payload, reason: "A different request" })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("ties need an independent coordinator; the first requester and reviewer Owner cannot choose", async () => {
    const f = await fixture({ candidates: [candidate, second], reviewers: [owner, a] }); await open(f, owner); for (const reviewer of f.reviewers) await statement(f, reviewer);
    const v = (await view(f, owner)).case!;
    expect(v.status).toBe("WAITING_ASSIGNMENT"); expect(v.canCoordinate).toBe(false);
    await expect(cases.act(f.id, owner, f.roundId, { action: "SELECT", caseId: v.id, candidateId: candidate, reason: "I want to choose this candidate", expectedCaseVersion: v.version, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.finalizer(f.id, owner, f.roundId, { expectedVersion: (await service.detail(f.id, owner, f.roundId)).version, finalizerId: owner, reason: "Owner cannot override independence", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("coordinator selects only the highest tied rank and records the reason", async () => {
    const f = await fixture({ candidates: [candidate, second] }); await open(f); await statement(f, a); await statement(f, b);
    const v = (await view(f, owner)).case!; expect(v.candidates.map(p => p.id).sort()).toEqual([candidate, second].sort());
    await expect(cases.act(f.id, owner, f.roundId, { action: "SELECT", caseId: v.id, candidateId: owner, reason: "Cannot jump ahead of independent members", expectedCaseVersion: v.version, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await cases.act(f.id, owner, f.roundId, { action: "SELECT", caseId: v.id, candidateId: second, reason: "Assigned based on the registered methodology", expectedCaseVersion: v.version, clientKey: randomUUID() });
    expect((await view(f)).case?.invitation?.userId).toBe(second);
    expect(JSON.stringify(await service.history(f.id, owner, f.roundId))).toContain("registered methodology");
  });
  it("predesignated eligible person has priority; reviewers and proposer are excluded", async () => {
    const f = await fixture({ preferred: owner, candidates: [candidate, second] }); await ready(f);
    expect((await view(f)).case?.invitation).toMatchObject({ userId: owner, role: "PREDESIGNATED" });
    const g = await fixture({ preferred: proposer }); await ready(g);
    expect((await view(g)).case?.invitation?.userId).toBe(candidate);
    const h = await fixture({ preferred: a }); await ready(h);
    expect((await view(h)).case?.invitation?.userId).toBe(candidate);
  });
  it("direct assignment creates tasks and independent coordinator can reassign with reason", async () => {
    const f = await fixture(); await ready(f);
    const v = (await view(f, candidate)).case!;
    expect((await service.adjudicationTasks(f.id, candidate))[0]).toMatchObject({ caseStatus: "ASSIGNED" });
    expect((await service.workspaceSummary(f.id, candidate)).pendingAdjudications).toHaveLength(1);
    await expect(cases.act(f.id, candidate, f.roundId, { action: "ACCEPT", caseId: v.id, invitationId: v.invitation!.id, expectedCaseVersion: v.version, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    for (const actor of [a, b, candidate]) await expect(cases.act(f.id, actor, f.roundId, { action: "REASSIGN", caseId: v.id, reason: "Coordinator must verify the replacement", expectedCaseVersion: v.version, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
    await cases.act(f.id, owner, f.roundId, { action: "REASSIGN", caseId: v.id, reason: "Unavailable for this methodology review", expectedCaseVersion: v.version, clientKey: randomUUID() });
    const next = (await view(f)).case!;
    expect(next.invitation).toMatchObject({ userId: owner, status: "ASSIGNED" });
    expect(next.invitations.find(i => i.userId === candidate)).toMatchObject({ status: "REVOKED", responseReason: "Unavailable for this methodology review" });
    await expect(view(f, candidate)).rejects.toMatchObject({ statusCode: 404 });
    expect(await service.adjudicationTasks(f.id, candidate)).toEqual([]);
  });

  it("both reviewers submit concurrently using individual statement revisions and sealed text", async () => {
    const f = await fixture(); await open(f);
    const before = (await view(f)).case!;
    await statement(f, a, "Private methodological statement from reviewer A", false);
    const sealed = await view(f, b);
    expect(JSON.stringify(sealed)).not.toContain("Private methodological statement");
    expect(JSON.stringify(await service.history(f.id, b, f.roundId))).not.toContain("Private methodological statement");
    await cases.act(f.id, b, f.roundId, { action: "STATEMENT", caseId: before.id, expectedPacketVersion: before.packetVersion, expectedStatementRevision: 0, text: "", useExisting: true, clientKey: randomUUID() });
    expect((await view(f, candidate)).case).toMatchObject({ ready: true, status: "ASSIGNED", canResolve: true });
    expect(JSON.stringify(await view(f, b))).toContain("Private methodological statement");
    await expect(statement(f, a, "Revised methodological statement from reviewer A", false)).rejects.toMatchObject({ statusCode: 403 });
    expect((await view(f, a)).case?.statements.find(s => s.reviewerId === a)?.history).toHaveLength(1);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });
  it("deadline permits adjudication without fabricating silence as consent", async () => {
    const f = await fixture(); await open(f);
    await statement(f, a);
    await expect(view(f, candidate)).rejects.toMatchObject({ statusCode: 404 });
    await db.screeningAdjudicationCase.updateMany({ where: { roundId: f.roundId }, data: { deadline: new Date(Date.now() - 1000) } });
    await maintainScreeningCases((await view(f, a)).case!.id);
    const v = await view(f, candidate);
    expect(v.case).toMatchObject({ ready: true, canResolve: true, lockedAt: expect.any(String) });
    expect(v.case?.statements.find(s => s.reviewerId === b)).toMatchObject({ completed: false, hidden: false });
    expect(await db.screeningAdjudicationStatement.count({ where: { caseId: v.case!.id, reviewerId: b } })).toBe(0);
  });
  it("concurrent supplements seal exactly once, block late edits and expose a direct assignment", async () => {
    const f = await fixture(); await open(f);
    const old = await view(f, a);
    await Promise.all([statement(f, a, "Independent supplement from the first reviewer", false), statement(f, b)]);
    const sealed = await view(f, candidate);
    expect(sealed.case).toMatchObject({ ready: true, status: "ASSIGNED", lockedAt: expect.any(String), canStart: true, canResolve: true });
    expect(await db.screeningAdjudicationInvitation.count({ where: { caseId: sealed.case!.id, status: "ASSIGNED" } })).toBe(1);
    expect(await db.screeningAudit.count({ where: { roundId: f.roundId, type: "ADJUDICATION_CASE_LOCKED" } })).toBe(1);
    for (const actor of [a, b]) await expect(statement(f, actor, "Late modification to a locked packet", false)).rejects.toMatchObject({ statusCode: 403 });
    const r = await service.detail(f.id, a, f.roundId);
    expect(r.canReassess).toBe(false);
    for (const actor of [a, b]) { const own = await service.detail(f.id, actor, f.roundId); await expect(service.reopen(f.id, actor, f.roundId, { expectedVersion: own.version, assignmentId: own.myAssignmentId!, reason: "Cannot bypass the locked packet", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 }); }
    await expect(service.reassess(f.id, a, f.roundId, { expectedRevision: r.version, decision: "UNSURE", reason: "Cannot change the sealed ballot", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.resolve(f.id, candidate, f.roundId, { expectedVersion: sealed.version, expectedCaseVersion: old.case!.version, decision: "INCLUDED", sourceMaterial: "Stored abstract and population details", reason: "Stale case version cannot bypass the sealed packet", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await cases.act(f.id, candidate, f.roundId, { action: "START", caseId: sealed.case!.id, expectedCaseVersion: sealed.case!.version, clientKey: randomUUID() });
    expect((await view(f, a)).case?.status).toBe("IN_PROGRESS");
  });

  it("missing source prevents exclusion and a more-information result keeps binary screening unresolved", async () => {
    const f = await fixture();
    await db.paper.update({ where: { id: f.paperId }, data: { abstractText: null } });
    await ready(f);
    await expect(resolve(f, candidate, { decision: "EXCLUDED", exclusionReason: "Wrong population" })).rejects.toMatchObject({ statusCode: 400 });
    await resolve(f, candidate, { decision: "NEEDS_MORE_INFO", reason: "Retrieve the full text and verify the participant population before deciding" });
    expect(await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: f.id, paperId: f.paperId } } })).toMatchObject({ screeningStatus: "MAYBE", screenedAt: null });
    const result = await view(f, a);
    expect(result.case?.status).toBe("NEEDS_MORE_INFO");
    expect(result.finalDecision).toBeNull();
    expect(result.resolution?.reason).toContain("Retrieve the full text");
    expect(await service.adjudicationTasks(f.id, candidate)).toEqual([]);
  });
  it("reopening requires a new case and keeps each historical decision attached to its own packet", async () => {
    const f = await fixture(); await ready(f); await resolve(f);
    const first = await view(f, a);
    const r = await service.detail(f.id, owner, f.roundId);
    const assignment = r.assignments.find(v => v.reviewerId === a)!;
    await service.reopen(f.id, owner, f.roundId, { expectedVersion: r.version, assignmentId: assignment.id, reason: "New source requires a formal review of the result", confirmed: true, clientKey: randomUUID() });
    const reopened = await service.detail(f.id, a, f.roundId);
    await service.submit(f.id, a, f.roundId, { assignmentId: assignment.id, expectedRevision: reopened.assignments.find(v => v.reviewerId === a)!.revision, decision: "INCLUDE", comment: "Reviewed new source and retain the original position", confirmed: true, clientKey: randomUUID() });
    for (const actor of f.reviewers) await service.comment(f.id, actor, f.roundId, { comment: "Compare the new source with current independent positions", clientKey: randomUUID() });
    await ready(f); await resolve(f, candidate, { decision: "EXCLUDED", exclusionReason: "Wrong population", reason: "The revised source confirms a different participant population" });
    const current = await view(f, a);
    const historical = await cases.view(f.id, a, f.roundId, first.case!.id);
    expect(current.case?.id).not.toBe(first.case!.id);
    expect(current.finalDecision?.decision).toBe("EXCLUDED");
    expect(historical.finalDecision).toEqual(first.finalDecision);
    expect(historical.packet).toEqual(first.packet);
    expect(historical.canResolve).toBe(false);
    expect(current.caseHistory).toHaveLength(2);
    const unrelated = await fixture();
    await expect(cases.view(f.id, a, f.roundId, (await open(unrelated)).caseId!)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("database prevents a second active case or simultaneous live invitation even outside the service", async () => {
    const f = await fixture(); await ready(f);
    const existing = await db.screeningAdjudicationCase.findFirstOrThrow({ where: { roundId: f.roundId } });
    const { id: _id, ...data } = existing;
    await expect(db.screeningAdjudicationCase.create({ data })).rejects.toMatchObject({ code: "P2002" });
    await expect(db.screeningAdjudicationInvitation.create({ data: { projectId: f.id, caseId: existing.id, userId: second, role: "MEMBER", status: "ASSIGNED" } })).rejects.toMatchObject({ code: "P2002" });
  });
  it("no third-party access during collection, no three-person chat, full packet after assignment", async () => {
    const f = await fixture(); await open(f);
    await expect(view(f, candidate)).rejects.toMatchObject({ statusCode: 404 });
    expect(await service.adjudicationTasks(f.id, candidate)).toEqual([]);
    await expect(view(f, second)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.comment(f.id, a, f.roundId, { comment: "Advocacy after opening the case", clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await statement(f, a); await statement(f, b);
    expect((await view(f, candidate)).packet.reviews).toHaveLength(2);
    expect((await view(f, candidate)).thread).toEqual([]);
    await expect(service.comment(f.id, candidate, f.roundId, { comment: "Let us discuss this decision", shareWithAdjudicator: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("stores one separate decision, requires sources and actual exclusion criteria, and clears active tasks", async () => {
    const f = await fixture({ criteria: false }); await ready(f);
    await expect(resolve(f, candidate, { decision: "EXCLUDED", exclusionReason: "Unregistered criterion" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(resolve(f, candidate, { sourceMaterial: "" })).rejects.toMatchObject({ statusCode: 400 });
    const v = await view(f, candidate);
    const input = { expectedVersion: v.version, expectedCaseVersion: v.case!.version, decision: "INCLUDED" as const, sourceMaterial: "Abstract: human university participants", reason: "Population is supported by the actual source", confirmed: true as const, clientKey: randomUUID() };
    const results = await Promise.allSettled([service.resolve(f.id, candidate, f.roundId, input), service.resolve(f.id, candidate, f.roundId, { ...input, clientKey: randomUUID() })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    expect((await view(f, candidate)).case).toMatchObject({ status: "COMPLETED", active: false });
    expect(await db.notification.count({ where: { userId: proposer, targetUuid: f.id, eventKey: { contains: "ADJUDICATION_COMPLETED" } } })).toBe(1);
    expect(await service.adjudicationTasks(f.id, candidate)).toEqual([]);
    expect((await service.workspaceSummary(f.id, candidate)).pendingAdjudications).toEqual([]);
    await expect(resolve(f)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("changed ballots invalidate old statements and stale decisions while preserving revisions", async () => {
    const f = await fixture(); await open(f); await statement(f, a);
    const old = await view(f, a);
    const r = await service.detail(f.id, a, f.roundId);
    await service.reassess(f.id, a, f.roundId, { expectedRevision: r.version, decision: "UNSURE", reason: "New source requires clarification before inclusion", confirmed: true, clientKey: randomUUID() });
    const updated = await view(f, a);
    expect(updated.case?.packetVersion).toBe(old.case!.packetVersion + 1);
    expect(updated.case?.ready).toBe(false); expect(updated.case?.statements.find(s => s.reviewerId === a)?.history).toHaveLength(1);
    await expect(service.resolve(f.id, candidate, f.roundId, { expectedVersion: old.version, expectedCaseVersion: old.case!.version, decision: "INCLUDED", sourceMaterial: "Old abstract", reason: "Stale decision must never win the race", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(0);
  });
  it("reviewer agreement cancels the pending case and preserves its history", async () => {
    const f = await fixture(); await open(f);
    const r = await service.detail(f.id, b, f.roundId);
    await service.reassess(f.id, b, f.roundId, { expectedRevision: r.version, decision: "INCLUDE", reason: "After discussion I verified the correct population", confirmed: true, clientKey: randomUUID() });
    expect((await view(f, a)).case).toMatchObject({ status: "CANCELLED_AS_RESOLVED", active: false });
    expect(await db.screeningAdjudicationInvitation.count({ where: { projectId: f.id, status: "REVOKED" } })).toBe(0);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
  });
  it("conflict report pauses the case and only an independent coordinator can replace the candidate", async () => {
    const f = await fixture(); await ready(f);
    let v = (await view(f)).case!;
    await cases.act(f.id, a, f.roundId, { action: "REPORT_CONFLICT", caseId: v.id, invitationId: v.invitation!.id, reason: "Candidate is an author of this source paper", expectedCaseVersion: v.version, clientKey: randomUUID() });
    await expect(resolve(f)).rejects.toMatchObject({ statusCode: 403 });
    v = (await view(f)).case!;
    const payload = { action: "REVIEW_CONFLICT" as const, caseId: v.id, reportId: v.conflicts[0]!.id, upheld: true, reason: "Verified author relationship in source metadata", expectedCaseVersion: v.version, clientKey: randomUUID() };
    await expect(cases.act(f.id, b, f.roundId, payload)).rejects.toMatchObject({ statusCode: 403 });
    await cases.act(f.id, owner, f.roundId, payload);
    expect((await view(f)).case?.invitation?.userId).toBe(owner);
    await expect(view(f, candidate)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("no eligible candidate remains waiting; proposer Owner cannot appoint themselves", async () => {
    const f = await fixture({ candidates: [], proposer: owner }); await ready(f);
    const v = (await view(f)).case!;
    // The extra proposer member is independent and eligible, so revoke their membership explicitly.
    if (v.invitation) await db.projectMember.update({ where: { projectId_userId: { projectId: f.id, userId: v.invitation.userId } }, data: { status: "LEFT" } });
    const waiting = (await view(f)).case!;
    expect(waiting.status).toBe("WAITING_ASSIGNMENT"); expect(waiting.invitation).toBeNull();
    await expect(view(f, owner)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("qualified primary mentor precedes secondary, then independent members after revoked access; scope stays local", async () => {
    const f = await fixture();
    const mentorIds = [];
    for (const role of ["PRIMARY", "SECONDARY"] as const) {
      const user = await db.user.create({ data: { email: `case-mentor-${randomUUID()}@example.org`, fullName: `${role} mentor`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: user.id, academicRole: "LECTURER", primaryPosition: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", supportAvailability: { enabled: true } } });
      await db.project.update({ where: { id: f.id }, data: { mentorshipSummary: "Public research abstract explaining independent screening methodology for a university research project", mentorshipNeeds: "Methodology", mentorshipDiscovery: "SEEKING_MENTOR" } });
      const request = await mentors.request(f.id, owner, { mentorUserId: user.id, mentorRole: role, message: "Please advise our methodology", idempotencyKey: randomUUID(), access: { preset: "ADVISOR", permissions: [...mentorPresets.ADVISOR], expiresAt: null } });
      await mentors.accept(f.id, request.id, user.id, "Accepted", request.accessPolicy?.version);
      mentorIds.push(user.id);
    }
    const bytes = new Uint8Array(Buffer.from("%PDF-1.7 case fixture"));
    const file = await db.projectPaperFile.create({ data: { projectId: f.id, paperId: f.paperId, uploadedById: owner, content: bytes, sha256: "a".repeat(64), byteSize: bytes.length } });
    await ready(f);
    expect((await view(f, mentorIds[0]!)).case?.invitation).toMatchObject({ userId: mentorIds[0], role: "PRIMARY_MENTOR", status: "ASSIGNED" });
    await db.mentorAccess.updateMany({ where: { projectId: f.id, mentorUserId: mentorIds[0] }, data: { revokedAt: new Date() } });
    await view(f, a);
    expect((await view(f)).case?.invitation).toMatchObject({ userId: mentorIds[1], role: "SECONDARY_MENTOR" });
    expect(Buffer.from(await cases.source(f.id, mentorIds[1]!, f.roundId, file.id)).toString()).toContain("%PDF");
    await db.projectPaperFile.update({ where: { id: file.id }, data: { sha256: "b".repeat(64) } });
    await expect(cases.source(f.id, mentorIds[1]!, f.roundId, file.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.board(f.id, mentorIds[1]!, { page: 1, pageSize: 20, q: "", filter: "ALL" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.history(f.id, mentorIds[1]!, f.roundId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(cases.source(f.id, mentorIds[1]!, f.roundId, randomUUID())).rejects.toMatchObject({ statusCode: 404 });
    await db.mentorAccess.updateMany({ where: { projectId: f.id, mentorUserId: mentorIds[1] }, data: { revokedAt: new Date() } });
    expect((await view(f)).case?.invitation?.userId).toBe(candidate);
    await expect(view(f, mentorIds[1]!)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("reminds the assignee once and escalates to an independent coordinator without auto deciding", async () => {
    const f = await fixture(); await ready(f);
    const v = (await view(f)).case!;
    const past = new Date(Date.now() - 169 * 3600000);
    await db.screeningAdjudicationCase.update({ where: { id: v.id }, data: { lockedAt: past } });
    await db.screeningAdjudicationInvitation.update({ where: { id: v.invitation!.id }, data: { createdAt: past } });
    await maintainScreeningCases(v.id); await maintainScreeningCases(v.id);
    expect(await db.notification.count({ where: { eventKey: `SCREENING:CASE:${v.id}:REMINDER:${v.invitation!.id}` } })).toBe(1);
    expect(await db.notification.count({ where: { userId: owner, eventKey: { contains: `FOLLOWUP:${v.invitation!.id}` } } })).toBe(1);
    expect((await view(f)).case?.invitation?.userId).toBe(candidate);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(0);
  });
  it("freezes project assignment and followup policy into new round snapshots", async () => {
    const f = await fixture({ preferred: owner, coordinators: [candidate] });
    const r = await service.detail(f.id, a, f.roundId);
    expect(r.settings).toMatchObject({ workflowVersion: 9, preferredAdjudicatorId: owner, adjudicationCoordinatorIds: [candidate], statementWindowHours: 48, adjudicationReminderHours: 72, adjudicationReassignHours: 168 });
    const conf = await service.config(f.id, owner);
    const { version, workflowVersion: _workflow, questionOptions: _questions, ...policy } = conf.settings;
    await service.configure(f.id, owner, { ...policy, expectedVersion: version, preferredAdjudicatorId: candidate, adjudicationCoordinatorIds: [], statementWindowHours: 72, clientKey: randomUUID() });
    expect((await service.detail(f.id, a, f.roundId)).settings.preferredAdjudicatorId).toBe(owner);
  });

  it("preserves an old invitation as history and promotes it only after both statements seal", async () => {
    const f = await fixture(); await open(f);
    const v = (await view(f)).case!;
    const invitation = await db.screeningAdjudicationInvitation.create({ data: { projectId: f.id, caseId: v.id, userId: candidate, role: "MEMBER", status: "SENT" } });
    await db.screeningAdjudicationCase.update({ where: { id: v.id }, data: { status: "INVITED" } });
    const collecting = await view(f);
    expect(collecting.case).toMatchObject({ status: "COLLECTING", lockedAt: null, invitation: null });
    expect(collecting.case?.invitations[0]).toMatchObject({ id: invitation.id, status: "SENT" });
    await expect(view(f, candidate)).rejects.toMatchObject({ statusCode: 404 });
    await statement(f, a); await statement(f, b);
    expect((await view(f, candidate)).case?.invitation).toMatchObject({ id: invitation.id, status: "ASSIGNED", respondedAt: null });
    expect(await db.screeningAdjudicationInvitation.count({ where: { caseId: v.id } })).toBe(1);
    expect(JSON.stringify(await service.history(f.id, owner, f.roundId))).toContain("ADJUDICATION_DIRECT_ASSIGNED");
  });

});
