import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import express from "express";
import { once } from "node:events";
import { createServer } from "node:http";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { contributionEvaluationService as service, evaluationHash } from "../contribution-evaluation.service.js";
import { allocationService } from "../allocation.service.js";
import { workContributionsService as work } from "../work-contributions.service.js";
import { evaluationDecisionSchema, evaluationProposalSchema } from "../dto/contribution-evaluation.schema.js";
import type { EvaluationProposalInput, OutcomeEvaluation } from "@trend/shared-types";
import { projectRouter } from "../project.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { hashOpaqueToken, tokenService } from "../../auth/token.service.js";

const enabled = process.env.CONTRIBUTION_EVALUATION_INTEGRATION === "1" || process.env.STUDENT_AFFILIATION_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Evaluation integration requires an isolated _test database");
describe.skipIf(!enabled).sequential("contribution evaluation with isolated PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, peer: string, outsider: string;
  const projects: string[] = [], users: string[] = [];
  beforeAll(async () => {
    for (const name of ["Owner", "Member", "Peer", "Outsider"]) {
      const user = await db.user.create({ data: { fullName: name, email: `evaluation-${randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: user.id, academicRole: "RESEARCHER", primaryPosition: "RESEARCH_STAFF" } }); users.push(user.id);
    }
    [owner, member, peer, outsider] = users as [string, string, string, string];
  });
  afterAll(async () => {
    // Existing append-only contribution tables intentionally retain project history.
    // These fixtures live only in the disposable database, never in a developer/production database.
    expect(projects.length).toBeGreaterThan(0);
  });
  async function fixture(single = false) {
    const p = await createProjectFixture({ data: { title: "Evaluation test", ownerId: owner, status: "ACTIVE", createdAt: new Date(Date.now() - 86400000) } }); projects.push(p.id);
    if (!single) await db.projectMember.createMany({ data: [member, peer].map(userId => ({ projectId: p.id, userId })) });
    const rule = await service.createRule(p.id, owner, { title: "Equal base weights", rationale: "Weights express the team's agreed scope of work", defaultWeight: 1, maxWeight: 100, clientKey: randomUUID() });
    return { id: p.id, rule };
  }
  async function source(id: string, participants = [owner, member], workDate = new Date(Date.now() - 60000).toISOString()) {
    const row = await work.save(id, owner, { title: "Methodology result", description: "Designed and validated the experiment protocol", source: "MANUAL", workDate, participants: participants.map(userId => ({ userId, roles: ["METHODOLOGY"] })), evidence: "Protocol reviewed against dated team meeting notes", evidenceRefs: [], clientKey: randomUUID() });
    await work.submit(id, owner, row.id, row.version);
    if (participants.includes(member)) await work.review(id, member, row.id, { expectedVersion: 1, decision: "ACKNOWLEDGE", note: "Validated my contribution to protocol design" });
    if (participants.length > 1) await work.review(id, peer, row.id, { expectedVersion: 1, decision: "ACCEPT", note: "Reviewed the protocol and evidence" });
    return row;
  }
  async function period(id: string) { return allocationService.createPeriod(id, owner, { title: "Completed scope", description: "Evaluation of confirmed methodology work", scope: "Research methodology effort", periodStart: new Date(Date.now() - 86400000).toISOString(), periodEnd: new Date().toISOString(), clientKey: randomUUID() }); }
  function proposal(ruleId: string, sourceId: string, key = "METHOD-01"): EvaluationProposalInput { return { ruleId, clientKey: randomUUID(), outcomeKey: key, expectedVersion: 0, contributionIds: [sourceId], weight: 10, rationale: "Agreed complexity and documented participation in protocol", retrospectiveWeight: true, participation: [{ userId: owner, basisPoints: 6000 }, { userId: member, basisPoints: 4000 }] }; }
  async function approve(id: string, e: OutcomeEvaluation, participants = [owner, member]) {
    await service.decide(id, owner, e.id, { kind: "WEIGHT", decision: "APPROVE", payloadHash: e.payloadHash, note: "" });
    await Promise.all(participants.map(actor => service.decide(id, actor, e.id, { kind: "PARTICIPANT", decision: "APPROVE", payloadHash: e.payloadHash, note: "" })));
  }
  async function calculate(id: string, periodId: string, ruleId: string) {
    const run = await service.requestRun(id, owner, { periodId, ruleId, clientKey: randomUUID() });
    await service.process(run.id); const done = await service.run(id, owner, run.id);
    expect(done.status).toBe("COMPLETED"); return service.snapshot(id, owner, done.snapshotId!);
  }
  it("requires separate authenticated consent, reproduces a snapshot, and never changes an allocation", async () => {
    const f = await fixture(); const s = await source(f.id); const p = await period(f.id); const input = proposal(f.rule.id, s.id);
    const e = await service.propose(f.id, owner, input); expect((await service.propose(f.id, owner, input)).id).toBe(e.id);
    await expect(service.propose(f.id, owner, { ...input, weight: 9 })).rejects.toMatchObject({ statusCode: 409 });
    let board = await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 }); expect(board.coverage).toEqual({ total: 1, eligible: 0, pending: 1, disputed: 0, excluded: 0 });
    const empty = await calculate(f.id, p.id, f.rule.id); expect(empty.calculation.status).toBe("INSUFFICIENT_DATA");
    await approve(f.id, e); board = await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 }); expect(board.coverage.eligible).toBe(1);
    const snapshot = await calculate(f.id, p.id, f.rule.id);
    expect(snapshot.calculation.scores.find(x => x.userId === owner)?.basisPoints).toBe(6000);
    expect(snapshot.calculation.scores.find(x => x.userId === member)?.basisPoints).toBe(4000);
    expect(snapshot.calculation.scores.find(x => x.userId === peer)?.basisPoints).toBe(0);
    expect(snapshot.isStale).toBe(false);
    const again = await calculate(f.id, p.id, f.rule.id); expect(again.inputHash).toBe(snapshot.inputHash); expect(again.calculation).toEqual(snapshot.calculation);
    expect(await db.allocationRevision.count({ where: { projectId: f.id } })).toBe(0);
    await expect(db.contributionEvaluationSnapshot.update({ where: { id: snapshot.id }, data: { inputHash: "0".repeat(64) } })).rejects.toThrow();
    await expect(db.contributionEvaluationDecision.deleteMany({ where: { evaluationId: e.id } })).rejects.toThrow();
    await expect(service.decide(f.id, owner, e.id, { kind: "PARTICIPANT", decision: "DISPUTE", payloadHash: e.payloadHash, note: "Changing a previous decision without amendment" })).rejects.toMatchObject({ statusCode: 409 });
    const shares = snapshot.calculation.scores.map(x => ({ userId: x.userId, basisPoints: x.basisPoints!, rationale: "Confirmed work in this scope" }));
    const draft = await allocationService.draft(f.id, owner, p.id, { shares, rationale: "Team proposal referencing the transparent calculation", evaluationSnapshotId: snapshot.id, clientKey: randomUUID() });
    expect(draft.evaluationReference?.snapshotId).toBe(snapshot.id); expect(draft.approvals).toHaveLength(0);
    const altered = shares.map(x => ({ ...x, basisPoints: x.userId === owner ? 5000 : x.userId === member ? 5000 : 0, rationale: "" }));
    await expect(allocationService.edit(f.id, owner, draft.id, { shares: altered, rationale: "Adjusted proposal missing individual explanations", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 400 });
    await service.decide(f.id, peer, e.id, { kind: "CHALLENGE", decision: "DISPUTE", payloadHash: e.payloadHash, note: "The protocol work overlaps another documented result" });
    expect((await service.snapshot(f.id, owner, snapshot.id)).isStale).toBe(true);
    expect((await service.snapshot(f.id, owner, snapshot.id)).calculation).toEqual(snapshot.calculation);
    expect((await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 })).coverage.disputed).toBe(1);
  });
  it("rejects actor forgery, cross-project data and duplicate outcome sources", async () => {
    const f = await fixture(), other = await fixture(); const s = await source(f.id), e = await service.propose(f.id, owner, proposal(f.rule.id, s.id));
    await expect(service.detail(f.id, outsider, e.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.decide(f.id, peer, e.id, { kind: "PARTICIPANT", decision: "APPROVE", payloadHash: e.payloadHash, note: "" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.decide(f.id, member, e.id, { kind: "WEIGHT", decision: "APPROVE", payloadHash: e.payloadHash, note: "" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.decide(other.id, owner, e.id, { kind: "WEIGHT", decision: "APPROVE", payloadHash: e.payloadHash, note: "" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.propose(f.id, owner, proposal(f.rule.id, s.id, "DUPLICATE"))).rejects.toMatchObject({ statusCode: 409 });
    expect(evaluationDecisionSchema.safeParse({ kind: "PARTICIPANT", decision: "APPROVE", note: "", payloadHash: e.payloadHash, userId: member }).success).toBe(false);
    expect(evaluationProposalSchema.safeParse({ ...proposal(f.rule.id, s.id), participation: [{ userId: owner, basisPoints: 9999 }] }).success).toBe(false);
    expect(evaluationHash({ b: 1, a: [2] })).toBe(evaluationHash({ a: [2], b: 1 }));
  });
  it("counts a grouped outcome once even when two accepted records document it", async () => {
    const f = await fixture(), a = await source(f.id), b = await source(f.id), p = await period(f.id);
    const e = await service.propose(f.id, owner, { ...proposal(f.rule.id, a.id), contributionIds: [a.id, b.id] });
    await approve(f.id, e);
    const result = await calculate(f.id, p.id, f.rule.id);
    expect(result.coverage).toEqual({ total: 1, eligible: 1, pending: 0, disputed: 0, excluded: 0 });
    expect(result.calculation.totalRawScore).toBe("100000");
    expect(result.calculation.scores.find(s => s.userId === owner)?.rawScore).toBe("60000");
    expect(result.outcomes[0]!.evaluation!.payload.sources).toHaveLength(2);
  });
  it("keeps objections across revisions until each original objector explicitly accepts the correction", async () => {
    const f = await fixture(), s = await source(f.id), p = await period(f.id), input = proposal(f.rule.id, s.id);
    const e = await service.propose(f.id, owner, input); await approve(f.id, e);
    await service.decide(f.id, peer, e.id, { kind: "CHALLENGE", decision: "DISPUTE", payloadHash: e.payloadHash, note: "The recorded outcome duplicates other work" });
    await service.decide(f.id, member, e.id, { kind: "CHALLENGE", decision: "DISPUTE", payloadHash: e.payloadHash, note: "The rationale needs to explain my contribution" });
    const retry = await service.propose(f.id, owner, input);
    expect(retry.decisions).toHaveLength(5); expect(retry.canApproveWeight).toBe(false);
    expect(retry.unresolvedObjections).toHaveLength(2);
    await expect(service.decide(f.id, peer, e.id, { kind: "RESOLUTION", decision: "APPROVE", payloadHash: e.payloadHash, note: "Attempting to resolve without a correction" })).rejects.toMatchObject({ statusCode: 409 });
    const next = await service.propose(f.id, owner, { ...input, clientKey: randomUUID(), expectedVersion: 1, weight: 12 });
    const supersededRetry = await service.propose(f.id, owner, input);
    expect(supersededRetry.supersededById).toBe(next.id); expect(supersededRetry.canChallenge).toBe(false);
    await approve(f.id, next);
    expect((await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 })).coverage.disputed).toBe(1);
    await expect(service.decide(f.id, owner, next.id, { kind: "RESOLUTION", decision: "APPROVE", payloadHash: next.payloadHash, note: "The owner cannot resolve someone else's objection" })).rejects.toMatchObject({ statusCode: 403 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: f.id, userId: peer } }, data: { status: "REMOVED" } });
    const detail = await service.detail(f.id, peer, next.id);
    expect(detail.evaluation.canResolveObjection).toBe(true); expect(detail.evaluation.canApprove).toBe(false);
    expect(detail.evaluation.unresolvedObjections).toHaveLength(2);
    expect(detail.evaluation.payload.sources.every(s => !s.evidence && Array.isArray(s.evidenceRefs) && !s.evidenceRefs.length)).toBe(true);
    await expect(service.board(f.id, peer, { periodId: p.id, page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 404 });
    const snapshot = await calculate(f.id, p.id, f.rule.id); expect(snapshot.calculation.status).toBe("INSUFFICIENT_DATA");
    const resolve = { kind: "RESOLUTION" as const, decision: "APPROVE" as const, payloadHash: next.payloadHash, note: "The revised scope separates this result from the other work" };
    await service.decide(f.id, peer, next.id, resolve); await service.decide(f.id, peer, next.id, resolve);
    expect((await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 })).coverage.disputed).toBe(1);
    await service.decide(f.id, member, next.id, { ...resolve, note: "The corrected rationale explains my participation adequately" });
    expect((await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 })).coverage.eligible).toBe(1);
    expect((await service.snapshot(f.id, owner, snapshot.id)).isStale).toBe(true);
    expect((await service.snapshot(f.id, owner, snapshot.id)).calculation.status).toBe("INSUFFICIENT_DATA");
    const third = await service.propose(f.id, owner, { ...input, clientKey: randomUUID(), expectedVersion: 2, weight: 13 });
    expect((await service.detail(f.id, owner, third.id)).evaluation.unresolvedObjections).toEqual([]);
  });
  it("returns the saved snapshot when a completed calculation request is retried", async () => {
    const f = await fixture(), p = await period(f.id), input = { periodId: p.id, ruleId: f.rule.id, clientKey: randomUUID() };
    const run = await service.requestRun(f.id, owner, input); await service.process(run.id);
    const retried = await service.requestRun(f.id, owner, input);
    expect(retried.status).toBe("COMPLETED"); expect(retried.snapshotId).toBeTruthy();
    expect(retried.snapshotId).toBe((await service.run(f.id, owner, run.id)).snapshotId);
    await service.createRule(f.id, owner, { clientKey: randomUUID(), title: "Updated scope weights", rationale: "Published rules changed after the completed calculation", defaultWeight: 2, maxWeight: 100 });
    expect(await service.requestRun(f.id, owner, input)).toEqual(retried);
    await expect(service.requestRun(f.id, owner, { ...input, clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("does not score work outside the period by attaching it to an in-period outcome", async () => {
    const f = await fixture(), a = await source(f.id, [owner, member], new Date(Date.now() - 3 * 86400000).toISOString()), b = await source(f.id), p = await period(f.id);
    const e = await service.propose(f.id, owner, { ...proposal(f.rule.id, b.id), contributionIds: [a.id, b.id] }); await approve(f.id, e);
    const board = await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 });
    expect(board.coverage.excluded).toBe(1); expect(board.items[0]!.reasons).toContain("SOURCE_OUTSIDE_PERIOD");
    expect((await calculate(f.id, p.id, f.rule.id)).calculation.status).toBe("INSUFFICIENT_DATA");
  });
  it("authenticates actors and rejects forged or cross-project requests over HTTP", async () => {
    const f = await fixture(), other = await fixture(), s = await source(f.id);
    const e = await service.propose(f.id, owner, proposal(f.rule.id, s.id));
    const app = express(); app.use(express.json()); app.use("/projects", projectRouter); app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const sessionId = randomUUID();
    await db.refreshToken.create({ data: { userId: member, familyId: sessionId, tokenHash: hashOpaqueToken(randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    const token = tokenService.signAccessToken({ sub: member, systemRole: "USER", sessionId }).token;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/projects`;
    const body = { kind: "PARTICIPANT", decision: "APPROVE", payloadHash: e.payloadHash, note: "" };
    try {
      expect((await fetch(`${base}/${f.id}/contributions/evaluation/rules`)).status).toBe(401);
      const path = `${base}/${f.id}/contributions/evaluation/outcomes/${e.id}/decisions`;
      expect((await fetch(path, { method: "POST", headers, body: JSON.stringify({ ...body, userId: owner }) })).status).toBe(400);
      expect((await fetch(path, { method: "POST", headers, body: JSON.stringify({ ...body, payloadHash: "0".repeat(64) }) })).status).toBe(409);
      expect((await fetch(`${base}/${other.id}/contributions/evaluation/outcomes/${e.id}/decisions`, { method: "POST", headers, body: JSON.stringify(body) })).status).toBe(404);
      const approved = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
      expect(approved.status).toBe(200); expect((await approved.json()).success).toBe(true);
      const detail = await fetch(`${base}/${f.id}/contributions/evaluation/outcomes/${e.id}`, { headers });
      expect((await detail.json()).data.evaluation.decisions).toEqual([expect.objectContaining({ userId: member, kind: "PARTICIPANT" })]);
    } finally { server.close(); await once(server, "close"); }
  });
  it("invalidates changed sources/rules, resets consent on revisions, preserves former-member review", async () => {
    const f = await fixture(); const s = await source(f.id); const p = await period(f.id); const input = proposal(f.rule.id, s.id); const e = await service.propose(f.id, owner, input); await approve(f.id, e);
    const snapshot = await calculate(f.id, p.id, f.rule.id);
    const next = await service.propose(f.id, owner, { ...input, clientKey: randomUUID(), expectedVersion: 1, weight: 12 });
    expect((await service.detail(f.id, owner, next.id)).evaluation.decisions).toHaveLength(0);
    await expect(service.decide(f.id, member, e.id, { kind: "CHALLENGE", decision: "DISPUTE", note: "Responding to an outdated revision", payloadHash: e.payloadHash })).rejects.toMatchObject({ statusCode: 409 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: f.id, userId: member } }, data: { status: "REMOVED" } });
    const former = await service.detail(f.id, member, next.id); expect(former.evaluation.canApprove).toBe(true); expect(former.evaluation.payload.sources.every(s => !s.evidence && Array.isArray(s.evidenceRefs) && !s.evidenceRefs.length)).toBe(true);
    await service.decide(f.id, member, next.id, { kind: "PARTICIPANT", decision: "APPROVE", note: "", payloadHash: next.payloadHash });
    await expect(service.snapshot(f.id, member, snapshot.id)).rejects.toMatchObject({ statusCode: 404 });
    await service.createRule(f.id, owner, { title: "Updated research scope", rationale: "New scope needs independently renewed confirmations", defaultWeight: 2, maxWeight: 50, clientKey: randomUUID() });
    const blocked = await service.detail(f.id, owner, next.id);
    expect(blocked.evaluation.approvalBlockedReason).toBe("RULE_CHANGED"); expect(blocked.evaluation.canApproveWeight).toBe(false);
    const retry = await service.propose(f.id, owner, input);
    expect(retry.id).toBe(e.id); expect(retry.supersededById).toBe(next.id); expect(retry.canApprove).toBe(false);
    expect((await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 })).items[0]!.reasons).toContain("RULE_CHANGED");
    await expect(service.decide(f.id, owner, next.id, { kind: "WEIGHT", decision: "APPROVE", payloadHash: next.payloadHash, note: "" })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("reads beyond 500 sources and labels pending, disputed and insufficient data", async () => {
    const f = await fixture(); const timestamp = new Date(Date.now() - 60000);
    const rows = Array.from({ length: 505 }, (_, i) => ({ id: randomUUID(), projectId: f.id, proposedById: owner, contributorId: owner, source: "MANUAL", title: `Recorded work ${i}`, description: "Offline research work awaiting detailed confirmation", workDate: timestamp, evidence: "Recorded team notes", status: i < 3 ? "DISPUTED" : "SUBMITTED", confirmationRequiredFrom: "CONTRIBUTOR", visibility: "PRIVATE" }));
    await db.projectContributionProposal.createMany({ data: rows }); await db.contributionParticipant.createMany({ data: rows.map(r => ({ proposalId: r.id, userId: owner, roles: [] })) });
    const p = await period(f.id); const first = await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 }); const last = await service.board(f.id, owner, { periodId: p.id, page: 26, pageSize: 20 });
    expect(first.coverage).toEqual({ total: 505, eligible: 0, pending: 502, disputed: 3, excluded: 0 }); expect(last.items).toHaveLength(5); expect(last.hasNext).toBe(false);
    const snapshot = await calculate(f.id, p.id, f.rule.id); expect(snapshot.outcomes).toHaveLength(505); expect(snapshot.calculation.status).toBe("INSUFFICIENT_DATA");
  });
  it("supports an explicitly confirmed solo result and preserves changes as a new source revision", async () => {
    const f = await fixture(true); const s = await source(f.id, [owner]); const p = await period(f.id);
    const e = await service.propose(f.id, owner, { ...proposal(f.rule.id, s.id), participation: [{ userId: owner, basisPoints: 10000 }] });
    await approve(f.id, e, [owner]); const snapshot = await calculate(f.id, p.id, f.rule.id); expect(snapshot.calculation.scores[0]!.basisPoints).toBe(10000); expect(snapshot.outcomes[0]!.verificationMode).toBe("SOLO_SELF_CONFIRMED");
    const original = await work.detail(f.id, owner, s.id);
    await work.save(f.id, owner, { title: original.title, description: original.description, source: "MANUAL", workDate: original.workDate, participants: [{ userId: owner, roles: [] }], evidence: "Corrected protocol and newly documented experiment notes", evidenceRefs: [], expectedVersion: 1, correctionReason: "Correct evidence after further research findings" }, s.id);
    const board = await service.board(f.id, owner, { periodId: p.id, page: 1, pageSize: 20 }); expect(board.items[0]!.reasons).toContain("SOURCE_CHANGED"); expect(board.coverage.excluded).toBe(1);
    expect((await service.snapshot(f.id, owner, snapshot.id)).isStale).toBe(true);
  });
  it("serializes competing revisions and never publishes a mixed snapshot during a dispute", async () => {
    const f = await fixture(), s = await source(f.id), p = await period(f.id);
    const input = proposal(f.rule.id, s.id);
    const proposals = await Promise.allSettled([service.propose(f.id, owner, input), service.propose(f.id, member, { ...input, clientKey: randomUUID(), weight: 11 })]);
    expect(proposals.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(proposals.filter(x => x.status === "rejected")).toHaveLength(1);
    const e = (proposals.find(x => x.status === "fulfilled") as PromiseFulfilledResult<OutcomeEvaluation>).value;
    await approve(f.id, e);
    const run = await service.requestRun(f.id, owner, { ruleId: f.rule.id, periodId: p.id, clientKey: randomUUID() });
    await Promise.all([service.process(run.id), service.decide(f.id, peer, e.id, { kind: "CHALLENGE", decision: "DISPUTE", note: "Concurrent objection to overlapping work", payloadHash: e.payloadHash })]);
    const result = await service.snapshot(f.id, owner, (await service.run(f.id, owner, run.id)).snapshotId!);
    if (result.coverage.eligible === 1) {
      expect(result.isStale).toBe(true); expect(result.outcomes[0]!.evaluation!.decisions.every(d => d.decision === "APPROVE")).toBe(true);
    } else {
      expect(result.coverage.disputed).toBe(1); expect(result.calculation.status).toBe("INSUFFICIENT_DATA");
    }
  });
  it("preserves a removed participant's restricted challenge on a non-first grouped source", async () => {
    const f = await fixture(), a = await source(f.id, [owner]), b = await source(f.id);
    const input = { ...proposal(f.rule.id, b.id), contributionIds: [a.id, b.id] };
    const e = await service.propose(f.id, owner, input);
    // Correct the second source and remove its former collaborator.
    const old = await work.detail(f.id, owner, b.id);
    await work.save(f.id, owner, { title: old.title, description: old.description, source: "MANUAL", workDate: old.workDate, evidence: old.evidence, evidenceRefs: [], participants: [{ userId: owner, roles: [] }], expectedVersion: 1, correctionReason: "Correct attribution after rechecking the protocol" }, b.id);
    await work.submit(f.id, owner, b.id, 2);
    const next = await service.propose(f.id, owner, { ...input, clientKey: randomUUID(), expectedVersion: e.version, participation: [{ userId: owner, basisPoints: 10000 }] });
    await db.projectMember.update({ where: { projectId_userId: { projectId: f.id, userId: member } }, data: { status: "REMOVED" } });
    const detail = await service.detail(f.id, member, next.id);
    expect(detail.evaluation.canApprove).toBe(false); expect(detail.evaluation.canChallenge).toBe(true);
    await service.decide(f.id, member, next.id, { kind: "CHALLENGE", decision: "DISPUTE", payloadHash: next.payloadHash, note: "The correction wrongly removes my contribution" });
    expect((await service.detail(f.id, owner, next.id)).evaluation.decisions[0]!.decision).toBe("DISPUTE");
  });
});
