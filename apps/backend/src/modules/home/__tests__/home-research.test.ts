import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthClaims } from "../../../common/middleware/auth.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { getResearchHome, researchWorkspace } from "../home-research.service.js";

describe.sequential("Research Home real data and access boundaries", () => {
  const db = getPrisma();
  const user = randomUUID(), other = randomUUID(), lecturer = randomUUID(), empty = randomUUID();
  const users = [user, other, lecturer, empty];
  const active = randomUUID(), privateId = randomUUID(), archived = randomUUID(), complete = randomUUID(), shared = randomUUID();
  const projects = [active, privateId, archived, complete, shared];
  const paper = randomUUID(), included = randomUUID(), recommendation = randomUUID(), restrictedPaper = randomUUID();
  const papers = [paper, included, recommendation, restrictedPaper];
  const gap = randomUUID(), template = randomUUID(), version = randomUUID(), submission = randomUUID(), revision = randomUUID(), request = randomUUID();
  const community = randomUUID(), hiddenTopic = randomUUID(), privateTopic = randomUUID();
  const claims = (id: string, role: "user" | "admin" = "user") => ({ sub: id, role }) as AuthClaims;
  beforeAll(async () => {
    await db.user.createMany({ data: users.map((id) => ({ id, email: `${id}@home-test.invalid`, fullName: "Home research test", researchInterests: [`home-interest-${user}`] })) });
    await db.userEmail.createMany({ data: users.map((id) => ({ userId: id, normalizedEmail: `${id}@home-test.invalid`, verifiedAt: new Date() })) });
    await db.academicProfile.createMany({ data: [{ userId: user, academicRole: "STUDENT" }, { userId: lecturer, academicRole: "LECTURER" }] });
    await db.userCapability.createMany({ data: ["STRUCTURED_REVIEW", "MENTOR_PROJECT"].map((capability) => ({ userId: lecturer, capability, status: "ACTIVE", source: "home-test" })) });
    await db.project.createMany({ data: [
      { id: active, ownerId: user, title: "Active screening work", status: "ACTIVE" },
      { id: privateId, ownerId: other, title: "Secret unrelated project", status: "ACTIVE" },
      { id: archived, ownerId: user, title: "Archived", status: "ARCHIVED" },
      { id: complete, ownerId: user, title: "Completed", status: "COMPLETED" },
      { id: shared, ownerId: other, title: "Shared evidence work", status: "ACTIVE" },
    ] });
    await db.projectMember.create({ data: { projectId: shared, userId: user, status: "ACTIVE" } });
    await db.paper.createMany({ data: papers.map((id) => ({ id, title: id === recommendation ? `home-interest-${user} recommended literature` : "Home test paper", primaryProvider: "openalex", publicationYear: 2026, dataStatus: id === restrictedPaper ? "draft" : "active" })) });
    await db.projectPaper.createMany({ data: [
      { projectId: active, paperId: paper, screeningStatus: "UNDECIDED" },
      { projectId: active, paperId: included, screeningStatus: "INCLUDED" },
      { projectId: privateId, paperId: paper },
      { projectId: archived, paperId: paper },
      { projectId: shared, paperId: included, screeningStatus: "INCLUDED" },
    ] });
    await db.researchGap.create({ data: { id: gap, userId: user, projectId: active, title: "Home candidate", topic: "Testing", normalizedTopic: "testing", description: "Candidate", rationale: "Evidence", source: "manual" } });
    await db.gapEvidenceRecord.create({ data: { gapId: gap, paperId: included, evidenceKind: "supporting", explanation: "Evidence attached", addedById: user } });
    await db.reviewTemplate.create({ data: { id: template, name: "Home review test" } });
    await db.reviewTemplateVersion.create({ data: { id: version, templateId: template, versionNumber: 1, reviewMode: "STRUCTURED_REVIEW", status: "PUBLISHED" } });
    await db.submission.create({ data: { id: submission, projectId: active, createdById: user, title: "Proposal requiring revision" } });
    await db.submissionRevision.create({ data: { id: revision, submissionId: submission, revisionNumber: 1, uploadedById: user, sizeBytes: 32, contentType: "MARKDOWN", contentSnapshot: "Research proposal for review" } });
    await db.reviewRequest.create({ data: { id: request, projectId: active, submissionId: submission, requesterId: user, templateVersionId: version, artifactRevisionId: revision, status: "REVISION_REQUESTED" } });
    await db.reviewerAssignment.create({ data: { submissionId: submission, reviewerId: lecturer, assignedById: user, anonymousCode: randomUUID(), status: "accepted" } });
    await db.mentorRelationship.create({ data: { projectId: active, mentorUserId: lecturer, requestedBy: user, status: "PENDING", message: "Please mentor our evidence work" } });
    await db.projectInvitation.createMany({ data: [
      { projectId: shared, invitedById: other, email: `${user}@home-test.invalid`, expiresAt: new Date(Date.now() + 86400_000) },
      { projectId: privateId, invitedById: other, email: `${user}@home-test.invalid`, expiresAt: new Date(0) },
    ] });
    await db.community.create({ data: { id: community, name: "Private Home community", ownerId: other, slug: `home-${community}`, visibility: "private" } });
    await db.forumPost.createMany({ data: [
      { id: privateTopic, communityId: community, authorId: other, title: "Private Home discussion", body: "Private" },
      { id: hiddenTopic, authorId: other, title: "Hidden Home discussion", body: "Hidden", visibilityStatus: "HIDDEN" },
    ] });
  });
  afterAll(async () => {
    await db.forumPost.deleteMany({ where: { id: { in: [privateTopic, hiddenTopic] } } });
    await db.community.deleteMany({ where: { id: community } });
    await db.projectInvitation.deleteMany({ where: { projectId: { in: projects } } });
    await db.mentorRelationship.deleteMany({ where: { projectId: { in: projects } } });
    await db.reviewerAssignment.deleteMany({ where: { submissionId: submission } });
    await db.reviewRequest.deleteMany({ where: { id: request } });
    await db.submissionRevision.deleteMany({ where: { id: revision } });
    await db.submission.deleteMany({ where: { id: submission } });
    await db.reviewTemplateVersion.deleteMany({ where: { id: version } });
    await db.reviewTemplate.deleteMany({ where: { id: template } });
    await db.gapEvidenceRecord.deleteMany({ where: { gapId: gap } });
    await db.researchGap.deleteMany({ where: { id: gap } });
    await db.projectPaper.deleteMany({ where: { projectId: { in: projects } } });
    await db.projectMember.deleteMany({ where: { projectId: { in: projects } } });
    await db.project.deleteMany({ where: { id: { in: projects } } });
    await db.bookmark.deleteMany({ where: { userId: { in: users } } });
    await db.paper.deleteMany({ where: { id: { in: papers } } });
    await db.userCapability.deleteMany({ where: { userId: { in: users } } });
    await db.academicProfile.deleteMany({ where: { userId: { in: users } } });
    await db.userEmail.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  it("uses exact stage-specific counts and prioritizes revisions", async () => {
    const result = await researchWorkspace(user, "STUDENT");
    expect(result.continueResearch[0]).toMatchObject({ id: active, stage: "revision", paperCount: 2, screenedCount: 1, evidenceCount: 1, papersWithEvidence: 1 });
    expect(result.continueResearch[0].href).toBe(`/review-requests/${request}`);
    expect(result.attention[0].type).toBe("revision");
    expect(result.attention.find((i) => i.type === "screening")).toMatchObject({ count: 1, projectId: active });
    expect(result.attention.find((i) => i.type === "evidence")).toMatchObject({ count: 1, projectId: shared });
  });
  it("excludes private, archived, completed and inactive membership work, including for Admin", async () => {
    await db.projectMember.update({ where: { projectId_userId: { projectId: shared, userId: user } }, data: { status: "LEFT" } });
    const result = await getResearchHome(claims(user, "admin"));
    expect(result.workspace.status).toBe("ready");
    expect(result.workspace.data?.continueResearch.map((p) => p.id)).toEqual([active]);
    expect(result.workspace.data?.attention.some((i) => i.type === "evidence")).toBe(false);
    expect(result.workspace.data?.attention.some((i) => i.projectId === privateId)).toBe(false);
    expect(result.currentUser.academicRole).toBe("STUDENT");
    await db.projectMember.update({ where: { projectId_userId: { projectId: shared, userId: user } }, data: { status: "ACTIVE" } });
  });
  it("shows pending invitations only while verified and unexpired", async () => {
    const result = await researchWorkspace(user);
    expect(result.attention.filter((i) => i.type === "invitation").map((i) => i.projectId)).toEqual([shared]);
    await db.userEmail.updateMany({ where: { userId: user }, data: { verifiedAt: null } });
    expect((await researchWorkspace(user)).attention.some((i) => i.type === "invitation")).toBe(false);
    await db.userEmail.updateMany({ where: { userId: user }, data: { verifiedAt: new Date() } });
  });
  it("orders Lecturer review and mentorship work ahead of screening without project access", async () => {
    const result = await researchWorkspace(lecturer, "LECTURER");
    expect(result.continueResearch).toEqual([]);
    expect(result.attention.map((i) => i.type)).toEqual(["review", "mentorship"]);
    await db.userCapability.updateMany({ where: { userId: lecturer }, data: { status: "REVOKED" } });
    expect((await researchWorkspace(lecturer, "LECTURER")).attention).toEqual([]);
    await db.userCapability.updateMany({ where: { userId: lecturer }, data: { status: "ACTIVE" } });
  });
  it("matches interests honestly, excludes saved/project/restricted papers and hides forum content", async () => {
    const result = await getResearchHome(claims(user));
    expect(result.recommendations.status).toBe("ready");
    expect(result.recommendations.data?.[0]).toMatchObject({ id: recommendation, reason: "interest", reasonLabel: `home-interest-${user}` });
    expect(result.recommendations.data?.some((p) => [paper, included, restrictedPaper].includes(p.id))).toBe(false);
    expect(result.communityActivity.status).toBe("ready");
    expect(result.communityActivity.data?.some((p) => [privateTopic, hiddenTopic].includes(p.id))).toBe(false);
    await db.bookmark.create({ data: { userId: user, paperId: recommendation } });
    expect((await getResearchHome(claims(user))).recommendations.data?.some((p) => p.id === recommendation)).toBe(false);
  });
  it("returns intentional empty research data for a new user", async () => {
    const result = await getResearchHome(claims(empty));
    expect(result.workspace).toEqual({ status: "ready", data: { continueResearch: [], attention: [] } });
  });
});
