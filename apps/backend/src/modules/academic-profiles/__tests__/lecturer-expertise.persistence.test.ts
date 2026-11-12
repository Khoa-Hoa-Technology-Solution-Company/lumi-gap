import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { authService } from "../../auth/auth.service.js";
import { academicProfileService as profiles } from "../academic-profile.service.js";
import { projectMentorshipService as mentors } from "../../projects/project-mentorship.service.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { assertPeerReviewer } from "../../reviews/peer-review-access.js";
import { buildLecturerMatch } from "../../projects/lecturer-match-evidence.js";
const enabled = process.env.ORCID_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Isolated database required");
describe.skipIf(!enabled).sequential("lecturer expertise onboarding and mentor discovery", () => {
  const db = getPrisma(); afterAll(disconnectPostgres);
  async function user() { return (await db.user.create({ data: { email: `${randomUUID()}@expertise.invalid`, fullName: "Academic expertise fixture", emailVerifiedAt: new Date() } })).id; }
  const setup = { academicRole: "LECTURER" as const, institutionName: "Expertise Test University", positionTitle: "Lecturer", researchAreas: ["Computer Science"], researchSpecializations: ["Artificial Intelligence"], researchInterests: ["Medical Image Analysis"], skills: ["PyTorch", "Computer Vision"], researchKeywords: ["Medical AI"], biography: "Research in medical image analysis.", mentorshipPreferences: { interested: true, preferredTopics: ["Medical Image Analysis"] } };
  async function candidate(verified = true) {
    const id = await user(); await authService.updateAcademicProfile(id, setup);
    await db.academicProfile.update({ where: { userId: id }, data: { profileVisibility: "PUBLIC", showInResearcherSearch: true, ...(verified ? { roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED" } : {}), supportAvailability: { enabled: true, types: ["RESEARCH_METHODOLOGY"], preferredTopics: ["Medical Image Analysis"] } } }); return id;
  }
  it("persists lecturer expertise and mentoring intent without granting privileges or formal availability", async () => {
    const id = await user(); const result = await authService.updateAcademicProfile(id, setup), profile = await profiles.getMine(id);
    expect(result.onboarding?.completed).toBe(true);
    expect(profile).toMatchObject({ researchSpecializations: ["Artificial Intelligence"], expertiseAreas: ["Computer Science"], researchInterests: ["Medical Image Analysis"], skills: ["PyTorch", "Computer Vision"], researchKeywords: ["Medical AI"], supportAvailability: { enabled: false, requestedEnabled: true, preferredTopics: ["Medical Image Analysis"] } });
    expect(profile.academicRoleVerificationStatus).not.toBe("VERIFIED"); await expect(assertPeerReviewer(id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(profiles.updateMine(id, { supportAvailability: { enabled: true, types: [], preferredTopics: [] } })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("preserves advanced fields when an older client retries onboarding without them", async () => {
    const id = await user(); await authService.updateAcademicProfile(id, setup);
    await authService.updateAcademicProfile(id, { academicRole: "LECTURER", institutionName: setup.institutionName, positionTitle: "Lecturer", researchAreas: ["Computer Science"] });
    expect(await profiles.getMine(id)).toMatchObject({ researchSpecializations: setup.researchSpecializations, researchKeywords: setup.researchKeywords, skills: setup.skills, supportAvailability: { requestedEnabled: true } });
  });
  it("allows later editing and applies expertise privacy to specializations, technologies and keywords", async () => {
    const id = await candidate(), viewer = await user();
    await profiles.updateMine(id, { researchSpecializations: ["Medical AI"], skills: ["PyTorch"], privacy: { expertise: "PRIVATE" } });
    expect(await profiles.getPublic(id, viewer)).toMatchObject({ researchSpecializations: [], skills: [], researchKeywords: [] });
    expect(await profiles.getMine(id)).toMatchObject({ researchSpecializations: ["Medical AI"], skills: ["PyTorch"] });
  });
  it("matches project needs against declared technologies and specializations with separate filters", async () => {
    const owner = await user(), lecturer = await candidate(), p = await createProjectFixture({ data: { ownerId: owner, title: "Image analysis project", status: "ACTIVE", mentorshipResearchAreas: ["Medical Image Analysis"], mentorshipExpertise: ["PyTorch"] } });
    const result = await mentors.mentors(p.id, owner, { specialization: "Artificial Intelligence", technology: "PyTorch", interest: "Medical Image Analysis" });
    const found = result.items.find(item => item._id === lecturer); expect(found).toMatchObject({ verifiedLecturer: true, skills: ["PyTorch", "Computer Vision"], researchSpecializations: ["Artificial Intelligence"], matchedTerms: ["Medical Image Analysis", "PyTorch"] });
    expect((await mentors.mentors(p.id, owner, { technology: "Unrelated technology" })).items).toEqual([]);
    const evidence = await mentors.mentorEvidence(p.id, owner, lecturer); expect(evidence.topics).toContainEqual({ term: "PyTorch", source: "PROFILE_DECLARATION" }); expect(JSON.stringify(evidence)).not.toMatch(/suitabilityScore|similarityScore/);
  });
  it("does not use hidden expertise for filtering, explanations or ranking", async () => {
    const owner = await user(), lecturer = await candidate(), p = await createProjectFixture({ data: { ownerId: owner, title: "Privacy study", status: "ACTIVE", mentorshipExpertise: ["PyTorch"] } });
    await profiles.updateMine(lecturer, { privacy: { expertise: "PRIVATE", researchInterests: "PRIVATE" } });
    expect((await mentors.mentors(p.id, owner, { technology: "PyTorch" })).items.some(item => item._id === lecturer)).toBe(false);
    await db.user.update({ where: { id: lecturer }, data: { fullName: `Hidden expertise ${lecturer}` } });
    const found = (await mentors.mentors(p.id, owner, { q: lecturer })).items.find(item => item._id === lecturer);
    expect(found).toMatchObject({ matchedTerms: [], skills: [], researchSpecializations: [], researchKeywords: [] });
  });
  it("excludes unverified lecturers, private profiles and disabled availability from formal discovery", async () => {
    const owner = await user(), unverified = await candidate(false), privateUser = await candidate(), unavailable = await candidate(), p = await createProjectFixture({ data: { ownerId: owner, title: "Eligibility study", status: "ACTIVE" } });
    await db.academicProfile.update({ where: { userId: privateUser }, data: { profileVisibility: "PRIVATE" } });
    await db.academicProfile.update({ where: { userId: unavailable }, data: { supportAvailability: { enabled: false } } });
    const found = await mentors.mentors(p.id, owner, {}); for (const id of [unverified, privateUser, unavailable]) expect(found.items.some(item => item._id === id)).toBe(false);
    await expect(mentors.mentorEvidence(p.id, owner, unverified)).rejects.toMatchObject({ statusCode: 403 });
    await expect(mentors.mentorEvidence(p.id, owner, privateUser)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("denies evidence access to outsiders and keeps mentorship consent separate from matching", async () => {
    const owner = await user(), stranger = await user(), lecturer = await candidate(), p = await createProjectFixture({ data: { ownerId: owner, title: "Consent study", status: "ACTIVE" } });
    await expect(mentors.mentorEvidence(p.id, stranger, lecturer)).rejects.toMatchObject({ statusCode: 403 });
    await mentors.mentors(p.id, owner, {}); await mentors.mentorEvidence(p.id, owner, lecturer);
    expect(await db.mentorshipRequest.count({ where: { projectId: p.id } })).toBe(0); expect(await db.mentorRelationship.count({ where: { projectId: p.id } })).toBe(0);
  });
  it("uses the existing evidence method and never treats self-declared technologies as independent qualification", () => {
    const result = buildLecturerMatch({ topics: ["PyTorch"], methodologies: [], needs: "" }, { areas: [], methodologies: [], capabilities: [] }, { expertiseAreas: [], researchInterests: [], researchSpecializations: [], skills: ["PyTorch"], researchKeywords: [], featuredWorks: [], academicIdentityLinks: [] } as never, [], true);
    expect(result.topics).toContainEqual({ term: "PyTorch", source: "PROFILE_DECLARATION" }); expect(result.missing).toContain("Declared expertise and availability are not independent assessments of mentoring quality.");
  });
});
