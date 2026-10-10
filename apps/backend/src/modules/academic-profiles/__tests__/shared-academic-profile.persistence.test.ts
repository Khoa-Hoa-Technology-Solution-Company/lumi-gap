import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createApp } from "../../../app.js";
import { authService } from "../../auth/auth.service.js";
import { authMailService } from "../../auth/auth-mail.service.js";
import { academicProfileService } from "../academic-profile.service.js";
import { academicIdentityService } from "../academic-identity.service.js";
import { featuredWorkOptions } from "../academic-featured-works.service.js";
import { assertPeerReviewer } from "../../reviews/peer-review-access.js";
import { institutionalEmailVerificationService } from "../institutional-email-verification.service.js";
import { hashAcademicEmailOtp } from "../academic-email.service.js";
import { profileAvatarStorage, profileCoverStorage } from "../profile-cover-storage.service.js";

const enabled = process.env.STUDENT_AFFILIATION_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Use an isolated test database");
describe.skipIf(!enabled).sequential("one shared academic profile and viewer-safe featured contributions", () => {
  const db = getPrisma(), marker = randomUUID(), userIds: string[] = [], institutionIds: string[] = [], projectIds: string[] = [], paperIds: string[] = [];
  const password = "AcademicProfilePassword123";
  let student: string, researcher: string, lecturer: string, outsider: string, studentToken: string, outsiderToken: string, institutionId: string, hostId: string;
  let projectId: string, foreignProjectId: string, submissionId: string, reportId: string, gapId: string, privatePaperId: string, publicPaperId: string;
  let server: Server, base: string;
  vi.spyOn(authMailService, "sendEmailVerification").mockResolvedValue(true);
  beforeAll(async () => {
    const institution = await db.institution.create({ data: { name: `Shared university ${marker}`, slug: `shared-${marker}` } });
    institutionId = institution.id; institutionIds.push(institutionId);
    hostId = (await db.institution.findUniqueOrThrow({ where: { slug: "fpt-university" } })).id;
    for (const [name, role] of [["Student", "STUDENT"], ["Researcher", "RESEARCHER"], ["Lecturer", "LECTURER"], ["Outsider", "RESEARCHER"]] as const) {
      const email = `${name.toLowerCase()}-profile-${marker}@example.test`;
      const account = await authService.register({ email, password, fullName: name }); userIds.push(account.user.id);
      await db.user.update({ where: { id: account.user.id }, data: { emailVerifiedAt: new Date() } });
      await authService.updateAcademicProfile(account.user.id, { academicRole: role, institutionId, ...(role === "STUDENT" ? { programName: "Software Engineering" } : { positionTitle: role === "LECTURER" ? "Senior Lecturer" : "Research Engineer" }), researchAreas: ["Software Engineering", "Artificial Intelligence"], researchInterests: ["Automated Testing"] });
      if (name === "Student") { student = account.user.id; studentToken = (await authService.login({ email, password })).tokens.accessToken; }
      if (name === "Researcher") researcher = account.user.id;
      if (name === "Lecturer") lecturer = account.user.id;
      if (name === "Outsider") { outsider = account.user.id; outsiderToken = (await authService.login({ email, password })).tokens.accessToken; }
    }
    const project = await db.project.create({ data: { title: "Private student project", ownerId: student } }); projectId = project.id; projectIds.push(projectId);
    const foreign = await db.project.create({ data: { title: "Unrelated private project", ownerId: outsider } }); foreignProjectId = foreign.id; projectIds.push(foreignProjectId);
    await db.projectMember.create({ data: { projectId, userId: researcher, status: "ACTIVE" } });
    const submission = await db.submission.create({ data: { projectId, createdById: student, title: "Private research proposal", submissionType: "RESEARCH_PROPOSAL" } }); submissionId = submission.id;
    await db.submissionAuthor.create({ data: { submissionId, userId: student, position: 1 } });
    const report = await db.report.create({ data: { userId: student, projectId, title: "Private research artifact", query: "Research question", status: "ready", artifactType: "RESEARCH_PROPOSAL" } }); reportId = report.id;
    const gap = await db.researchGap.create({ data: { userId: student, projectId, topic: "Testing", normalizedTopic: "testing", title: "Private candidate gap", description: "Description", rationale: "Rationale", source: "manual" } }); gapId = gap.id;
    const privatePaper = await db.paper.create({ data: { title: "Private draft paper", primaryProvider: "user", publicationYear: 2026, dataStatus: "draft", requestedById: student } }); privatePaperId = privatePaper.id; paperIds.push(privatePaperId);
    const publicPaper = await db.paper.create({ data: { title: "Public paper title", primaryProvider: "user", dataStatus: "active", doi: `10.1234/${marker}`, publicationYear: 2026 } }); publicPaperId = publicPaper.id; paperIds.push(publicPaperId);
    server = createApp().listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.on("listening", resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  }, 30_000);
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await db.report.deleteMany({ where: { userId: { in: userIds } } });
    await db.researchGap.deleteMany({ where: { userId: { in: userIds } } });
    await db.submission.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.paper.deleteMany({ where: { id: { in: paperIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.academicProgram.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.institution.deleteMany({ where: { id: { in: institutionIds } } });
    vi.restoreAllMocks();
  });
  it.each(["STUDENT", "RESEARCHER", "LECTURER"] as const)("reuses %s onboarding data in the shared public profile", async role => {
    const id = role === "STUDENT" ? student : role === "RESEARCHER" ? researcher : lecturer;
    const profile = await academicProfileService.getPublic(id);
    expect(profile.academicRole).toBe(role);
    expect(profile.expertiseAreas).toEqual(["Software Engineering", "Artificial Intelligence"]);
    expect(profile.researchInterests).toEqual(["Automated Testing"]);
    expect(profile.affiliation).toMatchObject({ institutionId, hostInstitution: false });
    expect(await db.academicProfile.count({ where: { userId: id } })).toBe(1);
    if (role === "STUDENT") expect(profile.affiliation.programName).toBe("Software Engineering");
    else expect(profile.positionTitle).toBe(role === "LECTURER" ? "Senior Lecturer" : "Research Engineer");
    expect(profile.skills).toEqual([]); expect(profile.biography).toBeUndefined();
    expect(profile).not.toHaveProperty("institutionalEmail"); expect(profile).not.toHaveProperty("verificationRequests"); expect(profile).not.toHaveProperty("verificationEvidence"); expect(profile).not.toHaveProperty("profileHistory"); expect(profile).not.toHaveProperty("affiliationHistory");
  });
  it("edits the student's structured major without requiring current position", async () => {
    const result = await academicProfileService.updateMine(student, { affiliation: { programName: "Computer Science" } });
    expect(result.affiliation.programName).toBe("Computer Science");
    const foreignProgram = await db.academicProgram.create({ data: { institutionId: hostId, name: `Foreign major ${marker}` } });
    await expect(academicProfileService.updateMine(student, { affiliation: { programId: foreignProgram.id } })).rejects.toMatchObject({ statusCode: 400 });
    await db.academicProgram.delete({ where: { id: foreignProgram.id } });
  });
  it("features project, proposal, report, candidate gap and paper through the existing collection", async () => {
    const profile = await academicProfileService.updateMine(student, { featuredWorks: [
      { kind: "PROJECT", source: "LUMIGAP", projectId, title: "Forged public title" },
      { kind: "RESEARCH_PROPOSAL", source: "LUMIGAP", submissionId },
      { kind: "RESEARCH_ARTIFACT", source: "LUMIGAP", reportId },
      { kind: "CANDIDATE_GAP", source: "LUMIGAP", gapId },
      { source: "LUMIGAP", paperId: privatePaperId },
      { source: "LUMIGAP", paperId: publicPaperId },
      { kind: "DATASET", source: "MANUAL", title: "Declared public dataset" },
    ] });
    expect(profile.featuredWorks).toHaveLength(7);
    expect(profile.featuredWorks[0]).toMatchObject({ title: "Private student project", canonical: true, visibility: "RESTRICTED" });
    expect((await db.academicFeaturedWork.findFirstOrThrow({ where: { profileId: profile.id, projectId } })).title).toBeNull();
    expect((await featuredWorkOptions(student, "RESEARCH_ARTIFACT", "Private research")).map(item => item.title)).toEqual(expect.arrayContaining(["Private research proposal", "Private research artifact"]));
  });
  it("filters private work before serializing anonymous, outsider and member profiles", async () => {
    for (const viewer of [undefined, outsider]) {
      const profile = await academicProfileService.getPublic(student, viewer);
      expect(profile.featuredWorks.map(item => item.title)).toEqual(["Public paper title", "Declared public dataset"]);
      expect(JSON.stringify(profile)).not.toContain("Private student project");
      expect((await academicProfileService.getCompact(student, viewer)).programMajor).toBe("Computer Science");
    }
    expect((await academicProfileService.getPublic(student, researcher)).featuredWorks.map(item => item.kind)).toEqual(["PROJECT", "RESEARCH_PROPOSAL", "RESEARCH_ARTIFACT", "CANDIDATE_GAP", "PAPER", "DATASET"]);
    expect(await featuredWorkOptions(outsider, "PROJECT", "Private student")).toEqual([]);
  });
  it("public project summary never exposes its private artifacts or gaps; revoked membership takes effect immediately", async () => {
    await db.project.update({ where: { id: projectId }, data: { visibility: "PUBLIC_SUMMARY" } });
    expect((await academicProfileService.getPublic(student)).featuredWorks.map(item => item.kind)).toEqual(["PROJECT", "PAPER", "DATASET"]);
    await db.projectMember.update({ where: { projectId_userId: { projectId, userId: researcher } }, data: { status: "REMOVED" } });
    expect((await academicProfileService.getPublic(student, researcher)).featuredWorks.map(item => item.kind)).toEqual(["PROJECT", "PAPER", "DATASET"]);
    await db.project.update({ where: { id: projectId }, data: { visibility: "PRIVATE" } });
  });
  it("rejects pinning inaccessible or deleted domain objects", async () => {
    await expect(academicProfileService.updateMine(student, { featuredWorks: [{ kind: "PROJECT", source: "LUMIGAP", projectId: foreignProjectId }] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(academicProfileService.updateMine(student, { featuredWorks: [{ source: "LUMIGAP", paperId: randomUUID() }] })).rejects.toMatchObject({ statusCode: 400 });
    expect((await academicProfileService.getMine(student)).featuredWorks).toHaveLength(7);
  });
  it("keeps scholarly privacy and manual verification separate from profile visibility", async () => {
    await academicIdentityService.create(student, { provider: "ORCID", identifier: "0000-0002-1825-0097", visibility: "PRIVATE" });
    await academicIdentityService.create(student, { provider: "OPENALEX", identifier: "A123456789", visibility: "REGISTERED_USERS" });
    await academicIdentityService.create(student, { provider: "GOOGLE_SCHOLAR", profileUrl: "https://scholar.google.com/citations?user=abc123", visibility: "PUBLIC" });
    expect((await academicProfileService.getPublic(student)).academicIdentityLinks.map(item => item.provider)).toEqual(["GOOGLE_SCHOLAR"]);
    expect((await academicProfileService.getPublic(student, outsider)).academicIdentityLinks.map(item => item.provider)).toEqual(["OPENALEX", "GOOGLE_SCHOLAR"]);
    expect((await academicProfileService.getMine(student)).academicIdentityLinks.every(item => item.verificationStatus === "UNVERIFIED")).toBe(true);
    await academicProfileService.updateMine(student, { privacy: { expertise: "PRIVATE", researchInterests: "REGISTERED_USERS" }, researchKeywords: ["Private research keyword"] });
    const anonymous = await academicProfileService.getPublic(student);
    expect(anonymous.expertiseAreas).toEqual([]); expect(anonymous.researchKeywords).toEqual([]); expect(anonymous.researchInterests).toEqual([]);
    await academicProfileService.updateMine(student, { privacy: { expertise: "PUBLIC", researchInterests: "PUBLIC" } });
  });
  it("enforces ownership and profile privacy through real HTTP endpoints", async () => {
    const updateOther = await fetch(`${base}/academic-profiles/${student}`, { method: "PATCH", headers: { Authorization: `Bearer ${outsiderToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ biography: "Unauthorized edit" }) });
    expect(updateOther.status).toBe(404);
    const escalation = await fetch(`${base}/academic-profiles/me`, { method: "PATCH", headers: { Authorization: `Bearer ${studentToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ academicRole: "LECTURER", roleVerificationStatus: "VERIFIED" }) });
    expect(escalation.status).toBe(400);
    await academicProfileService.updateMine(student, { profileVisibility: "PRIVATE" });
    expect((await fetch(`${base}/academic-profiles/${student}`)).status).toBe(404);
    expect((await fetch(`${base}/academic-profiles/${student}/summary`, { headers: { Authorization: `Bearer ${outsiderToken}` } })).status).toBe(404);
    expect((await fetch(`${base}/academic-profiles/me`, { headers: { Authorization: `Bearer ${studentToken}` } })).status).toBe(200);
    await academicProfileService.updateMine(student, { profileVisibility: "PUBLIC" });
  });
  it("shows the FPT affiliation signal only for a verified current host affiliation", async () => {
    await academicProfileService.updateMine(student, { affiliation: { institutionId: hostId, programName: "Software Engineering" } });
    expect((await academicProfileService.getCompact(student)).fptAffiliationVerified).toBe(false);
    await db.affiliation.updateMany({ where: { userId: student, isCurrent: true }, data: { verificationStatus: "PENDING" } });
    expect((await academicProfileService.getCompact(student)).fptAffiliationVerified).toBe(false);
    await db.affiliation.updateMany({ where: { userId: student, isCurrent: true }, data: { verificationStatus: "VERIFIED" } });
    expect((await academicProfileService.getCompact(student)).fptAffiliationVerified).toBe(true);
    await db.affiliation.updateMany({ where: { userId: student, isPrimary: true }, data: { isCurrent: false } });
    expect((await academicProfileService.getCompact(student)).fptAffiliationVerified).toBe(false);
    await db.affiliation.updateMany({ where: { userId: student, isPrimary: true }, data: { isCurrent: true } });
  });
  it("changing Student to Lecturer keeps shared research data and does not confer verification", async () => {
    const profile = await academicProfileService.updateMine(student, { academicRole: "LECTURER", positionTitle: "Lecturer" });
    expect(profile.academicRole).toBe("LECTURER"); expect(profile.affiliation.programName).toBeUndefined();
    expect(profile.expertiseAreas).toEqual(["Software Engineering", "Artificial Intelligence"]);
    expect(profile.verificationStatuses?.position).toBe("NOT_SUBMITTED"); expect(profile.academicRoleVerificationStatus).toBe("SELF_DECLARED");
    await expect(assertPeerReviewer(student)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("never exposes a legacy scholarly copy after the canonical link is hidden or removed", async () => {
    const profile = await db.academicProfile.findUniqueOrThrow({ where: { userId: student } });
    const link = await db.academicIdentityLink.findFirstOrThrow({ where: { userId: student, provider: "ORCID" } });
    await db.academicExternalIdentity.create({ data: { profileId: profile.id, provider: "ORCID", externalId: link.identifier, profileUrl: "https://orcid.org/0000-0002-1825-0097" } });
    expect(JSON.stringify(await academicProfileService.getPublic(student))).not.toContain("0000-0002-1825-0097");
    await academicIdentityService.remove(student, link.id);
    expect(JSON.stringify(await academicProfileService.getPublic(student, outsider))).not.toContain("0000-0002-1825-0097");
  });
  it("recognizes the UUID owner of a private profile exposed under a legacy public ID", async () => {
    const legacy = "0123456789abcdef01234567";
    await db.user.update({ where: { id: researcher }, data: { legacyMongoId: legacy } });
    const identity = await academicIdentityService.create(researcher, { provider: "OPENALEX", identifier: "A987654321", visibility: "PRIVATE" });
    await academicProfileService.updateMine(researcher, { profileVisibility: "PRIVATE" });
    expect((await academicProfileService.getPublic(legacy, researcher)).academicIdentityLinks).toHaveLength(1);
    expect((await academicProfileService.getCompact(legacy, researcher)).userId).toBe(legacy);
    await expect(academicProfileService.getPublic(legacy, outsider)).rejects.toMatchObject({ statusCode: 404 });
    await academicIdentityService.remove(researcher, identity.id);
  });
  it("changes same-name institutions by ID and serializes competing identity edits", async () => {
    const duplicate = await db.institution.create({ data: { name: `Shared university ${marker}`, slug: `duplicate-${marker}` } }); institutionIds.push(duplicate.id);
    await db.academicProfile.update({ where: { userId: lecturer }, data: { positionStatus: "VERIFIED", roleVerificationStatus: "VERIFIED" } });
    const changed = await academicProfileService.updateMine(lecturer, { affiliation: { institutionId: duplicate.id } });
    expect(changed.affiliation.institutionId).toBe(duplicate.id);
    expect(changed.verificationStatuses.position).toBe("NOT_SUBMITTED");
    const changes = await Promise.allSettled([
      academicProfileService.updateMine(lecturer, { affiliation: { institutionId } }),
      academicProfileService.updateMine(lecturer, { affiliation: { institutionId: hostId } }),
    ]);
    expect(changes.some(result => result.status === "fulfilled")).toBe(true);
    const current = await db.affiliation.findMany({ where: { userId: lecturer, isCurrent: true, isPrimary: true } });
    expect(current).toHaveLength(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: lecturer } })).institution).toBe(current[0].institutionName);
    expect((await academicProfileService.getMine(lecturer)).institution).toBe(current[0].institutionName);
  });
  it("excludes inactive Lecturer accounts without failing the directory", async () => {
    await db.user.update({ where: { id: lecturer }, data: { isActive: false } });
    const directory = await academicProfileService.listLecturers({ page: 1, pageSize: 50, verifiedOnly: false });
    expect(directory.data.some(profile => profile.userId === lecturer)).toBe(false);
    await db.user.update({ where: { id: lecturer }, data: { isActive: true } });
  });
  it("does not restore email verification while the owner changes the email", async () => {
    const email = `otp-${marker}@fpt.edu.vn`, nextEmail = `otp-new-${marker}@fpt.edu.vn`, code = "123456";
    await academicProfileService.updateMine(outsider, { institutionalEmail: email });
    await db.academicEmailVerificationChallenge.create({ data: { userId: outsider, email, codeHash: hashAcademicEmailOtp(outsider, email, code), expiresAt: new Date(Date.now() + 60_000) } });
    const results = await Promise.allSettled([
      institutionalEmailVerificationService.verifyChallenge(outsider, code),
      academicProfileService.updateMine(outsider, { institutionalEmail: nextEmail }),
    ]);
    expect(results[1].status).toBe("fulfilled");
    const profile = await db.academicProfile.findUniqueOrThrow({ where: { userId: outsider } });
    expect(profile.institutionalEmail).toBe(nextEmail);
    expect(profile.institutionalEmailVerifiedAt).toBeNull();
    await expect(institutionalEmailVerificationService.verifyChallenge(outsider, code)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("authorizes legacy-ID owner media and prevents shared caching of viewer-dependent responses", async () => {
    const legacy = "fedcba9876543210fedcba98";
    await db.user.update({ where: { id: student }, data: { legacyMongoId: legacy } });
    await db.academicProfile.update({ where: { userId: student }, data: { profileVisibility: "PRIVATE", avatarStorageKey: "fixture-avatar", coverStorageKey: "fixture-cover" } });
    const avatarLocation = vi.spyOn(profileAvatarStorage, "publicLocation").mockResolvedValue({ kind: "redirect", url: "https://example.test/avatar.webp" });
    const coverLocation = vi.spyOn(profileCoverStorage, "publicLocation").mockResolvedValue({ kind: "redirect", url: "https://example.test/cover.webp" });
    try {
      for (const type of ["avatar", "cover"]) {
        const owned = await fetch(`${base}/academic-profiles/${legacy}/${type}`, { redirect: "manual", headers: { Authorization: `Bearer ${studentToken}` } });
        expect(owned.status).toBe(302);
        expect(owned.headers.get("cache-control")).toBe("private, no-store");
        expect((await fetch(`${base}/academic-profiles/${legacy}/${type}`, { headers: { Authorization: `Bearer ${outsiderToken}` } })).status).toBe(404);
      }
    } finally {
      avatarLocation.mockRestore(); coverLocation.mockRestore();
      await db.academicProfile.update({ where: { userId: student }, data: { avatarStorageKey: null, coverStorageKey: null } });
    }
  });
});
