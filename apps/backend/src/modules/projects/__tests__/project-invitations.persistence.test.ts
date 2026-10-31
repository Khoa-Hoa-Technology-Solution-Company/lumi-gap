import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { projectService as service } from "../project.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) }, aiJobsQueue: { add: vi.fn().mockResolvedValue({}) } }));
const enabled = process.env.PROJECT_INVITATIONS_INTEGRATION === "1";
if (enabled && (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test") || !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname))) throw new Error("Project invitation tests require a local isolated _test database");

describe.skipIf(!enabled)("project invitation consent and owner permissions (isolated PostgreSQL)", () => {
  const db = getPrisma();
  afterAll(disconnectPostgres);
  async function user(lecturer = false) {
    const row = await db.user.create({ data: { email: `invitation-${randomUUID()}@example.org`, fullName: "Same display name", emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
    await db.academicProfile.create({ data: { userId: row.id, academicRole: lecturer ? "LECTURER" : "RESEARCHER", primaryPosition: lecturer ? "LECTURER" : "RESEARCH_STAFF", roleVerificationStatus: lecturer ? "VERIFIED" : "SELF_DECLARED", positionStatus: lecturer ? "VERIFIED" : "NOT_SUBMITTED" } });
    return row;
  }
  async function fixture() {
    const owner = await user(), first = await user(), second = await user();
    const project = await createProjectFixture({ data: { title: "Invitation consent regression", ownerId: owner.id, status: "ACTIVE" } });
    return { owner, first, second, project };
  }

  it("keeps distinct accounts separate even when display names match; only the accepted invitation disappears", async () => {
    const f = await fixture();
    const first = await service.inviteMember(f.project.id, { userId: f.first.id }, f.owner.id);
    const second = await service.inviteMember(f.project.id, { userId: f.second.id }, f.owner.id);
    expect((await service.listMyInvitations(f.first.id)).find(i => i.id === first.id)).toMatchObject({ invitedEmail: f.first.email });
    await service.respondToInvitation(f.project.id, first.id, f.first.id, "ACCEPTED");
    const team = await service.team(f.project.id, f.owner.id);
    expect(team.invitations.map(i => i.id)).toEqual([second.id]);
    expect(team.memberMeta.total).toBe(2);
    expect((await service.listMyInvitations(f.first.id)).some(i => i.id === first.id)).toBe(false);
    expect((await service.listMyInvitations(f.second.id)).find(i => i.id === second.id)).toMatchObject({ invitedEmail: f.second.email, status: "PENDING" });
    expect(await db.projectMember.count({ where: { projectId: f.project.id, userId: f.second.id } })).toBe(0);
  });

  it("does not accept when reading notifications, preview or inbox, and rejects the wrong account", async () => {
    const f = await fixture(), invite = await service.inviteMember(f.project.id, { userId: f.first.id }, f.owner.id);
    await service.listMyInvitations(f.first.id);
    expect((await service.listMyInvitations(f.second.id)).some(i => i.id === invite.id)).toBe(false);
    await expect(service.respondToInvitation(f.project.id, invite.id, f.second.id, "ACCEPTED")).rejects.toMatchObject({ statusCode: 403 });
    expect((await db.projectInvitation.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe("PENDING");
    expect(await db.projectMember.count({ where: { projectId: f.project.id } })).toBe(1);
  });

  it("accepts concurrent retries once and removes the invitation from the owner's pending count", async () => {
    const f = await fixture(), invite = await service.inviteMember(f.project.id, { userId: f.first.id }, f.owner.id);
    const results = await Promise.all(Array.from({ length: 2 }, () => service.respondToInvitation(f.project.id, invite.id, f.first.id, "ACCEPTED")));
    expect(results.every(r => r.projectId === f.project.id && r.status === "ACCEPTED")).toBe(true);
    expect((await service.team(f.project.id, f.owner.id)).invitationMeta.total).toBe(0);
    expect(await db.projectActivity.count({ where: { projectId: f.project.id, type: "MEMBER_JOINED" } })).toBe(1);
  });

  it("allows only the actual owner to invite, resend, cancel or use the legacy add-member route", async () => {
    const f = await fixture(), lecturer = await user(true);
    await db.projectMember.createMany({ data: [{ projectId: f.project.id, userId: f.first.id }, { projectId: f.project.id, userId: lecturer.id }] });
    const invite = await service.inviteMember(f.project.id, { userId: f.second.id }, f.owner.id);
    for (const actor of [f.first.id, lecturer.id]) {
      await expect(service.inviteMember(f.project.id, { email: `outsider-${randomUUID()}@example.org` }, actor)).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.resendInvitation(f.project.id, invite.id, actor)).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.cancelInvitation(f.project.id, invite.id, actor)).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.addMemberToProject(f.project.id, { targetId: f.second.id }, actor)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect((await db.projectInvitation.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe("PENDING");
    await service.cancelInvitation(f.project.id, invite.id, f.owner.id);
    expect((await service.team(f.project.id, f.owner.id)).invitationMeta.total).toBe(0);
  });
});
