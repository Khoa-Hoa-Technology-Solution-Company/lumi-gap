import { projectEvidenceService as evidence } from "../project-evidence.service.js";
import { projectSourcesService as sources } from "../project-sources.service.js";
import { gapsService } from "../../gaps/gaps.service.js";
import { AnalyzeGapSchema } from "../../gaps/dto/gaps.schema.js";
import { libraryAssessmentService as library } from "../library-assessment.service.js";
import { projectAnalysisSetService as sets, validateAnalysisSet } from "../project-analysis-set.service.js";
import { discoverySources } from "../../gaps/project-gap-discovery.js";
import { withWorkspace } from "../workspace-access.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { screeningService as service } from "../screening.service.js";
import { screeningAiService as ai, validateScreeningAi } from "../screening-ai.service.js";
import { projectScreeningService as legacy } from "../project-screening.service.js";
import { projectService } from "../project.service.js";
import { projectMentorshipService as consent } from "../project-mentorship.service.js";
import { mentorPresets } from "@trend/shared-types";
import { screeningRouter } from "../screening.routes.js";
import { requireAuth } from "../../../common/middleware/auth.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import type { ScreeningChoice } from "@trend/shared-types";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), queue: { getJob: vi.fn().mockResolvedValue(null), add: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: mocks.queue, notificationQueue: mocks.queue, gapsQueue: mocks.queue }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: mocks.generate }));
vi.mock("../../user-ai/user-ai.runtime.js", () => ({ withUserAi: (_id: string, run: () => unknown) => run(), withProjectAi: (_project: string, _id: string, run: () => unknown) => run() }));
const enabled = process.env.SCREENING_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Screening tests require an isolated _test database");
describe.skipIf(!enabled).sequential("collaborative screening on isolated PostgreSQL", () => {
  const db = getPrisma(), page = { page: 1, pageSize: 20, q: "", filter: "ALL" as const };
  let owner: string, member: string, peer: string, outsider: string;
  beforeAll(async () => {
    const users: string[] = [];
    for (const name of ["Owner", "Member", "Peer", "Outsider"]) {
      const u = await db.user.create({ data: { email: `screening-${randomUUID()}@example.org`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } }); users.push(u.id);
      await db.academicProfile.create({ data: { userId: u.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } });
    }
    [owner, member, peer, outsider] = users as [string, string, string, string];
  });
  afterAll(disconnectPostgres);
  async function historicRound(roundId: string) {
    const row = await db.screeningRound.findUniqueOrThrow({ where: { id: roundId } });
    const { workflowVersion: _, ...settings } = row.settings as Record<string, unknown>;
    await db.screeningRound.update({ where: { id: roundId }, data: { settings: JSON.parse(JSON.stringify(settings)) } });
  }
  async function fixture(options: { v3?: boolean; v4?: boolean; legacy?: boolean; assisted?: boolean; count?: number; reviewers?: string[]; simple?: boolean; consensus?: boolean; unblinded?: boolean } = {}) {
    const p = await createProjectFixture({ data: { title: "Screening fixture", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: (options.simple ? [member] : [member, peer]).map(userId => ({ projectId: p.id, userId })) });
    const paper = await db.paper.create({ data: { title: "Machine learning in universities", abstractText: "A study of university students using machine learning.", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: p.id, paperId: paper.id, addedById: owner, screeningStatus: options.legacy ? "INCLUDED" : "UNDECIDED", inclusionReason: options.legacy ? "Historical decision" : null } });
    await service.configure(p.id, owner, { reviewMode: options.simple ? "SIMPLE" : "INDEPENDENT", blindReview: !options.unblinded && !options.simple, resolutionPolicy: options.consensus ? "CONSENSUS" : "ADJUDICATION", expectedVersion: 0, requiredReviewers: options.simple ? 1 : options.count ?? 2, consensusPolicy: "UNANIMOUS", aiAssisted: options.assisted ?? false, inclusionCriteria: options.assisted ? ["University students"] : [], exclusionCriteria: options.assisted ? ["Non-human studies"] : [], researchQuestions: options.assisted ? ["How is machine learning used?"] : [], clientKey: randomUUID() });
    const started = await service.start(p.id, owner, { paperIds: [paper.id], phase: "TITLE_ABSTRACT", confirmRescreen: Boolean(options.legacy), clientKey: randomUUID() }); const roundId = started.roundIds![0]!;
    // Exercise actual pre-V3 immutable snapshots in the existing compatibility suite.
    if (!options.v3 && !options.v4) {
      await historicRound(roundId);
      if (options.unblinded) {
        const snapshot = await db.screeningRound.findUniqueOrThrow({ where: { id: roundId } });
        await db.screeningRound.update({ where: { id: roundId }, data: { settings: { ...(snapshot.settings as Record<string, unknown>), blindReview: false } as never } });
      }
    }
    else {
      const snapshot = await db.screeningRound.findUniqueOrThrow({ where: { id: roundId } });
      await db.screeningRound.update({ where: { id: roundId }, data: { settings: { ...(snapshot.settings as Record<string, unknown>), workflowVersion: options.v4 ? 4 : 3 } as never } });
    }
    await service.assign(p.id, owner, { roundIds: [roundId], mode: "MANUAL", reviewerIds: options.reviewers ?? (options.simple ? [member] : [owner, member]), dueAt: null, clientKey: randomUUID() });
    return { id: p.id, paperId: paper.id, roundId };
  }
  async function submit(f: Awaited<ReturnType<typeof fixture>>, actor: string, decision: ScreeningChoice, extra = {}) {
    const round = await service.detail(f.id, actor, f.roundId), a = round.assignments.find(a => a.id === round.myAssignmentId)!;
    return service.submit(f.id, actor, f.roundId, { assignmentId: a.id, expectedRevision: a.revision, decision, exclusionReason: decision === "EXCLUDE" ? "Population outside criteria" : "", comment: `private-${actor}`, confirmed: true, clientKey: randomUUID(), ...extra });
  }
  async function finalize(f: Awaited<ReturnType<typeof fixture>>, decision: "INCLUDED" | "EXCLUDED" = "INCLUDED", actor = owner) {
    const view = await service.detail(f.id, actor, f.roundId);
    return service.resolve(f.id, actor, f.roundId, { decision, expectedVersion: view.version, reason: "Verified against the registered eligibility criteria", confirmed: true, clientKey: randomUUID() });
  }
  async function collaborative() {
    const p = await createProjectFixture({ data: { title: "Shared research library", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.create({ data: { projectId: p.id, userId: member } });
    await db.screeningSettings.create({ data: { projectId: p.id, reviewMode: "COLLABORATIVE", requiredReviewers: 1, blindReview: false } });
    const papers = await Promise.all(["First paper", "Second paper"].map(title => db.paper.create({ data: { title, abstractText: "Actual stored abstract for source verification", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } })));
    await db.projectPaper.createMany({ data: papers.map(paper => ({ projectId: p.id, paperId: paper.id, addedById: owner })) });
    return { id: p.id, paperIds: papers.map(p => p.id), paperId: papers[0]!.id };
  }
  async function assess(f: { id: string; paperId: string }, actor: string, decision: ScreeningChoice, override = {}) {
    const board = await service.board(f.id, actor, page), row = board.items.find(p => p.paperId === f.paperId)!;
    return library.assess(f.id, actor, f.paperId, { roundId: row.round?.id ?? null, expectedRevision: row.round?.myReview?.revision ?? 0, settingsVersion: board.settings.version, decision, exclusionReason: decision === "EXCLUDE" ? "Outside our research question" : "", comment: `opinion-${actor}`, clientKey: randomUUID(), ...override });
  }
  async function conflict() {
    const f = await fixture({ v3: true, reviewers: [member, peer] });
    await submit(f, member, "INCLUDE"); await submit(f, peer, "EXCLUDE");
    return f;
  }
  async function discuss(f: Awaited<ReturnType<typeof fixture>>) {
    for (const actor of [member, peer]) await service.comment(f.id, actor, f.roundId, { comment: "We discussed the population against the eligibility criteria", clientKey: randomUUID() });
  }
  async function appoint(f: Awaited<ReturnType<typeof fixture>>, finalizerId: string, extra = {}) {
    return service.finalizer(f.id, owner, f.roundId, { expectedVersion: (await service.detail(f.id, owner, f.roundId)).version, finalizerId, reason: "Independent methodological expertise is required for this dispute", confirmed: true, clientKey: randomUUID(), ...extra });
  }
  async function lecturer(f: Awaited<ReturnType<typeof fixture>>) {
    const user = await db.user.create({ data: { email: `adjudicator-${randomUUID()}@example.org`, fullName: "Lecturer", emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: user.id, academicRole: "LECTURER", primaryPosition: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED", supportAvailability: { enabled: true } } });
    await db.project.update({ where: { id: f.id }, data: { mentorshipSummary: "Public research abstract", mentorshipNeeds: "Methodological adjudication", mentorshipDiscovery: "SEEKING_MENTOR" } });
    const request = await consent.request(f.id, owner, { mentorUserId: user.id, message: "Please advise our review methodology", idempotencyKey: randomUUID(), access: { preset: "ADVISOR", permissions: [...mentorPresets.ADVISOR], expiresAt: null } });
    await consent.accept(f.id, request.id, user.id, "Accepted", request.accessPolicy?.version);
    return { id: user.id, access: await db.mentorAccess.findUniqueOrThrow({ where: { requestId: request.id } }) };
  }
  async function propose(f: Awaited<ReturnType<typeof fixture>>, actor = member, decision: "INCLUDED" | "EXCLUDED" = "INCLUDED") {
    return service.proposeAgreement(f.id, actor, f.roundId, { expectedVersion: (await service.detail(f.id, actor, f.roundId)).version, decision, reason: "Keep for full text to verify the disputed population", confirmed: true, clientKey: randomUUID() });
  }
  async function confirmAgreement(f: Awaited<ReturnType<typeof fixture>>, actor: string, proposalId: string, extra = {}) {
    return service.confirmAgreement(f.id, actor, f.roundId, { expectedVersion: (await service.detail(f.id, actor, f.roundId)).version, proposalId, confirmed: true, clientKey: randomUUID(), ...extra });
  }

  async function automatic(teamSize = 3, proposer = owner) {
    const p = await createProjectFixture({ data: { title: "V5 automatic workflow", ownerId: owner, status: "ACTIVE" } });
    if (teamSize > 1) await db.projectMember.createMany({ data: [member, peer, outsider].slice(0, teamSize - 1).map(userId => ({ projectId: p.id, userId })) });
    const input = { title: "V5 automatically assigned source", authors: [], reference: "", clientKey: randomUUID() };
    const imported = await sources.import(p.id, proposer, input);
    const round = (await service.board(p.id, owner, page)).items[0]!.round!;
    return { id: p.id, paperId: imported.paperId, roundId: round.id, input };
  }
  it("V5 adds a paper and assigns two non-proposers without Owner setup, with idempotent import", async () => {
    const f = await automatic();
    const row = await service.detail(f.id, owner, f.roundId);
    expect(row.settings).toMatchObject({ workflowVersion: 5, reviewMode: "INDEPENDENT", blindReview: true, requiredReviewers: 2, stages: ["TITLE_ABSTRACT", "FULL_TEXT"] });
    expect(row.assignments.map(a => a.reviewerId).sort()).toEqual([member, peer].sort());
    await sources.import(f.id, owner, f.input);
    expect(await db.screeningRound.count({ where: { projectId: f.id } })).toBe(1);
    await submit(f, member, "INCLUDE");
    const blinded = await service.detail(f.id, peer, f.roundId);
    expect(blinded.hiddenReviews).toBe(true); expect(blinded.reviews).toHaveLength(0);
    expect(JSON.stringify(await service.analytics(f.id, peer))).not.toContain("private-");
    await submit(f, peer, "INCLUDE");
    expect((await service.detail(f.id, owner, f.roundId))).toMatchObject({ active: false, status: "INCLUDED", extractionReady: false });
    const full = (await service.board(f.id, owner, page)).items[0]!.round!;
    expect(full).toMatchObject({ active: true, phase: "FULL_TEXT", completed: 0, assigned: 2 });
    expect(await db.projectPaper.findFirst({ where: { projectId: f.id } })).toMatchObject({ screeningStatus: "UNDECIDED" });
    await expect(submit({ ...f, roundId: full.id }, member, "INCLUDE")).rejects.toMatchObject({ statusCode: 400 });
    for (const actor of [member, peer]) await submit({ ...f, roundId: full.id }, actor, "INCLUDE", { scope: "FULL_TEXT", fullTextReference: "Read the institutional full text, methods and results" });
    expect((await service.detail(f.id, member, full.id))).toMatchObject({ status: "INCLUDED", extractionReady: true });
  });
  it("V5 four-person teams still require exactly two assigned reviewers and no Owner or third deciding vote", async () => {
    const f = await automatic(4);
    const view = await service.detail(f.id, owner, f.roundId);
    const reviewers = view.assignments.map(a => a.reviewerId);
    expect((await service.config(f.id, owner)).people).toHaveLength(4);
    expect(reviewers).toHaveLength(2);
    expect(reviewers).not.toContain(owner);
    expect(view).toMatchObject({ assigned: 2, completed: 0, canReview: false, myAssignmentId: null, finalizerAssigned: false });
    for (const actor of [owner, member, peer, outsider]) {
      const personal = await service.detail(f.id, actor, f.roundId);
      expect(personal.canReview).toBe(reviewers.includes(actor));
      if (!reviewers.includes(actor)) await expect(service.submit(f.id, actor, f.roundId, { assignmentId: view.assignments[0]!.id, expectedRevision: 1, decision: "INCLUDE", exclusionReason: "", comment: "Unauthorized extra ballot", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
    }
    for (const actor of reviewers) await submit(f, actor, "EXCLUDE");
    expect(await service.detail(f.id, owner, f.roundId)).toMatchObject({ assigned: 2, completed: 2, status: "EXCLUDED", finalDecision: { source: "CONSENSUS", resolverId: null } });
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });
  it("V5 two-person and one-person defaults finish without an Owner deciding vote", async () => {
    const pair = await automatic(2, member);
    expect((await service.detail(pair.id, member, pair.roundId)).assignments.map(a => a.reviewerId).sort()).toEqual([owner, member].sort());
    await submit(pair, member, "EXCLUDE"); await submit(pair, owner, "EXCLUDE");
    expect((await service.detail(pair.id, owner, pair.roundId))).toMatchObject({ status: "EXCLUDED", finalDecision: { source: "CONSENSUS", resolverId: null } });
    const solo = await automatic(1);
    await db.projectMember.create({ data: { projectId: solo.id, userId: member } });
    expect((await service.config(solo.id, owner)).settings).toMatchObject({ requiredReviewers: 1, version: 1 });
    expect((await service.detail(solo.id, owner, solo.roundId)).settings).toMatchObject({ reviewMode: "SIMPLE", requiredReviewers: 1 });
    await submit(solo, owner, "EXCLUDE");
    expect((await service.detail(solo.id, owner, solo.roundId))).toMatchObject({ status: "EXCLUDED", canReopenOwn: true });
    const old = await service.detail(solo.id, owner, solo.roundId);
    await service.reopen(solo.id, owner, solo.roundId, { assignmentId: old.myAssignmentId!, expectedVersion: old.version, reason: "Reconsider the source after reading additional material", confirmed: true, clientKey: randomUUID() });
    await submit(solo, owner, "EXCLUDE");
    expect(await db.screeningReview.count({ where: { projectId: solo.id } })).toBe(2);
  });
  it("V5 proposer consent plus the other reviewer's acceptance records a separate versioned resolution", async () => {
    const f = await automatic(); await submit(f, member, "INCLUDE"); await submit(f, peer, "EXCLUDE");
    await expect(propose(f)).rejects.toMatchObject({ statusCode: 409 });
    await discuss(f);
    const proposal = await propose(f);
    const agreement = (await service.detail(f.id, member, f.roundId)).agreement!;
    expect(agreement.confirmedByIds).toEqual([member]); expect(agreement.confirmations?.[0]?.confirmedAt).toBeTruthy();
    await expect(confirmAgreement(f, member, proposal.id!)).rejects.toMatchObject({ statusCode: 409 });
    await expect(confirmAgreement(f, owner, proposal.id!)).rejects.toMatchObject({ statusCode: 409 });
    const version = (await service.detail(f.id, peer, f.roundId)).version;
    const outcomes = await Promise.allSettled([peer, peer].map(actor => service.confirmAgreement(f.id, actor, f.roundId, { expectedVersion: version, proposalId: proposal.id!, confirmed: true, clientKey: randomUUID() })));
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    const final = await service.detail(f.id, owner, f.roundId);
    expect(final.finalDecision).toMatchObject({ source: "CONSENSUS", decision: "INCLUDED" });
    expect(final.agreement?.confirmedByIds.sort()).toEqual([member, peer].sort());
    expect(final.reviews.map(r => r.decision).sort()).toEqual(["EXCLUDE", "INCLUDE"]);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
    const events = await db.projectActivity.findMany({ where: { projectId: f.id, type: "SCREENING_PARTICIPATION" } });
    expect(events.some(e => e.actorId === member)).toBe(true); expect(events.some(e => e.actorId === peer)).toBe(true);
    expect(JSON.stringify(events.map(e => e.metadata))).not.toMatch(/private-|decision|exclusionReason/);
  });
  it("V5 declining a proposal leaves the conflict open and invalidates its confirmations", async () => {
    const f = await automatic(); await submit(f, member, "INCLUDE"); await submit(f, peer, "EXCLUDE"); await discuss(f);
    const proposal = await propose(f), row = await service.detail(f.id, peer, f.roundId);
    await expect(service.declineAgreement(f.id, owner, f.roundId, { proposalId: proposal.id!, expectedVersion: row.version, reason: "I was not assigned as a reviewer", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await service.declineAgreement(f.id, peer, f.roundId, { proposalId: proposal.id!, expectedVersion: row.version, reason: "The full text is needed before we can agree", confirmed: true, clientKey: randomUUID() });
    expect((await service.detail(f.id, member, f.roundId))).toMatchObject({ status: "NEEDS_RESOLUTION", agreement: null, finalDecision: null });
    await expect(confirmAgreement(f, peer, proposal.id!)).rejects.toMatchObject({ statusCode: 409 });
    expect(JSON.stringify(await service.history(f.id, owner, f.roundId))).toContain("The full text is needed");
  });
  it("V5 uncertainty can end in a shared request for further information without a binary conclusion", async () => {
    const f = await automatic(); await submit(f, member, "UNSURE"); await submit(f, peer, "INCLUDE");
    expect((await service.detail(f.id, owner, f.roundId)).status).toBe("NEEDS_MORE_INFO"); await discuss(f);
    const proposal = await service.proposeAgreement(f.id, member, f.roundId, { expectedVersion: (await service.detail(f.id, member, f.roundId)).version, decision: "NEEDS_MORE_INFO", reason: "Request full text and clarify the study population", confirmed: true, clientKey: randomUUID() });
    await confirmAgreement(f, peer, proposal.id!);
    const row = await service.detail(f.id, owner, f.roundId);
    expect(row).toMatchObject({ status: "NEEDS_MORE_INFO", finalDecision: null, resolution: { decision: "NEEDS_MORE_INFO" } });
    expect(await db.screeningRound.count({ where: { projectId: f.id } })).toBe(1);
  });
  it("V5 reviewers request an independent adjudicator after discussion; the adjudicator can request more information", async () => {
    const f = await automatic(); await submit(f, member, "INCLUDE"); await submit(f, peer, "EXCLUDE");
    let row = await service.detail(f.id, member, f.roundId);
    await expect(service.requestAdjudication(f.id, member, f.roundId, { expectedVersion: row.version, reason: "An independent methodological assessment is needed", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
    await discuss(f); row = await service.detail(f.id, member, f.roundId);
    const payload = { expectedVersion: row.version, reason: "An independent methodological assessment is needed", confirmed: true as const, clientKey: randomUUID() };
    const requested = await service.requestAdjudication(f.id, member, f.roundId, payload);
    expect(await service.requestAdjudication(f.id, member, f.roundId, payload)).toEqual(requested);
    await appoint(f, owner, { acknowledgeProposer: true });
    row = await service.detail(f.id, owner, f.roundId);
    await service.resolve(f.id, owner, f.roundId, { expectedVersion: row.version, decision: "NEEDS_MORE_INFO", reason: "Obtain the full text before the population can be determined", confirmed: true, clientKey: randomUUID() });
    expect((await service.detail(f.id, member, f.roundId))).toMatchObject({ status: "NEEDS_MORE_INFO", finalDecision: null });
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });
  it("V5 begin is a write action, preserves legacy data and never self-claims a third review", async () => {
    const p = await createProjectFixture({ data: { title: "Existing library", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [member, peer].map(userId => ({ projectId: p.id, userId })) });
    const paper = await db.paper.create({ data: { title: "Historically included", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: p.id, paperId: paper.id, addedById: owner, screeningStatus: "INCLUDED", inclusionReason: "Earlier assessment" } });
    expect((await service.board(p.id, member, page)).items[0]?.round).toBeNull();
    await expect(service.begin(p.id, member, paper.id, { confirmRescreen: false, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await service.begin(p.id, member, paper.id, { confirmRescreen: true, clientKey: randomUUID() });
    expect((await service.rounds(p.id, owner, paper.id)).legacy).toBeTruthy();
    expect(await db.screeningRound.count({ where: { projectId: p.id } })).toBe(1);
    await service.begin(p.id, peer, paper.id, { confirmRescreen: true, clientKey: randomUUID() });
    expect(await db.screeningAssignment.count({ where: { projectId: p.id } })).toBe(2);
  });
  it("V5 both catalog add and manual import initialize the same workflow", async () => {
    const p = await createProjectFixture({ data: { title: "Catalog workflow", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.create({ data: { projectId: p.id, userId: member } });
    const paper = await db.paper.create({ data: { title: "Catalog source", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await projectService.addPaperToProject(p.id, paper.id, owner, "Source matches our question");
    expect((await service.board(p.id, member, page)).items[0]!.round).toMatchObject({ assigned: 2, status: "NOT_REVIEWED" });
  });


  it("V5 conservative full-text advancement is explicitly permitted, versioned, and does not resolve the abstract conflict", async () => {
    const f = await automatic(2); await submit(f, owner, "INCLUDE"); await submit(f, member, "EXCLUDE");
    for (const actor of [owner, member]) await service.comment(f.id, actor, f.roundId, { comment: "We need the full text to determine the eligible population", clientKey: randomUUID() });
    let row = await service.detail(f.id, owner, f.roundId);
    expect(row.canAdvanceConservatively).toBe(true);
    const payload = { expectedVersion: row.version, reason: "No independent third person is available; inspect the full text", confirmed: true as const, clientKey: randomUUID() };
    const result = await service.advanceConservatively(f.id, owner, f.roundId, payload);
    expect(await service.advanceConservatively(f.id, owner, f.roundId, payload)).toEqual(result);
    row = await service.detail(f.id, owner, f.roundId);
    expect(row).toMatchObject({ active: false, status: "NEEDS_MORE_INFO", finalDecision: null });
    expect(row.reviews.map(r => r.decision).sort()).toEqual(["EXCLUDE", "INCLUDE"]);
    const next = (await service.board(f.id, member, page)).items[0]!.round!;
    expect(next).toMatchObject({ phase: "FULL_TEXT", assigned: 2, completed: 0, provisionalAdvance: true });
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(0);
    const other = await automatic(2); await submit(other, owner, "INCLUDE"); await submit(other, member, "EXCLUDE");
    for (const actor of [owner, member]) await service.comment(other.id, actor, other.roundId, { comment: "We discussed full text and the protocol restrictions", clientKey: randomUUID() });
    const old = await db.screeningRound.findUniqueOrThrow({ where: { id: other.roundId } });
    await db.screeningRound.update({ where: { id: other.roundId }, data: { settings: { ...(old.settings as object), allowConservativeFullText: false } } });
    await expect(service.advanceConservatively(other.id, owner, other.roundId, { ...payload, clientKey: randomUUID(), expectedVersion: old.version })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("V5 freezes authorized adjudicators in the round and rechecks that list at decision time", async () => {
    const f = await automatic(); await submit(f, member, "INCLUDE"); await submit(f, peer, "EXCLUDE"); await discuss(f);
    const row = await db.screeningRound.findUniqueOrThrow({ where: { id: f.roundId } });
    await db.screeningRound.update({ where: { id: row.id }, data: { settings: { ...(row.settings as object), authorizedAdjudicatorIds: [member] } } });
    await expect(appoint(f, owner, { acknowledgeProposer: true })).rejects.toMatchObject({ statusCode: 400 });
    await db.screeningRound.update({ where: { id: row.id }, data: { settings: { ...(row.settings as object), authorizedAdjudicatorIds: [owner] } } });
    await appoint(f, owner, { acknowledgeProposer: true });
    const current = await service.detail(f.id, owner, row.id);
    await db.screeningRound.update({ where: { id: row.id }, data: { settings: { ...(row.settings as object), authorizedAdjudicatorIds: [member] } } });
    await expect(service.resolve(f.id, owner, row.id, { decision: "INCLUDED", expectedVersion: current.version, reason: "The old UI tab still thinks this person can decide", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("V5 preserves Evidence Matrix entries and reopens accepted evidence when the screened source changes", async () => {
    const f = await automatic(); await submit(f, member, "INCLUDE"); await submit(f, peer, "INCLUDE");
    const full = (await service.board(f.id, member, page)).items[0]!.round!;
    for (const actor of [member, peer]) await submit({ ...f, roundId: full.id }, actor, "INCLUDE", { scope: "FULL_TEXT", fullTextReference: "Institutional PDF, methods and findings inspected" });
    const content = { claim: "A human-recorded finding", quotation: "", locator: "Results section", context: "University students", methodology: "Qualitative", population: "Students", results: "Observed outcome", limitations: "Small sample", themes: [] };
    const item = await evidence.create(f.id, member, { ...content, paperId: f.paperId, origin: "HUMAN", clientKey: randomUUID() });
    const accepted = await evidence.review(f.id, member, item.id, { expectedVersion: item.version, state: "ACCEPTED", rationale: "Verified against the actual full text" });
    const round = await service.detail(f.id, member, full.id);
    await service.reopen(f.id, member, full.id, { assignmentId: round.myAssignmentId!, expectedVersion: round.version, reason: "Newly identified population limitations require another review", confirmed: true, clientKey: randomUUID() });
    const kept = await db.projectEvidenceItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(kept).toMatchObject({ claim: content.claim, reviewState: "PENDING", version: accepted.version + 1 });
    const listed = await evidence.list(f.id, member, { page: 1, pageSize: 20, q: "" });
    expect(listed.items[0]?.sourceNeedsReview).toBe(true);
    expect((await evidence.history(f.id, member, item.id)).some(r => (r.snapshot as { reviewState?: string }).reviewState === "ACCEPTED")).toBe(true);
  });

  it("V4 enforces the exact reviewer cohort and keeps independent choices hidden until completion", async () => {
    const f = await fixture({ v4: true, unblinded: true, reviewers: [member, peer] });
    await expect(service.assign(f.id, owner, { roundIds: [f.roundId], mode: "MANUAL", reviewerIds: [owner, member, peer], dueAt: null, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    await submit(f, peer, "EXCLUDE");
    for (const actor of [owner, member]) {
      const view = await service.detail(f.id, actor, f.roundId);
      expect(view.hiddenReviews).toBe(true); expect(view.reviews).toHaveLength(0);
      expect(JSON.stringify(await service.history(f.id, actor, f.roundId))).not.toContain(`private-${peer}`);
    }
    const row = await service.detail(f.id, owner, f.roundId);
    await expect(service.unblind(f.id, owner, f.roundId, { expectedVersion: row.version, reason: "Owner attempts early exposure of the other vote", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.comment(f.id, member, f.roundId, { comment: "Cannot discuss unseen choices", clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await submit(f, member, "INCLUDE");
    expect((await service.detail(f.id, member, f.roundId)).reviews).toHaveLength(2);
  });
  it("lets a reviewer revise only their own unpublished vote without compromising independence", async () => {
    const f = await fixture({ v4: true, reviewers: [member, peer] });
    await submit(f, member, "INCLUDE");
    const view = await service.detail(f.id, member, f.roundId);
    expect(view.canReopenOwn).toBe(true);
    const input = { assignmentId: view.myAssignmentId!, expectedVersion: view.version, reason: "Correct my population assessment before publication", confirmed: true as const, clientKey: randomUUID() };
    await expect(service.reopen(f.id, peer, f.roundId, input)).rejects.toMatchObject({ statusCode: 403 });
    await service.reopen(f.id, member, f.roundId, input);
    await submit(f, member, "EXCLUDE");
    expect((await service.detail(f.id, peer, f.roundId)).reviews).toHaveLength(0);
    await submit(f, peer, "EXCLUDE");
    expect((await service.detail(f.id, owner, f.roundId))).toMatchObject({ independenceCompromised: false, status: "EXCLUDED" });
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
  });
  it("closes ordinary reviewer intake after completion and after reopening", async () => {
    const f = await conflict();
    const assign = () => service.assign(f.id, owner, { roundIds: [f.roundId], mode: "MANUAL" as const, reviewerIds: [owner, member, peer], dueAt: null, clientKey: randomUUID() });
    await expect(assign()).rejects.toMatchObject({ statusCode: 409 });
    const row = await service.detail(f.id, member, f.roundId);
    await service.reopen(f.id, member, f.roundId, { assignmentId: row.myAssignmentId!, expectedVersion: row.version, reason: "Recheck my opinion with more evidence", confirmed: true, clientKey: randomUUID() });
    await expect(assign()).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.detail(f.id, member, f.roundId)).hiddenReviews).toBe(true);
    await expect(service.comment(f.id, member, f.roundId, { comment: "Still waiting for revised independent opinion", clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await submit(f, member, "INCLUDE");
    expect((await service.detail(f.id, member, f.roundId)).hiddenReviews).toBe(false);
    expect(await db.screeningAssignment.count({ where: { roundId: f.roundId } })).toBe(2);
  });
  it("records a separate group agreement only after each reviewer confirms, without rewriting dissent", async () => {
    const f = await conflict(); const before = await db.screeningReview.findMany({ where: { projectId: f.id }, orderBy: { id: "asc" } });
    await expect(propose(f, owner)).rejects.toMatchObject({ statusCode: 403 });
    const proposal = await propose(f); expect(proposal.id).toBeDefined();
    expect((await service.detail(f.id, member, f.roundId)).agreement?.confirmedByIds).toEqual([]);
    await expect(confirmAgreement(f, owner, proposal.id!)).rejects.toMatchObject({ statusCode: 409 });
    const first = { expectedVersion: proposal.version!, proposalId: proposal.id!, confirmed: true as const, clientKey: randomUUID() };
    const result = await service.confirmAgreement(f.id, member, f.roundId, first);
    expect(await service.confirmAgreement(f.id, member, f.roundId, first)).toEqual(result);
    expect((await service.detail(f.id, peer, f.roundId)).finalDecision).toBeNull();
    await expect(confirmAgreement(f, member, proposal.id!)).rejects.toMatchObject({ statusCode: 409 });
    await confirmAgreement(f, peer, proposal.id!);
    const final = await service.detail(f.id, owner, f.roundId);
    expect(final.finalDecision).toMatchObject({ source: "CONSENSUS", decision: "INCLUDED", resolverId: null });
    expect(final.agreement?.confirmedByIds.sort()).toEqual([member, peer].sort());
    expect(await db.screeningReview.findMany({ where: { projectId: f.id }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
    expect((await service.analytics(f.id, owner)).agreements).toBe(0);
    const audit = await db.screeningAudit.findFirstOrThrow({ where: { roundId: f.roundId, type: "AGREEMENT_CONFIRMED" } });
    await expect(db.screeningAudit.update({ where: { id: audit.id }, data: { details: {} } })).rejects.toThrow();
  });
  it("supersedes proposals and invalidates confirmations when a review is revised", async () => {
    const f = await conflict(), first = await propose(f); await confirmAgreement(f, member, first.id!);
    const second = await propose(f, peer, "EXCLUDED");
    await expect(confirmAgreement(f, peer, first.id!)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.detail(f.id, member, f.roundId)).agreement?.confirmedByIds).toEqual([]);
    await confirmAgreement(f, member, second.id!);
    const row = await service.detail(f.id, member, f.roundId);
    await service.reopen(f.id, member, f.roundId, { assignmentId: row.myAssignmentId!, expectedVersion: row.version, reason: "Review revision invalidates the old shared agreement", confirmed: true, clientKey: randomUUID() });
    await expect(confirmAgreement(f, peer, second.id!)).rejects.toMatchObject({ statusCode: 409 });
    await submit(f, member, "INCLUDE");
    expect((await service.detail(f.id, peer, f.roundId)).agreement).toBeNull();
    await expect(confirmAgreement(f, peer, second.id!)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("serializes competing proposals and stale confirmations", async () => {
    const f = await conflict(); const version = (await service.detail(f.id, member, f.roundId)).version;
    const outcomes = await Promise.allSettled([member, peer].map(actor => service.proposeAgreement(f.id, actor, f.roundId, { expectedVersion: version, decision: "INCLUDED", reason: "Keep the study for full text eligibility verification", confirmed: true, clientKey: randomUUID() })));
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const view = await service.detail(f.id, member, f.roundId);
    await confirmAgreement(f, member, view.agreement!.id);
    await expect(confirmAgreement(f, peer, view.agreement!.id, { expectedVersion: view.version })).rejects.toMatchObject({ statusCode: 409 });
    await confirmAgreement(f, peer, view.agreement!.id);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
  });
  it("supports separate group agreement under CONSENSUS protocol and waits for every configured reviewer", async () => {
    const f = await fixture({ v4: true, consensus: true, count: 3, reviewers: [owner, member, peer] });
    await submit(f, owner, "INCLUDE"); await submit(f, member, "INCLUDE"); await submit(f, peer, "EXCLUDE");
    const p = await propose(f, member, "EXCLUDED"); await confirmAgreement(f, owner, p.id!); await confirmAgreement(f, member, p.id!);
    expect((await service.detail(f.id, owner, f.roundId)).finalDecision).toBeNull();
    await confirmAgreement(f, peer, p.id!);
    expect((await service.detail(f.id, owner, f.roundId)).finalDecision?.decision).toBe("EXCLUDED");
  });
  it("does not bypass uncertainty or allow new agreement writes after project completion", async () => {
    const f = await fixture({ v4: true, reviewers: [member, peer] });
    await submit(f, member, "UNSURE"); await submit(f, peer, "INCLUDE");
    await expect(propose(f)).rejects.toMatchObject({ statusCode: 403 });
    const other = await conflict(), p = await propose(other);
    await db.project.update({ where: { id: other.id }, data: { status: "COMPLETED" } });
    await expect(confirmAgreement(other, member, p.id!)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("advances an agreed title decision to full text without treating it as final extraction approval", async () => {
    const f = await fixture({ v4: true, reviewers: [member, peer] });
    const snapshot = await db.screeningRound.findUniqueOrThrow({ where: { id: f.roundId } });
    await db.screeningRound.update({ where: { id: f.roundId }, data: { settings: { ...(snapshot.settings as Record<string, unknown>), stages: ["TITLE_ABSTRACT", "FULL_TEXT"] } as never } });
    await submit(f, member, "INCLUDE"); await submit(f, peer, "EXCLUDE");
    const p = await propose(f); await confirmAgreement(f, member, p.id!); await confirmAgreement(f, peer, p.id!);
    const title = await service.detail(f.id, owner, f.roundId);
    expect(title).toMatchObject({ active: false, extractionReady: false, status: "INCLUDED" });
    const fullText = await db.screeningRound.findFirstOrThrow({ where: { projectId: f.id, paperId: f.paperId, active: true } });
    expect(fullText.phase).toBe("FULL_TEXT");
    expect((await service.detail(f.id, owner, fullText.id))).toMatchObject({ assigned: 2, completed: 0, extractionReady: false });
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });
  it("shares only owner-selected discussion from the same round with a scoped lecturer", async () => {
    const f = await conflict(), other = await conflict(), mentor = await lecturer(f); await discuss(f); await discuss(other);
    const proposal = await propose(f); await confirmAgreement(f, member, proposal.id!);
    const comments = await db.screeningAudit.findMany({ where: { roundId: f.roundId, type: "DISCUSSION" } });
    const foreign = await db.screeningAudit.findFirstOrThrow({ where: { roundId: other.roundId, type: "DISCUSSION" } });
    await expect(appoint(f, mentor.id, { shareWithMentor: true, discussionIds: [foreign.id] })).rejects.toMatchObject({ statusCode: 400 });
    await appoint(f, mentor.id, { shareWithMentor: true, discussionIds: [comments[0]!.id] });
    expect((await service.detail(f.id, member, f.roundId)).agreement).toBeNull();
    await expect(confirmAgreement(f, peer, proposal.id!)).rejects.toMatchObject({ statusCode: 409 });
    const packet = (await service.adjudication(f.id, mentor.id, f.roundId)).packet;
    expect(packet.discussion?.map(d => d.id)).toEqual([comments[0]!.id]);
    expect(packet.discussion?.[0]?.comment).toBe((comments[0]!.details as { comment: string }).comment);
    expect((await service.adjudication(f.id, mentor.id, f.roundId)).availableDiscussion).toBeUndefined();
    expect(JSON.stringify(packet)).not.toContain(comments[1]!.id);
    await expect(service.history(f.id, mentor.id, f.roundId)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("V3 prioritizes non-proposers on automatic assignment and falls back for two-person teams", async () => {
    const f = await fixture({ v3: true });
    const imported = await sources.import(f.id, owner, { title: "Unassigned source", authors: [], reference: "", clientKey: randomUUID() });
    const id = (await service.board(f.id, owner, page)).items.find(p => p.paperId === imported.paperId)!.round!.id;
    await service.assign(f.id, owner, { roundIds: [id], mode: "AUTO", reviewerIds: [], dueAt: null, clientKey: randomUUID() });
    expect((await service.detail(f.id, owner, id)).assignments.map(a => a.reviewerId).sort()).toEqual([member, peer].sort());
    await projectService.leaveProject(f.id, peer);
    await service.assign(f.id, owner, { roundIds: [id], mode: "AUTO", reviewerIds: [], dueAt: null, clientKey: randomUUID() });
    expect((await service.detail(f.id, owner, id)).assignments.map(a => a.reviewerId).sort()).toEqual([member, owner].sort());
  });
  it.each(["INCLUDE", "EXCLUDE"] as const)("V3 waits for every assigned reviewer then automatically records unanimous %s once", async decision => {
    const f = await fixture({ v3: true, reviewers: [owner, member, peer] });
    expect((await service.detail(f.id, owner, f.roundId)).status).toBe("NOT_REVIEWED");
    await submit(f, owner, decision); await submit(f, member, decision);
    const partial = await service.detail(f.id, owner, f.roundId);
    expect(partial.status).toBe("IN_REVIEW"); expect(partial.hiddenReviews).toBe(true); expect(partial.reviews).toHaveLength(1);
    const r = await service.detail(f.id, peer, f.roundId);
    const input = { assignmentId: r.myAssignmentId!, expectedRevision: 1, decision, exclusionReason: "Outside population", comment: "Checked protocol", confirmed: true as const, clientKey: randomUUID() };
    await Promise.all([service.submit(f.id, peer, f.roundId, input), service.submit(f.id, peer, f.roundId, input)]);
    const final = await service.detail(f.id, owner, f.roundId);
    expect(final.status).toBe(decision === "INCLUDE" ? "INCLUDED" : "EXCLUDED");
    expect(final.finalDecision).toMatchObject({ source: "CONSENSUS", resolverId: null });
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
  });
  it("V3 advances unanimous title screening to assigned full-text review without granting extraction", async () => {
    const f = await fixture({ v3: true });
    const row = await db.screeningRound.findUniqueOrThrow({ where: { id: f.roundId } });
    await db.screeningRound.update({ where: { id: row.id }, data: { settings: { ...(row.settings as object), stages: ["TITLE_ABSTRACT", "FULL_TEXT"] } } });
    await submit(f, owner, "INCLUDE"); await submit(f, member, "INCLUDE");
    const old = await service.detail(f.id, owner, f.roundId);
    expect(old).toMatchObject({ active: false, status: "INCLUDED", extractionReady: false });
    const next = await db.screeningRound.findFirstOrThrow({ where: { projectId: f.id, paperId: f.paperId, active: true } });
    expect(next.phase).toBe("FULL_TEXT");
    expect((await service.detail(f.id, owner, next.id)).assignments).toHaveLength(2);
    expect((await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: f.id, paperId: f.paperId } } })).screeningStatus).not.toBe("INCLUDED");
    await expect(submit({ ...f, roundId: next.id }, owner, "INCLUDE")).rejects.toMatchObject({ statusCode: 400 });
  });
  it("V3 treats unsure as missing information and blocks adjudication", async () => {
    const f = await fixture({ v3: true }); await submit(f, owner, "INCLUDE"); await submit(f, member, "UNSURE");
    expect((await service.detail(f.id, owner, f.roundId)).status).toBe("NEEDS_MORE_INFO");
    await expect(appoint(f, peer)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(0);
  });
  it("V3 requires discussion and explicit independent adjudicator; proposer needs acknowledgement", async () => {
    const f = await conflict();
    expect((await service.detail(f.id, owner, f.roundId)).finalizer.id).toBe("");
    await expect(finalize(f)).rejects.toMatchObject({ statusCode: 403 });
    await expect(appoint(f, owner, { acknowledgeProposer: true })).rejects.toMatchObject({ statusCode: 409 });
    await service.comment(f.id, member, f.roundId, { comment: "First reviewer asks about population", clientKey: randomUUID() });
    await expect(appoint(f, owner, { acknowledgeProposer: true })).rejects.toMatchObject({ statusCode: 409 });
    await discuss(f);
    await expect(appoint(f, member)).rejects.toMatchObject({ statusCode: 400 });
    await expect(appoint(f, owner)).rejects.toMatchObject({ statusCode: 400 });
    await appoint(f, owner, { acknowledgeProposer: true });
    expect((await service.detail(f.id, owner, f.roundId)).status).toBe("ADJUDICATING");
    await finalize(f);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
  });
  it("V3 lets reviewers reopen their own published vote and preserves revisions and previous finals", async () => {
    const f = await conflict(); await discuss(f); await appoint(f, owner, { acknowledgeProposer: true }); await finalize(f);
    const row = await service.detail(f.id, member, f.roundId);
    const input = { expectedVersion: row.version, assignmentId: row.myAssignmentId!, reason: "Recheck the population after new methodological evidence", confirmed: true as const, clientKey: randomUUID() };
    await expect(service.reopen(f.id, peer, f.roundId, input)).rejects.toMatchObject({ statusCode: 403 });
    await service.reopen(f.id, member, f.roundId, input);
    expect((await service.detail(f.id, member, f.roundId))).toMatchObject({ finalDecision: null, independenceCompromised: true, finalizerAssigned: false });
    await submit(f, member, "EXCLUDE");
    expect((await service.detail(f.id, owner, f.roundId)).finalDecision?.source).toBe("CONSENSUS");
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(2);
  });
  it("V3 requires discussion from both sides of a disagreement with more than two reviewers", async () => {
    const f = await fixture({ v3: true, reviewers: [owner, member, peer] });
    await submit(f, owner, "INCLUDE"); await submit(f, member, "INCLUDE"); await submit(f, peer, "EXCLUDE");
    for (const actor of [owner, member]) await service.comment(f.id, actor, f.roundId, { comment: "We believe it satisfies the eligibility criteria", clientKey: randomUUID() });
    expect((await service.detail(f.id, owner, f.roundId)).discussionReady).toBe(false);
    await service.comment(f.id, peer, f.roundId, { comment: "Our disagreement concerns the selected population", clientKey: randomUUID() });
    expect((await service.detail(f.id, owner, f.roundId)).discussionReady).toBe(true);
  });
  it("V3 shares only approved packet with accepted lecturer, grants no team access, and serializes resolution", async () => {
    const f = await conflict(), mentor = await lecturer(f); await discuss(f);
    await expect(appoint(f, mentor.id)).rejects.toMatchObject({ statusCode: 400 });
    await appoint(f, mentor.id, { shareWithMentor: true });
    const view = await service.adjudication(f.id, mentor.id, f.roundId);
    expect(view.canResolve).toBe(true); expect(view.packet.reviews).toHaveLength(2);
    expect(JSON.stringify(view.packet)).not.toContain('"reviewerId"');
    expect(Object.keys(view.packet).sort()).toEqual(["roundId", "paperId", "phase", "roundVersion", "paper", "inclusionCriteria", "exclusionCriteria", "researchQuestions", "reviews"].sort());
    expect(await db.projectMember.count({ where: { projectId: f.id, userId: mentor.id } })).toBe(0);
    await expect(service.detail(f.id, mentor.id, f.roundId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.board(f.id, mentor.id, page)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.adjudication(f.id, outsider, f.roundId)).rejects.toMatchObject({ statusCode: 404 });
    const app = express(); app.use(express.json()); app.use("/projects/:id/research/screening-v2", requireAuth, screeningRouter); app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const sessionId = randomUUID(); await db.refreshToken.create({ data: { userId: mentor.id, familyId: sessionId, tokenHash: hashOpaqueToken(randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    const token = tokenService.signAccessToken({ sub: mentor.id, systemRole: "USER", sessionId }).token;
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/projects/${f.id}/research/screening-v2/rounds/${f.roundId}`;
    try {
      expect((await fetch(`${endpoint}/adjudication`)).status).toBe(401);
      const headers = { authorization: `Bearer ${token}` };
      const response = await fetch(`${endpoint}/adjudication`, { headers });
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
      expect((await response.json()).data.packet).toEqual(view.packet);
      expect((await fetch(endpoint, { headers })).status).toBe(404);
    } finally { server.close(); server.closeAllConnections(); }
    const notification = await db.notification.findFirstOrThrow({ where: { userId: mentor.id, type: "SCREENING_ADJUDICATION_ASSIGNED" } });
    expect(notification.emailPayload).toMatchObject({ screeningRoundId: f.roundId });
    const input = { decision: "INCLUDED" as const, expectedVersion: view.version, reason: "Eligibility is supported by the population and methodology", confirmed: true as const, clientKey: randomUUID() };
    await expect(service.resolve(f.id, mentor.id, f.roundId, { ...input, expectedVersion: view.version - 1 })).rejects.toMatchObject({ statusCode: 409 });
    const outcomes = await Promise.allSettled([service.resolve(f.id, mentor.id, f.roundId, input), service.resolve(f.id, mentor.id, f.roundId, { ...input, decision: "EXCLUDED", clientKey: randomUUID() })]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    expect((await service.adjudication(f.id, mentor.id, f.roundId)).canResolve).toBe(false);
    const review = await service.detail(f.id, member, f.roundId);
    await service.reopen(f.id, member, f.roundId, { assignmentId: review.myAssignmentId!, expectedVersion: review.version, reason: "New evidence requires reviewer reconsideration", confirmed: true, clientKey: randomUUID() });
    await expect(service.adjudication(f.id, mentor.id, f.roundId)).rejects.toMatchObject({ statusCode: 404 });
    await submit(f, member, "INCLUDE"); await discuss(f); await appoint(f, mentor.id, { shareWithMentor: true });
    expect((await service.adjudication(f.id, mentor.id, f.roundId)).finalDecision).toBeNull();
  });
  it.each(["share", "policy", "completed", "forged"])("V3 blocks lecturer writes after %s changes", async change => {
    const f = await conflict(), mentor = await lecturer(f); await discuss(f); await appoint(f, mentor.id, { shareWithMentor: true });
    const view = await service.adjudication(f.id, mentor.id, f.roundId);
    if (change === "policy") await db.mentorAccess.update({ where: { id: mentor.access.id }, data: { revokedAt: new Date() } });
    if (change === "share" || change === "forged") {
      await db.mentorResourceShare.updateMany({ where: { accessId: mentor.access.id }, data: { revokedAt: new Date() } });
      if (change === "forged") await db.mentorResourceShare.create({ data: { projectId: f.id, accessId: mentor.access.id, sharedById: owner, kind: "PAPER", resourceId: f.paperId, sectionKey: `screening:${f.roundId}`, title: "Forged packet", content: JSON.stringify(view.packet) } });
    }
    if (change === "completed") await db.project.update({ where: { id: f.id }, data: { status: "COMPLETED" } });
    await expect(service.resolve(f.id, mentor.id, f.roundId, { decision: "INCLUDED", expectedVersion: view.version, reason: "Attempt after access or project status changed", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: change === "completed" ? 409 : 404 });
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(0);
  });
  it("seals actual research question text and reading scope in immutable review versions", async () => {
    const f = await collaborative(), questionId = randomUUID();
    await db.researchPlan.upsert({ where: { projectId: f.id }, create: { projectId: f.id, questions: [{ id: questionId, text: "How does the intervention support learning?" }] }, update: { questions: [{ id: questionId, text: "How does the intervention support learning?" }] } });
    const first = await assess(f, owner, "INCLUDE", { researchQuestionIds: [questionId], scope: "TITLE_ABSTRACT" });
    const v1 = await service.detail(f.id, owner, first.roundId!);
    expect(v1.myReview).toMatchObject({ scope: "TITLE_ABSTRACT", fullTextReference: null, researchQuestions: [{ id: questionId, text: "How does the intervention support learning?" }] });
    await expect(assess(f, owner, "INCLUDE", { scope: "FULL_TEXT" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(assess(f, owner, "INCLUDE", { researchQuestionIds: [randomUUID()] })).rejects.toMatchObject({ statusCode: 409 });
    await assess(f, owner, "INCLUDE", { scope: "FULL_TEXT", fullTextReference: "Team read the licensed institutional PDF, pages 1–12", researchQuestionIds: [questionId] });
    await db.researchPlan.update({ where: { projectId: f.id }, data: { questions: [] } });
    const history = await service.history(f.id, owner, first.roundId!, 1, "HISTORY");
    expect(JSON.stringify(history)).toContain("How does the intervention support learning?");
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    await expect(db.screeningReview.update({ where: { id: v1.myReview!.id }, data: { scope: "FULL_TEXT", fullTextReference: "Overwrite historic reading claim" } })).rejects.toThrow();
  });
  it("allows a sole researcher to select background, reopen it and preserve extracted evidence", async () => {
    const p = await createProjectFixture({ data: { title: "Sole researcher", ownerId: owner, status: "ACTIVE" } });
    await db.screeningSettings.create({ data: { projectId: p.id, reviewMode: "COLLABORATIVE", requiredReviewers: 1, blindReview: false } });
    const imported = await sources.import(p.id, owner, { title: "A useful background method", publicationYear: 2025, authors: ["A Researcher"], reference: "", clientKey: randomUUID() });
    const f = { id: p.id, paperId: imported.paperId };
    const a = await assess(f, owner, "INCLUDE");
    let view = await service.detail(f.id, owner, a.roundId!);
    expect(view.finalDecision).toBeNull(); expect(view.completed).toBe(1);
    await service.resolve(f.id, owner, view.id, { decision: "BACKGROUND", expectedVersion: view.version, reason: "Useful context but not an eligible primary study", confirmed: true, clientKey: randomUUID() });
    view = await service.detail(f.id, owner, view.id);
    expect(view.finalDecision?.decision).toBe("BACKGROUND"); expect(view.canReview).toBe(false);
    expect((await service.board(f.id, owner, { ...page, status: "BACKGROUND" })).total).toBe(1);
    expect((await service.analytics(f.id, owner)).distribution.BACKGROUND).toBe(1);
    await expect(assess(f, owner, "INCLUDE")).rejects.toMatchObject({ statusCode: 409 });
    await library.defer(f.id, owner, view.id, { expectedVersion: view.version, reason: "Reconsider for detailed evidence extraction", confirmed: true, clientKey: randomUUID() });
    view = await service.detail(f.id, owner, view.id);
    await service.resolve(f.id, owner, view.id, { decision: "INCLUDED", expectedVersion: view.version, reason: "The method meets our updated eligibility criteria", confirmed: true, clientKey: randomUUID() });
    const content = { claim: "Reported observation", quotation: "", locator: "Methods section", context: "Study context", methodology: "Qualitative", population: "University students", results: "Reported finding", limitations: "Small sample", themes: ["Learning"] };
    const item = await evidence.create(f.id, owner, { ...content, paperId: f.paperId, origin: "HUMAN", clientKey: randomUUID() });
    view = await service.detail(f.id, owner, view.id);
    await library.defer(f.id, owner, view.id, { expectedVersion: view.version, reason: "Review newly identified limitations in the evidence", confirmed: true, clientKey: randomUUID() });
    expect(await db.projectEvidenceItem.findUnique({ where: { id: item.id } })).toMatchObject({ claim: content.claim });
    expect(await db.screeningFinalDecision.count({ where: { roundId: view.id } })).toBe(2);
    expect((await service.rounds(f.id, owner, f.paperId)).legacy).toBeNull();
  });
  it("enforces configured title/full-text stages before official analysis and verifies full-text review context", async () => {
    const f = await fixture();
    // Use an explicit DTO: API-only read metadata is never submitted as configuration.
    const config = await service.config(f.id, owner);
    await service.configure(f.id, owner, { reviewMode: "INDEPENDENT", blindReview: true, resolutionPolicy: "ADJUDICATION", expectedVersion: config.settings.version, requiredReviewers: 2, consensusPolicy: "UNANIMOUS", aiAssisted: false, inclusionCriteria: [], exclusionCriteria: [], researchQuestions: [], stages: ["TITLE_ABSTRACT", "FULL_TEXT"], clientKey: randomUUID() });
    const second = await sources.import(f.id, member, { title: "Protocol source", authors: [], reference: "", clientKey: randomUUID() });
    await expect(service.start(f.id, owner, { paperIds: [second.paperId], phase: "FULL_TEXT", confirmRescreen: false, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    const next = { id: f.id, paperId: second.paperId, roundId: (await service.board(f.id, owner, page)).items.find(p => p.paperId === second.paperId)!.round!.id };
    await historicRound(next.roundId);
    await service.assign(f.id, owner, { roundIds: [next.roundId], mode: "MANUAL", reviewerIds: [owner, member], dueAt: null, clientKey: randomUUID() });
    await submit(next, owner, "INCLUDE");
    await expect(finalize(next)).rejects.toMatchObject({ statusCode: 409 });
    await submit(next, member, "INCLUDE"); await finalize(next);
    expect((await service.detail(next.id, owner, next.roundId)).extractionReady).toBe(false);
    expect((await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: f.id, paperId: next.paperId } } })).screeningStatus).toBe("MAYBE");
    await expect(sets.create(f.id, owner, { mode: "OFFICIAL", paperIds: [f.paperId, next.paperId], topic: "Review methods", clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    const full = await service.start(f.id, owner, { paperIds: [next.paperId], phase: "FULL_TEXT", confirmRescreen: true, clientKey: randomUUID() });
    next.roundId = full.roundIds![0]!;
    await historicRound(next.roundId);
    await service.assign(f.id, owner, { roundIds: [next.roundId], mode: "MANUAL", reviewerIds: [owner, member], dueAt: null, clientKey: randomUUID() });
    await expect(submit(next, owner, "INCLUDE", { scope: "TITLE_ABSTRACT" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(submit(next, owner, "INCLUDE")).rejects.toMatchObject({ statusCode: 400 });
    await submit(next, owner, "INCLUDE", { scope: "FULL_TEXT", fullTextReference: "Licensed PDF read through institutional access" });
    await submit(next, member, "INCLUDE", { scope: "FULL_TEXT", fullTextReference: "Institutional full text, methods and results sections" });
    await finalize(next);
    expect((await service.detail(next.id, owner, next.roundId)).extractionReady).toBe(true);
  });
  it("searches stored authors/keywords and pages discussion separately from assessment history", async () => {
    const f = await collaborative();
    await db.paperAuthor.create({ data: { paperId: f.paperId, displayName: "Unique Nguyen Author", position: 1 } });
    await db.paperKeyword.create({ data: { paperId: f.paperId, keywordName: "Rare-methodology-keyword", position: 1 } });
    expect((await service.board(f.id, member, { ...page, q: "Nguyen Author" })).items[0]?.authors).toEqual(["Unique Nguyen Author"]);
    expect((await service.board(f.id, member, { ...page, q: "Rare-methodology" })).total).toBe(1);
    const a = await assess(f, member, "UNSURE");
    await service.comment(f.id, owner, a.roundId!, { comment: "Can we obtain the full text before deciding?", clientKey: randomUUID() });
    const discussion = await service.history(f.id, owner, a.roundId!, 1, "DISCUSSION");
    expect(discussion.total).toBe(1); expect(discussion.items[0]?.actorName).toBe("Owner");
    const history = await service.history(f.id, owner, a.roundId!, 1, "HISTORY");
    expect(history.items.every(item => item.type !== "DISCUSSION")).toBe(true);
  });
  it("accepts the first opinion on a preassigned collaborative round and returns the actual revision", async () => {
    const f = await collaborative();
    const started = await service.start(f.id, owner, { paperIds: [f.paperId], phase: "TITLE_ABSTRACT", confirmRescreen: false, clientKey: randomUUID() });
    const roundId = started.roundIds![0]!;
    await service.assign(f.id, owner, { roundIds: [roundId], mode: "MANUAL", reviewerIds: [member], dueAt: null, clientKey: randomUUID() });
    const first = await assess(f, member, "INCLUDE", { expectedRevision: 1 });
    expect(first).toMatchObject({ roundId, revision: 1 });
    const second = await assess(f, member, "UNSURE");
    expect(second).toMatchObject({ roundId, revision: 2 });
    const assignment = await db.screeningAssignment.findUniqueOrThrow({ where: { roundId_reviewerId: { roundId, reviewerId: member } } });
    expect((await db.screeningReview.findMany({ where: { assignmentId: assignment.id }, orderBy: { revision: "asc" } })).map(r => r.revision)).toEqual([1, 2]);
  });
  it("preserves explicit collaborative rules and two conflicting opinions and all own revisions", async () => {
    const f = await collaborative();
    expect((await service.config(f.id, owner)).settings.reviewMode).toBe("COLLABORATIVE");
    await assess(f, owner, "INCLUDE"); const second = await assess(f, member, "EXCLUDE");
    const before = await service.detail(f.id, member, second.roundId!);
    expect(before.status).toBe("NEEDS_RESOLUTION"); expect(before.hiddenReviews).toBe(false); expect(before.reviews).toHaveLength(2); expect(before.finalDecision).toBeNull();
    await assess(f, member, "INCLUDE");
    const after = await service.detail(f.id, owner, second.roundId!);
    expect(after.status).toBe("AWAITING_FINALIZATION"); expect(after.myReview?.revision).toBe(1);
    expect(after.reviews.find(r => r.reviewerId === member)?.revision).toBe(2);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
    await expect(assess(f, member, "EXCLUDE", { expectedRevision: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(assess(f, outsider, "INCLUDE")).rejects.toMatchObject({ statusCode: 404 });
  });
  it("allows brief personal opinions, enforces finalizer rights and serializes conflicting decisions", async () => {
    const f = await collaborative(); const a = await assess(f, owner, "INCLUDE"); await assess(f, member, "EXCLUDE");
    await expect(assess(f, member, "EXCLUDE", { exclusionReason: "" })).resolves.toBeDefined();
    const row = await service.detail(f.id, owner, a.roundId!);
    const input = { expectedVersion: row.version, decision: "INCLUDED" as const, reason: "Selected based on the stated methodological relevance", confirmed: true as const, clientKey: randomUUID() };
    await expect(service.resolve(f.id, member, row.id, input)).rejects.toMatchObject({ statusCode: 403 });
    const results = await Promise.allSettled([service.resolve(f.id, owner, row.id, input), service.resolve(f.id, owner, row.id, { ...input, decision: "EXCLUDED", clientKey: randomUUID() })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.screeningFinalDecision.count({ where: { roundId: row.id } })).toBe(1);
    await expect(assess(f, member, "INCLUDE")).rejects.toMatchObject({ statusCode: 409 });
    const final = await service.detail(f.id, owner, row.id);
    await library.defer(f.id, owner, row.id, { expectedVersion: final.version, reason: "More evidence is required before selecting this source", confirmed: true, clientKey: randomUUID() });
    expect((await service.detail(f.id, owner, row.id)).finalDecision).toBeNull();
    expect(await db.screeningFinalDecision.count({ where: { roundId: row.id } })).toBe(1);
    await assess(f, member, "UNSURE");
  });
  it("does not bypass independent protocols or leak their reviews through draft snapshots", async () => {
    const f = await fixture(); await submit(f, owner, "INCLUDE");
    await expect(library.assess(f.id, member, f.paperId, { roundId: f.roundId, expectedRevision: 1, settingsVersion: 1, decision: "INCLUDE", exclusionReason: "", comment: "", clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    const second = await db.paper.create({ data: { title: "Another source", publicationYear: 2025, dataStatus: "active", primaryProvider: "user" } });
    await db.projectPaper.create({ data: { projectId: f.id, paperId: second.id, addedById: owner } });
    const result = await sets.create(f.id, member, { paperIds: [f.paperId, second.id], mode: "DRAFT", topic: "Research methods", clientKey: randomUUID() });
    expect(JSON.stringify(await sets.get(f.id, member, result.id!))).not.toContain(`private-${owner}`);
    await expect(library.defer(f.id, owner, f.roundId, { expectedVersion: (await service.detail(f.id, owner, f.roundId)).version, reason: "Attempt to bypass mandatory independent review", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("freezes draft snapshots without changing decisions and uses exact sources in discovery", async () => {
    const f = await collaborative(); const before = await db.projectPaper.findMany({ where: { projectId: f.id } });
    const input = { paperIds: f.paperIds, mode: "DRAFT" as const, topic: "Research methods", clientKey: randomUUID() };
    const created = await sets.create(f.id, member, input);
    expect((await sets.create(f.id, member, input)).id).toBe(created.id);
    const snapshot = await sets.get(f.id, owner, created.id!);
    expect(snapshot.mode).toBe("DRAFT"); expect(snapshot.sources).toHaveLength(2); expect(snapshot.hash).toHaveLength(64);
    expect(await db.projectPaper.findMany({ where: { projectId: f.id } })).toEqual(before);
    const sources = await withWorkspace(f.id, owner, {}, c => discoverySources(c, f.paperIds, snapshot.id));
    expect(sources.map(s => s.id).sort()).toEqual([...f.paperIds].sort());
    await expect(withWorkspace(f.id, owner, {}, c => discoverySources(c, f.paperIds))).rejects.toMatchObject({ statusCode: 409 });
    await expect(withWorkspace(f.id, owner, {}, c => validateAnalysisSet(c, snapshot.id, [f.paperId]))).rejects.toMatchObject({ statusCode: 409 });
    const revision = await db.projectWorkspaceRevision.findFirstOrThrow({ where: { entityId: snapshot.id, entityKind: "ANALYSIS_SET" } });
    await expect(db.projectWorkspaceRevision.update({ where: { id: revision.id }, data: { snapshot: {} } })).rejects.toThrow();
    await expect(db.projectWorkspaceRevision.delete({ where: { id: revision.id } })).rejects.toThrow();
    await db.paper.update({ where: { id: f.paperId }, data: { abstractText: "Changed source text" } });
    await expect(withWorkspace(f.id, owner, {}, c => validateAnalysisSet(c, snapshot.id, f.paperIds))).rejects.toMatchObject({ statusCode: 409 });
    expect(await sets.get(f.id, owner, snapshot.id)).toEqual(snapshot);
  });
  it("queues the exact draft set through the real gaps API and records mode, hash and credit charge", async () => {
    const f = await collaborative();
    await db.user.update({ where: { id: member }, data: { credits: 1000 } });
    const result = await sets.create(f.id, member, { paperIds: f.paperIds, mode: "DRAFT", topic: "Research methods", clientKey: randomUUID() });
    const dto = AnalyzeGapSchema.parse({ projectId: f.id, projectDiscovery: true, analysisSetId: result.id!, selectedPaperIds: f.paperIds, topic: "Research methods", evidenceMode: "selected" });
    await expect(gapsService.enqueue(member, { ...dto, topic: "Different configuration" })).rejects.toMatchObject({ statusCode: 409 });
    const analysisId = await gapsService.enqueue(member, dto);
    const run = await gapsService.getAnalysis(member, analysisId);
    expect(run.analysisSetId).toBe(result.id); expect(run.analysisMode).toBe("DRAFT"); expect(run.selectedPaperIds.sort()).toEqual([...f.paperIds].sort());
    expect(mocks.queue.add).toHaveBeenCalledWith("gap-analysis", { analysisId }, { jobId: analysisId });
    const packet = await db.projectWorkspaceRevision.findFirstOrThrow({ where: { entityKind: "GAP_ANALYSIS_INPUT", entityId: analysisId, version: 1 } });
    expect(packet.snapshot).toMatchObject({ analysisSetId: result.id, analysisMode: "DRAFT", analysisSetHash: (await sets.get(f.id, owner, result.id!)).hash });
    expect((await db.user.findUniqueOrThrow({ where: { id: member } })).credits).toBeLessThan(1000);
    expect(await db.screeningFinalDecision.count({ where: { projectId: f.id } })).toBe(0);
  });
  it("requires actual explicit selected finals for official sets and isolates projects", async () => {
    const f = await collaborative(), other = await collaborative();
    const input = { paperIds: f.paperIds, mode: "OFFICIAL" as const, topic: "Research methods", clientKey: randomUUID() };
    await expect(sets.create(f.id, member, input)).rejects.toMatchObject({ statusCode: 403 });
    await db.projectPaper.updateMany({ where: { projectId: f.id }, data: { screeningStatus: "INCLUDED" } });
    await expect(sets.create(f.id, owner, input)).rejects.toMatchObject({ statusCode: 409 });
    for (const paperId of f.paperIds) { const a = await assess({ ...f, paperId }, owner, "INCLUDE"); await finalize({ id: f.id, paperId, roundId: a.roundId! }); }
    const created = await sets.create(f.id, owner, input), snapshot = await sets.get(f.id, member, created.id!);
    expect(snapshot.confirmedById).toBe(owner); expect(snapshot.sources.every(s => s.finalDecisionId)).toBe(true);
    await expect(sets.get(other.id, owner, snapshot.id)).rejects.toMatchObject({ statusCode: 404 });
    await db.projectPaper.create({ data: { projectId: other.id, paperId: f.paperId, addedById: owner } });
    await assess({ id: other.id, paperId: f.paperId }, member, "EXCLUDE");
    expect((await service.board(f.id, owner, page)).items.find(p => p.paperId === f.paperId)?.round?.status).toBe("INCLUDED");
    const selected = (await service.board(f.id, owner, page)).items.find(p => p.paperId === f.paperId)!.round!;
    await library.defer(f.id, owner, selected.id, { expectedVersion: selected.version, reason: "Reconsider current selection with new evidence", confirmed: true, clientKey: randomUUID() });
    await expect(withWorkspace(f.id, owner, {}, c => validateAnalysisSet(c, snapshot.id, f.paperIds))).rejects.toMatchObject({ statusCode: 409 });
    expect((await sets.get(f.id, owner, snapshot.id)).sources[0]?.finalDecisionId).toBe(snapshot.sources[0]?.finalDecisionId);
  });
  it("supports a two-person Simple Review with a delegated finalizer and separate progress", async () => {
    const f = await fixture({ simple: true });
    expect(await db.projectMember.count({ where: { projectId: f.id } })).toBe(2);
    expect((await service.board(f.id, owner, page)).progress).toEqual({ total: 1, reviewed: 0, finalized: 0, legacy: 0 });
    await expect(finalize(f)).rejects.toMatchObject({ statusCode: 409 });
    await submit(f, member, "INCLUDE");
    expect((await service.board(f.id, owner, page)).progress).toEqual({ total: 1, reviewed: 1, finalized: 0, legacy: 0 });
    const ready = await service.detail(f.id, owner, f.roundId);
    await service.finalizer(f.id, owner, f.roundId, { expectedVersion: ready.version, finalizerId: member, reason: "Delegate to the domain specialist on our team", confirmed: true, clientKey: randomUUID() });
    await expect(finalize(f)).rejects.toMatchObject({ statusCode: 403 });
    await finalize(f, "INCLUDED", member);
    expect((await service.detail(f.id, member, f.roundId)).finalDecision?.resolverId).toBe(member);
    expect((await service.board(f.id, owner, page)).progress).toEqual({ total: 1, reviewed: 1, finalized: 1, legacy: 0 });
    const metrics = await service.analytics(f.id, owner);
    expect(metrics.resolved).toBe(0); expect(metrics.reviewedPapers).toBe(1); expect(metrics.finalizedPapers).toBe(1); expect(metrics.kappa.value).toBeNull();
  });
  it("requires real reviewer agreement under consensus policy and rejects uncertain finalization", async () => {
    const f = await fixture({ consensus: true }); await submit(f, owner, "INCLUDE"); await submit(f, member, "EXCLUDE");
    await expect(finalize(f)).rejects.toMatchObject({ statusCode: 409 });
    const conflict = await service.detail(f.id, owner, f.roundId);
    await service.comment(f.id, member, f.roundId, { comment: "Discuss the eligibility evidence together", clientKey: randomUUID() });
    await service.reopen(f.id, owner, f.roundId, { assignmentId: conflict.assignments.find(a => a.reviewerId === member)!.id, expectedVersion: conflict.version, reason: "Reviewer agreed to reassess after discussing evidence", confirmed: true, clientKey: randomUUID() });
    await submit(f, member, "INCLUDE"); await finalize(f);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
    const unsure = await fixture({ simple: true }); await submit(unsure, member, "UNSURE");
    await expect(finalize(unsure)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("serializes concurrent explicit finalizations after unanimous reviews", async () => {
    const f = await fixture(); await submit(f, owner, "INCLUDE"); await submit(f, member, "INCLUDE");
    const view = await service.detail(f.id, owner, f.roundId);
    expect(view.finalDecision).toBeNull();
    const input = { expectedVersion: view.version, decision: "INCLUDED" as const, reason: "Both reviewers satisfy the registered criteria", confirmed: true as const, clientKey: randomUUID() };
    const secondInput = { ...input, clientKey: randomUUID() };
    const results = await Promise.allSettled([service.resolve(f.id, owner, f.roundId, input), service.resolve(f.id, owner, f.roundId, secondInput)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await service.resolve(f.id, owner, f.roundId, results[0]!.status === "fulfilled" ? input : secondInput);
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
    const final = await service.detail(f.id, owner, f.roundId);
    await service.reopen(f.id, owner, f.roundId, { expectedVersion: final.version, assignmentId: final.assignments.find(a => a.reviewerId === member)!.id, reason: "New full text evidence requires reassessment", confirmed: true, clientKey: randomUUID() });
    await submit(f, member, "EXCLUDE"); await finalize(f, "EXCLUDED");
    const decisions = await db.screeningFinalDecision.findMany({ where: { roundId: f.roundId }, orderBy: { roundVersion: "asc" } });
    expect(decisions.map(d => d.decision)).toEqual(["INCLUDED", "EXCLUDED"]);
    expect(decisions[1]!.roundVersion).toBeGreaterThan(decisions[0]!.roundVersion);
  });
  it("keeps the same paper isolated across projects and prevents DOI duplicates", async () => {
    const f = await fixture({ simple: true }), other = await fixture({ simple: true });
    const paper = await db.paper.findUniqueOrThrow({ where: { id: f.paperId } });
    await projectService.addPaperToProject(other.id, f.paperId, member, "Addresses our first research question");
    await submit(f, member, "INCLUDE"); await finalize(f);
    expect((await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: other.id, paperId: f.paperId } } })).screeningStatus).toBe("UNDECIDED");
    expect((await db.paper.findUniqueOrThrow({ where: { id: f.paperId } })).title).toBe(paper.title);
    const view = await service.board(other.id, member, { ...page, proposerId: member, status: "NOT_REVIEWED" });
    const proposed = view.items.find(p => p.paperId === f.paperId)!; expect(proposed.proposalReason).toContain("research question"); expect(proposed.proposer?.id).toBe(member);
    await expect(service.proposal(other.id, owner, f.paperId, { reason: "Overwrite another proposal", expectedUpdatedAt: proposed.updatedAt, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
    const doi = `10.1234/${randomUUID()}`;
    await db.paper.update({ where: { id: f.paperId }, data: { doi } });
    const duplicate = await db.paper.create({ data: { title: "Different provider copy", publicationYear: 2025, primaryProvider: "user", dataStatus: "active", doi: `https://doi.org/${doi.toUpperCase()}` } });
    await expect(projectService.addPaperToProject(f.id, duplicate.id, member)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("honors configured non-blind review without leaking blind rounds through filters", async () => {
    const open = await fixture({ unblinded: true }); await submit(open, member, "EXCLUDE");
    expect((await service.detail(open.id, owner, open.roundId)).reviews).toHaveLength(1);
    const blind = await fixture(); await submit(blind, member, "EXCLUDE");
    const board = await service.board(blind.id, owner, { ...page, reviewerId: member, status: "IN_REVIEW" });
    expect(board.items).toHaveLength(1); expect(board.items[0]!.round!.reviews).toEqual([]);
    expect(JSON.stringify(await service.rounds(blind.id, owner, blind.paperId))).not.toContain("Population outside criteria");
    const assigned = await service.detail(blind.id, owner, blind.roundId);
    await expect(service.submit(blind.id, peer, blind.roundId, { assignmentId: assigned.myAssignmentId!, expectedRevision: 1, decision: "INCLUDE", exclusionReason: "", comment: "Overwrite another reviewer", confirmed: true, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("returns the saved proposal timestamp, rejects stale edits, and replays retries exactly", async () => {
    const f = await fixture();
    const paper = (await service.board(f.id, owner, page)).items[0]!;
    const input = { expectedUpdatedAt: paper.updatedAt, reason: "Evidence for the first research question", clientKey: randomUUID() };
    const saved = await service.proposal(f.id, owner, f.paperId, input);
    expect(Date.parse(saved.updatedAt!)).toBeGreaterThan(Date.parse(paper.updatedAt));
    expect(await service.proposal(f.id, owner, f.paperId, input)).toEqual(saved);
    await expect(service.proposal(f.id, owner, f.paperId, { ...input, reason: "A conflicting stale edit", clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
    await service.proposal(f.id, owner, f.paperId, { reason: "Updated after reading the complete study", expectedUpdatedAt: saved.updatedAt!, clientKey: randomUUID() });
    expect(await db.screeningAudit.count({ where: { projectId: f.id, type: "PROPOSAL_REASON_UPDATED" } })).toBe(2);
  });
  it("serializes finalizer reassignment against an in-flight final decision", async () => {
    const f = await fixture({ simple: true }); await submit(f, member, "INCLUDE");
    const ready = await service.detail(f.id, owner, f.roundId);
    const results = await Promise.allSettled([
      service.resolve(f.id, owner, f.roundId, { expectedVersion: ready.version, decision: "INCLUDED", reason: "Confirming the registered eligibility criteria", confirmed: true, clientKey: randomUUID() }),
      service.finalizer(f.id, owner, f.roundId, { expectedVersion: ready.version, finalizerId: member, reason: "Assign responsibility to the specialist reviewer", confirmed: true, clientKey: randomUUID() }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const current = await service.detail(f.id, owner, f.roundId);
    if (current.finalizer.id === member) {
      await expect(finalize(f)).rejects.toMatchObject({ statusCode: 403 });
      await finalize(f, "INCLUDED", member);
    }
    expect(await db.screeningFinalDecision.count({ where: { roundId: f.roundId } })).toBe(1);
  });
  it("keeps choices, comments and derived metrics hidden even from the owner", async () => {
    const f = await fixture(); await submit(f, member, "EXCLUDE");
    const view = await service.detail(f.id, owner, f.roundId);
    expect(view.reviews).toEqual([]); expect(view.completed).toBe(1); expect(view.status).toBe("IN_REVIEW");
    expect(JSON.stringify(await service.board(f.id, owner, page))).not.toContain(`private-${member}`);
    expect(JSON.stringify(await service.history(f.id, owner, f.roundId))).not.toContain("Population outside criteria");
    const metrics = await service.analytics(f.id, owner); expect(metrics.fullyReviewed).toBe(0); expect(metrics.exclusionReasons).toEqual([]); expect(metrics.kappa.value).toBeNull();
    await expect(ai.get(f.id, owner, f.roundId)).rejects.toMatchObject({ statusCode: 403 });
    await submit(f, owner, "EXCLUDE");
    const complete = await service.detail(f.id, member, f.roundId); expect(complete.status).toBe("AWAITING_FINALIZATION"); expect(complete.reviews).toHaveLength(2); expect(complete.finalDecision).toBeNull();
    await finalize(f, "EXCLUDED");
    expect((await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: f.id, paperId: f.paperId } } })).screeningStatus).toBe("EXCLUDED");
  });
  it("serializes simultaneous submissions and retries without duplicate reviews/finals", async () => {
    const f = await fixture(), key = randomUUID();
    await Promise.all([submit(f, owner, "INCLUDE", { clientKey: key }), submit(f, member, "INCLUDE")]);
    await submit(f, owner, "INCLUDE", { clientKey: key });
    expect((await service.detail(f.id, owner, f.roundId)).status).toBe("AWAITING_FINALIZATION");
    await finalize(f);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2); expect(await db.screeningFinalDecision.count({ where: { projectId: f.id } })).toBe(1);
    await expect(submit(f, owner, "EXCLUDE", { clientKey: key })).rejects.toMatchObject({ statusCode: 409 });
    await expect(submit(f, owner, "INCLUDE")).rejects.toMatchObject({ statusCode: 409 });
  });
  it("authorizes a single concurrent resolution and preserves original reviews", async () => {
    const f = await fixture(); await submit(f, owner, "INCLUDE"); await submit(f, member, "EXCLUDE");
    const conflict = await service.detail(f.id, owner, f.roundId); expect(conflict.status).toBe("NEEDS_RESOLUTION");
    const input = { expectedVersion: conflict.version, decision: "EXCLUDED" as const, reason: "The population fails the registered inclusion criteria", confirmed: true as const, clientKey: randomUUID() };
    await expect(service.resolve(f.id, member, f.roundId, input)).rejects.toMatchObject({ statusCode: 403 });
    const results = await Promise.allSettled([service.resolve(f.id, owner, f.roundId, input), service.resolve(f.id, owner, f.roundId, { ...input, clientKey: randomUUID() })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    await expect(db.screeningReview.updateMany({ where: { projectId: f.id }, data: { comment: "Overwrite" } })).rejects.toThrow();
    expect((await service.detail(f.id, owner, f.roundId)).finalDecision?.reason).toBe(input.reason);
    expect((await service.analytics(f.id, owner)).resolved).toBe(1);
  });
  it("reopens by appending a new revision, never reblinds, and retains old revision content", async () => {
    const f = await fixture(); await submit(f, owner, "INCLUDE"); await submit(f, member, "INCLUDE");
    await finalize(f);
    const view = await service.detail(f.id, owner, f.roundId), assignment = view.assignments.find(a => a.reviewerId === member)!;
    await service.reopen(f.id, owner, f.roundId, { assignmentId: assignment.id, expectedVersion: view.version, reason: "Correct the population after reading full text", confirmed: true, clientKey: randomUUID() });
    const open = await service.detail(f.id, member, f.roundId); expect(open.hiddenReviews).toBe(false); expect(open.independenceCompromised).toBe(true); expect(open.finalDecision).toBeNull();
    await submit(f, member, "EXCLUDE");
    expect(await db.screeningReview.count({ where: { assignmentId: assignment.id } })).toBe(2);
    const history = await service.history(f.id, owner, f.roundId); expect(history.items.filter(i => i.type === "REVIEW_SUBMITTED" && i.details?.review)).toHaveLength(3);
    const metrics = await service.analytics(f.id, owner); expect(metrics.excludedFromAgreement).toBe(1); expect(metrics.fullyReviewed).toBe(0);
  });
  it("does not allow an owner to bypass an unfinished blind protocol", async () => {
    const f = await fixture(); await submit(f, member, "INCLUDE"); const view = await service.detail(f.id, owner, f.roundId);
    const input = { expectedVersion: view.version, reason: "Team requests an exceptional early discussion", confirmed: true as const, clientKey: randomUUID() };
    await expect(service.unblind(f.id, member, f.roundId, input)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.unblind(f.id, owner, f.roundId, input)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.detail(f.id, owner, f.roundId)).reviews).toEqual([]);
  });
  it("revokes unfinished work on leaving while keeping submitted work and official results", async () => {
    const f = await fixture({ reviewers: [member, peer] }); await submit(f, member, "INCLUDE");
    await projectService.leaveProject(f.id, peer); expect((await service.detail(f.id, owner, f.roundId)).assigned).toBe(1);
    await expect(submit(f, peer, "INCLUDE")).rejects.toMatchObject({ statusCode: 404 });
    await service.assign(f.id, owner, { roundIds: [f.roundId], mode: "AUTO", reviewerIds: [], dueAt: null, clientKey: randomUUID() });
    await submit(f, owner, "INCLUDE"); await finalize(f); await projectService.leaveProject(f.id, member);
    expect((await service.detail(f.id, owner, f.roundId)).status).toBe("INCLUDED"); expect((await service.detail(f.id, owner, f.roundId)).reviews).toHaveLength(2);
    expect((await service.board(f.id, owner, page)).filters.reviewers.some(p => p.id === member)).toBe(true);
  });
  it("snapshots rule changes and preserves historical decisions across rounds", async () => {
    const f = await fixture({ legacy: true });
    await service.configure(f.id, owner, { expectedVersion: 1, requiredReviewers: 3, consensusPolicy: "STRICT_MAJORITY", aiAssisted: false, inclusionCriteria: [], exclusionCriteria: [], researchQuestions: [], clientKey: randomUUID() });
    expect((await service.detail(f.id, owner, f.roundId)).settings.requiredReviewers).toBe(2);
    await submit(f, owner, "INCLUDE"); await submit(f, member, "INCLUDE");
    await finalize(f);
    await service.start(f.id, owner, { paperIds: [f.paperId], phase: "FULL_TEXT", confirmRescreen: true, clientKey: randomUUID() });
    const history = await service.rounds(f.id, owner, f.paperId); expect(history.items).toHaveLength(2); expect(history.items[0]!.settings.requiredReviewers).toBe(3); expect(history.items[1]!.finalDecision?.decision).toBe("INCLUDED");
    expect(history.legacy).toMatchObject({ status: "INCLUDED", inclusionReason: "Historical decision" });
    await expect(projectService.removePaperFromProject(f.id, f.paperId, owner)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("waits for extra reviewers and recalculates after unfinished assignment revocation", async () => {
    const f = await fixture({ reviewers: [owner, member, peer] });
    await submit(f, owner, "INCLUDE"); await submit(f, member, "INCLUDE");
    expect((await service.detail(f.id, owner, f.roundId)).hiddenReviews).toBe(true);
    await projectService.leaveProject(f.id, peer);
    const complete = await service.detail(f.id, owner, f.roundId); expect(complete.status).toBe("AWAITING_FINALIZATION"); expect(complete.reviews).toHaveLength(2);
  });
  it("rejects legacy bypasses, member shared edits, inactive assignees and cross-project access", async () => {
    const f = await fixture(), other = await fixture();
    await expect(service.detail(f.id, outsider, f.roundId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.detail(other.id, owner, f.roundId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.assign(f.id, owner, { roundIds: [f.roundId], mode: "MANUAL", reviewerIds: [owner, outsider], dueAt: null, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(projectService.updateProjectPaper(f.id, f.paperId, { screeningStatus: "INCLUDED" }, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(legacy.vote(f.id, member, f.paperId, { phase: "TITLE_ABSTRACT", expectedVersion: 1, decision: "INCLUDED", reason: "Bypass" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(legacy.policy(f.id, owner, { mode: "EXPLORATORY", blinded: false, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("filters, paginates and records assignment/start events in round history", async () => {
    const f = await fixture(); await submit(f, owner, "INCLUDE");
    expect((await service.board(f.id, owner, { ...page, filter: "COMPLETED" })).total).toBe(1);
    expect((await service.board(f.id, owner, { ...page, filter: "PENDING" })).total).toBe(0);
    expect((await service.board(f.id, member, { ...page, filter: "PENDING" })).total).toBe(1);
    expect((await service.board(f.id, owner, { ...page, page: 2 })).items).toHaveLength(0);
    const types = (await service.history(f.id, owner, f.roundId)).items.map(i => i.type); expect(types).toContain("ASSIGNED"); expect(types).toContain("ROUND_STARTED");
  });
  it("preserves legacy classifications without counting them as reviewed or finalized and blocks archived writes", async () => {
    const f = await fixture();
    const old = await db.paper.create({ data: { title: "Legacy only", publicationYear: 2020, primaryProvider: "user" } });
    await db.projectPaper.create({ data: { projectId: f.id, paperId: old.id, screeningStatus: "INCLUDED", addedById: owner } });
    const m = await service.analytics(f.id, owner);
    expect(m.distribution.INCLUDED).toBe(0); expect(m.distribution.NOT_REVIEWED).toBe(2); expect(m.fullyReviewed).toBe(0);
    expect(m.reviewedPapers).toBe(0); expect(m.finalizedPapers).toBe(0); expect(m.legacyPapers).toBe(1);
    const board = await service.board(f.id, owner, page);
    expect(board.progress).toEqual({ total: 2, reviewed: 0, finalized: 0, legacy: 1 });
    expect(board.items.find(p => p.paperId === old.id)).toMatchObject({ legacyStatus: "INCLUDED", legacyProvenance: true, round: null });
    expect((await service.board(f.id, owner, { ...page, status: "INCLUDED" })).items).toHaveLength(0);
    expect((await service.board(f.id, owner, { ...page, status: "NOT_REVIEWED" })).items.map(p => p.paperId).sort()).toEqual([old.id, f.paperId].sort());
    expect((await db.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: f.id, paperId: old.id } } })).screeningStatus).toBe("INCLUDED");
    await db.project.update({ where: { id: f.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await expect(submit(f, owner, "INCLUDE")).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.detail(f.id, member, f.roundId)).canReview).toBe(false);
  });
  it("rejects AI without criteria, malformed evidence, and queue failures without touching reviews", async () => {
    const f = await fixture(); await submit(f, owner, "UNSURE"); await submit(f, member, "UNSURE");
    await expect(ai.request(f.id, owner, f.roundId, randomUUID())).rejects.toMatchObject({ statusCode: 400 });
    const assisted = await fixture({ assisted: true });
    mocks.queue.add.mockRejectedValueOnce(new Error("Queue unavailable"));
    await expect(ai.request(assisted.id, owner, assisted.roundId, randomUUID())).rejects.toMatchObject({ statusCode: 503 });
    expect((await ai.get(assisted.id, owner, assisted.roundId))?.status).toBe("FAILED");
    const run = await ai.request(assisted.id, owner, assisted.roundId, randomUUID());
    mocks.generate.mockImplementationOnce(async options => options.validate({ decision: "INCLUDE", explanation: "Invalid evidence", inclusionCriteria: ["Invented criterion"], exclusionCriteria: [], evidence: [], missingInformation: [] }));
    await expect(ai.process(run.id)).rejects.toThrow();
    expect(await db.screeningReview.count({ where: { projectId: assisted.id } })).toBe(0);
    expect(await db.screeningFinalDecision.count({ where: { projectId: assisted.id } })).toBe(0);
  });
  it("applies the exact additive migration to populated legacy tables without inventing reviews", async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA screening_migration_probe; SET LOCAL search_path TO screening_migration_probe; CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE projects(id uuid PRIMARY KEY); CREATE TABLE project_papers(project_id uuid, paper_id uuid, screening_status text, screened_by_id uuid, screened_at timestamptz, inclusion_reason text, exclusion_reason text, exclusion_note text, UNIQUE(project_id,paper_id))");
      const project = randomUUID(), paper = randomUUID(), reviewer = randomUUID();
      await client.query("INSERT INTO users VALUES($1);", [reviewer]); await client.query("INSERT INTO projects VALUES($1)", [project]);
      await client.query("INSERT INTO project_papers(project_id,paper_id,screening_status,screened_by_id,inclusion_reason) VALUES($1,$2,'INCLUDED',$3,'Historical reason')", [project, paper, reviewer]);
      const sql = readFileSync(new URL("../../../../prisma/migrations/20261028120000_collaborative_screening_v2/migration.sql", import.meta.url), "utf8");
      await client.query(sql);
      await client.query(readFileSync(new URL("../../../../prisma/migrations/20261029090000_screening_explicit_finalization/migration.sql", import.meta.url), "utf8"));
      expect((await client.query("SELECT screening_status FROM project_papers")).rows[0].screening_status).toBe("INCLUDED");
      expect((await client.query("SELECT snapshot FROM screening_legacy_records")).rows[0].snapshot).toMatchObject({ provenance: "LEGACY_SHARED_STATUS", status: "INCLUDED", screenedById: reviewer });
      expect((await client.query("SELECT count(*)::int AS n FROM screening_reviews")).rows[0].n).toBe(0);
      expect((await client.query("SELECT count(*)::int AS n FROM screening_assignments")).rows[0].n).toBe(0);
    } finally { await client.query("ROLLBACK"); await client.end(); }
  });
  it("stores AI advisory results separately and survives provider failure or malformed content", async () => {
    const f = await fixture({ assisted: true }), before = await service.detail(f.id, owner, f.roundId);
    const run = await ai.request(f.id, owner, f.roundId, randomUUID());
    const result = { decision: "INCLUDE", explanation: "Metadata matches university population", inclusionCriteria: ["University students"], exclusionCriteria: [], evidence: [{ field: "abstract", quote: "university students" }], missingInformation: ["No full text"] };
    mocks.generate.mockImplementation(async options => options.validate(result)); await ai.process(run.id);
    expect((await ai.get(f.id, member, f.roundId))?.result?.decision).toBe("INCLUDE");
    const after = await service.detail(f.id, owner, f.roundId); expect(after.status).toBe(before.status); expect(after.reviews).toEqual([]); expect(after.finalDecision).toBeNull();
    const next = await ai.request(f.id, owner, f.roundId, randomUUID()); mocks.generate.mockRejectedValueOnce(new Error("Provider timeout")); await expect(ai.process(next.id)).rejects.toThrow("Provider timeout");
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(0);
    const input = { title: "Study", abstract: "", settings: before.settings };
    expect(() => validateScreeningAi({ ...result, evidence: [{ field: "abstract", quote: "fabricated" }] }, input)).toThrow();
    expect(() => validateScreeningAi({ ...result, confidence: 0.99 }, input)).toThrow();
    const unsure = validateScreeningAi({ ...result, decision: "UNSURE", evidence: [] }, input); expect(unsure.missingInformation).toContain("Không có tóm tắt");
    await expect(db.screeningAiSuggestion.update({ where: { id: run.id }, data: { status: "FAILED" } })).rejects.toThrow();
  });
  it("enforces HTTP authentication, DTO validation, blind output and role checks", async () => {
    const f = await fixture(); await submit(f, owner, "INCLUDE");
    const app = express(); app.use(express.json()); app.use("/projects/:id/research/screening-v2", requireAuth, screeningRouter); app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address() as { port: number };
    const sessionId = randomUUID(); await db.refreshToken.create({ data: { userId: member, familyId: sessionId, tokenHash: hashOpaqueToken(randomUUID()), expiresAt: new Date(Date.now()+3600000) } });
    const token = tokenService.signAccessToken({ sub: member, systemRole: "USER", sessionId }).token;
    const base = `http://127.0.0.1:${address.port}/projects/${f.id}/research/screening-v2`;
    try {
      expect((await fetch(`${base}/papers`)).status).toBe(401);
      const response = await fetch(`${base}/rounds/${f.roundId}`, { headers: { authorization: `Bearer ${token}` } }); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(JSON.stringify(await response.json())).not.toContain(`private-${owner}`);
      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
      expect((await fetch(`${base}/rounds/${f.roundId}/reviews`, { method: "POST", headers, body: JSON.stringify({ decision: "EXCLUDE", confirmed: false }) })).status).toBe(400);
      expect((await fetch(`${base}/rounds/${f.roundId}/resolve`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1, reason: "Unauthorized member resolution", decision: "INCLUDED", confirmed: true, clientKey: randomUUID() }) })).status).toBe(403);
    } finally { server.close(); server.closeAllConnections(); }
  });
});
