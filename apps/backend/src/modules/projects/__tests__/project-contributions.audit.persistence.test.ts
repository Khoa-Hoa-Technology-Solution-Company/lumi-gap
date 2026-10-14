import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { allocationService as allocations } from "../allocation.service.js";
import { workContributionsService as work } from "../work-contributions.service.js";
import { contributionActivityService as activity } from "../contribution-activity.service.js";
import { projectService } from "../project.service.js";
import { projectTasksService as tasks } from "../project-tasks.service.js";
import { notificationService } from "../../notifications/notification.service.js";
import { deliverContributionsEmail } from "../contributions-mail.service.js";
import { authMailService } from "../../auth/auth-mail.service.js";
import { env } from "../../../config/env.js";
import { workspaceService } from "../../workspaces/workspace.service.js";
import express from "express";
import { once } from "node:events";
import { createServer } from "node:http";
import { projectRouter } from "../project.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { hashOpaqueToken, tokenService } from "../../auth/token.service.js";
import { projectDiscussionsService as discussions } from "../project-discussions.service.js";

const isolated = process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("independent contribution audit, disposable PostgreSQL", () => {
  const db = getPrisma();
  let a: string, b: string, c: string, d: string;
  const originalMailMode = env.EMAIL_DELIVERY_MODE;
  beforeAll(async () => {
    const ids = await Promise.all(["A", "B", "C", "D"].map(async name => {
      const user = await db.user.create({ data: { email: `audit-${crypto.randomUUID()}@example.org`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
      await db.academicProfile.create({ data: { userId: user.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER" } });
      return user.id;
    }));
    [a, b, c, d] = ids as [string, string, string, string];
  });
  afterEach(() => { vi.restoreAllMocks(); env.EMAIL_DELIVERY_MODE = originalMailMode; });
  async function project(ids = [a, b, c]) {
    const p = await createProjectFixture({ data: { title: "Independent contributions audit", ownerId: a, visibility: "PUBLIC", status: "ACTIVE", createdAt: new Date(Date.now() - 86400000) } });
    for (const userId of ids.filter(id => id !== a)) await db.projectMember.create({ data: { projectId: p.id, userId } });
    return p.id;
  }
  async function period(projectId: string) {
    return allocations.createPeriod(projectId, a, { title: "Methodology phase", description: "Documented methodology and analysis effort", scope: "Methodology and analysis work in this phase", periodStart: new Date(Date.now() - 86400000).toISOString(), periodEnd: new Date().toISOString(), clientKey: crypto.randomUUID() });
  }
  const shares = (values = [4000, 3500, 2500]) => [a, b, c].map((userId, i) => ({ userId, basisPoints: values[i]!, rationale: "Documented phase deliverables negotiated by the team" }));
  async function proposal(id: string, values?: number[]) {
    const p = await period(id);
    const r = await allocations.draft(id, a, p.id, { shares: shares(values), rationale: "A negotiated distribution recognizing methodology and analysis", clientKey: crypto.randomUUID() });
    return allocations.submit(id, a, r.id, 1);
  }
  const claim = (userId = a) => ({ title: "Offline methodology protocol", description: "Designed the methodology from offline research interviews", source: "MANUAL" as const, workDate: new Date().toISOString(), participants: [{ userId, roles: ["METHODOLOGY" as const] }], evidence: "Team interview protocol notes", evidenceRefs: [], clientKey: crypto.randomUUID() });

  it("rejects direct insertion of terminal or submitted revisions without consent", async () => {
    const id = await project(), p = await period(id);
    for (const status of ["FINALIZED", "SUPERSEDED", "DISPUTED", "AWAITING_APPROVAL"]) {
      await expect(db.$transaction(async tx => {
        await tx.allocationRevision.create({ data: { projectId: id, periodId: p.id, revision: 1, status, roster: [], createdById: a, clientKey: crypto.randomUUID() } });
        // Keep the baseline corruption probe rollback-only even when the guard is missing.
        throw new Error("AUDIT_INSERT_WAS_ACCEPTED");
      })).rejects.not.toThrow("AUDIT_INSERT_WAS_ACCEPTED");
    }
    expect(await db.allocationRevision.count({ where: { periodId: p.id } })).toBe(0);
  });
  it("rejects draft status and timestamp shortcuts at the database boundary", async () => {
    const id = await project(), p = await period(id);
    const r = await allocations.draft(id, a, p.id, { shares: shares(), rationale: "Documented effort from the whole team", clientKey: crypto.randomUUID() });
    for (const data of [{ status: "DISPUTED" }, { status: "SUPERSEDED" }, { finalizedAt: new Date() }, { submittedAt: new Date() }]) {
      await expect(db.$transaction(async tx => {
        await tx.allocationRevision.update({ where: { id: r.id }, data });
        throw new Error("AUDIT_UPDATE_WAS_ACCEPTED");
      })).rejects.not.toThrow("AUDIT_UPDATE_WAS_ACCEPTED");
    }
  });
  it("executes A/B: three-person 60/25/15 dispute then 40/35/25 with entirely new consent", async () => {
    const id = await project();
    const task = await tasks.save(id, a, { title: "Methodology protocol", description: "Completed team methodology protocol", status: "DONE", blockedReason: "", assigneeId: a, milestoneId: null, dueAt: null, link: null, clientKey: crypto.randomUUID() });
    const input = { ...claim(), evidenceRefs: [{ kind: "TASK" as const, id: task.id }] };
    const contribution = await work.save(id, a, input);
    await work.submit(id, a, contribution.id, 1);
    expect((await work.review(id, b, contribution.id, { expectedVersion: 1, decision: "ACCEPT", note: "Checked the protocol against team notes" })).status).toBe("ACCEPTED");
    const first = await proposal(id, [6000, 2500, 1500]);
    await allocations.decide(id, a, first.id, { decision: "APPROVE", explanation: "" });
    await allocations.decide(id, b, first.id, { decision: "APPROVE", explanation: "" });
    expect((await allocations.decide(id, c, first.id, { decision: "DISPUTE", explanation: "The proposal omits my methodological validation work" })).status).toBe("DISPUTED");
    const second = await allocations.draft(id, a, first.period.id, { shares: shares(), rationale: "Revision includes the team's methodological validation work", clientKey: crypto.randomUUID() });
    expect(second.approvals).toHaveLength(0);
    await allocations.submit(id, a, second.id, 1);
    await allocations.decide(id, a, second.id, { decision: "APPROVE", explanation: "" });
    await allocations.decide(id, b, second.id, { decision: "APPROVE", explanation: "" });
    const final = await allocations.decide(id, c, second.id, { decision: "APPROVE", explanation: "" });
    expect(final.status).toBe("FINALIZED");
    expect(final.shares.map(s => s.basisPoints).sort((x, y) => x - y)).toEqual([2500, 3500, 4000]);
    expect(final.approvals.map(p => p.userId).sort()).toEqual([a, b, c].sort());
    expect((await allocations.history(id, a, first.period.id)).map(r => r.status)).toEqual(["FINALIZED", "DISPUTED"]);
    expect((await allocations.export(id, b, second.id)).meaning).toContain("Not a grade");
  });
  it("returns exact submission retries after finalization and acknowledgement", async () => {
    const id = await project(), r = await proposal(id);
    for (const userId of [a, b, c]) await allocations.decide(id, userId, r.id, { decision: "APPROVE", explanation: "" });
    expect((await allocations.submit(id, a, r.id, 1)).status).toBe("FINALIZED");
    const w = await work.save(id, a, claim()); await work.submit(id, a, w.id, 1);
    await work.review(id, b, w.id, { expectedVersion: 1, decision: "ACCEPT", note: "" });
    expect((await work.submit(id, a, w.id, 1)).status).toBe("ACCEPTED");
    expect(await db.projectActivity.count({ where: { entityId: r.id, type: "ALLOCATION_SUBMITTED" } })).toBe(1);
    expect(await db.projectContributionHistory.count({ where: { proposalId: w.id, action: "SUBMITTED" } })).toBe(1);
  });
  it("executes C/D: departed D retains consent rights, zero-share objection and no manuscript access", async () => {
    const id = await project([a, b, c, d]), input = claim(d), w = await work.save(id, d, input);
    await work.submit(id, d, w.id, 1); await work.review(id, b, w.id, { expectedVersion: 1, decision: "ACCEPT", note: "" });
    await projectService.removeMemberFromProject(id, d, a);
    const p = await period(id); expect(p.roster.some(person => person.id === d)).toBe(true);
    await expect(allocations.draft(id, a, p.id, { shares: shares(), rationale: "Owner tries excluding the departed contributor", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    const r = await allocations.draft(id, a, p.id, { shares: [...shares(), { userId: d, basisPoints: 0, rationale: "No included work according to this contested proposal" }], rationale: "Contested distribution requires D's explicit agreement", clientKey: crypto.randomUUID() });
    await allocations.submit(id, a, r.id, 1);
    const limited = await allocations.detail(id, d, r.id);
    expect(limited.evidenceSummary.some(e => e.id === w.id)).toBe(true);
    expect(JSON.stringify(limited)).not.toContain(input.evidence);
    const manuscript = await workspaceService.create({ projectId: id, name: "Private team manuscript" }, a, "researcher");
    await expect(workspaceService.get(manuscript._id, d, "researcher")).rejects.toMatchObject({ statusCode: 404 });
    await expect(work.list(id, d, { page: 1, pageSize: 20, q: "", filter: "TEAM" })).rejects.toMatchObject({ statusCode: 404 });
    expect((await allocations.decide(id, d, r.id, { decision: "DISPUTE", explanation: "I completed documented methodology work before departure" })).status).toBe("DISPUTED");
    await expect(allocations.edit(id, a, r.id, { shares: shares(), rationale: "Rewrite the disputed submitted version", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(db.projectContributionProposal.delete({ where: { id: w.id } })).rejects.toThrow();
  });
  it("serializes approval versus dispute and conflicting decisions from two tabs", async () => {
    const id = await project(), r = await proposal(id);
    await allocations.decide(id, a, r.id, { decision: "APPROVE", explanation: "" });
    const results = await Promise.allSettled([
      allocations.decide(id, b, r.id, { decision: "APPROVE", explanation: "" }),
      allocations.decide(id, c, r.id, { decision: "DISPUTE", explanation: "The percentage misses my analysis and validation" }),
    ]);
    expect(results.some(p => p.status === "fulfilled")).toBe(true);
    expect((await allocations.detail(id, a, r.id)).status).toBe("DISPUTED");
    expect(await db.projectActivity.count({ where: { entityId: r.id, type: "ALLOCATION_FINALIZED" } })).toBe(0);
    const other = await project(), pending = await proposal(other);
    const tabs = await Promise.allSettled([
      allocations.decide(other, b, pending.id, { decision: "APPROVE", explanation: "" }),
      allocations.decide(other, b, pending.id, { decision: "DISPUTE", explanation: "A conflicting response from another browser tab" }),
    ]);
    expect(tabs.filter(t => t.status === "fulfilled")).toHaveLength(1);
    expect(await db.allocationApproval.count({ where: { revisionId: pending.id, userId: b } })).toBe(1);
  });
  it("serializes removal, revision creation and final approvals without losing frozen participants", async () => {
    const id = await project(), r = await proposal(id);
    await allocations.decide(id, a, r.id, { decision: "APPROVE", explanation: "" });
    await Promise.all([
      projectService.removeMemberFromProject(id, c, a),
      allocations.decide(id, b, r.id, { decision: "APPROVE", explanation: "" }),
    ]);
    expect((await allocations.detail(id, c, r.id)).roster.map(p => p.id)).toContain(c);
    const results = await Promise.allSettled([
      allocations.decide(id, c, r.id, { decision: "APPROVE", explanation: "" }),
      allocations.draft(id, a, r.period.id, { shares: shares(), rationale: "Concurrent explicit amendment request from the owner", clientKey: crypto.randomUUID() }),
    ]);
    expect(results[0]!.status).toBe("fulfilled");
    const final = await allocations.detail(id, a, r.id); expect(final.status).toBe("FINALIZED"); expect(final.approvals).toHaveLength(3);
    expect(await db.projectActivity.count({ where: { entityId: r.id, type: "ALLOCATION_FINALIZED" } })).toBe(1);
  });
  it("rolls back consent, state and activity together if durable notification storage fails", async () => {
    const id = await project(), r = await proposal(id);
    vi.spyOn(notificationService, "create").mockRejectedValueOnce(new Error("Audit outbox storage failure"));
    await expect(allocations.decide(id, b, r.id, { decision: "APPROVE", explanation: "" })).rejects.toThrow("Audit outbox storage failure");
    expect(await db.allocationApproval.count({ where: { revisionId: r.id } })).toBe(0);
    expect(await db.projectActivity.count({ where: { entityId: r.id, type: "ALLOCATION_APPROVED" } })).toBe(0);
    expect((await allocations.detail(id, a, r.id)).status).toBe("AWAITING_APPROVAL");
  });
  it("keeps finalized consensus intact across mail failures, retries and ambiguous delivery", async () => {
    const id = await project(), r = await proposal(id);
    for (const userId of [a, b, c]) await allocations.decide(id, userId, r.id, { decision: "APPROVE", explanation: "" });
    const notification = await db.notification.findFirstOrThrow({ where: { targetUuid: id, userId: b, eventKey: { startsWith: "CONTRIBUTIONS:ALLOCATION_SUBMITTED:" } } });
    env.EMAIL_DELIVERY_MODE = "smtp";
    const sender = vi.spyOn(authMailService, "sendContributions").mockRejectedValueOnce(Object.assign(new Error("Synthetic refusal"), { code: "ECONNREFUSED" }));
    await expect(deliverContributionsEmail(notification.id)).rejects.toThrow("Synthetic refusal");
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).emailStatus).toBe("PENDING");
    expect((await allocations.detail(id, a, r.id)).status).toBe("FINALIZED");
    sender.mockResolvedValue(true);
    await Promise.all([deliverContributionsEmail(notification.id), deliverContributionsEmail(notification.id)]);
    expect(sender).toHaveBeenCalledTimes(2); // One refusal, one claimed retry, no duplicate send.
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).emailStatus).toBe("SENT");
    const ambiguous = await db.notification.findFirstOrThrow({ where: { targetUuid: id, userId: c, emailStatus: "PENDING" } });
    sender.mockRejectedValueOnce(Object.assign(new Error("Synthetic uncertain delivery"), { code: "ETIMEDOUT" }));
    await deliverContributionsEmail(ambiguous.id);
    expect((await db.notification.findUniqueOrThrow({ where: { id: ambiguous.id } })).emailStatus).toBe("UNCERTAIN");
    await deliverContributionsEmail(ambiguous.id); expect(sender).toHaveBeenCalledTimes(3);
  });
  it("aggregates only persisted activity consistently across midnight, paging and actor filters", async () => {
    const id = await project();
    for (const [userId, timestamp] of [[a, "2026-10-13T16:59:59Z"], [b, "2026-10-13T17:00:00Z"], [b, "2026-10-13T17:00:01Z"]]) {
      await db.projectActivity.create({ data: { projectId: id, actorId: userId!, type: "TASK_COMPLETED", createdAt: new Date(timestamp!), entityKind: "TASK", entityId: crypto.randomUUID() } });
    }
    const q = { from: "2026-10-13T00:00:00Z", to: "2026-10-14T23:59:59Z", timeZone: "Asia/Ho_Chi_Minh", page: 1, pageSize: 1 };
    const first = await activity.list(id, a, q), second = await activity.list(id, a, { ...q, page: 2 });
    expect(first.total).toBe(3); expect(first.hasNext).toBe(true); expect(first.items[0]!.id).not.toBe(second.items[0]!.id);
    expect(first.days).toEqual([{ day: "2026-10-13", count: 1 }, { day: "2026-10-14", count: 2 }]);
    const selected = await activity.list(id, a, { ...q, memberId: b, eventDay: "2026-10-14" });
    expect(selected.total).toBe(2); expect(selected.items.every(item => item.actor.id === b)).toBe(true);
    expect((await activity.list(id, a, { ...q, timeZone: "UTC" })).days).toEqual([{ day: "2026-10-13", count: 3 }]);
    // Seeded boundary fixtures test aggregation, not ingestion provenance.
  });
  it("executes F: rejects forged identities, guessed IDs, arbitrary statuses and mentor/admin privilege escalation over HTTP", async () => {
    const id = await project(), r = await proposal(id), w = await work.save(id, a, claim());
    await db.user.update({ where: { id: d }, data: { systemRole: "ADMIN" } });
    await db.academicProfile.update({ where: { userId: d }, data: { academicRole: "LECTURER", primaryPosition: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED" } });
    const request = await db.mentorshipRequest.create({ data: { projectId: id, mentorUserId: d, requestedBy: a, status: "ACCEPTED" } });
    await db.mentorRelationship.create({ data: { projectId: id, mentorUserId: d, sourceRequestId: request.id } });
    expect(r.roster.map(p => p.id)).not.toContain(d);
    async function headers(userId: string) {
      const sessionId = crypto.randomUUID();
      await db.refreshToken.create({ data: { userId, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
      return { Authorization: `Bearer ${tokenService.signAccessToken({ sub: userId, systemRole: userId === d ? "ADMIN" : "USER", sessionId }).token}`, "Content-Type": "application/json" };
    }
    const app = express(); app.use(express.json()); app.use("/projects", projectRouter); app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/projects/${id}/contributions`;
    const admin = await headers(d), member = await headers(b), owner = await headers(a);
    async function check(resource: string, expected: number, actorHeaders: typeof owner, method = "GET", body?: unknown) {
      const response = await fetch(`${origin}/${resource}`, { method, headers: actorHeaders, ...(body ? { body: JSON.stringify(body) } : {}) });
      expect(response.status, `${method} ${resource}`).toBe(expected);
    }
    try {
      for (const resource of ["work", `work/${w.id}`, `revisions/${r.id}`, `revisions/${r.id}/export`, `periods/${r.period.id}/history`]) await check(resource, 404, admin);
      await check(`revisions/${r.id}/decisions`, 404, admin, "POST", { decision: "APPROVE" });
      await check(`revisions/${r.id}/decisions`, 400, member, "POST", { decision: "APPROVE", userId: a });
      await check(`revisions/${r.id}`, 400, owner, "PATCH", { shares: shares(), rationale: "Forged final state from the browser", expectedVersion: 1, status: "FINALIZED" });
      await check(`work/${w.id}`, 403, member, "PATCH", { ...claim(b), clientKey: undefined, expectedVersion: 1, correctionReason: "Attempt editing another person's contribution" });
      await check("activity", 404, member, "POST", { actorId: a, count: 9999 });
      await check(`work/${w.id}`, 404, owner, "DELETE");
      await check(`revisions/${r.id}/finalize`, 404, owner, "POST", {});
      const other = await project();
      const cross = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/projects/${other}/contributions/revisions/${r.id}`, { headers: owner }); expect(cross.status).toBe(404);
      const expired = tokenService.signAccessToken({ sub: b, systemRole: "USER", sessionId: crypto.randomUUID() }).token;
      const noSession = await fetch(`${origin}/work`, { headers: { Authorization: `Bearer ${expired}` } }); expect(noSession.status).toBe(401);
      expect((await allocations.detail(id, a, r.id)).status).toBe("AWAITING_APPROVAL");
      expect(await db.allocationApproval.count({ where: { revisionId: r.id } })).toBe(0);
    } finally { server.close(); await once(server, "close"); await db.user.update({ where: { id: d }, data: { systemRole: "USER" } }); }
  });
  it("executes E for the actual section editor: saver identity, unchanged replay, deletion and immutable source revisions", async () => {
    const id = await project(), manuscript = await workspaceService.create({ projectId: id, name: "Team manuscript" }, a, "researcher");
    const largeDraft = Array.from({ length: 100 }, (_, n) => `Research line ${n}`).join("\n");
    const section = await workspaceService.createSection(manuscript._id, { title: "Methodology", content: largeDraft }, a, "researcher");
    const corrected = `${largeDraft}\nFive important methodology corrections by the team`;
    await workspaceService.updateSection(manuscript._id, section._id, { expectedVersion: 1, content: corrected }, b, "researcher");
    await expect(workspaceService.updateSection(manuscript._id, section._id, { expectedVersion: 1, content: corrected }, b, "researcher")).rejects.toMatchObject({ statusCode: 409 });
    await workspaceService.updateSection(manuscript._id, section._id, { expectedVersion: 2, content: corrected }, b, "researcher");
    await workspaceService.updateSection(manuscript._id, section._id, { expectedVersion: 2, content: "Replaced section; earlier source remains in revision history" }, a, "researcher");
    const events = await db.projectActivity.findMany({ where: { projectId: id, type: "MANUSCRIPT_REVISION_SAVED" }, orderBy: { createdAt: "asc" } });
    expect(events.map(e => e.actorId)).toEqual([a, b, a]);
    expect(events.map(e => e.artifactVersion)).toEqual([1, 2, 3]);
    expect(events.every(e => (e.metadata as { attribution: string }).attribution === "REVISION_SAVER_ONLY")).toBe(true);
    const revisions = await db.sectionRevision.findMany({ where: { sectionId: section.id }, orderBy: { version: "asc" } });
    expect(revisions[1]!.content).toBe(corrected); expect(revisions[1]!.changedById).toBe(b);
    expect(await db.allocationRevision.count({ where: { projectId: id } })).toBe(0);
    expect(await db.projectContributionProposal.count({ where: { projectId: id } })).toBe(0);
  });
  it("deduplicates research decision creation retries and preserves the original receipt after revisions", async () => {
    const id = await project(), input = { decision: "Use mixed methods", context: "Research interviews", alternatives: "Quantitative only", rationale: "The research question requires methodological triangulation", link: null, threadId: null, clientKey: crypto.randomUUID() };
    const [first, retry] = await Promise.all([discussions.saveDecision(id, a, input), discussions.saveDecision(id, a, input)]);
    expect(retry.id).toBe(first.id);
    await discussions.saveDecision(id, b, { ...input, rationale: "A revised methodological rationale", expectedVersion: 1 }, first.id);
    expect((await discussions.saveDecision(id, a, input)).id).toBe(first.id);
    await expect(discussions.saveDecision(id, a, { ...input, rationale: "Reused request key with different research terms" })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.projectActivity.count({ where: { projectId: id, type: "DECISION_RECORDED" } })).toBe(1);
  });
});
