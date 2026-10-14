import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { projectService } from "../project.service.js";
import { hashOpaqueToken } from "../../auth/token.service.js";
import { deliverProjectInvitationEmail } from "../project-invitation-delivery.js";
import { projectMentorshipService } from "../project-mentorship.service.js";
import { reportService } from "../../reports/report.service.js";
import { literatureService } from "../../literature/literature.service.js";
import { workspaceService } from "../../workspaces/workspace.service.js";

const mail = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("../project-invitation.mail.js", () => ({ sendProjectInvitationEmail: mail }));

// This suite must never create/delete fixtures in a developer's academic database.
const isolated = process.env.PROJECT_SLICE_TEST === "1" && process.env.DATABASE_URL?.includes("127.0.0.1:15439/lumigap_project_slice_test");
describe.skipIf(!isolated).sequential("project creation and team integration (disposable PostgreSQL)", () => {
  const db = getPrisma(), marker = crypto.randomUUID(), users: string[] = [], projects: string[] = [];
  let owner: string, member: string, outsider: string, lecturer: string;
  const email = (name: string) => `${name}-${marker}@example.org`;
  async function person(name: string, role = "RESEARCHER", onboarded = true) {
    const user = await db.user.create({ data: { email: email(name), fullName: `${name} ${marker}`, emailVerifiedAt: new Date(), onboardingCompletedAt: onboarded ? new Date() : null } });
    users.push(user.id);
    await db.userEmail.create({ data: { userId: user.id, normalizedEmail: user.email, isPrimary: true, verifiedAt: new Date(), purpose: "ACCOUNT" } });
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: role === "LECTURER" ? "LECTURER" : role === "STUDENT" ? "STUDENT" : "RESEARCH_STAFF", academicRole: role, roleVerificationStatus: role === "LECTURER" ? "VERIFIED" : "SELF_DECLARED", positionStatus: role === "LECTURER" ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true } } });
    return user.id;
  }
  async function project() {
    const row = await projectService.createProject({ title: `Slice ${marker}`, description: "Unpublished private research problem", researchAreas: ["Education", "Artificial Intelligence"], idempotencyKey: crypto.randomUUID() }, owner);
    projects.push(row._id); return row;
  }
  async function join(projectId: string, target = member) {
    const invite = await projectService.inviteMember(projectId, { userId: target }, owner);
    await projectService.respondToInvitation(projectId, invite.id, target, "ACCEPTED");
    return invite;
  }
  beforeAll(async () => { owner = await person("owner"); member = await person("member", "STUDENT"); outsider = await person("outsider"); lecturer = await person("lecturer", "LECTURER"); });
  afterAll(async () => {
    await db.notification.deleteMany({ where: { OR: [{ userId: { in: users } }, { targetUuid: { in: projects } }] } });
    await db.report.deleteMany({ where: { userId: { in: users } } });
    await db.literatureCorpus.deleteMany({ where: { ownerId: { in: users } } });
    await db.project.deleteMany({ where: { id: { in: projects } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });

  it("atomically creates one private project, plan, owner and event under concurrent retries", async () => {
    const request = { title: `Concurrent ${marker}`, researchApproach: "EXPLORATORY" as const, idempotencyKey: crypto.randomUUID() };
    const results = await Promise.all(Array.from({ length: 4 }, () => projectService.createProject(request, owner)));
    const id = results[0]!._id; projects.push(id);
    expect(new Set(results.map(row => row._id)).size).toBe(1);
    expect(results[0]).toMatchObject({ visibility: "PRIVATE", accessRole: "OWNER", researchApproach: "EXPLORATORY", mentorshipDiscovery: "CLOSED", memberCount: 1 });
    expect(await db.projectMember.count({ where: { projectId: id, role: "OWNER", status: "ACTIVE" } })).toBe(1);
    expect(await db.projectActivity.count({ where: { projectId: id, type: "PROJECT_CREATED" } })).toBe(1);
    await expect(projectService.createProject({ ...request, title: "Changed" }, owner)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("allows onboarded non-FPT students, lecturers and researchers; rejects incomplete onboarding atomically", async () => {
    for (const actor of [member, lecturer]) {
      const row = await projectService.createProject({ title: `Non FPT ${marker}`, idempotencyKey: crypto.randomUUID() }, actor);
      projects.push(row._id); expect(row.accessRole).toBe("OWNER");
    }
    const incomplete = await person("incomplete", "RESEARCHER", false), key = crypto.randomUUID();
    await expect(projectService.createProject({ title: "Not allowed", idempotencyKey: key }, incomplete)).rejects.toMatchObject({ code: "ONBOARDING_REQUIRED" });
    expect(await db.project.count({ where: { creationKey: key } })).toBe(0);
  });

  it("enforces owner-only mutations and prevents an orphaned project", async () => {
    const row = await project(); await join(row._id);
    await expect(projectService.leaveProject(row._id, owner)).rejects.toMatchObject({ statusCode: 409 });
    await expect(projectService.updateProject(row._id, { visibility: "PUBLIC" }, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(projectService.inviteMember(row._id, { userId: outsider }, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(projectService.transferOwnership(row._id, outsider, owner)).rejects.toMatchObject({ statusCode: 409 });
    await expect(projectService.getProjectById(row._id, outsider)).rejects.toMatchObject({ statusCode: 404 });
    await expect(projectService.team(row._id, outsider)).rejects.toMatchObject({ statusCode: 404 });
    await expect(db.projectMember.updateMany({ where: { projectId: row._id, role: "OWNER" }, data: { status: "LEFT" } })).rejects.toThrow();
  });

  it("prevents duplicate invitations, requires consent and commits an encrypted durable delivery intent", async () => {
    const row = await project(); mail.mockClear();
    const results = await Promise.allSettled([projectService.inviteMember(row._id, { userId: member }, owner), projectService.inviteMember(row._id, { email: email("member").toUpperCase() }, owner)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const invites = await db.projectInvitation.findMany({ where: { projectId: row._id } });
    expect(invites).toHaveLength(1);
    expect(await db.projectMember.count({ where: { projectId: row._id, userId: member } })).toBe(0);
    expect(mail).not.toHaveBeenCalled();
    const notification = await db.notification.findFirstOrThrow({ where: { eventKey: { startsWith: `PROJECT_INVITATION_${invites[0]!.id}_` } } });
    expect(notification.emailStatus).toBe("PENDING");
    expect(JSON.stringify(notification.emailPayload)).not.toContain('"token":');
    await deliverProjectInvitationEmail(notification.id);
    expect(mail).toHaveBeenCalledTimes(1);
    const token = mail.mock.calls[0]![0].token as string;
    expect(hashOpaqueToken(token)).toBe(invites[0]!.tokenHash);
    expect(JSON.stringify(notification.emailPayload)).not.toContain(token);
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).emailPayload).toEqual({});
  });

  it("hides private invitation metadata until both verified email and bound account match", async () => {
    const row = await project(), token = `identity_${crypto.randomUUID()}_0123456789`;
    const invite = await db.projectInvitation.create({ data: { projectId: row._id, invitedUserId: member, email: email("member"), invitedById: owner, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + 60000) } });
    for (const viewer of [undefined, outsider]) {
      const preview = await projectService.getInvitationByToken(token, viewer);
      expect(preview).toMatchObject({ projectId: "", projectTitle: "", invitedEmail: "", inviterName: "", emailMatches: false });
      expect(JSON.stringify(preview)).not.toContain("Unpublished private research problem");
    }
    await expect(projectService.respondToInvitationByToken(token, outsider, "ACCEPTED")).rejects.toMatchObject({ statusCode: 403 });
    await db.projectInvitation.update({ where: { id: invite.id }, data: { invitedUserId: outsider } });
    await expect(projectService.respondToInvitationByToken(token, member, "ACCEPTED")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("accepts concurrently once, supports retries, and permits consent-based rejoining", async () => {
    const row = await project(), invite = await projectService.inviteMember(row._id, { userId: member }, owner);
    await Promise.all([projectService.respondToInvitation(row._id, invite.id, member, "ACCEPTED"), projectService.respondToInvitation(row._id, invite.id, member, "ACCEPTED")]);
    expect(await db.projectActivity.count({ where: { projectId: row._id, type: "MEMBER_JOINED" } })).toBe(1);
    await projectService.removeMemberFromProject(row._id, member, owner);
    await expect(projectService.respondToInvitation(row._id, invite.id, member, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });
    await expect(projectService.getProjectById(row._id, member)).rejects.toMatchObject({ statusCode: 404 });
    await join(row._id);
    expect(await db.projectMember.count({ where: { projectId: row._id, userId: member } })).toBe(1);
    await projectService.leaveProject(row._id, member);
    await join(row._id);
    expect((await projectService.getProjectById(row._id, member)).accessRole).toBe("MEMBER");
  });

  it("accepts an email invitation after registration without granting premature membership", async () => {
    const row = await project();
    const invite = await projectService.inviteMember(row._id, { email: email("late") }, owner);
    expect((await db.projectInvitation.findUniqueOrThrow({ where: { id: invite.id } })).invitedUserId).toBeNull();
    const late = await person("late");
    expect((await projectService.listMyInvitations(late)).map(item => item.id)).toContain(invite.id);
    await projectService.respondToInvitation(row._id, invite.id, late, "ACCEPTED");
    expect((await projectService.getProjectById(row._id, late)).accessRole).toBe("MEMBER");
  });

  it("declines, cancels, expires and resends with cooldown and token invalidation", async () => {
    const row = await project();
    const declined = await projectService.inviteMember(row._id, { userId: member }, owner);
    await projectService.respondToInvitation(row._id, declined.id, member, "DECLINED");
    const cancelled = await projectService.inviteMember(row._id, { userId: member }, owner);
    await projectService.cancelInvitation(row._id, cancelled.id, owner);
    await expect(projectService.respondToInvitation(row._id, cancelled.id, member, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });
    const pending = await projectService.inviteMember(row._id, { userId: member }, owner);
    await expect(projectService.resendInvitation(row._id, pending.id, owner)).rejects.toMatchObject({ statusCode: 429 });
    const oldToken = `old_${crypto.randomUUID()}_0123456789abcdef`;
    await db.projectInvitation.update({ where: { id: pending.id }, data: { tokenHash: hashOpaqueToken(oldToken), lastSentAt: new Date(Date.now() - 61000) } });
    await projectService.resendInvitation(row._id, pending.id, owner);
    await expect(projectService.getInvitationByToken(oldToken, member)).rejects.toMatchObject({ statusCode: 404 });
    await db.projectInvitation.update({ where: { id: pending.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(projectService.respondToInvitation(row._id, pending.id, member, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.projectInvitation.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("EXPIRED");
  });

  it("serializes acceptance against cancellation", async () => {
    const row = await project();
    const invite = await projectService.inviteMember(row._id, { userId: member }, owner);
    const results = await Promise.allSettled([projectService.respondToInvitation(row._id, invite.id, member, "ACCEPTED"), projectService.cancelInvitation(row._id, invite.id, owner)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const current = await db.projectInvitation.findUniqueOrThrow({ where: { id: invite.id } });
    expect(["ACCEPTED", "CANCELLED"]).toContain(current.status);
    expect(await db.projectMember.count({ where: { projectId: row._id, userId: member, status: "ACTIVE" } })).toBe(current.status === "ACCEPTED" ? 1 : 0);
  });

  it("serializes acceptance against archive, preserves records and permits leaving an archive", async () => {
    const row = await project(); await join(row._id);
    const invite = await projectService.inviteMember(row._id, { userId: outsider }, owner);
    await Promise.allSettled([projectService.respondToInvitation(row._id, invite.id, outsider, "ACCEPTED"), projectService.archiveProject(row._id, owner)]);
    expect((await db.project.findUniqueOrThrow({ where: { id: row._id } })).status).toBe("ARCHIVED");
    expect(await db.projectInvitation.count({ where: { projectId: row._id, status: "PENDING" } })).toBe(0);
    await expect(projectService.updateProject(row._id, { title: "Bad" }, owner)).rejects.toMatchObject({ statusCode: 409 });
    expect((await projectService.listActivity(row._id, member, 20)).length).toBeGreaterThan(0);
    await projectService.leaveProject(row._id, member);
    await expect(projectService.leaveProject(row._id, owner)).rejects.toMatchObject({ statusCode: 409 });
    await projectService.restoreProject(row._id, owner);
    expect((await db.project.findUniqueOrThrow({ where: { id: row._id } })).mentorshipDiscovery).toBe("CLOSED");
  });

  it("keeps one current owner under transfer/removal/leave races and rejects stale owner writes", async () => {
    const row = await project(); await join(row._id);
    await Promise.allSettled([projectService.transferOwnership(row._id, member, owner), projectService.leaveProject(row._id, member), projectService.removeMemberFromProject(row._id, member, owner)]);
    const canonical = await db.project.findUniqueOrThrow({ where: { id: row._id } });
    const owners = await db.projectMember.findMany({ where: { projectId: row._id, role: "OWNER", status: "ACTIVE" } });
    expect(owners).toHaveLength(1); expect(owners[0]!.userId).toBe(canonical.ownerId);
    if (canonical.ownerId === member) await expect(projectService.updateProject(row._id, { title: "Stale owner" }, owner)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("publishes only approved summary fields and keeps private mentor discovery separate from membership", async () => {
    const row = await project();
    await projectService.updateProject(row._id, { visibility: "PUBLIC", publicSummary: "Approved safe public summary" }, owner);
    const summary = await projectService.getPublicProjectById(row._id);
    expect(summary).toMatchObject({ description: "Approved safe public summary", members: [], papers: [], ownerId: "", memberCount: 0, paperCount: 0 });
    expect(JSON.stringify(summary)).not.toContain("Unpublished private research problem");
    expect(JSON.stringify(summary)).not.toContain(email("owner"));
    expect((await db.project.findUniqueOrThrow({ where: { id: row._id } })).mentorshipDiscovery).toBe("CLOSED");
    await projectService.updateProject(row._id, { visibility: "PRIVATE" }, owner);
    await projectMentorshipService.settings(row._id, owner, { discovery: "SEEKING_MENTOR", summary: "Approved mentor discovery summary", expertise: ["Study design"] });
    await expect(projectMentorshipService.discovery(outsider, {})).rejects.toMatchObject({ statusCode: 403 });
    const discovered = await projectMentorshipService.discovery(lecturer, { q: marker });
    const item = discovered.items.find(item => item.id === row._id);
    expect(item).toMatchObject({ summary: "Approved mentor discovery summary", expertise: ["Study design"] });
    expect(Object.keys(item!).sort()).toEqual(["discovery", "expertise", "id", "researchField", "stage", "summary", "title"].sort());
    expect(await db.projectMember.count({ where: { projectId: row._id, userId: lecturer } })).toBe(0);
    await expect(projectService.getProjectById(row._id, lecturer)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("paginates team reads, protects invitations from members, and rejects lost settings updates", async () => {
    const row = await project(); await join(row._id);
    await projectService.inviteMember(row._id, { userId: outsider }, owner);
    const first = await projectService.team(row._id, owner, { pageSize: 1 });
    expect(first.members).toHaveLength(1); expect(first.memberMeta.totalPages).toBe(2); expect(first.invitations).toHaveLength(1);
    const second = await projectService.team(row._id, owner, { page: 2, pageSize: 1 });
    expect(second.members[0]!.targetId).not.toEqual(first.members[0]!.targetId);
    expect((await projectService.team(row._id, member)).invitations).toEqual([]);
    await projectService.updateProject(row._id, { title: "First update", expectedVersion: row.version }, owner);
    await expect(projectService.updateProject(row._id, { title: "Lost update", expectedVersion: row.version }, owner)).rejects.toMatchObject({ statusCode: 409 });
    const directory = await projectService.getProjectsPageByUser(owner, { pageSize: 1 });
    expect(directory.items).toHaveLength(1); expect(directory.meta.hasNext).toBe(true);
    expect((await projectService.getProjectsPageByUser(owner, { pageSize: 1, page: 2 })).items[0]!._id).not.toBe(directory.items[0]!._id);
    const inbox = await projectService.getMyInvitationPage(outsider, { pageSize: 1 });
    expect(inbox.items).toHaveLength(1); expect(inbox.meta.pageSize).toBe(1);
  });

  it("revokes a removed creator's report, corpus and draft access while preserving academic records", async () => {
    const row = await project(); await join(row._id);
    const report = await db.report.create({ data: { userId: member, projectId: row._id, query: "Private research", title: "Private report", status: "completed" } });
    const corpus = await db.literatureCorpus.create({ data: { ownerId: member, projectId: row._id, name: "Private corpus", topic: "Evidence" } });
    const workspace = await workspaceService.create({ projectId: row._id, name: "Private draft" }, member, "researcher");
    await projectService.removeMemberFromProject(row._id, member, owner);
    await expect(reportService.getById(member, report.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(literatureService.detail(corpus.id, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(workspaceService.get(workspace.id, member, "researcher")).rejects.toMatchObject({ statusCode: 404 });
    await expect(projectService.deleteProject(row._id, owner)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db.report.count({ where: { id: report.id } })).toBe(1);
  });

  it("never sends cancelled or rotated invitation emails", async () => {
    const row = await project(); mail.mockClear();
    const invite = await projectService.inviteMember(row._id, { userId: member }, owner);
    const first = await db.notification.findFirstOrThrow({ where: { eventKey: { startsWith: `PROJECT_INVITATION_${invite.id}_` } } });
    await db.projectInvitation.update({ where: { id: invite.id }, data: { lastSentAt: new Date(Date.now() - 61000) } });
    await projectService.resendInvitation(row._id, invite.id, owner);
    await deliverProjectInvitationEmail(first.id);
    expect((await db.notification.findUniqueOrThrow({ where: { id: first.id } })).emailStatus).toBe("SKIPPED");
    const second = await db.notification.findFirstOrThrow({ where: { eventKey: { startsWith: `PROJECT_INVITATION_${invite.id}_` }, id: { not: first.id } } });
    await projectService.cancelInvitation(row._id, invite.id, owner);
    await deliverProjectInvitationEmail(second.id);
    expect((await db.notification.findUniqueOrThrow({ where: { id: second.id } })).emailPayload).toEqual({});
    expect(mail).not.toHaveBeenCalled();
  });

  it("does not replay a creator's lost response after they lose project access", async () => {
    const request = { title: `Replay ${marker}`, idempotencyKey: crypto.randomUUID() };
    const row = await projectService.createProject(request, owner); projects.push(row._id);
    await join(row._id);
    await projectService.transferOwnership(row._id, member, owner);
    await projectService.removeMemberFromProject(row._id, owner, member);
    await expect(projectService.createProject(request, owner)).rejects.toMatchObject({ statusCode: 404 });
    expect(await db.project.count({ where: { createdById: owner, creationKey: request.idempotencyKey } })).toBe(1);
  });

  it("protects a sole owner's research drafts and records empty-project deletion", async () => {
    const draft = await project();
    await workspaceService.create({ projectId: draft._id, name: "Academic draft" }, owner, "researcher");
    await expect(projectService.deleteProject(draft._id, owner)).rejects.toMatchObject({ statusCode: 409 });
    const empty = await project();
    await projectService.deleteProject(empty._id, owner);
    expect(await db.project.count({ where: { id: empty._id } })).toBe(0);
    expect(await db.auditLog.count({ where: { targetRecordId: empty._id, actionName: "PROJECT_DELETED" } })).toBe(1);
  });
});
