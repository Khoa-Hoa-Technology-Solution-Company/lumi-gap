import { screeningCaseService as cases } from "../screening-case.service.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { screeningService as service } from "../screening.service.js";
import { projectService } from "../project.service.js";
import { projectEvidenceService as evidence } from "../project-evidence.service.js";
import { screeningConfigSchema } from "../dto/screening.schema.js";
import type { ScreeningChoice } from "@trend/shared-types";
vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.SCREENING_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");

describe.skipIf(!enabled).sequential("two-slot screening integrity on PostgreSQL", () => {
  const db = getPrisma(), key = () => ({ clientKey: randomUUID() }), page = { page: 1, pageSize: 12, q: "", filter: "QUEUE" as const };
  let owner: string, a: string, b: string, c: string;
  beforeAll(async () => {
    const users = await Promise.all(["Owner", "A", "B", "C"].map(fullName => db.user.create({ data: { fullName, email: `slots-${randomUUID()}@example.org`, emailVerifiedAt: new Date() } })));
    [owner, a, b, c] = users.map(u => u.id) as [string, string, string, string];
  });
  afterAll(disconnectPostgres);
  async function fixture(stages: Array<"TITLE_ABSTRACT" | "FULL_TEXT"> = ["TITLE_ABSTRACT"]) {
    const p = await createProjectFixture({ data: { title: "Two-slot integrity", ownerId: owner, status: "ACTIVE" } });
    await db.projectMember.createMany({ data: [a, b, c].map(userId => ({ projectId: p.id, userId })) });
    await service.configure(p.id, owner, { reviewMode: "INDEPENDENT", requiredReviewers: 2, expectedVersion: 0, consensusPolicy: "UNANIMOUS", aiAssisted: false, inclusionCriteria: ["Relevant research population"], exclusionCriteria: ["Wrong population", "Wrong methodology"], researchQuestions: [], stages, ...key() });
    const paper = await db.paper.create({ data: { title: "Independent screening study", abstractText: "Actual abstract of an identified research article.", publicationYear: 2025, primaryProvider: "user", dataStatus: "active" } });
    await db.projectPaper.create({ data: { projectId: p.id, paperId: paper.id, addedById: owner } });
    const started = await service.begin(p.id, a, paper.id, { confirmRescreen: false, ...key() });
    return { id: p.id, paperId: paper.id, roundId: started.roundId! };
  }
  type F = Awaited<ReturnType<typeof fixture>>;
  const claim = (f: F, actor: string) => service.claim(f.id, actor, f.roundId, key());
  async function review(f: F, actor: string, decision: ScreeningChoice = "INCLUDE", extra = {}) {
    const v = await service.detail(f.id, actor, f.roundId), assignment = v.assignments.find(a => a.id === v.myAssignmentId)!;
    return service.submit(f.id, actor, f.roundId, { assignmentId: assignment.id, expectedRevision: assignment.revision, decision, exclusionReason: decision === "EXCLUDE" ? "Wrong population" : "", comment: `private-rationale-${actor}`, confirmed: true, ...key(), ...extra });
  }
  async function expire(f: F, actor: string) {
    await db.screeningAssignment.update({ where: { roundId_reviewerId: { roundId: f.roundId, reviewerId: actor } }, data: { dueAt: new Date(Date.now() - 1000) } });
  }

  it("defaults to two reviewers even for a solo project, without writes on GET", async () => {
    const p = await createProjectFixture({ data: { title: "Solo", ownerId: owner, status: "ACTIVE" } });
    expect((await service.config(p.id, owner)).settings).toMatchObject({ requiredReviewers: 2, reviewMode: "INDEPENDENT", version: 0 });
    expect(await db.screeningSettings.count({ where: { projectId: p.id } })).toBe(0);
  });
  it("starts with two free slots, claims are not submissions, and a full paper stays in Library", async () => {
    const f = await fixture();
    await db.paper.update({ where: { id: f.paperId }, data: { publicationYear: 0 } });
    expect(await service.detail(f.id, owner, f.roundId)).toMatchObject({ assigned: 0, completed: 0, canClaim: false });
    await claim(f, a); await claim(f, b);
    expect(await service.detail(f.id, c, f.roundId)).toMatchObject({ assigned: 2, completed: 0, canReview: false, canClaim: false });
    expect((await service.board(f.id, c, page)).total).toBe(0);
    expect((await service.board(f.id, c, { ...page, filter: "ALL" })).total).toBe(1);
    for (const actor of [a, b]) expect((await service.workspaceSummary(f.id, actor)).myActiveClaims).toHaveLength(1);
    expect((await service.workspaceSummary(f.id, a)).myActiveClaims[0]?.publicationYear).toBeNull();
    await expect(claim(f, c)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("serializes concurrent claims for the last slot", async () => {
    const f = await fixture(); await claim(f, a);
    const outcomes = await Promise.allSettled([b, c].map(actor => claim(f, actor)));
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    expect(await db.screeningAssignment.count({ where: { roundId: f.roundId, active: true } })).toBe(2);
  });
  it("enforces capacity at the database boundary too", async () => {
    const f = await fixture(); await claim(f, a); await claim(f, b);
    await expect(db.screeningAssignment.create({ data: { projectId: f.id, roundId: f.roundId, reviewerId: c } })).rejects.toThrow();
  });
  it("same actor cannot occupy both slots or renew implicitly by re-claiming", async () => {
    const f = await fixture(), first = await claim(f, a), second = await claim(f, a);
    expect(second).toEqual(first);
    expect(await db.screeningAssignment.count({ where: { roundId: f.roundId } })).toBe(1);
  });
  it("binds idempotency keys to the round and preserves deadlines on retries", async () => {
    const f = await fixture(), other = await fixture(), input = key();
    const first = await service.claim(f.id, a, f.roundId, input);
    expect(await service.claim(f.id, a, f.roundId, input)).toEqual(first);
    const paper = await db.paper.create({ data: { title: "Second research source", publicationYear: 2025, primaryProvider: "user" } });
    await db.projectPaper.create({ data: { projectId: f.id, paperId: paper.id, addedById: owner } });
    const round = await service.begin(f.id, a, paper.id, { confirmRescreen: false, ...key() });
    await expect(service.claim(f.id, a, round.roundId!, input)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.release(other.id, a, f.roundId, key())).rejects.toMatchObject({ statusCode: 404 });
  });
  it("expiry releases only unfinished B; completed A survives and C replaces B", async () => {
    const f = await fixture(); await claim(f, a); await claim(f, b); await review(f, a); await expire(f, b);
    expect((await service.workspaceSummary(f.id, b)).myActiveClaims).toHaveLength(0);
    expect((await service.workspaceSummary(f.id, b)).expiredClaims).toHaveLength(1);
    expect((await service.board(f.id, c, page)).total).toBe(1);
    await claim(f, c); await review(f, c);
    const result = await service.detail(f.id, owner, f.roundId);
    expect(result).toMatchObject({ status: "INCLUDED", completed: 2 });
    expect(result.reviews.map(r => r.reviewerId).sort()).toEqual([a, c].sort());
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(2);
    expect(await db.screeningAudit.count({ where: { projectId: f.id, type: "CLAIM_EXPIRED" } })).toBe(1);
  });
  it.each(["submit", "extend"] as const)("rejects %s from an expired claim", async action => {
    const f = await fixture(); await claim(f, a);
    const old = await service.detail(f.id, a, f.roundId); await expire(f, a);
    const promise = action === "extend" ? service.extend(f.id, a, f.roundId, key()) : service.submit(f.id, a, f.roundId, { assignmentId: old.myAssignmentId!, expectedRevision: 1, decision: "INCLUDE", exclusionReason: "", comment: "", confirmed: true, ...key() });
    await expect(promise).rejects.toBeDefined();
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(0);
  });
  it("extends from the current server deadline by exactly 24h and releases only own unfinished slot", async () => {
    const f = await fixture(), initial = await claim(f, a); await claim(f, b);
    const ext = await service.extend(f.id, a, f.roundId, key());
    expect(new Date(ext.dueAt!).getTime() - new Date(initial.dueAt!).getTime()).toBe(86400000);
    await service.release(f.id, a, f.roundId, key());
    expect(await service.detail(f.id, b, f.roundId)).toMatchObject({ assigned: 1, myAssignmentId: expect.any(String) });
    await review(f, b); await expect(service.release(f.id, b, f.roundId, key())).rejects.toMatchObject({ statusCode: 409 });
  });
  it("preserves indefinite assignments as occupied; no new per-user claim limit", async () => {
    const f = await fixture();
    await service.assign(f.id, owner, { roundIds: [f.roundId], mode: "MANUAL", reviewerIds: [a, b], dueAt: null, ...key() });
    await expect(claim(f, c)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.board(f.id, c, page)).total).toBe(0);
    const paper = await db.paper.create({ data: { title: "Another source", publicationYear: 2025, primaryProvider: "user" } });
    await db.projectPaper.create({ data: { projectId: f.id, paperId: paper.id, addedById: owner } });
    const next = await service.begin(f.id, a, paper.id, { confirmRescreen: false, ...key() });
    await service.claim(f.id, a, next.roundId!, key());
    expect((await service.workspaceSummary(f.id, a)).myActiveClaims).toHaveLength(2);
  });
  it("claim-next is atomic and a retry returns the same paper", async () => {
    const f = await fixture(), input = key();
    const first = await service.claimNext(f.id, a, input);
    expect(first.paperId).toBe(f.paperId);
    expect(await service.claimNext(f.id, a, input)).toEqual(first);
    expect((await service.workspaceSummary(f.id, a)).eligibleQueueCount).toBe(0);
  });
  it("keeps all choices, rationales and reasons blinded until both submit, including Owner and history", async () => {
    const f = await fixture(); await claim(f, a); await claim(f, b); await review(f, a, "EXCLUDE");
    for (const actor of [owner, b, c]) {
      const v = await service.detail(f.id, actor, f.roundId);
      expect(v).toMatchObject({ completed: 1, assigned: 2, hiddenReviews: true, reviews: [] });
      expect(JSON.stringify(await service.history(f.id, actor, f.roundId))).not.toContain(`private-rationale-${a}`);
      expect(JSON.stringify(await service.board(f.id, actor, { ...page, filter: "ALL" }))).not.toContain(`private-rationale-${a}`);
    }
    await review(f, b, "INCLUDE");
    expect((await service.detail(f.id, owner, f.roundId)).reviews).toHaveLength(2);
  });
  it.each([["INCLUDE", "INCLUDE", "INCLUDED"], ["EXCLUDE", "EXCLUDE", "EXCLUDED"], ["INCLUDE", "EXCLUDE", "NEEDS_RESOLUTION"], ["UNSURE", "INCLUDE", "NEEDS_MORE_INFO"], ["UNSURE", "EXCLUDE", "NEEDS_MORE_INFO"], ["UNSURE", "UNSURE", "NEEDS_MORE_INFO"]] as const)("%s + %s produces %s without Owner approval", async (x, y, status) => {
    const f = await fixture(); await claim(f, a); await claim(f, b); await review(f, a, x); await review(f, b, y);
    expect(await service.detail(f.id, owner, f.roundId)).toMatchObject({ status, reviewerIntakeClosed: true });
    await expect(claim(f, c)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("two-stage acceptance opens a new independent two-slot full-text stage, not extraction", async () => {
    const f = await fixture(["TITLE_ABSTRACT", "FULL_TEXT"]); await claim(f, a); await claim(f, b); await review(f, a); await review(f, b);
    const full = (await service.board(f.id, owner, { ...page, filter: "ALL" })).items[0]!.round!;
    expect(full).toMatchObject({ phase: "FULL_TEXT", assigned: 0, completed: 0, extractionReady: false });
    await expect(evidence.create(f.id, a, { paperId: f.paperId, claim: "Premature evidence", quotation: "", locator: "", context: "", methodology: "", population: "", results: "", limitations: "", themes: [], origin: "HUMAN", ...key() })).rejects.toMatchObject({ statusCode: 400 });
    const next = { ...f, roundId: full.id }; await claim(next, a); await claim(next, b);
    await expect(review(next, a)).rejects.toMatchObject({ statusCode: 400 });
    for (const actor of [a, b]) await review(next, actor, "INCLUDE", { scope: "FULL_TEXT", fullTextReference: "Read actual full text, methods and results" });
    expect(await service.detail(f.id, a, full.id)).toMatchObject({ extractionReady: true, status: "INCLUDED" });
  });
  it("requires reconciliation of different full-text exclusion reasons", async () => {
    const f = await fixture(["FULL_TEXT"]); await claim(f, a); await claim(f, b);
    await review(f, a, "EXCLUDE", { scope: "FULL_TEXT", fullTextReference: "Read the full methods section", exclusionReason: "Wrong population" });
    await review(f, b, "EXCLUDE", { scope: "FULL_TEXT", fullTextReference: "Read the full methods section", exclusionReason: "Wrong methodology" });
    expect(await service.detail(f.id, owner, f.roundId)).toMatchObject({ status: "NEEDS_RESOLUTION", classification: "EXCLUSION_REASON_MISMATCH", finalDecision: null });
  });
  it.each(["agreement", "adjudication"] as const)("can resolve differing full-text exclusion reasons by %s", async path => {
    const f = await fixture(["FULL_TEXT"]); await claim(f, a); await claim(f, b);
    await review(f, a, "EXCLUDE", { scope: "FULL_TEXT", fullTextReference: "Read full text methods", exclusionReason: "Wrong population" });
    await review(f, b, "EXCLUDE", { scope: "FULL_TEXT", fullTextReference: "Read full text methods", exclusionReason: "Wrong methodology" });
    const before = await db.screeningReview.findMany({ where: { projectId: f.id }, orderBy: { id: "asc" } });
    for (const actor of [a, b]) await service.comment(f.id, actor, f.roundId, { comment: "We discussed which exclusion criterion the study fails", ...key() });
    const view = await service.detail(f.id, a, f.roundId);
    expect(view.discussionReady).toBe(true);
    if (path === "agreement") {
      await service.reassess(f.id, b, f.roundId, { expectedRevision: view.version, decision: "EXCLUDE", scope: "FULL_TEXT", fullTextReference: "Read full text methods", exclusionReason: "Wrong population", reason: "After discussion, population is the primary exclusion criterion", confirmed: true, ...key() });
    } else {
      await service.requestAdjudication(f.id, a, f.roundId, { expectedVersion: view.version, ...key() });
      for (const actor of [a, b]) {
        const cv = (await cases.view(f.id, actor, f.roundId)).case!;
        await cases.act(f.id, actor, f.roundId, { action: "STATEMENT", caseId: cv.id, expectedPacketVersion: cv.packetVersion, expectedStatementRevision: 0, useExisting: true, ...key() });
      }
      const packet = await cases.view(f.id, c, f.roundId);
      await service.resolve(f.id, c, f.roundId, { expectedVersion: packet.version, expectedCaseVersion: packet.case!.version, decision: "EXCLUDED", sourceMaterial: "Full text methods and eligibility protocol", exclusionReason: "Wrong population", reason: "Wrong population is the primary exclusion reason after examining full text", confirmed: true, ...key() });
    }
    expect(await service.detail(f.id, owner, f.roundId)).toMatchObject({ status: "EXCLUDED", completed: 2 });
    const after = await db.screeningReview.findMany({ where: { projectId: f.id }, orderBy: { id: "asc" } });
    expect(after.filter(r => before.some(old => old.id === r.id))).toEqual(before);
    expect(after).toHaveLength(path === "agreement" ? 3 : 2);
  });
  it("releases an unavailable account's unfinished slot before a replacement claim", async () => {
    const f = await fixture(); await claim(f, a); await claim(f, b); await review(f, a);
    await db.user.updateMany({ where: { id: { in: [a, b] } }, data: { accountStatus: "SUSPENDED" } });
    try {
      expect((await service.board(f.id, c, page)).total).toBe(1);
      await claim(f, c);
      await review(f, c);
      expect(await service.detail(f.id, owner, f.roundId)).toMatchObject({ status: "INCLUDED", completed: 2 });
      expect((await service.detail(f.id, owner, f.roundId)).reviews.map(r => r.reviewerId).sort()).toEqual([a, c].sort());
      expect(await db.screeningAssignment.findUnique({ where: { roundId_reviewerId: { roundId: f.roundId, reviewerId: b } } })).toMatchObject({ active: false, submittedAt: null });
      expect(await db.screeningAudit.count({ where: { roundId: f.roundId, type: "ASSIGNMENT_REVOKED" } })).toBe(1);
    } finally {
      await db.user.updateMany({ where: { id: { in: [a, b] } }, data: { accountStatus: "ACTIVE" } });
    }
  });
  it("no ordinary third vote after reopening; versions preserve the original ballot", async () => {
    const f = await fixture(); await claim(f, a); await claim(f, b); await review(f, a); await review(f, b, "EXCLUDE");
    const v = await service.detail(f.id, a, f.roundId);
    await service.reopen(f.id, a, f.roundId, { assignmentId: v.myAssignmentId!, expectedVersion: v.version, confirmed: true, reason: "New information requires correction of my own assessment", ...key() });
    await expect(claim(f, c)).rejects.toMatchObject({ statusCode: 409 });
    await review(f, a, "EXCLUDE");
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
    expect((await service.detail(f.id, owner, f.roundId)).completed).toBe(2);
  });
  it.each([false, true])("summary counts an unavailable reviewer only if submitted=%s", async submitted => {
    const f = await fixture(); await claim(f, a); await claim(f, b);
    if (submitted) await review(f, b);
    await db.user.update({ where: { id: b }, data: { accountStatus: "SUSPENDED" } });
    try {
      const summary = await service.workspaceSummary(f.id, owner);
      expect(summary.recentProposals[0]?.reviewProgress).toEqual({ completed: submitted ? 1 : 0, held: 1, required: 2 });
      const mine = await service.workspaceSummary(f.id, a);
      expect(mine.myActiveClaims[0]?.partner).toEqual(submitted ? { name: "B", completed: true } : null);
      expect((await service.board(f.id, c, page)).total).toBe(submitted ? 0 : 1);
      // GET must not silently mutate assignments or remove submitted work.
      expect(await db.screeningAssignment.count({ where: { roundId: f.roundId, active: true } })).toBe(2);
    } finally {
      await db.user.update({ where: { id: b }, data: { accountStatus: "ACTIVE" } });
    }
  });
  it("binds discussion to current ballots even when transaction timestamps precede submission", async () => {
    const f = await fixture(); await claim(f, a); await claim(f, b);
    await review(f, a); await review(f, b, "EXCLUDE");
    const reviewIds = (await db.screeningReview.findMany({ where: { projectId: f.id }, select: { id: true } })).map(r => r.id).sort();
    // PostgreSQL now() is the transaction start time, before waiting for the project lock.
    const discussions = [a, b].map(actorId => ({ projectId: f.id, roundId: f.roundId, actorId, type: "DISCUSSION", details: { comment: "Discussed the population and inclusion criteria", reviewIds } }));
    await db.screeningAudit.createMany({ data: discussions.map(d => ({ ...d, createdAt: new Date(Date.now() - 60000) })) });
    const view = await service.detail(f.id, a, f.roundId);
    expect(view.discussionReady).toBe(true);
    await service.reopen(f.id, a, f.roundId, { assignmentId: view.myAssignmentId!, expectedVersion: view.version, confirmed: true, reason: "Reconsider eligibility using newly available details", ...key() });
    await review(f, a);
    // A previous discussion cannot approve a new revision, even if its timestamp is later.
    await db.screeningAudit.createMany({ data: discussions.map(d => ({ ...d, createdAt: new Date(Date.now() + 60000) })) });
    expect((await service.detail(f.id, a, f.roundId)).discussionReady).toBe(false);
    await service.comment(f.id, a, f.roundId, { comment: "Discussed the revised ballot with the other reviewer", ...key() });
    expect((await service.detail(f.id, a, f.roundId)).discussionReady).toBe(false);
    await service.comment(f.id, b, f.roundId, { comment: "Responded to the revised ballot and its reasoning", ...key() });
    expect((await service.detail(f.id, a, f.roundId)).discussionReady).toBe(true);
    const fresh = await db.screeningAudit.findFirstOrThrow({ where: { roundId: f.roundId, type: "DISCUSSION", actorId: b, clientKey: { not: null } } });
    expect((fresh.details as { reviewIds: string[] }).reviewIds).toHaveLength(2);
    expect((fresh.details as { reviewIds: string[] }).reviewIds).not.toEqual(reviewIds);
    expect(await db.screeningReview.count({ where: { projectId: f.id } })).toBe(3);
  });
  it("rejects removed members and cross-project submit/extend/release", async () => {
    const f = await fixture(), other = await fixture(); await claim(f, a);
    for (const action of [service.extend, service.release]) await expect(action(other.id, a, f.roundId, key())).rejects.toMatchObject({ statusCode: 404 });
    await projectService.leaveProject(f.id, a);
    await expect(claim(f, a)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("flags invalid metadata and does not offer it to claim-next", async () => {
    const f = await fixture(); await db.paper.update({ where: { id: f.paperId }, data: { title: "Journal of Methods", journalName: "Journal of Methods" } });
    expect((await service.board(f.id, a, page)).total).toBe(0);
    expect((await service.detail(f.id, a, f.roundId)).canClaim).toBe(false);
    await expect(claim(f, a)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("only permits exactly two independent reviewers or explicit SIMPLE exception", () => {
    const config = { expectedVersion: 0, reviewMode: "INDEPENDENT", requiredReviewers: 3, consensusPolicy: "UNANIMOUS", aiAssisted: false, inclusionCriteria: [], exclusionCriteria: [], researchQuestions: [], ...key() };
    expect(screeningConfigSchema.safeParse(config).success).toBe(false);
    expect(screeningConfigSchema.safeParse({ ...config, reviewMode: "SIMPLE", requiredReviewers: 1 }).success).toBe(true);
    expect(screeningConfigSchema.safeParse({ ...config, requiredReviewers: 2, stages: ["FULL_TEXT", "TITLE_ABSTRACT"] }).success).toBe(false);
    expect(screeningConfigSchema.safeParse({ ...config, requiredReviewers: 2, stages: ["TITLE_ABSTRACT", "FULL_TEXT"] }).success).toBe(true);
  });
});
