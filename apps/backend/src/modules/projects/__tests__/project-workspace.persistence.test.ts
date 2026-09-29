import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { hashOpaqueToken } from "../../auth/token.service.js";
import { authService } from "../../auth/auth.service.js";
import { projectService } from "../project.service.js";

describe.sequential("project workspace persistence", () => {
  const marker = crypto.randomUUID();
  const emails = {
    owner: `project-owner-${marker}@example.test`,
    member: `project-member-${marker}@example.test`,
    outsider: `project-outsider-${marker}@example.test`,
    externalLogin: `external-login-${marker}@example.test`,
    externalInvited: `external-invited-${marker}@example.edu`,
  };
  let ownerId = "";
  let memberId = "";
  let outsiderId = "";
  let externalId = "";
  let paperId = "";
  const projectIds: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    const [owner, member, outsider, external, paper] = await Promise.all([
      prisma.user.create({ data: { email: emails.owner, fullName: "Project Owner" } }),
      prisma.user.create({ data: { email: emails.member, fullName: "Project Member" } }),
      prisma.user.create({ data: { email: emails.outsider, fullName: "Project Outsider" } }),
      prisma.user.create({ data: { email: emails.externalLogin, fullName: "External Researcher", admissionBasis: "INVITATION" } }),
      prisma.paper.create({ data: { title: `Project evidence ${marker}`, publicationYear: 2026, primaryProvider: "user", paperStatus: "downloaded", dataStatus: "active" } }),
    ]);
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
    externalId = external.id;
    paperId = paper.id;
    const verifiedAt = new Date();
    await prisma.userEmail.createMany({ data: [
      { userId: owner.id, normalizedEmail: emails.owner, isPrimary: true, purpose: "ACCOUNT", verifiedAt },
      { userId: member.id, normalizedEmail: emails.member, isPrimary: true, purpose: "ACCOUNT", verifiedAt },
      { userId: outsider.id, normalizedEmail: emails.outsider, isPrimary: true, purpose: "ACCOUNT", verifiedAt },
      { userId: external.id, normalizedEmail: emails.externalLogin, isPrimary: true, purpose: "ACCOUNT", verifiedAt },
      { userId: external.id, normalizedEmail: emails.externalInvited, isPrimary: false, purpose: "CONTACT", verifiedAt },
    ] });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    if (projectIds.length) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    if (paperId) await prisma.paper.deleteMany({ where: { id: paperId } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  });

  it("persists invitations, membership, per-project screening and removal boundaries", async () => {
    const project = await projectService.createProject({ title: "Private review", visibility: "PRIVATE", status: "ACTIVE" }, ownerId);
    projectIds.push(project._id);

    await expect(projectService.getProjectById(project._id, outsiderId)).rejects.toMatchObject({ statusCode: 404 });

    const invitation = await projectService.inviteMember(project._id, { userId: memberId, message: "Review the evidence" }, ownerId);
    const inbox = await projectService.listMyInvitations(memberId);
    expect(inbox.some((item) => item.id === invitation.id)).toBe(true);
    await expect(projectService.respondToInvitation(project._id, invitation.id, outsiderId, "ACCEPTED")).rejects.toMatchObject({ statusCode: 403 });
    await projectService.respondToInvitation(project._id, invitation.id, memberId, "ACCEPTED");

    await projectService.addPaperToProject(project._id, paperId, memberId);
    await expect(projectService.addPaperToProject(project._id, paperId, memberId)).rejects.toMatchObject({ statusCode: 409 });
    await projectService.updateProjectPaper(project._id, paperId, { screeningStatus: "INCLUDED", readingStatus: "REVIEWED", notes: "Useful baseline" }, memberId);
    const refreshed = await projectService.getProjectById(project._id, memberId);
    expect(refreshed.papers[0]).toMatchObject({ screeningStatus: "INCLUDED", readingStatus: "REVIEWED", notes: "Useful baseline" });
    expect(refreshed.papers[0]?.screenedBy?._id).toBe(memberId);
    expect(refreshed.papers[0]?.screenedAt).toBeTruthy();

    const criteriaProject = await projectService.updateProject(project._id, {
      inclusionCriteria: ["Empirical software engineering studies"],
      exclusionCriteria: ["Non-peer-reviewed opinion pieces"],
    }, ownerId);
    expect(criteriaProject.screeningCriteria).toEqual({
      inclusion: ["Empirical software engineering studies"],
      exclusion: ["Non-peer-reviewed opinion pieces"],
    });
    await expect(projectService.updateProject(project._id, { inclusionCriteria: ["Outsider edit"] }, outsiderId)).rejects.toMatchObject({ statusCode: 403 });

    const second = await projectService.createProject({ title: "Different review", status: "ACTIVE" }, outsiderId);
    projectIds.push(second._id);
    await projectService.addPaperToProject(second._id, paperId, outsiderId);
    await projectService.updateProjectPaper(second._id, paperId, { screeningStatus: "EXCLUDED", exclusionReason: "WRONG_POPULATION_CONTEXT", exclusionNote: "Not a software engineering population" }, outsiderId);
    const secondRefreshed = await projectService.getProjectById(second._id, outsiderId);
    expect(secondRefreshed.papers[0]).toMatchObject({ screeningStatus: "EXCLUDED", exclusionReason: "WRONG_POPULATION_CONTEXT", exclusionNote: "Not a software engineering population", screenedBy: { _id: outsiderId } });
    expect((await projectService.getProjectById(project._id, ownerId)).papers[0]?.screeningStatus).toBe("INCLUDED");
    await projectService.updateProjectPaper(second._id, paperId, { screeningStatus: "INCLUDED" }, outsiderId);
    await expect(projectService.updateProjectPaper(second._id, paperId, { exclusionNote: "remove rationale" }, outsiderId)).rejects.toMatchObject({ statusCode: 400 });
    expect((await projectService.getProjectById(second._id, outsiderId)).papers[0]).toMatchObject({ screeningStatus: "INCLUDED" });

    await projectService.removeMemberFromProject(project._id, memberId, ownerId);
    await expect(projectService.getProjectById(project._id, memberId)).rejects.toMatchObject({ statusCode: 404 });
  }, 20_000);

  it("enforces invitation decisions and owner/member lifecycle boundaries", async () => {
    const project = await projectService.createProject({ title: "Lifecycle review", status: "PLANNING", visibility: "PRIVATE" }, ownerId);
    projectIds.push(project._id);

    const updated = await projectService.updateProject(project._id, {
      title: "Lifecycle evidence review",
      researchField: "Research integrity",
      status: "ACTIVE",
      visibility: "PUBLIC_SUMMARY",
    }, ownerId);
    expect(updated).toMatchObject({ title: "Lifecycle evidence review", status: "ACTIVE", visibility: "PUBLIC_SUMMARY" });
    await expect(projectService.updateProject(project._id, { title: "Unauthorized edit" }, outsiderId)).rejects.toMatchObject({ statusCode: 403 });

    const publicSummary = await projectService.getProjectById(project._id, outsiderId);
    expect(publicSummary).toMatchObject({ isPublicSummary: true, papers: [], members: [] });

    const declined = await projectService.inviteMember(project._id, { userId: memberId }, ownerId);
    await expect(projectService.respondToInvitation(project._id, declined.id, memberId, "DECLINED")).resolves.toEqual({ status: "DECLINED" });

    const cancelled = await projectService.inviteMember(project._id, { userId: memberId }, ownerId);
    await projectService.cancelInvitation(project._id, cancelled.id, ownerId);
    await expect(projectService.respondToInvitation(project._id, cancelled.id, memberId, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });

    const accepted = await projectService.inviteMember(project._id, { userId: memberId }, ownerId);
    await projectService.respondToInvitation(project._id, accepted.id, memberId, "ACCEPTED");
    await expect(projectService.updateProject(project._id, { title: "Member edit" }, memberId)).rejects.toMatchObject({ statusCode: 403 });
    await expect(projectService.archiveProject(project._id, memberId)).rejects.toMatchObject({ statusCode: 403 });
    await expect(projectService.leaveProject(project._id, ownerId)).rejects.toMatchObject({ statusCode: 409 });

    const transferred = await projectService.transferOwnership(project._id, memberId, ownerId);
    expect(transferred.accessRole).toBe("MEMBER");
    await projectService.leaveProject(project._id, ownerId);
    await expect(projectService.getProjectById(project._id, ownerId)).resolves.toMatchObject({ isPublicSummary: true });

    const pendingOnArchive = await projectService.inviteMember(project._id, { userId: outsiderId }, memberId);
    const archived = await projectService.archiveProject(project._id, memberId);
    expect(archived.status).toBe("ARCHIVED");
    await expect(projectService.respondToInvitation(project._id, pendingOnArchive.id, outsiderId, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });
    await expect(projectService.addPaperToProject(project._id, paperId, memberId)).rejects.toMatchObject({ statusCode: 409 });

    const persistedInvites = await getPrisma().projectInvitation.findMany({
      where: { id: { in: [declined.id, cancelled.id, accepted.id, pendingOnArchive.id] } },
      select: { id: true, status: true },
    });
    expect(new Map(persistedInvites.map((invite) => [invite.id, invite.status]))).toEqual(new Map([
      [declined.id, "DECLINED"],
      [cancelled.id, "CANCELLED"],
      [accepted.id, "ACCEPTED"],
      [pendingOnArchive.id, "CANCELLED"],
    ]));
  }, 20_000);

  it("previews and accepts invitation tokens only for the invited email", async () => {
    const prisma = getPrisma();
    const project = await projectService.createProject({ title: "Token invitation review", visibility: "PRIVATE", status: "ACTIVE" }, ownerId);
    projectIds.push(project._id);
    const token = "project_invitation_test_token_0123456789abcdef";

    await prisma.projectInvitation.create({
      data: {
        projectId: project._id,
        invitedUserId: memberId,
        email: emails.member,
        tokenHash: hashOpaqueToken(token),
        invitedById: ownerId,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const anonymousPreview = await projectService.getInvitationByToken(token);
    expect(anonymousPreview).toMatchObject({
      projectId: project._id,
      projectTitle: "Token invitation review",
      invitedEmail: emails.member,
      authenticated: false,
      emailMatches: false,
      status: "PENDING",
    });

    const outsiderPreview = await projectService.getInvitationByToken(token, outsiderId);
    expect(outsiderPreview).toMatchObject({
      authenticated: true,
      emailMatches: false,
      currentUserEmail: emails.outsider,
    });
    await expect(projectService.respondToInvitationByToken(token, outsiderId, "ACCEPTED")).rejects.toMatchObject({ statusCode: 403 });

    await expect(projectService.respondToInvitationByToken(token, memberId, "ACCEPTED")).resolves.toEqual({ status: "ACCEPTED", alreadyMember: false });
    await expect(projectService.respondToInvitationByToken(token, memberId, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });
    await expect(projectService.getProjectById(project._id, memberId)).resolves.toMatchObject({ accessRole: "MEMBER" });
  }, 20_000);

  it("lets an existing account accept with a verified linked invited email while preserving private-project isolation", async () => {
    const project = await projectService.createProject({ title: "External collaboration", visibility: "PRIVATE", status: "ACTIVE" }, ownerId);
    projectIds.push(project._id);
    const otherPrivate = await projectService.createProject({ title: "Unrelated private work", visibility: "PRIVATE", status: "ACTIVE" }, memberId);
    projectIds.push(otherPrivate._id);

    const invitation = await projectService.inviteMember(project._id, { email: emails.externalInvited, message: "Join the review" }, ownerId);
    const stored = await getPrisma().projectInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.email).toBe(emails.externalInvited);
    expect(stored.invitedUserId).toBe(externalId);

    await expect(projectService.respondToInvitation(project._id, invitation.id, externalId, "ACCEPTED"))
      .resolves.toEqual({ status: "ACCEPTED" });
    await expect(projectService.getProjectById(project._id, externalId)).resolves.toMatchObject({ accessRole: "MEMBER" });
    await expect(projectService.getProjectById(otherPrivate._id, externalId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(projectService.createProject({ title: "External standalone project", status: "ACTIVE" }, externalId))
      .rejects.toMatchObject({ statusCode: 403 });

    const fpt = await getPrisma().institution.findUniqueOrThrow({ where: { slug: "fpt-university" } });
    await getPrisma().affiliation.create({
      data: {
        userId: externalId,
        institutionId: fpt.id,
        institutionName: fpt.name,
        verificationStatus: "VERIFIED",
        verificationMethod: "MANUAL_REVIEW",
        verificationSource: "ADMIN",
        verifiedAt: new Date(),
        isPrimary: true,
        isCurrent: true,
      },
    });
    const upgraded = await authService.updateAcademicProfile(externalId, {
      academicRole: "RESEARCHER",
      positionTitle: "Research Fellow",
      institutionName: "FPT University",
      researchAreas: ["Evidence synthesis"],
      researchInterests: ["Systematic reviews"],
    });
    expect(upgraded.participantScope).toBe("INTERNAL");
    expect(upgraded.id).toBe(externalId);
    await expect(projectService.getProjectById(project._id, externalId)).resolves.toMatchObject({ accessRole: "MEMBER" });
    const postUpgradeProject = await projectService.createProject({ title: "Internal continuation", status: "ACTIVE" }, externalId);
    projectIds.push(postUpgradeProject._id);
    expect(postUpgradeProject.accessRole).toBe("OWNER");
  }, 20_000);

  it("rejects expired and cancelled invitation tokens", async () => {
    const prisma = getPrisma();
    const project = await projectService.createProject({ title: "Expired token review", visibility: "PRIVATE", status: "ACTIVE" }, ownerId);
    projectIds.push(project._id);
    const expiredToken = "expired_project_invitation_token_0123456789abcdef";
    const cancelledToken = "cancelled_project_invitation_token_0123456789abcdef";

    await prisma.projectInvitation.createMany({
      data: [
        {
          projectId: project._id,
          invitedUserId: externalId,
          email: emails.externalInvited,
          tokenHash: hashOpaqueToken(expiredToken),
          invitedById: ownerId,
          status: "PENDING",
          expiresAt: new Date(Date.now() - 60_000),
        },
        {
          projectId: project._id,
          invitedUserId: externalId,
          email: emails.externalInvited,
          tokenHash: hashOpaqueToken(cancelledToken),
          invitedById: ownerId,
          status: "CANCELLED",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          respondedAt: new Date(),
        },
      ],
    });

    await expect(projectService.respondToInvitationByToken(expiredToken, externalId, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });
    await expect(projectService.respondToInvitationByToken(cancelledToken, externalId, "ACCEPTED")).rejects.toMatchObject({ statusCode: 409 });
  }, 20_000);
});
