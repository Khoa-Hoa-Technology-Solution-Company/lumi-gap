import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectMentorshipService as service } from "../project-mentorship.service.js";
import { mentorPlanService } from "../mentor-plan.service.js";
import { canAccessProjectAsMentor } from "../academic-relationship-access.js";
import { projectRouter } from "../project.routes.js";
import { manuscriptRouter } from "../../workspaces/manuscript.routes.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { requestMentorshipSchema } from "../project-mentorship.controller.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { mentorRolesService } from "../mentor-roles.service.js";

vi.mock("../../../infrastructure/queue.js", () => {
  const queue = () => ({ add: vi.fn().mockResolvedValue({}), getJob: vi.fn().mockResolvedValue(null) });
  return { QUEUE_NAMES: {}, notificationQueue: queue(), aiJobsQueue: queue(), apiSyncQueue: queue(), openAlexIngestQueue: queue(), corpusValidationQueue: queue(), embeddingQueue: queue(), paperAnalysisQueue: queue(), reportQueue: queue(), gapsQueue: queue(), taggingQueue: queue(), topicBackfillQueue: queue(), manuscriptCompileQueue: queue(), communitySummaryQueue: queue(), hasLiveJob: vi.fn().mockResolvedValue(false) };
});
const enabled = process.env.MENTOR_WORKSPACE_INTEGRATION === "1";
if (enabled && !/^codex_mentor_workspace_[a-f0-9]{12}_test$/.test(new URL(process.env.DATABASE_URL!).pathname.slice(1))) throw new Error("Isolated supervisor database required");
describe.skipIf(!enabled).sequential("supervisor discovery and invitation", () => {
  const db = getPrisma(); afterAll(disconnectPostgres);
  async function user(lecturer = false, name?: string) {
    const row = await db.user.create({ data: { fullName: name ?? (lecturer ? "Dr. Lecturer" : "Student researcher"), email: `${randomUUID()}@supervisor.invalid`, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date(), institution: "Research University", researchInterests: ["Evidence synthesis"] } });
    await db.academicProfile.create({ data: { userId: row.id, academicRole: lecturer ? "LECTURER" : "STUDENT", primaryPosition: lecturer ? "LECTURER" : "STUDENT", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionTitle: lecturer ? "Lecturer" : "Student", expertiseAreas: ["Computer Science"], researchKeywords: ["Clinical evaluation"], skills: ["PyTorch"], supportAvailability: { enabled: lecturer, preferredTopics: ["Medical image analysis"] } } }); return row;
  }
  async function fixture() {
    const owner = await user(), member = await user(), mentor = await user(true), other = await user(true);
    const p = await createProjectFixture({ data: { ownerId: owner.id, title: "Evidence-based research methods", researchField: "Computer Science", researchAreas: ["Medical image analysis", "Clinical evaluation"], description: "PRIVATE ORIGINAL GOAL: Compare reproducible methods in clinical image analysis with a baseline and documented evaluation protocol.", visibility: "PRIVATE", status: "ACTIVE" } });
    await db.projectMember.create({ data: { projectId: p.id, userId: member.id } }); return { owner, member, mentor, other, p };
  }
  const input = (mentorUserId: string) => ({ mentorUserId, mentorRole: "UNASSIGNED" as const, message: "Your work in medical image analysis aligns with our study. We need guidance on evaluation methods.", idempotencyKey: randomUUID(), dossier: { researchSummary: "Our team compares reproducible methods for clinical image analysis. We are preparing a literature review and need guidance on study design and evaluation.", sharingConfirmed: true as const, additionalMessage: "We would welcome an introductory meeting.", expectations: { supportAreas: ["RESEARCH_METHODOLOGY"], expectedPeriod: "2026-12-01" }, shareRepresentativeProfile: false, shareRepresentativeLinks: false, shareRepresentativeWorks: false, shareTeamOverview: false, shareCompetencies: false } });
  async function auth(id: string) { const sessionId = randomUUID(); await db.refreshToken.create({ data: { userId: id, familyId: sessionId, tokenHash: hashOpaqueToken(randomUUID()), expiresAt: new Date(Date.now() + 3600000) } }); return { Authorization: `Bearer ${tokenService.signAccessToken({ sub: id, systemRole: "USER", sessionId }).token}`, "Content-Type": "application/json" }; }
  async function http() { const app = express(); app.use(express.json()); app.use("/projects/:projectId/manuscripts", manuscriptRouter); app.use("/projects", projectRouter); app.use(errorHandler); const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}/projects` }; }

  it("searches names, verified account email, institution, fields, keywords, skills and preferred topics without leaking private fields", async () => {
    const f = await fixture();
    for (const q of [f.mentor.fullName, f.mentor.email, "Research University", "Computer Science", "Clinical evaluation", "PyTorch", "Medical image analysis"]) expect((await service.mentors(f.p.id, f.owner.id, { q })).items.some(r => r._id === f.mentor.id)).toBe(true);
    const result = await service.mentors(f.p.id, f.owner.id, { q: f.mentor.email }); expect(result.items[0]?.matchedTerms).toContain("Computer Science"); expect(JSON.stringify(result)).not.toContain(f.mentor.email);
    await db.academicProfile.update({ where: { userId: f.mentor.id }, data: { privacySettings: { expertise: "PRIVATE", researchInterests: "PRIVATE" } } });
    expect((await service.mentors(f.p.id, f.owner.id, { q: "PyTorch" })).items.some(r => r._id === f.mentor.id)).toBe(false);
    expect((await service.mentors(f.p.id, f.owner.id, { q: f.mentor.email })).items[0]?.matchedTerms).toEqual([]);
    await db.academicProfile.update({ where: { userId: f.mentor.id }, data: { positionStatus: "NOT_SUBMITTED" } }); expect((await service.mentors(f.p.id, f.owner.id, { q: f.mentor.email })).items).toEqual([]);
  });
  it("labels demo profiles and excludes unavailable lecturers", async () => {
    const f = await fixture(); await db.user.update({ where: { id: f.mentor.id }, data: { fullName: "TS. Demo Lecturer (Demo)" } });
    expect((await service.mentors(f.p.id, f.owner.id, { q: f.mentor.email })).items[0]?.isDemo).toBe(true);
    await db.academicProfile.update({ where: { userId: f.mentor.id }, data: { supportAvailability: { enabled: false } } }); expect((await service.mentors(f.p.id, f.owner.id, { q: f.mentor.email })).items).toEqual([]);
  });
  it("autofills private owner-only defaults and sends a separate frozen invitation summary without modifying the project", async () => {
    const f = await fixture();
    await db.researchPlan.upsert({ where: { projectId: f.p.id }, create: { projectId: f.p.id, searchStrategy: "PyTorch, Clinical evaluation", updatedById: f.owner.id }, update: { searchStrategy: "PyTorch, Clinical evaluation" } });
    const before = await service.settings(f.p.id, f.owner.id); expect(before.invitationDefaults?.summary).toBe(f.p.description); expect(before.invitationDefaults?.keywords).toContain("PyTorch"); expect(before.invitationDefaults?.researchField).toBe("Computer Science");
    expect((await service.mentors(f.p.id, f.owner.id, { q: f.mentor.email })).items[0]?.matchedTerms).toContain("PyTorch");
    await expect(service.settings(f.p.id, f.mentor.id)).rejects.toMatchObject({ statusCode: 403 });
    const request = await service.request(f.p.id, f.owner.id, input(f.mentor.id));
    const incoming = await service.requestDetail(f.p.id, request.id, f.mentor.id); expect(incoming.project.summary).toBe(input(f.mentor.id).dossier.researchSummary); expect(incoming.dossier?.additionalMessage).toBe("We would welcome an introductory meeting.");
    expect(JSON.stringify(incoming)).not.toContain("PRIVATE ORIGINAL GOAL"); expect(incoming.dossier?.expectations.supportAreas).toEqual(["RESEARCH_METHODOLOGY"]);
    await db.project.update({ where: { id: f.p.id }, data: { title: "Updated private title", description: "PRIVATE NEW DATA", mentorshipSummary: "New discovery summary" } });
    const frozen = await service.requestDetail(f.p.id, request.id, f.mentor.id); expect(frozen.project.title).toBe(f.p.title); expect(frozen.project.summary).toBe(incoming.project.summary); expect(frozen.dossier?.project.abstract).toBe(incoming.project.summary);
    expect((await db.project.findUniqueOrThrow({ where: { id: f.p.id } })).visibility).toBe("PRIVATE");
  });
  it("invites directly without a shortlist, full-plan capacity or candidate ordering barrier", async () => {
    const f = await fixture();
    for (const lecturer of [f.other, await user(true), await user(true), await user(true)]) await mentorPlanService.change(f.p.id, f.owner.id, { action: "add", mentorUserId: lecturer.id, mentorRole: "PRIMARY", expectedVersion: (await mentorPlanService.read(f.p.id, f.owner.id)).version });
    const before = await mentorPlanService.read(f.p.id, f.owner.id); const request = await service.request(f.p.id, f.owner.id, input(f.mentor.id)); expect(request.status).toBe("PENDING"); expect((await mentorPlanService.read(f.p.id, f.owner.id)).candidates).toHaveLength(before.candidates.length);
    expect(await db.mentorshipRequest.count({ where: { projectId: f.p.id } })).toBe(1);
  });
  it("is idempotent under simultaneous send and accept, notifies once and creates a relationship rather than a project team membership", async () => {
    const f = await fixture(), body = input(f.mentor.id); const [a, b] = await Promise.all([service.request(f.p.id, f.owner.id, body), service.request(f.p.id, f.owner.id, body)]); expect(a.id).toBe(b.id);
    expect(await db.notification.count({ where: { eventKey: `MENTORSHIP_REQUEST_RECEIVED:${a.id}:${f.mentor.id}` } })).toBe(1);
    expect(await canAccessProjectAsMentor(f.p.id, f.mentor.id)).toBe(false); expect((await service.mentors(f.p.id, f.owner.id, { q: f.mentor.email })).items[0]?.mentorshipStatus).toBe("PENDING");
    const [accepted, retried] = await Promise.all([service.accept(f.p.id, a.id, f.mentor.id), service.accept(f.p.id, a.id, f.mentor.id)]); expect(accepted.status).toBe("ACCEPTED"); expect(retried.id).toBe(a.id); expect(await db.mentorRelationship.count({ where: { projectId: f.p.id, mentorUserId: f.mentor.id } })).toBe(1);
    expect(await db.projectMember.count({ where: { projectId: f.p.id, userId: f.mentor.id } })).toBe(0); expect(await canAccessProjectAsMentor(f.p.id, f.mentor.id)).toBe(true); expect((await service.mentors(f.p.id, f.owner.id, { q: f.mentor.email })).items[0]?.mentorshipStatus).toBe("ACTIVE");
    expect(await db.reviewRequest.count({ where: { projectId: f.p.id } })).toBe(0); expect(await db.projectTask.count({ where: { projectId: f.p.id } })).toBe(0); await expect(service.request(f.p.id, f.owner.id, input(f.mentor.id))).rejects.toMatchObject({ statusCode: 409 });
    const changed = structuredClone(body); changed.dossier.researchSummary += " Changed"; await expect(service.request(f.p.id, f.owner.id, changed)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("reject and cancel never grant access; new invitations have no automatic expiry and archive rules remain effective", async () => {
    const f = await fixture(), request = await service.request(f.p.id, f.owner.id, input(f.mentor.id)); expect(request.expiresAt).toBeUndefined();
    await service.decline(f.p.id, request.id, f.mentor.id); expect(await canAccessProjectAsMentor(f.p.id, f.mentor.id)).toBe(false);
    const next = await service.request(f.p.id, f.owner.id, input(f.other.id)); await service.cancel(f.p.id, next.id, f.owner.id); expect(await canAccessProjectAsMentor(f.p.id, f.other.id)).toBe(false);
    await db.project.update({ where: { id: f.p.id }, data: { status: "ARCHIVED" } }); await expect(service.request(f.p.id, f.owner.id, input((await user(true)).id))).rejects.toMatchObject({ statusCode: 409 });
    await db.project.update({ where: { id: f.p.id }, data: { deletedAt: new Date(), deletedById: f.owner.id, purgeAt: new Date(Date.now() + 30 * 86400000) } }); await expect(service.request(f.p.id, f.owner.id, input((await user(true)).id))).rejects.toMatchObject({ statusCode: 404 });
  });
  it("rejects incomplete new invitation DTOs, missing consent and forged identities through real HTTP", async () => {
    const f = await fixture(), app = await http(), body = input(f.mentor.id), headers = await auth(f.owner.id), base = `${app.base}/${f.p.id}/mentorships`;
    try {
      for (const value of [{ ...body, dossier: undefined }, { ...body, message: "" }, { ...body, dossier: { ...body.dossier, researchSummary: "" } }, { ...body, dossier: { ...body.dossier, sharingConfirmed: false } }, { ...body, dossier: { ...body.dossier, researchSummary: "test" } }, { ...body, senderId: f.member.id }]) expect((await fetch(base, { method: "POST", headers, body: JSON.stringify(value) })).status).toBe(400);
      expect((await fetch(base, { method: "POST", headers: await auth(f.member.id), body: JSON.stringify(body) })).status).toBe(403);
      const response = await fetch(base, { method: "POST", headers, body: JSON.stringify(body) }); expect(response.status).toBe(201);
      const request = (await response.json()).data;
      const pendingHeaders = await auth(f.mentor.id);
      for (const path of ["/team-chat", "/manuscripts", "/tasks", "/research/evidence"]) {
        expect((await fetch(`${app.base}/${f.p.id}${path}`, { headers })).status, `owner ${path}`).toBe(200);
        expect([403, 404], `pending ${path}`).toContain((await fetch(`${app.base}/${f.p.id}${path}`, { headers: pendingHeaders })).status);
      }
      expect((await service.mine(f.mentor.id, { view: "incoming" })).requests.some(r => r.id === request.id)).toBe(true);
      const foreign = await fixture(); expect((await fetch(`${app.base}/${foreign.p.id}/mentorships/${request.id}`, { headers: pendingHeaders })).status).toBe(404);
      expect(requestMentorshipSchema.safeParse(body).success).toBe(true);
    } finally { app.server.closeAllConnections(); app.server.close(); await once(app.server, "close"); }
  });
  it("allows independent pending invitations, no default expiry and only two concurrent acceptances", async () => {
    const f = await fixture(), third = await user(true);
    const requests = await Promise.all([f.mentor, f.other, third].map(m => service.request(f.p.id, f.owner.id, { ...input(m.id), message: "Please guide our methods.", dossier: { ...input(m.id).dossier, researchSummary: "Study clinical AI.", expectations: { supportAreas: [] } } })));
    expect(requests.every(r => r.mentorRole === "UNASSIGNED" && !r.expiresAt)).toBe(true);
    await db.mentorshipRequest.updateMany({ where: { projectId: f.p.id }, data: { createdAt: new Date(Date.now() - 20 * 86400000) } });
    await service.expireRequests(); expect(await db.mentorshipRequest.count({ where: { projectId: f.p.id, status: "PENDING" } })).toBe(3);
    const results = await Promise.allSettled(requests.map((r, i) => service.accept(f.p.id, r.id, [f.mentor, f.other, third][i]!.id)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(2);
    expect(await db.mentorRelationship.count({ where: { projectId: f.p.id, status: "ACTIVE", mentorRole: "UNASSIGNED" } })).toBe(2);
    expect(await db.mentorshipRequest.count({ where: { projectId: f.p.id, status: "PENDING" } })).toBe(1);
    expect(await db.projectMember.count({ where: { projectId: f.p.id, userId: { in: [f.mentor.id, f.other.id, third.id] } } })).toBe(0);
  });
  it("preserves historical named invitations and their explicit expiry without rewriting their snapshots", async () => {
    const f = await fixture();
    const old = await db.mentorshipRequest.create({ data: { projectId: f.p.id, mentorUserId: f.mentor.id, requestedBy: f.owner.id, mentorRole: "PRIMARY", message: "Historical invitation", expiresAt: new Date(Date.now() - 1000), invitationSnapshot: { historical: true }, createdAt: new Date(Date.now() - 7 * 86400000) } });
    await service.expireRequests();
    expect(await db.mentorshipRequest.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: "EXPIRED", mentorRole: "PRIMARY", message: old.message, createdAt: old.createdAt, expiresAt: old.expiresAt, invitationSnapshot: old.invitationSnapshot });
    const fresh = await service.request(f.p.id, f.owner.id, input(f.other.id)); expect(fresh.expiresAt).toBeUndefined();
  });
  it("changes post-acceptance roles only after every affected mentor confirms, with history and idempotent responses", async () => {
    const f = await fixture();
    for (const m of [f.mentor, f.other]) { const r = await service.request(f.p.id, f.owner.id, input(m.id)); await service.accept(f.p.id, r.id, m.id); }
    const active = await db.mentorRelationship.findMany({ where: { projectId: f.p.id }, orderBy: { startedAt: "asc" } });
    const inputRoles = { clientKey: randomUUID(), assignments: active.map((r, i) => ({ relationshipId: r.id, role: i === 0 ? "PRIMARY" as const : "SECONDARY" as const })) };
    const proposal = (await mentorRolesService.propose(f.p.id, f.owner.id, inputRoles)).proposals[0]!;
    expect((await mentorRolesService.propose(f.p.id, f.owner.id, inputRoles)).proposals[0]!.id).toBe(proposal.id);
    await expect(mentorRolesService.respond(f.p.id, f.owner.id, proposal.id, "ACCEPT")).rejects.toMatchObject({ statusCode: 403 });
    await mentorRolesService.respond(f.p.id, active[0]!.mentorUserId, proposal.id, "ACCEPT");
    expect(await db.mentorRelationship.count({ where: { projectId: f.p.id, mentorRole: "UNASSIGNED" } })).toBe(2);
    await Promise.all([mentorRolesService.respond(f.p.id, active[1]!.mentorUserId, proposal.id, "ACCEPT"), mentorRolesService.respond(f.p.id, active[1]!.mentorUserId, proposal.id, "ACCEPT")]);
    const result = await mentorRolesService.read(f.p.id, f.owner.id); expect(result.proposals[0]!.status).toBe("CONFIRMED");
    expect(result.mentors.map(r => r.role).sort()).toEqual(["PRIMARY", "SECONDARY"]);
    expect(await db.projectActivity.count({ where: { projectId: f.p.id, type: "MENTOR_ROLES_APPLIED" } })).toBe(1);
    expect(await db.mentorshipRequest.count({ where: { projectId: f.p.id, mentorRole: "UNASSIGNED" } })).toBe(2);
  });
  it("denies foreign role changes and preserves roles after decline, cancellation or stale membership", async () => {
    const f = await fixture();
    for (const m of [f.mentor, f.other]) { const r = await service.request(f.p.id, f.owner.id, input(m.id)); await service.accept(f.p.id, r.id, m.id); }
    const active = await db.mentorRelationship.findMany({ where: { projectId: f.p.id } });
    const proposed = () => ({ clientKey: randomUUID(), assignments: [{ relationshipId: active[0]!.id, role: "PRIMARY" as const }] });
    await expect(mentorRolesService.propose(f.p.id, f.member.id, proposed())).rejects.toMatchObject({ statusCode: 403 });
    await expect(mentorRolesService.propose(f.p.id, f.owner.id, { ...proposed(), assignments: [{ relationshipId: randomUUID(), role: "PRIMARY" }] })).rejects.toMatchObject({ statusCode: 404 });
    let p = (await mentorRolesService.propose(f.p.id, f.owner.id, proposed())).proposals[0]!;
    await mentorRolesService.respond(f.p.id, active[0]!.mentorUserId, p.id, "DECLINE");
    p = (await mentorRolesService.propose(f.p.id, f.owner.id, proposed())).proposals[0]!;
    await mentorRolesService.respond(f.p.id, f.owner.id, p.id, "CANCEL");
    p = (await mentorRolesService.propose(f.p.id, f.owner.id, proposed())).proposals[0]!;
    await service.end(f.p.id, active[0]!.id, f.owner.id);
    expect((await mentorRolesService.read(f.p.id, f.owner.id)).proposals[0]!.status).toBe("SUPERSEDED");
    await expect(mentorRolesService.respond(f.p.id, active[0]!.mentorUserId, p.id, "ACCEPT")).rejects.toMatchObject({ statusCode: 403 });
    const foreign = await fixture(); await expect(mentorRolesService.read(foreign.p.id, f.mentor.id)).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.mentorRelationship.count({ where: { projectId: f.p.id, mentorRole: { not: "UNASSIGNED" } } })).toBe(0);
  });
  async function briefInput(f: Awaited<ReturnType<typeof fixture>>) {
    const settings = await service.settings(f.p.id, f.owner.id);
    return { mentorUserId: f.mentor.id, mentorRole: "UNASSIGNED" as const, message: "Please guide our clinical evaluation methods.", idempotencyKey: randomUUID(), expectedPreviewToken: settings.invitationContext.token, dossier: { presentation: "BRIEF" as const, researchSummary: "Study clinical AI.", sharingConfirmed: true as const, expectations: { supportAreas: [] } } };
  }
  it("freezes exactly the approved short introduction, representative and team size without hidden project/profile enrichment", async () => {
    const f = await fixture();
    await db.project.update({ where: { id: f.p.id }, data: { mentorshipNeeds: "PRIVATE NEEDS", mentorshipExpertise: ["PRIVATE TECHNOLOGY"], mentorshipResearchAreas: ["PRIVATE DISCOVERY TOPIC"] } });
    const body = await briefInput(f), settings = await service.settings(f.p.id, f.owner.id);
    const request = await service.request(f.p.id, f.owner.id, body);
    const before = await service.requestDetail(f.p.id, request.id, f.mentor.id);
    expect(before.dossier?.presentation).toBe("BRIEF");
    expect(before.dossier?.project).toMatchObject({ title: settings.invitationContext.title, researchField: settings.invitationContext.researchField, researchAreas: settings.invitationContext.researchAreas, abstract: body.dossier.researchSummary, teamMemberCount: settings.invitationContext.memberCount, keywords: [] });
    expect(before.dossier?.senderDisplayName).toBe(settings.invitationContext.senderDisplayName);
    expect(before.dossier?.whyThisLecturer.message).toBe(body.message);
    expect(before.dossier?.team.representative).toBeNull();
    expect(before.project.mentoringNeeds).toBe(""); expect(before.project.expertise).toEqual([]);
    for (const secret of ["PRIVATE NEEDS", "PRIVATE TECHNOLOGY", "PRIVATE DISCOVERY TOPIC", "PRIVATE ORIGINAL GOAL", f.owner.email]) expect(JSON.stringify(before)).not.toContain(secret);
    await db.user.update({ where: { id: f.owner.id }, data: { fullName: "Changed representative after sending" } });
    await db.projectMember.create({ data: { projectId: f.p.id, userId: f.other.id } });
    await db.project.update({ where: { id: f.p.id }, data: { title: "Changed project after sending", description: "PRIVATE LATER SOURCE" } });
    const after = await service.requestDetail(f.p.id, request.id, f.mentor.id);
    expect(after.dossier).toEqual(before.dossier); expect(after.project).toEqual(before.project); expect(after.requestedBy).toEqual(before.requestedBy);
    await expect(service.requestDetail(f.p.id, request.id, (await user()).id)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("rejects missing/stale preview context and unpreviewed additions, without rejecting unrelated private edits", async () => {
    const f = await fixture(), body = await briefInput(f);
    await expect(service.request(f.p.id, f.owner.id, { ...body, expectedPreviewToken: undefined })).rejects.toMatchObject({ statusCode: 409 });
    expect(requestMentorshipSchema.safeParse({ ...body, dossier: { ...body.dossier, approvedObjective: "Not visible in preview" } }).success).toBe(false);
    await db.projectMember.create({ data: { projectId: f.p.id, userId: f.other.id } });
    await expect(service.request(f.p.id, f.owner.id, body)).rejects.toMatchObject({ statusCode: 409 });
    const refreshed = await briefInput(f);
    await db.project.update({ where: { id: f.p.id }, data: { description: "Unrelated private working notes" } });
    expect((await service.request(f.p.id, f.owner.id, refreshed)).status).toBe("PENDING");
    expect(await db.mentorshipRequest.count({ where: { projectId: f.p.id } })).toBe(1);
  });
  it("keeps proposals internal until the owner explicitly sends, then links one invitation and one accepted mentor", async () => {
    const f = await fixture();
    await service.suggest(f.p.id, f.member.id, { mentorUserId: f.mentor.id, message: "Their clinical evaluation expertise fits our research." });
    expect(await db.notification.count({ where: { userId: f.mentor.id } })).toBe(0);
    expect(await db.mentorshipRequest.count({ where: { projectId: f.p.id } })).toBe(0);
    const inbox = await service.suggestions(f.p.id, f.owner.id); expect(inbox.items).toHaveLength(1);
    const body = await briefInput(f); await expect(service.request(f.p.id, f.member.id, body)).rejects.toMatchObject({ statusCode: 403 });
    const [first, second] = await Promise.all([service.request(f.p.id, f.owner.id, body), service.request(f.p.id, f.owner.id, body)]); expect(first.id).toBe(second.id);
    expect((await service.suggestions(f.p.id, f.owner.id, { scope: "all" })).items[0]).toMatchObject({ status: "INVITED", requestId: first.id, requestStatus: "PENDING" });
    expect(await db.notification.count({ where: { userId: f.mentor.id, type: "MENTORSHIP_REQUEST_RECEIVED" } })).toBe(1);
    const accepted = await service.accept(f.p.id, first.id, f.mentor.id); expect(accepted.actions.openProject).toBe(true);
    expect((await service.mine(f.mentor.id, { view: "active" })).relationships.some(r => r.projectId === f.p.id)).toBe(true);
    expect(await db.mentorRelationship.count({ where: { projectId: f.p.id, status: "ACTIVE" } })).toBe(1);
    expect(await db.projectMember.count({ where: { projectId: f.p.id, userId: f.mentor.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: f.member.id, type: "MENTORSHIP_REQUEST_ACCEPTED" } })).toBe(1);
    expect(await db.reviewRequest.count({ where: { projectId: f.p.id } })).toBe(0);
    await service.accept(f.p.id, first.id, f.mentor.id); expect(await db.notification.count({ where: { userId: f.member.id, type: "MENTORSHIP_REQUEST_ACCEPTED" } })).toBe(1);
  });
  it("serializes concurrent accept/cancel and denies the wrong recipient without creating an extra relationship", async () => {
    const f = await fixture(), request = await service.request(f.p.id, f.owner.id, await briefInput(f));
    await expect(service.requestDetail(f.p.id, request.id, f.other.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.accept(f.p.id, request.id, f.other.id)).rejects.toMatchObject({ statusCode: 403 });
    const outcomes = await Promise.allSettled([service.accept(f.p.id, request.id, f.mentor.id), service.cancel(f.p.id, request.id, f.owner.id)]);
    expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
    const final = await db.mentorshipRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(["ACCEPTED", "CANCELED_BY_PROJECT"]).toContain(final.status);
    expect(await db.mentorRelationship.count({ where: { sourceRequestId: request.id } })).toBe(final.status === "ACCEPTED" ? 1 : 0);
  });

  it("derives sender/recipient/team views from the authenticated account and separates the two snapshot fields", async () => {
    const f = await fixture(), body = await briefInput(f);
    body.dossier.researchSummary = "We compare two clinical image analysis models.";
    body.message = "Please guide our evaluation protocol and statistical analysis.";
    const sent = await service.request(f.p.id, f.owner.id, body);
    expect(sent.viewer).toBe("SENDER");
    const ownerView = await service.requestDetail(f.p.id, sent.id, f.owner.id), mentorView = await service.requestDetail(f.p.id, sent.id, f.mentor.id), memberView = await service.requestDetail(f.p.id, sent.id, f.member.id);
    expect(ownerView.viewer).toBe("SENDER"); expect(ownerView.actions).toMatchObject({ accept: false, decline: false, cancel: true });
    expect(mentorView.viewer).toBe("RECIPIENT"); expect(mentorView.actions).toMatchObject({ accept: true, decline: true, cancel: false });
    expect(memberView.viewer).toBe("TEAM"); expect(memberView.actions).toMatchObject({ accept: false, decline: false, cancel: false });
    expect(ownerView.dossier).toEqual(mentorView.dossier);
    for (const view of [ownerView, mentorView, memberView]) { expect(view.dossier?.project.abstract).toBe(body.dossier.researchSummary); expect(view.dossier?.whyThisLecturer.message).toBe(body.message); }
    await expect(service.cancel(f.p.id, sent.id, f.member.id)).rejects.toMatchObject({ statusCode: 403 });
    const api = await http(); try {
      const res = await fetch(`${api.base}/${f.p.id}/mentorships/${sent.id}?viewerRole=SENDER`, { headers: await auth(f.mentor.id) });
      expect(res.status).toBe(200); expect((await res.json()).data.viewer).toBe("RECIPIENT");
      expect(requestMentorshipSchema.safeParse({ ...body, viewer: "RECIPIENT" }).success).toBe(false);
    } finally { api.server.closeAllConnections(); api.server.close(); await once(api.server, "close"); }
    await service.accept(f.p.id, sent.id, f.mentor.id);
    const reloaded = await service.requestDetail(f.p.id, sent.id, f.owner.id); expect(reloaded.viewer).toBe("SENDER"); expect(reloaded.status).toBe("ACCEPTED"); expect(reloaded.actions).toMatchObject({ accept: false, decline: false, cancel: false });
  });
  it("rejects copied form instructions on new sends but preserves exactly such content in historical snapshots", async () => {
    const f = await fixture(), body = await briefInput(f);
    const helper = "Giới thiệu vấn đề, mục tiêu và hướng nghiên cứu. Không cần một abstract hoàn chỉnh.";
    expect(requestMentorshipSchema.safeParse({ ...body, message: helper }).success).toBe(false);
    expect(requestMentorshipSchema.safeParse({ ...body, dossier: { ...body.dossier, researchSummary: helper } }).success).toBe(false);
    const sent = await service.request(f.p.id, f.owner.id, body);
    const row = await db.mentorshipRequest.findUniqueOrThrow({ where: { id: sent.id } });
    const snapshot = JSON.parse(JSON.stringify(row.invitationSnapshot));
    snapshot.dossier.project.abstract = helper; snapshot.dossier.whyThisLecturer.message = helper; snapshot.project.summary = helper; snapshot.dossierConfig.researchSummary = helper;
    // Seed a historical record at INSERT; the existing trigger correctly forbids rewriting sent content.
    const historical = await db.mentorshipRequest.create({ data: { ...row, id: randomUUID(), idempotencyKey: null, status: "DECLINED", respondedAt: new Date(), message: helper, invitationSnapshot: snapshot } });
    const read = await service.requestDetail(f.p.id, historical.id, f.owner.id);
    expect(read.message).toBe(helper); expect(read.dossier?.project.abstract).toBe(helper); expect(read.dossier?.whyThisLecturer.message).toBe(helper);
    expect((await db.mentorshipRequest.findUniqueOrThrow({ where: { id: historical.id } })).invitationSnapshot).toEqual(snapshot);
  });

  it("keeps active supervisors visible when the project team pages through invitation history", async () => {
    const f = await fixture(), sent = await service.request(f.p.id, f.owner.id, await briefInput(f));
    await service.accept(f.p.id, sent.id, f.mentor.id);
    await service.request(f.p.id, f.owner.id, input(f.other.id));
    const page = await service.list(f.p.id, f.owner.id, { page: 2, pageSize: 1 });
    expect(page.requestMeta.totalPages).toBe(2); expect(page.relationships.some(row => row.mentorUser._id === f.mentor.id && row.status === "ACTIVE")).toBe(true);
  });

  it.skipIf(process.env.SUPERVISOR_BROWSER !== "1")("operates member proposal, owner invitation, retry and mentor acceptance in isolated browser sessions", async () => {
    const f = await fixture();
    await db.user.update({ where: { id: f.mentor.id }, data: { fullName: "Dr. Browser Supervisor" } });
    await db.user.update({ where: { id: f.other.id }, data: { fullName: "Dr. Co Supervisor" } });
    const ownerHeaders = await auth(f.owner.id), mentorHeaders = await auth(f.mentor.id), otherHeaders = await auth(f.other.id), memberHeaders = await auth(f.member.id);
    const { supervisorDiscoveryBrowser } = await import("./supervisor-discovery.browser.js");
    await supervisorDiscoveryBrowser(db, { projectId: f.p.id, ownerId: f.owner.id, mentorId: f.mentor.id, ownerToken: ownerHeaders.Authorization.slice(7), mentorToken: mentorHeaders.Authorization.slice(7), otherId: f.other.id, otherToken: otherHeaders.Authorization.slice(7), memberId: f.member.id, memberToken: memberHeaders.Authorization.slice(7) });
  }, 240000);
});
