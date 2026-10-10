import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { authService } from "../auth.service.js";
import { authMailService } from "../auth-mail.service.js";
import { academicProfileService } from "../../academic-profiles/academic-profile.service.js";
import { studentAffiliationService } from "../../academic-profiles/student-affiliation.service.js";
import { assertPeerReviewer } from "../../reviews/peer-review-access.js";
import { projectService } from "../../projects/project.service.js";
import { projectMentorshipService } from "../../projects/project-mentorship.service.js";
import { cleanupVerificationEvidence } from "../../academic-profiles/verification-evidence-retention.service.js";
import { affiliationService } from "../../verification/affiliation.service.js";

const enabled = process.env.STUDENT_AFFILIATION_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated test database");
describe.skipIf(!enabled).sequential("open registration, onboarding and generic affiliation", () => {
  const db = getPrisma(), marker = randomUUID(), ids: string[] = [], institutions: string[] = [];
  let adminId: string, hostId: string;
  const bytes = Buffer.from("%PDF-1.4\nacademic affiliation\n%%EOF");
  const file = { buffer: bytes, size: bytes.length, mimetype: "application/pdf", originalname: "private.pdf" };
  const mail = vi.spyOn(authMailService, "sendEmailVerification").mockResolvedValue(true);
  vi.spyOn(authMailService, "sendAffiliationStatus").mockResolvedValue(true);
  beforeAll(async () => {
    hostId = (await db.institution.findUniqueOrThrow({ where: { slug: "fpt-university" } })).id;
    const admin = await db.user.create({ data: { email: `admin-open-${marker}@example.test`, fullName: "Admin", systemRole: "ADMIN", role: "admin", emailVerifiedAt: new Date() } }); adminId = admin.id; ids.push(adminId);
  });
  afterAll(async () => {
    await db.project.deleteMany({ where: { ownerId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await cleanupVerificationEvidence();
    await db.academicProgram.deleteMany({ where: { institutionId: { in: institutions } } });
    await db.institution.deleteMany({ where: { id: { in: institutions } } });
    vi.restoreAllMocks();
  });
  async function account(email: string) {
    const created = await authService.register({ email, password: "OpenPlatformPassword123", fullName: "Academic Member" }); ids.push(created.user.id);
    expect(created.user.emailVerifiedAt).toBeUndefined();
    const token = mail.mock.calls.findLast(call => call[0] === email)![1];
    await authService.verifyEmail(token);
    return created.user.id;
  }
  it.each(["STUDENT", "RESEARCHER", "LECTURER"] as const)("lets non-FPT %s register, finish onboarding, retry and create a project", async academicRole => {
    const id = await account(`${academicRole.toLowerCase()}-${marker}@other-university.edu`);
    const institutionName = `Open university ${academicRole} ${marker}`;
    const input = { academicRole, institutionName, researchAreas: ["Computer Science"], ...(academicRole === "STUDENT" ? { programName: "Software Engineering" } : { positionTitle: academicRole === "LECTURER" ? "Assistant Professor" : "Research Engineer" }) };
    const result = await authService.updateAcademicProfile(id, input);
    const affiliation = await db.affiliation.findFirstOrThrow({ where: { userId: id, isCurrent: true } }); institutions.push(affiliation.institutionId);
    expect(result.onboarding?.completed).toBe(true);
    expect(result.capabilities).toContain("CREATE_RESEARCH_PROJECT");
    expect(result.capabilities).not.toContain("STRUCTURED_REVIEW");
    expect(affiliation.verificationStatus).toBe("NOT_SUBMITTED");
    await db.academicProfile.update({ where: { userId: id }, data: { biography: "Existing biography", skills: ["Python"] } });
    await authService.updateAcademicProfile(id, input);
    expect(await db.academicProfile.count({ where: { userId: id } })).toBe(1);
    expect(await db.affiliation.count({ where: { userId: id, isCurrent: true } })).toBe(1);
    expect(await db.academicProfile.findUnique({ where: { userId: id } })).toMatchObject({ biography: "Existing biography", skills: ["Python"] });
    const profile = await academicProfileService.getMine(id);
    expect(profile.affiliation.hostInstitution).toBe(false);
    if (academicRole === "STUDENT") expect(profile.affiliation.programName).toBe("Software Engineering");
    expect((await projectService.createProject({ title: "Normal research" }, id)).title).toBe("Normal research");
    await expect(assertPeerReviewer(id)).rejects.toMatchObject({ statusCode: 403 });
  }, 15_000);
  it.each(["RESEARCHER", "LECTURER"] as const)("uses the same private affiliation flow for FPT %s without granting formal authority", async academicRole => {
    const id = await account(`${academicRole.toLowerCase()}-fpt-${marker}@gmail.com`);
    await authService.updateAcademicProfile(id, { academicRole, institutionId: hostId, institutionName: "FPT University", positionTitle: academicRole === "LECTURER" ? "Lecturer" : "Research Fellow", researchAreas: ["Education"] });
    await studentAffiliationService.submit(id, { type: "AFFILIATION", evidenceType: "DOCUMENT", institutionId: hostId, proofType: "STAFF" }, file);
    const request = await db.verificationEvidence.findFirstOrThrow({ where: { userId: id, status: "PENDING" } });
    await academicProfileService.decideVerification(request.id, { decision: "approve" }, adminId);
    const result = await authService.me(id);
    expect(result.participantScope).toBe("INTERNAL");
    expect(result.capabilities).toContain("CREATE_RESEARCH_PROJECT");
    expect(result.capabilities).not.toContain("STRUCTURED_REVIEW");
    expect((await academicProfileService.getMine(id)).verificationStatuses).toMatchObject({ affiliation: "VERIFIED", position: "NOT_SUBMITTED" });
    await expect(assertPeerReviewer(id)).rejects.toMatchObject({ statusCode: 403 });
  }, 15_000);
  it("requires a relationship for a verified non-FPT mentor and invalidates authority on role change", async () => {
    const lecturer = await db.user.findUniqueOrThrow({ where: { email: `lecturer-${marker}@other-university.edu` } });
    const student = await db.user.findUniqueOrThrow({ where: { email: `student-${marker}@other-university.edu` } });
    const project = await projectService.createProject({ title: "Assigned mentoring" }, student.id);
    await expect(projectMentorshipService.request(project._id, student.id, { mentorUserId: lecturer.id })).rejects.toMatchObject({ statusCode: 403 });
    const additionalBytes = Buffer.from("%PDF-1.4\nappointment\n%%EOF"), additional = { ...file, buffer: additionalBytes, size: additionalBytes.length };
    async function verifyLecturer() {
      const current = await db.affiliation.findFirstOrThrow({ where: { userId: lecturer.id, isPrimary: true, isCurrent: true } });
      await academicProfileService.requestVerification(lecturer.id, { type: "POSITION", path: "MANUAL", institutionId: current.institutionId, evidenceType: "DOCUMENT", primarySourceType: "EMPLOYMENT_DOCUMENT", additionalSourceType: "APPOINTMENT_DOCUMENT" }, file, additional);
      const evidence = await db.verificationEvidence.findFirstOrThrow({ where: { userId: lecturer.id, verificationType: "POSITION", status: "PENDING" }, include: { sources: true } });
      await academicProfileService.decideVerification(evidence.id, { decision: "approve", checklist: { identityMatches: true, institutionMatches: true, currentPositionConfirmed: true, institutionControlled: true, noConflicts: true, identityBound: true, independentEvidence: true }, evidenceChecks: evidence.sources.map(source => ({ id: source.id, status: "VALID" })) }, adminId);
    }
    await verifyLecturer();
    await assertPeerReviewer(lecturer.id);
    await db.academicProfile.update({ where: { userId: lecturer.id }, data: { supportAvailability: { enabled: true } } });
    const relation = await projectMentorshipService.request(project._id, student.id, { mentorUserId: lecturer.id });
    expect((await projectMentorshipService.accept(project._id, relation.id, lecturer.id)).status).toBe("ACCEPTED");
    await expect(projectService.getProjectById(project._id, lecturer.id)).rejects.toMatchObject({ statusCode: 404 });
    await authService.updateProfile(lecturer.id, { institution: "Updated university" });
    await expect(assertPeerReviewer(lecturer.id)).rejects.toMatchObject({ statusCode: 403 });
    expect((await academicProfileService.getMine(lecturer.id)).verificationStatuses.position).toBe("NOT_SUBMITTED");
    await verifyLecturer();
    await assertPeerReviewer(lecturer.id);
    await academicProfileService.updateMine(lecturer.id, { academicRole: "RESEARCHER" });
    await expect(assertPeerReviewer(lecturer.id)).rejects.toMatchObject({ statusCode: 403 });
    const profile = await academicProfileService.getMine(lecturer.id);
    expect(profile.academicRole).toBe("RESEARCHER");
    expect(profile.primaryPosition).toBe("RESEARCH_STAFF");
    expect(profile.positionCategory).toBe("RESEARCH_STAFF");
    expect(profile.positionTitle).not.toBe("Assistant Professor");
    expect(profile.verificationStatuses.position).toBe("NOT_SUBMITTED");
    expect((await authService.me(lecturer.id)).capabilities).not.toContain("MENTOR_PROJECT");
  });
  it("does not reuse an inactive custom institution during onboarding", async () => {
    const institutionName = `Inactive university ${marker}`;
    const slug = `external-${createHash("sha256").update(institutionName.toLowerCase()).digest("hex").slice(0, 24)}`;
    const institution = await db.institution.create({ data: { name: institutionName, slug, isActive: false, status: "INACTIVE" } });
    institutions.push(institution.id);
    const id = await account(`inactive-${marker}@example.test`);
    await expect(authService.updateAcademicProfile(id, { academicRole: "RESEARCHER", institutionName, positionTitle: "Research Fellow", researchAreas: ["Education"] })).rejects.toMatchObject({ statusCode: 400 });
    expect((await authService.me(id)).onboarding?.completed).toBe(false);
    expect(await db.affiliation.count({ where: { userId: id } })).toBe(0);
  });
  it("institutional-email affiliation changes invalidate old Lecturer authority and keep verification history", async () => {
    const id = await account(`institution-switch-${marker}@example.test`);
    await authService.updateAcademicProfile(id, { academicRole: "LECTURER", institutionName: `Old employer ${marker}`, positionTitle: "Lecturer", researchAreas: ["Education"] });
    const profile = await db.academicProfile.findUniqueOrThrow({ where: { userId: id } });
    await db.academicProfile.update({ where: { id: profile.id }, data: { positionStatus: "VERIFIED", roleVerificationStatus: "VERIFIED" } });
    const evidence = await db.verificationEvidence.create({ data: { userId: id, academicProfileId: profile.id, verificationType: "POSITION", sourceType: "DOCUMENT", status: "VERIFIED" } });
    const email = `switch-${marker}@fpt.edu.vn`;
    await db.userEmail.create({ data: { userId: id, normalizedEmail: email, purpose: "INSTITUTIONAL", verifiedAt: new Date() } });
    await affiliationService.verifyFromEmail(id, email);
    const changed = await academicProfileService.getMine(id);
    expect(changed.affiliation.institutionId).toBe(hostId);
    expect(changed.verificationStatuses).toMatchObject({ affiliation: "VERIFIED", position: "NOT_SUBMITTED" });
    await expect(assertPeerReviewer(id)).rejects.toMatchObject({ statusCode: 403 });
    expect((await db.verificationEvidence.findUniqueOrThrow({ where: { id: evidence.id } })).status).toBe("INVALIDATED");
    // Re-verifying the same affiliation must not revoke a freshly verified position.
    await db.academicProfile.update({ where: { id: profile.id }, data: { positionStatus: "VERIFIED", roleVerificationStatus: "VERIFIED" } });
    await affiliationService.verifyFromEmail(id, email);
    await assertPeerReviewer(id);
  });
  it("backfills legacy roles and existing verified ownership without destroying profile data", async () => {
    const email = `legacy-open-${marker}@example.test`;
    const user = await db.user.create({ data: { email, fullName: "Legacy member", academicProfileType: "student", onboardingCompletedAt: new Date() } }); ids.push(user.id);
    await db.academicProfile.create({ data: { userId: user.id, primaryPosition: "STUDENT", biography: "Preserved biography", expertiseAreas: ["Education"] } });
    await db.userEmail.create({ data: { userId: user.id, normalizedEmail: email, isPrimary: true, purpose: "ACCOUNT", verifiedAt: new Date() } });
    const sql = await readFile(new URL("../../../../prisma/migrations/20261007000200_open_academic_onboarding/migration.sql", import.meta.url), "utf8");
    for (const statement of sql.replace(/^--.*$/gm, "").split(";").filter(value => value.trim())) await db.$executeRawUnsafe(statement);
    expect(await db.academicProfile.findUnique({ where: { userId: user.id } })).toMatchObject({ academicRole: "STUDENT", biography: "Preserved biography", expertiseAreas: ["Education"] });
    const migrated = await authService.me(user.id);
    expect(migrated.emailVerifiedAt).toBeDefined();
    expect(migrated.onboarding?.completed).toBe(true);
  });
});
