import { beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { once } from "node:events";
import { createServer } from "node:http";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectService } from "../project.service.js";
import { allocationService as allocations } from "../allocation.service.js";
import { workContributionsService as work } from "../work-contributions.service.js";
import { contributionActivityService as activity } from "../contribution-activity.service.js";
import { projectTasksService as tasks } from "../project-tasks.service.js";
import { workspaceService } from "../../workspaces/workspace.service.js";
import { projectRouter } from "../project.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { hashOpaqueToken, tokenService } from "../../auth/token.service.js";

const isolated = process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test") && process.env.REDIS_URL === "redis://127.0.0.1:16389";
describe.skipIf(!isolated).sequential("contributions and unanimous allocation, disposable PostgreSQL", () => {
  const db = getPrisma(); let owner: string, member: string, peer: string, outsider: string;
  async function person(name: string) { const u = await db.user.create({ data: { fullName: name, email: `${name}-${crypto.randomUUID()}@example.org`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } }); await db.academicProfile.create({ data: { userId: u.id, primaryPosition: "RESEARCH_STAFF", academicRole: "RESEARCHER" } }); return u.id; }
  beforeAll(async () => { owner = await person("owner"); member = await person("member"); peer = await person("peer"); outsider = await person("outsider"); });
  async function project(single = false, third = false) { const p = await createProjectFixture({ data: { title: "Contribution test", ownerId: owner, visibility: "PUBLIC", status: "ACTIVE", createdAt: new Date(Date.now() - 86400000) } }); if (!single) await db.projectMember.create({ data: { projectId: p.id, userId: member } }); if (third) await db.projectMember.create({ data: { projectId: p.id, userId: peer } }); return p.id; }
  async function period(id: string) { return allocations.createPeriod(id, owner, { title: "Research phase", description: "Documented research work during this phase", scope: "Effort in methodology and analysis", periodStart: new Date(Date.now() - 86400000).toISOString(), periodEnd: new Date().toISOString(), clientKey: crypto.randomUUID() }); }
  const shares = (ids: string[]) => ids.map((id, index) => ({ userId: id, basisPoints: index === 0 ? 10000 : 0, rationale: index === 0 ? "Completed the phase work" : "No completed work in this scope; participant consent is required" }));
  async function submitted(id: string) { const p = await period(id); const r = await allocations.draft(id, owner, p.id, { shares: shares(p.roster.map(p => p.id)), rationale: "A negotiated distribution for this evaluation scope", clientKey: crypto.randomUUID() }); return allocations.submit(id, owner, r.id, r.draftVersion); }
  const claim = (ids = [owner]) => ({ title: "Offline methodology design", description: "Designed and documented the methodology outside LumiGap", source: "MANUAL" as const, workDate: new Date().toISOString(), participants: ids.map(userId => ({ userId, roles: ["METHODOLOGY" as const] })), evidence: "Team meeting notes and experimental protocol", evidenceRefs: [], clientKey: crypto.randomUUID() });
  it("persists offline/shared work, independent review, collaborator acknowledgement and immutable corrections", async () => {
    const id = await project(false, true), input = claim([owner, member]); const first = await work.save(id, owner, input); expect((await work.save(id, owner, input)).id).toBe(first.id);
    await expect(work.save(id, owner, { ...input, title: "Changed retry" })).rejects.toMatchObject({ statusCode: 409 });
    await work.submit(id, owner, first.id, 1);
    await expect(work.review(id, owner, first.id, { expectedVersion: 1, decision: "ACCEPT", note: "" })).rejects.toMatchObject({ statusCode: 403 });
    expect((await work.review(id, peer, first.id, { expectedVersion: 1, decision: "ACCEPT", note: "Compared the documented protocol" })).status).toBe("SUBMITTED");
    expect((await work.review(id, member, first.id, { expectedVersion: 1, decision: "ACKNOWLEDGE", note: "I designed the validation protocol" })).status).toBe("ACCEPTED");
    await expect(work.save(id, member, { ...claim([member]), expectedVersion: 1, correctionReason: "Owner cannot erase another claim" }, first.id)).rejects.toMatchObject({ statusCode: 403 });
    expect((await work.review(id, member, first.id, { expectedVersion: 1, decision: "DISPUTE", note: "The record omits my analysis work" })).status).toBe("DISPUTED");
    const corrected = await work.save(id, owner, { ...input, title: "Corrected shared methodology", clientKey: undefined, expectedVersion: 1, correctionReason: "Include collaborator analysis and validation work" }, first.id);
    expect(corrected.version).toBe(2); expect(corrected.reviews.length).toBe(3); expect(corrected.history.some(h => h.action === "DISPUTE")).toBe(true);
    await expect(db.projectContributionHistory.update({ where: { id: corrected.history[0]!.id }, data: { note: "erase" } })).rejects.toThrow();
  });
  it("keeps public-project work private and rejects cross-project evidence", async () => {
    const id = await project(), other = await project(); const task = await db.projectTask.create({ data: { projectId: other, title: "Private task", createdById: owner, clientKey: crypto.randomUUID() } });
    await expect(work.list(id, outsider, { page: 1, pageSize: 20, q: "", filter: "TEAM" })).rejects.toMatchObject({ statusCode: 404 });
    const draft = await db.draftWorkspace.create({ data: { projectId: other, name: "Private manuscript", createdById: owner } });
    await expect(work.save(id, owner, { ...claim(), evidenceRefs: [{ kind: "MANUSCRIPT", id: draft.id }] })).rejects.toMatchObject({ statusCode: 400 }); expect(task.id).toBeTruthy();
    await expect(work.save(id, owner, { ...claim(), evidenceRefs: [{ kind: "TASK", id: task.id }] })).rejects.toMatchObject({ statusCode: 400 });
    const ownTask = await db.projectTask.create({ data: { projectId: id, title: "Team deliverable", createdById: owner, clientKey: crypto.randomUUID() } });
    expect((await work.save(id, owner, { ...claim(), evidenceRefs: [{ kind: "TASK", id: ownTask.id }] })).evidenceRefs).toEqual([{ kind: "TASK", id: ownTask.id }]);
    await expect(work.save(id, owner, { ...claim([outsider]) })).rejects.toMatchObject({ statusCode: 400 });
  });
  it("retains membership intervals on removal, rejoin and ownership transfer", async () => {
    const id = await project(); await projectService.removeMemberFromProject(id, member, owner);
    const before = await db.projectMembershipPeriod.findMany({ where: { projectId: id, userId: member } }); expect(before).toHaveLength(1); expect(before[0]!.leftAt).not.toBeNull();
    await db.projectMember.update({ where: { projectId_userId: { projectId: id, userId: member } }, data: { status: "ACTIVE" } }); expect(await db.projectMembershipPeriod.count({ where: { projectId: id, userId: member } })).toBe(2);
    await projectService.transferOwnership(id, member, owner); expect((await db.project.findUniqueOrThrow({ where: { id } })).ownerId).toBe(member);
    expect((await periodForNewOwner(id)).roster.map(p => p.id)).toContain(owner);
  });
  async function periodForNewOwner(id: string) { return allocations.createPeriod(id, member, { title: "Transferred phase", description: "History across owner transfer", scope: "Research effort before and after transfer", periodStart: new Date(Date.now() - 86400000).toISOString(), periodEnd: new Date().toISOString(), clientKey: crypto.randomUUID() }); }
  it("includes departed members and restricts their access to allocation summaries", async () => {
    const id = await project(), c = await work.save(id, owner, claim()); await work.submit(id, owner, c.id, 1);
    await projectService.removeMemberFromProject(id, member, owner); const p = await period(id); expect(p.roster.map(p => p.id)).toContain(member);
    const draft = await allocations.draft(id, owner, p.id, { shares: shares(p.roster.map(p => p.id)), rationale: "A negotiated distribution preserving former participants", clientKey: crypto.randomUUID() });
    await expect(allocations.detail(id, member, draft.id)).rejects.toMatchObject({ statusCode: 404 });
    const r = await allocations.submit(id, owner, draft.id, 1); expect((await allocations.detail(id, member, r.id)).evidenceSummary[0]!.title).toBe(c.title);
    await expect(work.list(id, member, { page: 1, pageSize: 20, q: "", filter: "TEAM" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(activity.list(id, member, { from: p.periodStart, to: p.periodEnd, timeZone: "UTC", page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 404 });
    expect((await allocations.decide(id, member, r.id, { decision: "APPROVE", explanation: "" })).status).toBe("AWAITING_APPROVAL");
    expect((await allocations.decide(id, owner, r.id, { decision: "APPROVE", explanation: "" })).status).toBe("FINALIZED");
  });
  it("never counts submission as owner approval and serializes concurrent final approvals", async () => {
    const id = await project(), r = await submitted(id); expect(r.approvals).toHaveLength(0);
    await expect(db.allocationRevision.update({ where: { id: r.id }, data: { status: "FINALIZED", finalizedAt: new Date() } })).rejects.toThrow();
    const results = await Promise.all([allocations.decide(id, owner, r.id, { decision: "APPROVE", explanation: "" }), allocations.decide(id, member, r.id, { decision: "APPROVE", explanation: "" }), allocations.decide(id, member, r.id, { decision: "APPROVE", explanation: "" })]);
    expect(results.some(row => row.status === "FINALIZED")).toBe(true); const final = await allocations.detail(id, owner, r.id); expect(final.approvals).toHaveLength(2);
    expect(await db.projectActivity.count({ where: { projectId: id, type: "ALLOCATION_FINALIZED" } })).toBe(1);
    expect(await db.notification.count({ where: { targetUuid: id, type: "PROJECT_ALLOCATION_UPDATE", eventKey: { contains: "ALLOCATION_SUBMITTED" } } })).toBe(1);
  });
  it("rejects omitted, duplicate and invalid shares, and immutable submitted payload edits", async () => {
    const id = await project(), p = await period(id), roster = p.roster.map(p => p.id);
    await expect(allocations.draft(id, owner, p.id, { shares: shares([owner]), rationale: "An exclusion attempt", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(allocations.draft(id, member, p.id, { shares: shares(roster), rationale: "Unauthorized proposal", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
    const draft = await allocations.draft(id, owner, p.id, { shares: shares(roster).map(s => ({ ...s, basisPoints: 1 })), rationale: "A valid rationale but invalid total", clientKey: crypto.randomUUID() });
    await expect(allocations.submit(id, owner, draft.id, 1)).rejects.toMatchObject({ statusCode: 400 });
    const edited = await allocations.edit(id, owner, draft.id, { shares: shares(roster), rationale: "A discussed effort distribution for this period", expectedVersion: 1 }); const r = await allocations.submit(id, owner, draft.id, edited.draftVersion);
    await expect(allocations.edit(id, owner, r.id, { shares: shares(roster), rationale: "Silent replacement", expectedVersion: r.draftVersion })).rejects.toMatchObject({ statusCode: 409 });
    await expect(db.allocationShare.update({ where: { revisionId_userId: { revisionId: r.id, userId: owner } }, data: { basisPoints: 9000 } })).rejects.toThrow();
    await expect(db.allocationRevision.update({ where: { id: r.id }, data: { rationale: "Silent edit" } })).rejects.toThrow();
    await expect(allocations.decide(await project(), owner, r.id, { decision: "APPROVE", explanation: "" })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("preserves disputes, resets consent on revisions and retains superseded finalizations", async () => {
    const id = await project(), r = await submitted(id); await allocations.decide(id, owner, r.id, { decision: "APPROVE", explanation: "" });
    const disputed = await allocations.decide(id, member, r.id, { decision: "DISPUTE", explanation: "The distribution misses my methodology design" }); expect(disputed.status).toBe("DISPUTED");
    const p = disputed.period, newRevision = await allocations.draft(id, owner, p.id, { shares: shares(p.roster.map(p => p.id)), rationale: "A revised distribution addressing the recorded concern", clientKey: crypto.randomUUID() });
    expect(newRevision.approvals).toHaveLength(0); expect(newRevision.revision).toBe(2); await allocations.submit(id, owner, newRevision.id, 1);
    await allocations.decide(id, owner, newRevision.id, { decision: "APPROVE", explanation: "" }); await allocations.decide(id, member, newRevision.id, { decision: "APPROVE", explanation: "" });
    const amendment = await allocations.draft(id, owner, p.id, { shares: shares(p.roster.map(p => p.id)), rationale: "An explicitly negotiated amendment to the final agreement", clientKey: crypto.randomUUID() }); await allocations.submit(id, owner, amendment.id, 1);
    await allocations.decide(id, owner, amendment.id, { decision: "APPROVE", explanation: "" }); await allocations.decide(id, member, amendment.id, { decision: "APPROVE", explanation: "" });
    const history = await allocations.history(id, member, p.id); expect(history.map(h => h.status)).toEqual(["FINALIZED", "SUPERSEDED", "DISPUTED"]); expect(history[1]!.finalizedAt).not.toBeNull(); expect((await allocations.export(id, member, history[1]!.id)).status).toBe("SUPERSEDED");
  });
  it("makes roster challenges explicit and prevents consent after a material eligibility change", async () => {
    const id = await project(), r = await submitted(id); await allocations.challenge(id, member, r.period.id, { revisionId: r.id, explanation: "The roster includes the wrong evaluation scope" }); expect((await allocations.detail(id, owner, r.id)).rosterChallenges).toHaveLength(1);
    await expect(allocations.decide(id, owner, r.id, { decision: "APPROVE", explanation: "" })).rejects.toMatchObject({ statusCode: 409 });
    const another = await project(), pending = await submitted(another);
    await db.projectMember.create({ data: { projectId: another, userId: peer, joinedAt: new Date(Date.now() - 10000) } });
    expect((await allocations.decide(another, owner, pending.id, { decision: "APPROVE", explanation: "" })).status).toBe("DISPUTED");
  });
  it("labels single-member work and allocation as self-recorded and requires a separate decision", async () => {
    const id = await project(true), c = await work.save(id, owner, claim()); expect((await work.submit(id, owner, c.id, 1)).status).toBe("SELF_RECORDED");
    const r = await submitted(id); expect(r.status).toBe("AWAITING_APPROVAL"); expect(r.selfAcknowledged).toBe(true); expect((await allocations.decide(id, owner, r.id, { decision: "APPROVE", explanation: "" })).status).toBe("FINALIZED");
  });
  it("allows shared self-recording when all team members are named, without inventing an independent reviewer", async () => {
    const id = await project(), c = await work.save(id, owner, claim([owner, member])); await work.submit(id, owner, c.id, 1);
    expect((await work.review(id, member, c.id, { expectedVersion: 1, decision: "ACKNOWLEDGE", note: "I acknowledge my methodology contribution" })).status).toBe("SELF_RECORDED");
  });
  it("lets a departed named contributor challenge only their record without restoring project evidence access", async () => {
    const id = await project(), c = await work.save(id, owner, claim([owner, member])); await work.submit(id, owner, c.id, 1); await projectService.removeMemberFromProject(id, member, owner);
    const detail = await work.detail(id, member, c.id); expect(detail.evidenceRefs).toEqual([]); expect(detail.viewerId).toBe(member);
    const result = await work.review(id, member, c.id, { expectedVersion: 1, decision: "DISPUTE", note: "My role in the recorded work is incorrect" }); expect(result.status).toBe("DISPUTED"); expect(result.evidenceRefs).toEqual([]);
    await expect(work.detail(id, outsider, c.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("preserves a removed collaborator's scoped challenge access across a correction", async () => {
    const id = await project(), task = await tasks.save(id, owner, { title: "Private methodology protocol", description: "Protocol deliverable", status: "DONE", blockedReason: "", assigneeId: owner, milestoneId: null, dueAt: null, link: null, clientKey: crypto.randomUUID() });
    const input = { ...claim([owner, member]), evidenceRefs: [{ kind: "TASK" as const, id: task.id }] };
    const c = await work.save(id, owner, input); await work.submit(id, owner, c.id, 1);
    await work.review(id, member, c.id, { expectedVersion: 1, decision: "ACKNOWLEDGE", note: "I acknowledge my methodology work" });
    await projectService.removeMemberFromProject(id, member, owner);
    await work.save(id, owner, { ...input, participants: [{ userId: owner, roles: ["METHODOLOGY"] }], clientKey: undefined, expectedVersion: 1, correctionReason: "Correct the participant attribution with a visible history" }, c.id);
    const detail = await work.detail(id, member, c.id);
    expect(detail.participants.map(p => p.userId)).toEqual([owner]); expect(detail.evidenceRefs).toEqual([]);
    expect(detail.history.some(h => (h.snapshot as { participants?: { userId: string }[] }).participants?.some(p => p.userId === member))).toBe(true);
    expect(detail.history.every(h => !("evidenceRefs" in (h.snapshot as object)))).toBe(true);
    expect(await db.notification.count({ where: { userId: member, eventKey: `CONTRIBUTIONS:CORRECTED:${c.id}:2:${member}` } })).toBe(1);
    await work.submit(id, owner, c.id, 2);
    expect((await work.detail(id, member, c.id)).reviewActions).toEqual(["NEEDS_CHANGES", "DISPUTE"]);
    await expect(work.review(id, member, c.id, { expectedVersion: 2, decision: "ACCEPT", note: "" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(work.review(id, member, c.id, { expectedVersion: 2, decision: "ACKNOWLEDGE", note: "" })).rejects.toMatchObject({ statusCode: 403 });
    expect((await work.review(id, member, c.id, { expectedVersion: 2, decision: "DISPUTE", note: "The correction wrongly removes my methodology attribution" })).status).toBe("DISPUTED");
    await expect(work.list(id, member, { filter: "TEAM", page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(work.detail(id, outsider, c.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("retains historical submitted work in eligibility even when a correction removes its contributor and date", async () => {
    const id = await project(); await projectService.removeMemberFromProject(id, member, owner);
    const start = new Date().toISOString(), c = await work.save(id, owner, claim([owner, member])); await work.submit(id, owner, c.id, 1);
    await work.review(id, member, c.id, { expectedVersion: 1, decision: "ACKNOWLEDGE", note: "Acknowledged methodology developed after departure" });
    const p = await allocations.createPeriod(id, owner, { title: "Post-departure methodology", description: "A defined scope following membership departure", scope: "Documented methodology contributions", periodStart: start, periodEnd: new Date().toISOString(), clientKey: crypto.randomUUID() });
    expect(p.roster.find(p => p.id === member)?.reasons).toEqual(["DOCUMENTED_TEAM_WORK"]);
    const r = await allocations.draft(id, owner, p.id, { shares: shares(p.roster.map(p => p.id)), rationale: "Former participant consent remains necessary", clientKey: crypto.randomUUID() }); await allocations.submit(id, owner, r.id, 1);
    await allocations.decide(id, owner, r.id, { decision: "APPROVE", explanation: "" });
    await work.save(id, owner, { ...claim(), expectedVersion: 1, correctionReason: "Revise the attribution and date with preserved submitted history" }, c.id);
    expect((await allocations.period(id, owner, p.id)).roster.find(p => p.id === member)?.reasons).toEqual(["DOCUMENTED_TEAM_WORK"]);
    expect((await allocations.decide(id, member, r.id, { decision: "APPROVE", explanation: "" })).status).toBe("FINALIZED");
  });
  it("keeps frozen consent required after departure and blocks archived or unavailable actors", async () => {
    const id = await project(), r = await submitted(id); await projectService.removeMemberFromProject(id, member, owner);
    expect((await allocations.detail(id, member, r.id)).roster.map(p => p.id)).toContain(member);
    await allocations.decide(id, owner, r.id, { decision: "APPROVE", explanation: "" }); expect((await allocations.detail(id, owner, r.id)).status).toBe("AWAITING_APPROVAL");
    await projectService.archiveProject(id, owner); expect((await allocations.detail(id, member, r.id)).canChallengeRoster).toBe(false); await expect(allocations.decide(id, member, r.id, { decision: "APPROVE", explanation: "" })).rejects.toMatchObject({ statusCode: 409 });
    const another = await project(), pending = await submitted(another); await db.user.update({ where: { id: member }, data: { isActive: false } });
    try { await expect(allocations.decide(another, member, pending.id, { decision: "APPROVE", explanation: "" })).rejects.toMatchObject({ statusCode: 401 }); expect((await allocations.decide(another, owner, pending.id, { decision: "APPROVE", explanation: "" })).status).toBe("AWAITING_APPROVAL"); } finally { await db.user.update({ where: { id: member }, data: { isActive: true } }); }
  });
  it("omits unrelated mentors/reviewers from the core-team denominator and refuses their decisions", async () => {
    const id = await project(), r = await submitted(id); expect(r.roster.map(p => p.id)).not.toContain(peer);
    await expect(allocations.draft(id, peer, r.period.id, { shares: shares(r.roster.map(p => p.id)), rationale: "Mentor cannot assign percentages", clientKey: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
    await expect(allocations.decide(id, peer, r.id, { decision: "APPROVE", explanation: "" })).rejects.toMatchObject({ statusCode: 404 });
  });
  it("records task completion and manuscript saver provenance without autosave effort points", async () => {
    const id = await project(); const data = { title: "Research synthesis", description: "Synthesis deliverable", status: "DONE" as const, blockedReason: "", assigneeId: member, milestoneId: null, dueAt: null, link: null, clientKey: crypto.randomUUID() };
    await tasks.save(id, member, data); await tasks.save(id, member, data); expect(await db.projectActivity.count({ where: { projectId: id, type: "TASK_COMPLETED" } })).toBe(1);
    const ws = await workspaceService.create({ projectId: id, name: "Research manuscript" }, owner, "researcher"); const section = await workspaceService.createSection(ws._id, { title: "Methodology", content: "Shared methodology outline" }, owner, "researcher");
    await workspaceService.updateSection(ws._id, section._id, { expectedVersion: 1, content: section.content }, owner, "researcher");
    await workspaceService.updateSection(ws._id, section._id, { expectedVersion: 1, content: "Shared methodology, revised approach" }, member, "researcher");
    const events = await db.projectActivity.findMany({ where: { projectId: id, type: "MANUSCRIPT_REVISION_SAVED" } }); expect(events).toHaveLength(2); expect(events[1]!.metadata).toMatchObject({ attribution: "REVISION_SAVER_ONLY" });
    const result = await activity.list(id, owner, { from: new Date(Date.now() - 86400000).toISOString(), to: new Date().toISOString(), timeZone: "Asia/Ho_Chi_Minh", page: 1, pageSize: 20 }); expect(result.items.some(e => e.category === "MANUSCRIPT")).toBe(true); expect(result.items.some(e => e.category === "TASK")).toBe(true); expect(result.items.every(e => !("metadata" in e))).toBe(true);
    const filtered = await activity.list(id, owner, { from: new Date(Date.now() - 86400000).toISOString(), to: new Date().toISOString(), timeZone: "UTC", memberId: member, category: "TASK", eventDay: new Date().toISOString().slice(0, 10), page: 1, pageSize: 1 }); expect(filtered.total).toBe(1); expect(filtered.items[0]!.actor.id).toBe(member); expect(filtered.items[0]!.link?.kind).toBe("TASK");
  });
  it("enforces authenticated actors and strict DTOs through real HTTP endpoints", async () => {
    const id = await project(), r = await submitted(id), app = express(); app.use(express.json()); app.use("/projects", projectRouter); app.use(errorHandler); const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening"); const port = (server.address() as { port: number }).port;
    const sessionId = crypto.randomUUID(); await db.refreshToken.create({ data: { userId: member, familyId: sessionId, tokenHash: hashOpaqueToken(crypto.randomUUID()), expiresAt: new Date(Date.now() + 3600000) } }); const token = tokenService.signAccessToken({ sub: member, systemRole: "USER", sessionId }).token;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    try {
      const forged = await fetch(`http://127.0.0.1:${port}/projects/${id}/contributions/revisions/${r.id}/decisions`, { method: "POST", headers, body: JSON.stringify({ decision: "APPROVE", userId: owner }) }); expect(forged.status).toBe(400);
      const approved = await fetch(`http://127.0.0.1:${port}/projects/${id}/contributions/revisions/${r.id}/decisions`, { method: "POST", headers, body: JSON.stringify({ decision: "APPROVE" }) }); expect(approved.status).toBe(200); expect((await approved.json()).data.approvals[0].userId).toBe(member);
      const fakeActivity = await fetch(`http://127.0.0.1:${port}/projects/${id}/contributions/activity`, { method: "POST", headers, body: JSON.stringify({ actorUserId: owner, count: 1000 }) }); expect(fakeActivity.status).toBe(404);
      const anonymous = await fetch(`http://127.0.0.1:${port}/projects/${id}/contributions/work`); expect(anonymous.status).toBe(401);
    } finally { server.close(); await once(server, "close"); }
  });
});
