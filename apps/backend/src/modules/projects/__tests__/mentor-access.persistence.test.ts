import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import { Client } from "pg";
import { mentorPresets, type MentorPolicyInput, type MentorShareInput } from "@trend/shared-types";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectMentorshipService as consent } from "../project-mentorship.service.js";
import { mentorAccessService as service, validateMentorPermissions } from "../mentor-access.service.js";
import { mentorAccessRouter } from "../mentor-access.routes.js";
import { canAccessProjectAsMentor } from "../academic-relationship-access.js";
import { withWorkspace } from "../workspace-access.js";
import { canDeliverWorkspaceNotification } from "../workspace-notification-access.js";
import { manuscriptService as writing } from "../../workspaces/manuscript.service.js";
import { requireAuth } from "../../../common/middleware/auth.js";
import { errorHandler } from "../../../common/middleware/error-handler.js";
import { tokenService, hashOpaqueToken } from "../../auth/token.service.js";
import { mentorPolicySchema, mentorShareSchema, mentorAgreementSchema, mentorFeedbackSchema } from "../dto/mentor-access.schema.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) }, aiJobsQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.MENTOR_ACCESS_INTEGRATION === "1";
if (enabled && (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test") || !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname))) throw new Error("Mentor access tests require a local isolated _test database");
const advisor = (): MentorPolicyInput => ({ preset: "ADVISOR", permissions: [...mentorPresets.ADVISOR], expiresAt: null });

describe("mentor policy validation", () => {
  it("rejects administration rights, duplicate permissions and unscoped manuscript sections", () => {
    expect(mentorPolicySchema.safeParse({ ...advisor(), permissions: ["ADMIN"] }).success).toBe(false);
    expect(mentorPolicySchema.safeParse({ ...advisor(), permissions: ["MENTOR_CHAT", "MENTOR_CHAT"] }).success).toBe(false);
    expect(mentorShareSchema.safeParse({ kind: "MANUSCRIPT", resourceId: randomUUID(), sectionKey: "", title: "Abstract", content: "Approved text" }).success).toBe(false);
    expect(() => validateMentorPermissions(["MANUSCRIPTS_REVIEW"])).toThrow();
    expect(mentorAgreementSchema.safeParse({ creditRoles: ["SUPERVISION", "SUPERVISION"], acknowledgement: "Approved acknowledgement", clientKey: randomUUID() }).success).toBe(false);
    expect(mentorFeedbackSchema.safeParse({ kind: "MESSAGE", body: "Feedback", creditRoles: ["SUPERVISION", "SUPERVISION"], clientKey: randomUUID() }).success).toBe(false);
    for (const preset of Object.values(mentorPresets)) expect(() => validateMentorPermissions(preset)).not.toThrow();
  });
});

describe.skipIf(!enabled).sequential("mentor consent and resource access on PostgreSQL", () => {
  const db = getPrisma();
  afterAll(disconnectPostgres);
  async function user(name: string, lecturer = false) {
    const row = await db.user.create({ data: { email: `mentor-access-${randomUUID()}@example.org`, fullName: name, emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: row.id, academicRole: lecturer ? "LECTURER" : "RESEARCHER", primaryPosition: lecturer ? "LECTURER" : "RESEARCH_STAFF", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: lecturer } } });
    return row.id;
  }
  async function fixture(options: { pending?: boolean; offer?: boolean; policy?: MentorPolicyInput } = {}) {
    const owner = await user("Chủ dự án"), mentor = await user("Cố vấn", true), member = await user("Thành viên"), outsider = await user("Người ngoài");
    const p = await createProjectFixture({ data: { title: "Mentor access test", ownerId: owner, status: "ACTIVE", description: "PRIVATE-TEAM-DESCRIPTION", mentorshipSummary: "Published abstract", mentorshipNeeds: "Study design", mentorshipDiscovery: "SEEKING_MENTOR" } });
    await db.projectMember.create({ data: { projectId: p.id, userId: member } });
    const input = { message: "Please help with our methodology", idempotencyKey: randomUUID() };
    const request = options.offer ? await consent.offer(p.id, mentor, input) : await consent.request(p.id, owner, { ...input, mentorUserId: mentor, access: options.policy ?? advisor() });
    if (!options.pending) await consent.accept(p.id, request.id, options.offer ? owner : mentor, "Agreed", request.accessPolicy?.version);
    const access = await db.mentorAccess.findUniqueOrThrow({ where: { requestId: request.id } });
    return { id: p.id, owner, mentor, member, outsider, request, access };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const policy = (f: Fixture) => db.mentorAccess.findUniqueOrThrow({ where: { id: f.access.id } });
  async function share(f: Fixture, input?: MentorShareInput) {
    return service.share(f.id, f.owner, f.access.id, { ...(input ?? { kind: "OVERVIEW", resourceId: f.id, sectionKey: "", title: "Approved overview", content: "Only the published study design" }), expectedVersion: (await policy(f)).version });
  }
  async function configure(f: Fixture, input: MentorPolicyInput) {
    return service.configure(f.id, f.owner, f.access.id, { ...input, expectedVersion: (await policy(f)).version, reason: "Update mentor access deliberately" });
  }
  const message = (extra = {}) => ({ shareId: null, replyToId: null, kind: "MESSAGE" as const, body: "Please clarify the evaluation", creditRoles: ["SUPERVISION" as const], clientKey: randomUUID(), ...extra });
  const revoke = async (f: Fixture) => service.revoke(f.id, f.owner, f.access.id, { expectedVersion: (await policy(f)).version, reason: "Mentorship complete", confirmed: true });

  it("exposes only the public preview and proposed policy before two-way consent", async () => {
    const f = await fixture({ pending: true }); await share(f);
    const invitation = (await consent.list(f.id, f.mentor)).requests[0]!;
    expect(invitation.accessPolicy?.permissions).toContain("MENTOR_CHAT");
    expect(JSON.stringify(invitation)).not.toContain("PRIVATE-TEAM");
    expect(JSON.stringify(invitation)).not.toContain("Only the published study design");
    await expect(service.workspace(f.id, f.mentor)).rejects.toMatchObject({ statusCode: 404 });
    await consent.accept(f.id, f.request.id, f.mentor, "Accepted after preview", (await policy(f)).version);
    const view = await service.workspace(f.id, f.mentor);
    expect(view.canManage).toBe(false); expect(view.policies[0]!.shares).toHaveLength(1);
    expect(view.policies[0]!.policy.effective).toBe(true);
    expect(await db.projectMember.count({ where: { projectId: f.id, userId: f.mentor } })).toBe(0);
  });
  it("supports mentor-origin offers without allowing self-granted permissions", async () => {
    const f = await fixture({ pending: true, offer: true });
    await expect(consent.accept(f.id, f.request.id, f.mentor)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.configure(f.id, f.mentor, f.access.id, { ...advisor(), expectedVersion: 1, reason: "Grant myself rights" })).rejects.toMatchObject({ statusCode: 404 });
    await consent.accept(f.id, f.request.id, f.owner);
    expect((await service.workspace(f.id, f.mentor)).policies[0]!.shares).toEqual([]);
    expect(await canAccessProjectAsMentor(f.id, f.mentor)).toBe(true);
    await expect(consent.offer(f.id, f.mentor, { message: "Unauthorized self grant", access: advisor() })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("serializes concurrent invitations and replays only the same payload", async () => {
    const f = await fixture({ pending: true }), other = await user("Concurrent mentor", true);
    const args = { mentorUserId: other, message: "Please help", idempotencyKey: randomUUID(), access: advisor() };
    const results = await Promise.all([consent.request(f.id, f.owner, args), consent.request(f.id, f.owner, args)]);
    expect(results[0]!.id).toBe(results[1]!.id);
    await expect(consent.request(f.id, f.owner, { ...args, access: undefined })).rejects.toMatchObject({ statusCode: 409 });
    await expect(consent.request(f.id, f.owner, { ...args, idempotencyKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("requires a fresh policy version if permissions or shares change before acceptance", async () => {
    const f = await fixture({ pending: true }); await configure(f, { ...advisor(), permissions: ["MENTOR_CHAT"] });
    await expect(consent.accept(f.id, f.request.id, f.mentor, "stale", 1)).rejects.toMatchObject({ statusCode: 409 });
    await expect(consent.accept(f.id, f.request.id, f.mentor)).rejects.toMatchObject({ statusCode: 409 });
    await consent.accept(f.id, f.request.id, f.mentor, "Read current rights", (await policy(f)).version);
    const event = await db.mentorAccessEvent.findFirstOrThrow({ where: { accessId: f.access.id, type: "ACCESS_ACCEPTED" } });
    expect(event.details).toMatchObject({ acceptedPolicyVersion: 2, permissions: ["MENTOR_CHAT"] });
  });
  it("keeps declined, cancelled and expired invitations closed without granting access", async () => {
    for (const state of ["DECLINED", "CANCELLED", "EXPIRED"] as const) {
      const f = await fixture({ pending: true });
      if (state === "DECLINED") await consent.decline(f.id, f.request.id, f.mentor);
      else if (state === "CANCELLED") await consent.cancel(f.id, f.request.id, f.owner);
      else { await db.mentorshipRequest.update({ where: { id: f.request.id }, data: { expiresAt: new Date(Date.now() - 1000) } }); await consent.expireRequests(); }
      await expect(consent.accept(f.id, f.request.id, f.mentor)).rejects.toMatchObject({ statusCode: 409 });
      expect(await canAccessProjectAsMentor(f.id, f.mentor)).toBe(false);
      expect((await service.workspace(f.id, f.owner)).policies[0]!.invitationState).toBe(state === "DECLINED" ? "REJECTED" : state);
    }
  });
  it("enforces ownership, project scope and live membership for every access operation", async () => {
    const f = await fixture(), other = await fixture();
    for (const actor of [f.member, f.mentor, f.outsider]) await expect(service.configure(f.id, actor, f.access.id, { ...advisor(), expectedVersion: f.access.version, reason: "Unauthorized grant" })).rejects.toMatchObject({ statusCode: actor === f.outsider ? 404 : 403 });
    await expect(service.workspace(f.id, f.outsider)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.feedback(other.id, other.owner, f.access.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(share(f, { kind: "OVERVIEW", resourceId: other.id, sectionKey: "", title: "Cross project", content: "Forbidden" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.catalog(f.id, f.mentor, { page: 1, q: "", kind: "MANUSCRIPT" })).rejects.toMatchObject({ statusCode: 404 });
    await db.projectMember.update({ where: { projectId_userId: { projectId: f.id, userId: f.member } }, data: { status: "LEFT" } });
    await expect(service.workspace(f.id, f.member)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("resolves legacy authentication IDs to the canonical agreement party", async () => {
    const f = await fixture(), legacyId = randomUUID().replaceAll("-", "").slice(0, 24);
    await db.user.update({ where: { id: f.mentor }, data: { legacyMongoId: legacyId } });
    const view = await service.workspace(f.id, legacyId);
    expect(view.viewerId).toBe(f.mentor);
    const agreement = await service.proposeAgreement(f.id, legacyId, f.access.id, { creditRoles: ["SUPERVISION"], acknowledgement: "Mentor methodology guidance", note: "", clientKey: randomUUID() });
    expect((await service.agreements(f.id, legacyId, f.access.id)).items[0]!.proposedById).toBe(view.viewerId);
    await expect(service.respondAgreement(f.id, legacyId, f.access.id, agreement.id, "ACCEPTED")).rejects.toMatchObject({ statusCode: 403 });
    await service.respondAgreement(f.id, f.owner, f.access.id, agreement.id, "ACCEPTED");
  });
  it("shares only the selected manuscript section, with immutable approved text and no source capabilities", async () => {
    const f = await fixture();
    const manuscript = await writing.create(f.id, f.owner, { title: "Private manuscript", template: "BLANK", documentType: "RESEARCH_PAPER", description: "", clientKey: randomUUID() });
    const detail = await writing.detail(f.id, f.owner, manuscript.id);
    const snapshot = await writing.snapshot(f.id, f.owner, manuscript.id, { label: "Internal revision", clientKey: randomUUID(), minimumSequences: {}, reuseUnchanged: true });
    const shared = await share(f, { kind: "MANUSCRIPT", resourceId: manuscript.id, sectionKey: "abstract", title: "Approved abstract", content: "This is the approved abstract only." });
    const view = await service.workspace(f.id, f.mentor), rendered = JSON.stringify(view);
    expect(view.policies[0]!.shares.map(s => s.sectionKey)).toEqual(["abstract"]);
    expect(rendered).not.toContain("This is the approved abstract only.");
    expect((await service.resource(f.id, f.mentor, f.access.id, shared.id)).content).toBe("This is the approved abstract only.");
    for (const secret of ["documentclass", "\\begin", "mainFileId", "manifest", "Internal revision", "PRIVATE-TEAM"]) expect(rendered).not.toContain(secret);
    for (const call of [() => writing.detail(f.id, f.mentor, manuscript.id), () => writing.fileContent(f.id, f.mentor, manuscript.id, detail.mainFileId!), () => writing.snapshots(f.id, f.mentor, manuscript.id), () => writing.export(f.id, f.mentor, manuscript.id), () => writing.export(f.id, f.mentor, manuscript.id, snapshot.id), () => writing.viewSnapshot(f.id, f.mentor, manuscript.id, snapshot.id)]) await expect(call()).rejects.toMatchObject({ statusCode: 404 });
    await expect(share(f, { kind: "MANUSCRIPT", resourceId: manuscript.id, sectionKey: "results", title: "Source", content: "\\documentclass{article}\\begin{document}secret" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(db.mentorResourceShare.update({ where: { id: shared.id }, data: { content: "Mutated" } })).rejects.toThrow();
    expect((await writing.detail(f.id, f.member, manuscript.id)).canWrite).toBe(true);
    await expect(writing.comment(f.id, f.owner, manuscript.id, { snapshotId: snapshot.id, mentorRelationshipId: f.access.relationshipId!, body: "Legacy whole snapshot sharing", clientKey: randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    await service.comment(f.id, f.mentor, f.access.id, message({ shareId: shared.id, kind: "COMMENT" }));
    await service.unshare(f.id, f.owner, f.access.id, shared.id, { expectedVersion: (await policy(f)).version, reason: "Stop sharing abstract", confirmed: true });
    await expect(service.resource(f.id, f.mentor, f.access.id, shared.id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.feedback(f.id, f.mentor, f.access.id)).items).toEqual([]);
    expect((await service.feedback(f.id, f.owner, f.access.id)).total).toBe(1);
  });
  it("blocks legacy mentor research, chat, plan and AI workspace entry points", async () => {
    const f = await fixture(); await share(f);
    await expect(consent.workspace(f.id, f.mentor)).rejects.toMatchObject({ statusCode: 403 });
    await expect(withWorkspace(f.id, f.mentor, { mentor: true }, async () => "Private team context")).rejects.toMatchObject({ statusCode: 404 });
    expect(await canDeliverWorkspaceNotification({ type: "PROJECT_WORKSPACE_PLAN_SHARED", targetUuid: f.id, userId: f.mentor })).toBe(false);
    expect(await canDeliverWorkspaceNotification({ type: "PROJECT_WORKSPACE_MENTOR_QUESTION", targetUuid: f.id, userId: f.member })).toBe(true);
    expect(await withWorkspace(f.id, f.member, {}, async c => c.role)).toBe("MEMBER");
  });
  it("removes shared content and its feedback immediately, while retaining team audit history", async () => {
    const f = await fixture(); const s = await share(f);
    await service.comment(f.id, f.mentor, f.access.id, message());
    const p = await policy(f);
    await service.unshare(f.id, f.owner, f.access.id, s.id, { expectedVersion: p.version, reason: "No longer needed", confirmed: true });
    expect((await service.workspace(f.id, f.mentor)).policies[0]!.shares).toEqual([]);
    await expect(service.unshare(f.id, f.owner, f.access.id, s.id, { expectedVersion: p.version, reason: "Stale action", confirmed: true })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.mentorResourceShare.count({ where: { id: s.id } })).toBe(1);
    expect((await service.history(f.id, f.owner, f.access.id)).items.some(e => e.type === "RESOURCE_REVOKED")).toBe(true);
    expect((await service.history(f.id, f.mentor, f.access.id)).items.every(e => Object.keys(e.details).length === 0)).toBe(true);
  });
  it("removes permissions without exposing hidden content or retaining a posting right", async () => {
    const f = await fixture(); const resource = await share(f); await service.comment(f.id, f.mentor, f.access.id, message());
    await configure(f, { preset: "OBSERVER", permissions: [], expiresAt: null });
    expect((await service.workspace(f.id, f.mentor)).policies[0]!.shares).toEqual([]);
    expect((await service.feedback(f.id, f.mentor, f.access.id)).items).toEqual([]);
    await expect(service.resource(f.id, f.mentor, f.access.id, resource.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.comment(f.id, f.mentor, f.access.id, message())).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.feedback(f.id, f.owner, f.access.id)).total).toBe(1);
  });
  it("uses a dedicated idempotent feedback channel and records handling identity and transitions", async () => {
    const f = await fixture(), input = message();
    const [first, retry] = await Promise.all([service.comment(f.id, f.mentor, f.access.id, input), service.comment(f.id, f.mentor, f.access.id, input)]);
    expect(first.id).toBe(retry.id);
    await expect(service.comment(f.id, f.mentor, f.access.id, { ...input, body: "Different" })).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.projectDiscussion.count({ where: { projectId: f.id } })).toBe(0);
    await expect(service.handle(f.id, f.mentor, f.access.id, first.id, { expectedVersion: 1, status: "ACCEPTED", response: "Self handling" })).rejects.toMatchObject({ statusCode: 403 });
    await service.handle(f.id, f.member, f.access.id, first.id, { expectedVersion: 1, status: "ACCEPTED", response: "We will apply this feedback" });
    let row = (await service.feedback(f.id, f.mentor, f.access.id)).items[0]!;
    expect(row).toMatchObject({ status: "ACCEPTED", handledById: f.member, handledByName: "Thành viên", creditRoles: ["SUPERVISION"] });
    expect(row.handledAt).not.toBeNull();
    await service.handle(f.id, f.owner, f.access.id, first.id, { expectedVersion: row.version, status: "RESOLVED", response: "Updated and checked" });
    row = (await service.feedback(f.id, f.mentor, f.access.id)).items[0]!;
    await expect(service.handle(f.id, f.owner, f.access.id, first.id, { expectedVersion: row.version, status: "ACCEPTED", response: "Reopen silently" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(db.mentorFeedback.update({ where: { id: first.id }, data: { body: "Edit immutable advice" } })).rejects.toThrow();
  });
  it("requires both parties for agreements and does not assign authorship or percentages", async () => {
    const f = await fixture(), input = { creditRoles: ["SUPERVISION" as const], acknowledgement: "Thank you for study design guidance", note: "No automatic authorship", clientKey: randomUUID() };
    const proposal = await service.proposeAgreement(f.id, f.mentor, f.access.id, input);
    expect(await service.proposeAgreement(f.id, f.mentor, f.access.id, input)).toEqual(proposal);
    await expect(service.respondAgreement(f.id, f.mentor, f.access.id, proposal.id, "ACCEPTED")).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.respondAgreement(f.id, f.member, f.access.id, proposal.id, "ACCEPTED")).rejects.toMatchObject({ statusCode: 403 });
    await service.respondAgreement(f.id, f.owner, f.access.id, proposal.id, "ACCEPTED");
    expect((await service.agreements(f.id, f.mentor, f.access.id)).items[0]!.status).toBe("ACCEPTED");
    await expect(service.respondAgreement(f.id, f.owner, f.access.id, proposal.id, "REJECTED")).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.projectMember.count({ where: { projectId: f.id, userId: f.mentor } })).toBe(0);
    expect(await db.researchContribution.count({ where: { projectId: f.id } })).toBe(0);
    await expect(db.mentorAgreement.update({ where: { id: proposal.id }, data: { acknowledgement: "Changed after consent" } })).rejects.toThrow();
  });
  it("serializes revocation with comments and permits security revocation on archived projects", async () => {
    const f = await fixture(); await db.project.update({ where: { id: f.id }, data: { status: "ARCHIVED" } });
    await revoke(f);
    expect(await canAccessProjectAsMentor(f.id, f.mentor)).toBe(false);
    await expect(service.workspace(f.id, f.mentor)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.history(f.id, f.owner, f.access.id)).items[0]!.type).toBe("ACCESS_REVOKED");
    const g = await fixture();
    const results = await Promise.allSettled([revoke(g), service.comment(g.id, g.mentor, g.access.id, message())]);
    expect(results[0]!.status).toBe("fulfilled");
    await expect(service.comment(g.id, g.mentor, g.access.id, message())).rejects.toMatchObject({ statusCode: 404 });
    expect((await consent.list(g.id, g.mentor)).relationships[0]!.actions.openProject).toBe(false);
  });
  it("honors expiry, ended relationships and lost lecturer eligibility immediately", async () => {
    for (const scenario of ["expiry", "ended", "ineligible"] as const) {
      const f = await fixture();
      if (scenario === "expiry") await db.mentorAccess.update({ where: { id: f.access.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      if (scenario === "ended") await consent.end(f.id, f.access.relationshipId!, f.mentor);
      if (scenario === "ineligible") await db.academicProfile.update({ where: { userId: f.mentor }, data: { roleVerificationStatus: "REJECTED" } });
      expect(await canAccessProjectAsMentor(f.id, f.mentor)).toBe(false);
      await expect(service.workspace(f.id, f.mentor)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.comment(f.id, f.mentor, f.access.id, message())).rejects.toMatchObject({ statusCode: 404 });
      expect((await consent.list(f.id, f.mentor)).relationships[0]!.actions.openProject).toBe(false);
    }
  });
  it("paginates feedback and audit history with stable ordering", async () => {
    const f = await fixture();
    for (let i = 0; i < 23; i++) await service.comment(f.id, f.mentor, f.access.id, message({ body: `Advice ${i}` }));
    const first = await service.feedback(f.id, f.owner, f.access.id, 1), next = await service.feedback(f.id, f.owner, f.access.id, 2);
    expect(first).toMatchObject({ total: 23, pageSize: 20, hasNext: true }); expect(next.items).toHaveLength(3);
    expect(new Set([...first.items, ...next.items].map(i => i.id)).size).toBe(23);
    expect((await service.history(f.id, f.owner, f.access.id)).hasNext).toBe(true);
  });
  it("protects HTTP authentication, schemas, cache behavior and owner-only routes", async () => {
    const f = await fixture(); await share(f);
    const app = express(); app.use(express.json()); app.use("/projects/:id/mentor-access", requireAuth, mentorAccessRouter); app.use(errorHandler);
    const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const sessionId = randomUUID(); await db.refreshToken.create({ data: { userId: f.mentor, familyId: sessionId, tokenHash: hashOpaqueToken(randomUUID()), expiresAt: new Date(Date.now() + 3600000) } });
    const token = tokenService.signAccessToken({ sub: f.mentor, systemRole: "USER", sessionId }).token;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" }, base = `http://127.0.0.1:${(server.address() as { port: number }).port}/projects/${f.id}/mentor-access`;
    try {
      expect((await fetch(base)).status).toBe(401);
      const response = await fetch(base, { headers }); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
      expect(JSON.stringify(await response.json())).not.toContain("PRIVATE-TEAM");
      expect((await fetch(`${base}/catalog`, { headers })).status).toBe(404);
      expect((await fetch(`${base}/${f.access.id}`, { method: "PUT", headers, body: JSON.stringify({ ...advisor(), expectedVersion: (await policy(f)).version, reason: "Self grant" }) })).status).toBe(403);
      expect((await fetch(`${base}/${f.access.id}/feedback`, { method: "POST", headers, body: JSON.stringify({ ...message(), administrator: true }) })).status).toBe(400);
      await revoke(f); expect((await fetch(base, { headers })).status).toBe(404);
    } finally { server.close(); server.closeAllConnections(); }
  });
  it("backfills old consent without auto-sharing, preserving old relationships and immutable history", async () => {
    const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect();
    try {
      await pg.query("BEGIN");
      await pg.query("CREATE SCHEMA mentor_migration_probe; SET LOCAL search_path TO mentor_migration_probe; CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE projects(id uuid PRIMARY KEY,owner_id uuid); CREATE TABLE mentorship_requests(id uuid PRIMARY KEY,project_id uuid,mentor_user_id uuid); CREATE TABLE mentor_relationships(id uuid PRIMARY KEY,project_id uuid,mentor_user_id uuid,source_request_id uuid,status text,ended_at timestamptz)");
      const owner = randomUUID(), mentor = randomUUID(), project = randomUUID(), request = randomUUID(), relationship = randomUUID();
      await pg.query("INSERT INTO users VALUES($1),($2)", [owner, mentor]); await pg.query("INSERT INTO projects VALUES($1,$2)", [project, owner]);
      await pg.query("INSERT INTO mentorship_requests VALUES($1,$2,$3)", [request, project, mentor]);
      await pg.query("INSERT INTO mentor_relationships VALUES($1,$2,$3,$4,'ACTIVE',NULL)", [relationship, project, mentor, request]);
      await pg.query(readFileSync(new URL("../../../../prisma/migrations/20261028140000_mentor_resource_access/migration.sql", import.meta.url), "utf8"));
      expect((await pg.query("SELECT relationship_id,permissions FROM mentor_access")).rows[0]).toEqual({ relationship_id: relationship, permissions: [] });
      expect((await pg.query("SELECT count(*)::int n FROM mentor_resource_shares")).rows[0].n).toBe(0);
      expect((await pg.query("SELECT status FROM mentor_relationships")).rows[0].status).toBe("ACTIVE");
    } finally { await pg.query("ROLLBACK"); await pg.end(); }
    const f = await fixture(); await expect(db.mentorAccessEvent.deleteMany({ where: { accessId: f.access.id } })).rejects.toThrow();
  });
});
