import { beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { projectMentorshipService as service } from "../project-mentorship.service.js";
import { academicProfileService } from "../../academic-profiles/academic-profile.service.js";
import { canAccessProjectAsMentor } from "../academic-relationship-access.js";
import { submissionService } from "../../submissions/submission.service.js";
import { env } from "../../../config/env.js";
import { verificationEvidenceStorage } from "../../academic-profiles/verification-evidence-storage.service.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));

// This suite runs only against the scratch database created by the integration harness.
describe.skipIf(process.env.STUDENT_AFFILIATION_INTEGRATION !== "1").sequential("academic relationship consent (PostgreSQL)", () => {
  let owner = "", lecturer = "", member = "", unverified = "", admin = "", project = "";
  beforeEach(async () => {
    const db = getPrisma();
    const ids: string[] = [];
    for (const [name, role, verified] of [["Owner", "STUDENT", false], ["Lecturer", "LECTURER", true], ["Member", "RESEARCHER", false], ["Claimant", "LECTURER", false], ["Admin", "RESEARCHER", false]] as const) {
      const user = await db.user.create({ data: { email: `${crypto.randomUUID()}@example.test`, fullName: name, institution: "University of Melbourne", emailVerifiedAt: new Date(), ...(name === "Admin" ? { systemRole: "ADMIN", role: "admin" } : {}) } });
      ids.push(user.id);
      await db.academicProfile.create({ data: { userId: user.id, academicRole: role, primaryPosition: role === "LECTURER" ? "LECTURER" : "STUDENT", positionTitle: role === "LECTURER" ? "Lecturer" : "Student", roleVerificationStatus: verified ? "VERIFIED" : "SELF_DECLARED", positionStatus: verified ? "VERIFIED" : "NOT_SUBMITTED", supportAvailability: { enabled: true } } });
    }
    [owner, lecturer, member, unverified, admin] = ids;
    project = (await db.project.create({ data: { ownerId: owner, title: "Safe title", description: "CONFIDENTIAL internal description", visibility: "PRIVATE" } })).id;
    await db.projectMember.create({ data: { projectId: project, userId: member, role: "MEMBER", status: "ACTIVE" } });
  });
  afterAll(async () => {
    if (unverified) for (const source of await getPrisma().verificationEvidenceSource.findMany({ where: { request: { userId: unverified } } })) {
      if (source.storageKey) await verificationEvidenceStorage.remove(source.storageKey, unverified);
    }
    await disconnectPostgres();
  });

  it("allows owner requests and grants scoped access only after Lecturer acceptance", async () => {
    await expect(service.request(project, member, { mentorUserId: lecturer, message: "Help with research methods" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.request(project, owner, { mentorUserId: unverified, message: "Help with research methods" })).rejects.toMatchObject({ statusCode: 403 });
    const request = await service.request(project, owner, { mentorUserId: lecturer, message: "Help evaluate methods" });
    expect(request.status).toBe("PENDING");
    expect(await canAccessProjectAsMentor(project, lecturer)).toBe(false);
    await expect(service.workspace(project, lecturer)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.accept(project, request.id, owner)).rejects.toMatchObject({ statusCode: 403 });
    await service.accept(project, request.id, lecturer);
    expect(await canAccessProjectAsMentor(project, lecturer)).toBe(true);
    const workspace = await service.workspace(project, lecturer, "Consider a control group");
    expect(workspace.guidance[0].note).toBe("Consider a control group");
    expect(workspace.context.description).toContain("CONFIDENTIAL");
    expect(await getPrisma().projectMember.count({ where: { projectId: project, userId: lecturer } })).toBe(0);
    await expect(submissionService.assignReviewer(project, { reviewerId: lecturer }, admin)).rejects.toMatchObject({ statusCode: 409 });
    await service.end(project, (await service.accept(project, request.id, lecturer)).relationshipId!, owner, "Study finished");
    expect(await canAccessProjectAsMentor(project, lecturer)).toBe(false);
    await expect(service.workspace(project, lecturer)).rejects.toMatchObject({ statusCode: 403 });
    expect(await getPrisma().projectActivity.count({ where: { projectId: project, type: "MENTOR_GUIDANCE" } })).toBe(1);
  });

  it("offers require discovery opt-in and owner acceptance without private content leaks", async () => {
    await expect(service.offer(project, lecturer, { message: "Offer research guidance" })).rejects.toMatchObject({ statusCode: 403 });
    await service.settings(project, owner, { discovery: "SEEKING_MENTOR", summary: "We seek help designing evaluation", expertise: ["Empirical research"] });
    const previews = (await service.discovery(lecturer)).items;
    const preview = previews.find(p => p.id === project)!;
    expect(preview.summary).toContain("evaluation");
    expect(Object.keys(preview).sort()).toEqual(["discovery", "expertise", "id", "researchField", "stage", "summary", "title"].sort());
    expect(JSON.stringify(preview)).not.toContain("CONFIDENTIAL");
    await expect(service.discovery(unverified)).rejects.toMatchObject({ statusCode: 403 });
    const offer = await service.offer(project, lecturer, { message: "I can mentor this project" });
    await expect(service.accept(project, offer.id, lecturer)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.accept(project, offer.id, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.workspace(project, lecturer)).rejects.toMatchObject({ statusCode: 403 });
    await service.accept(project, offer.id, owner);
    expect(await canAccessProjectAsMentor(project, lecturer)).toBe(true);
    expect((await getPrisma().project.findUniqueOrThrow({ where: { id: project } })).visibility).toBe("PRIVATE");
  });

  it("serializes duplicate creation and accept/cancel races", async () => {
    const creates = await Promise.allSettled([1, 2].map(() => service.request(project, owner, { mentorUserId: lecturer, message: "Help with research methods" })));
    expect(creates.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const request = await getPrisma().mentorshipRequest.findFirstOrThrow({ where: { projectId: project } });
    const results = await Promise.allSettled([service.accept(project, request.id, lecturer), service.cancel(project, request.id, owner)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await getPrisma().mentorshipRequest.count({ where: { projectId: project } })).toBe(1);
  });

  it("enforces availability, cooldown, expiry and sender cancellation", async () => {
    const db = getPrisma();
    await db.academicProfile.update({ where: { userId: lecturer }, data: { supportAvailability: { enabled: false } } });
    await expect(service.request(project, owner, { mentorUserId: lecturer, message: "Help with research methods" })).rejects.toMatchObject({ statusCode: 409 });
    await db.academicProfile.update({ where: { userId: lecturer }, data: { supportAvailability: { enabled: true } } });
    const request = await service.request(project, owner, { mentorUserId: lecturer, message: "Help with research methods" });
    await expect(service.cancel(project, request.id, lecturer)).rejects.toMatchObject({ statusCode: 403 });
    await service.decline(project, request.id, lecturer);
    await expect(service.request(project, owner, { mentorUserId: lecturer, message: "Help with research methods" })).rejects.toMatchObject({ statusCode: 409 });
    await db.mentorshipRequest.update({ where: { id: request.id }, data: { respondedAt: new Date(0) } });
    const next = await service.request(project, owner, { mentorUserId: lecturer, message: "Help with research methods" });
    await db.mentorshipRequest.update({ where: { id: next.id }, data: { expiresAt: new Date(0) } });
    await expect(service.accept(project, next.id, lecturer)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.list(project, owner)).requests.find(r => r.id === next.id)?.status).toBe("EXPIRED");
  });

  it("bounds creation by configured requester limit across projects", async () => {
    await getPrisma().mentorshipRequest.createMany({ data: Array.from({ length: env.ACADEMIC_RELATIONSHIP_REQUEST_LIMIT }, () => ({ projectId: project, mentorUserId: lecturer, requestedBy: owner, status: "DECLINED", respondedAt: new Date(0) })) });
    await expect(service.request(project, owner, { mentorUserId: lecturer, message: "Help with research methods" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("keeps legacy public Project IDs consistent in relationship responses", async () => {
    const legacy = "112233445566778899aabbcc";
    await getPrisma().project.update({ where: { id: project }, data: { legacyMongoId: legacy } });
    const request = await service.request(legacy, owner, { mentorUserId: lecturer, message: "Help with research methods" });
    expect(request.projectId).toBe(legacy);
    expect(request.project?.id).toBe(legacy);
    await service.accept(legacy, request.id, lecturer);
    expect((await service.workspace(legacy, lecturer)).project.id).toBe(legacy);
  });

  it("removes current access on verification revocation or role changes and preserves history", async () => {
    const db = getPrisma();
    const request = await service.request(project, owner, { mentorUserId: lecturer, message: "Help with research methods" });
    await service.accept(project, request.id, lecturer);
    await db.academicProfile.update({ where: { userId: lecturer }, data: { positionStatus: "INVALIDATED" } });
    expect(await canAccessProjectAsMentor(project, lecturer)).toBe(false);
    await expect(service.workspace(project, lecturer, "Forbidden note")).rejects.toMatchObject({ statusCode: 403 });
    await db.academicProfile.update({ where: { userId: lecturer }, data: { positionStatus: "VERIFIED", academicRole: "RESEARCHER" } });
    expect(await canAccessProjectAsMentor(project, lecturer)).toBe(false);
    expect((await db.mentorRelationship.findFirstOrThrow({ where: { sourceRequestId: request.id } })).startedAt).not.toBeNull();
    await service.end(project, (await service.list(project, lecturer)).relationships[0]!.id, lecturer);
  });

  it("blocks acceptance after archive or verification changes and isolates requests", async () => {
    const request = await service.request(project, owner, { mentorUserId: lecturer, message: "Help with research methods" });
    await expect(service.list(project, unverified)).rejects.toMatchObject({ statusCode: 403 });
    await getPrisma().academicProfile.update({ where: { userId: lecturer }, data: { roleVerificationStatus: "REJECTED" } });
    await expect(service.accept(project, request.id, lecturer)).rejects.toMatchObject({ statusCode: 403 });
    await getPrisma().academicProfile.update({ where: { userId: lecturer }, data: { roleVerificationStatus: "VERIFIED" } });
    await getPrisma().project.update({ where: { id: project }, data: { status: "ARCHIVED" } });
    await expect(service.accept(project, request.id, lecturer)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("keeps non-FPT Lecturer evidence private, supports more-info and safe concurrent decisions", async () => {
    const db = getPrisma();
    const institution = await db.institution.create({ data: { name: "University of Melbourne", slug: `consent-${crypto.randomUUID()}` } });
    await db.affiliation.create({ data: { userId: unverified, institutionId: institution.id, institutionName: institution.name, isPrimary: true, isCurrent: true } });
    const input = { type: "POSITION", path: "MANUAL", institutionId: institution.id, evidenceType: "DOCUMENT", primarySourceType: "EMPLOYMENT_DOCUMENT", additionalSourceType: "APPOINTMENT_DOCUMENT", additionalNote: "PRIVATE-NOTE" } as const;
    const buffer = Buffer.from("%PDF-1.4\nemployment\n%%EOF"), other = Buffer.from("%PDF-1.4\nappointment\n%%EOF");
    const file = { buffer, size: buffer.length, mimetype: "application/pdf", originalname: "employment.pdf" }, additional = { ...file, buffer: other, size: other.length, originalname: "appointment.pdf" };
    await academicProfileService.requestVerification(unverified, input, file, additional);
    let request = await db.verificationEvidence.findFirstOrThrow({ where: { userId: unverified, status: "PENDING" }, include: { sources: true } });
    await expect(academicProfileService.decideVerification(request.id, { decision: "approve" }, member)).rejects.toMatchObject({ statusCode: 403 });
    await expect(academicProfileService.decideVerification(request.id, { decision: "approve" }, unverified)).rejects.toMatchObject({ statusCode: 409 });
    await academicProfileService.decideVerification(request.id, { decision: "more_info", reason: "Provide a current appointment record" }, admin);
    expect((await db.academicProfile.findUniqueOrThrow({ where: { userId: unverified } })).positionStatus).toBe("NEEDS_MORE_INFORMATION");
    await academicProfileService.requestVerification(unverified, input, file, additional);
    request = await db.verificationEvidence.findFirstOrThrow({ where: { userId: unverified, status: "PENDING" }, include: { sources: true } });
    const approval = { decision: "approve" as const, checklist: { identityMatches: true, institutionMatches: true, currentPositionConfirmed: true, institutionControlled: true, noConflicts: true, identityBound: true, independentEvidence: true }, evidenceChecks: request.sources.map(source => ({ id: source.id, status: "VALID" as const })) };
    const decisions = await Promise.allSettled([academicProfileService.decideVerification(request.id, approval, admin), academicProfileService.decideVerification(request.id, { decision: "reject", reason: "Cannot confirm" }, admin)]);
    expect(decisions.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const publicProfile = JSON.stringify(await academicProfileService.getPublic(unverified, member));
    expect(publicProfile).not.toContain("PRIVATE-STAFF-ID");
    expect(publicProfile).not.toContain("PRIVATE-NOTE");
    expect(publicProfile).not.toContain("verificationRequests");
    expect((await db.user.findUniqueOrThrow({ where: { id: unverified } })).isActive).toBe(true);
  });
});
