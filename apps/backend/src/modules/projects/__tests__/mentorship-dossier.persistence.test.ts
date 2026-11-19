import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { disconnectPostgres, getPrisma } from "../../../infrastructure/database/prisma.js";
import { projectMentorshipService as service } from "../project-mentorship.service.js";
import { previewDossierSchema, requestMentorshipSchema } from "../project-mentorship.controller.js";
import { buildMentorshipMail } from "../mentorship-mail.service.js";
import { newCreatedAcademicData, removeCreatedAcademicData } from "./academic-test-data.js";

vi.mock("../../../infrastructure/queue.js", () => ({ notificationQueue: { add: vi.fn().mockResolvedValue({}) } }));

const enabled = process.env.MENTORSHIP_INTEGRATION === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) {
  throw new Error("Use an isolated _test database");
}

describe.skipIf(!enabled).sequential("Research Mentorship Invitation Dossier (PostgreSQL)", () => {
  const db = getPrisma();
  const created = newCreatedAcademicData();
  const createdInstIds: string[] = [];
  let owner: string;
  let mentor: string;
  let publicMember: string;
  let privateMember: string;
  let project: string;
  let prefix: string;
  let orcidUrl: string;

  async function createAcademicUser(role: "STUDENT" | "LECTURER", visibility: "PUBLIC" | "PRIVATE", verified = false) {
    const email = `secret-${crypto.randomUUID().slice(0, 8)}@uni-test.invalid`;
    const u = await db.user.create({
      data: {
        fullName: `${prefix}-${role}-${crypto.randomUUID().slice(0, 4)}`,
        email,
        institution: "FPT University",
        emailVerifiedAt: new Date(),
        researchInterests: ["NLP", "Academic Evaluation"],
      },
    });
    const inst = await db.institution.create({
      data: {
        name: `Uni-${crypto.randomUUID().slice(0, 6)}`,
        slug: `uni-${crypto.randomUUID().slice(0, 6)}`,
      },
    });
    createdInstIds.push(inst.id);
    const program = await db.academicProgram.create({
      data: {
        institutionId: inst.id,
        name: "Software Engineering",
      },
    });
    const ap = await db.academicProfile.create({
      data: {
        userId: u.id,
        academicRole: role,
        primaryPosition: role === "LECTURER" ? "LECTURER" : "STUDENT",
        positionTitle: role === "LECTURER" ? "Associate Professor" : "Undergraduate Researcher",
        headline: "Focused on trustworthy NLP",
        biography: "Built benchmark pipelines for Vietnamese scholarly QA.",
        roleVerificationStatus: verified ? "VERIFIED" : "SELF_DECLARED",
        positionStatus: verified ? "VERIFIED" : "NOT_SUBMITTED",
        profileVisibility: visibility,
        skills: ["Python", "PyTorch"],
        expertiseAreas: ["Information Retrieval"],
        institutionalEmail: "hidden-inst@uni-test.invalid",
        verificationNote: "PRIVATE-VERIFICATION-NOTE",
      },
    });
    await db.affiliation.create({
      data: {
        userId: u.id,
        institutionId: inst.id,
        institutionName: "FPT University",
        department: "Computing",
        programId: program.id,
        cohort: "K18",
        studentCode: "PRIVATE-STUDENT-CODE-999",
        verificationStatus: verified ? "VERIFIED" : "NOT_SUBMITTED",
        isCurrent: true,
        isPrimary: true,
      },
    });
    created.userIds.push(u.id);
    return { userId: u.id, profileId: ap.id, email };
  }

  beforeEach(async () => {
    prefix = `dossier-${crypto.randomUUID().slice(0, 6)}`;
    const o = await createAcademicUser("STUDENT", "PUBLIC", true);
    const m = await createAcademicUser("LECTURER", "PUBLIC", true);
    const pubMem = await createAcademicUser("STUDENT", "PUBLIC", false);
    const privMem = await createAcademicUser("STUDENT", "PRIVATE", false);
    owner = o.userId;
    mentor = m.userId;
    publicMember = pubMem.userId;
    privateMember = privMem.userId;

    const block1 = String(Math.floor(1000 + Math.random() * 8999));
    const block2 = String(Math.floor(1000 + Math.random() * 8999));
    const orcidId = `0000-0002-${block1}-${block2}`;
    orcidUrl = `https://orcid.org/${orcidId}`;

    await db.academicIdentityLink.create({
      data: {
        userId: owner,
        provider: "ORCID",
        label: "ORCID",
        identifier: orcidId,
        profileUrl: orcidUrl,
        connectionMethod: "OAUTH",
        status: "CONNECTED",
        verificationStatus: "PROVIDER_CONNECTED",
        visibility: "PUBLIC",
      },
    });
    await db.academicFeaturedWork.create({
      data: {
        profileId: o.profileId,
        kind: "PAPER",
        title: "Vietnamese Scholarly QA Benchmark",
        year: 2026,
        doi: "10.1000/lumigap.2026",
        source: "CROSSREF",
        position: 0,
      },
    });

    const p = await createProjectFixture({
      data: {
        ownerId: owner,
        title: `${prefix} Multilingual RAG Study`,
        description: "PRIVATE-INTERNAL-PROJECT-DESCRIPTION-DO-NOT-LEAK",
        mentorshipSummary: "We investigate hallucination mitigation in retrieval-augmented generation for Vietnamese scholarly corpora.",
        researchField: "Artificial Intelligence",
        mentorshipResearchAreas: ["NLP", "RAG"],
        mentorshipExpertise: ["Evaluation"],
        mentorshipNeeds: "Feedback on ablation setup",
        visibility: "PRIVATE",
      },
    });
    project = p.id;
    await db.projectMember.createMany({
      data: [
        { projectId: project, userId: publicMember, role: "MEMBER", status: "ACTIVE" },
        { projectId: project, userId: privateMember, role: "MEMBER", status: "ACTIVE" },
      ],
    });
    await service.preferences(mentor, { acceptingMentorships: true });
  });

  afterAll(async () => {
    await removeCreatedAcademicData(created);
    if (createdInstIds.length) {
      await db.affiliation.deleteMany({ where: { institutionId: { in: createdInstIds } } });
      await db.academicProgram.deleteMany({ where: { institutionId: { in: createdInstIds } } });
      await db.institution.deleteMany({ where: { id: { in: createdInstIds } } });
    }
    await disconnectPostgres();
  });

  it("projects an allowlisted 6-section dossier matching Step 3 preview and never leaks private fields", async () => {
    const dossierInput = {
      approvedObjective: "Construct a 1,500-item groundedness benchmark.",
      keywords: ["RAG", "Hallucination"],
      shareRepresentativeProfile: true,
      shareRepresentativeLinks: true,
      shareRepresentativeWorks: true,
      shareTeamOverview: true,
      shareCompetencies: true,
      teamOverviewNote: "Two prior NLP course capstones.",
      researchMethods: ["Ablation Study"],
      researchTools: ["PyTorch"],
      expectations: {
        supportAreas: ["RESEARCH_METHODOLOGY", "EXPERIMENT_DESIGN"],
        expectedPeriod: "1 học kỳ",
        meetingFrequency: "2 tuần/lần",
        expectedMilestone: "Bản thảo hội nghị",
        preferredChannel: "Google Meet",
      },
    };

    const preview = await service.previewDossier(project, owner, {
      mentorUserId: mentor,
      message: "Your RAG papers directly inspire our benchmark design.",
      mentorRole: "PRIMARY",
      dossier: dossierInput,
    });

    // Unauthorized team member cannot invoke Step 3 preview
    await expect(
      service.previewDossier(project, publicMember, {
        mentorUserId: mentor,
        message: "Not allowed",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const createdReq = await service.request(project, owner, {
      mentorUserId: mentor,
      message: "Your RAG papers directly inspire our benchmark design.",
      mentorRole: "PRIMARY",
      dossier: dossierInput,
    });

    const lecturerView = await service.requestDetail(project, createdReq.id, mentor);
    const serialized = JSON.stringify({ preview, lecturerView });

    expect(serialized).not.toContain("PRIVATE-INTERNAL-PROJECT-DESCRIPTION-DO-NOT-LEAK");
    expect(serialized).not.toContain("PRIVATE-STUDENT-CODE-999");
    expect(serialized).not.toContain("hidden-inst@uni-test.invalid");
    expect(serialized).not.toContain("PRIVATE-VERIFICATION-NOTE");
    expect(serialized).not.toContain("@uni-test.invalid");

    expect(lecturerView.dossier).toBeDefined();
    expect(lecturerView.dossier?.project.title).toContain("Multilingual RAG Study");
    expect(lecturerView.dossier?.project.primaryObjective).toBe("Construct a 1,500-item groundedness benchmark.");
    expect(lecturerView.dossier?.team.teamMemberCount).toBe(3);
    expect(lecturerView.dossier?.team.representative?.institutionName).toBe("FPT University");
    expect(lecturerView.dossier?.team.representative?.programName).toBe("Software Engineering");
    expect(lecturerView.dossier?.team.representative?.academicYearLabel).toBe("K18");
    expect(lecturerView.dossier?.team.representative?.affiliationVerified).toBe(true);
    expect(lecturerView.dossier?.team.representative?.publicLinks[0]?.profileUrl).toBe(orcidUrl);
    expect(lecturerView.dossier?.competencies.experienceHighlights[0]?.provenance).toBe("PUBLIC_WORK");
    expect(lecturerView.dossier?.competencies.researchMethods[0]).toMatchObject({ name: "Ablation Study", provenance: "SELF_DECLARED" });
    expect(lecturerView.dossier?.team.sharedMembersCount).toBe(1);
    expect(lecturerView.dossier?.team.privacyRedactedCount).toBe(1);
    expect(lecturerView.dossier?.expectations.supportAreas).toEqual(["RESEARCH_METHODOLOGY", "EXPERIMENT_DESIGN"]);
    expect(lecturerView.dossier?.whyThisLecturer.message).toBe(preview.whyThisLecturer.message);
  });

  it("preserves frozen project brief snapshot while dynamically redacting personal fields after privacy revocation", async () => {
    const req = await service.request(project, owner, {
      mentorUserId: mentor,
      message: "Personalized rationale for invitation",
      mentorRole: "PRIMARY",
      dossier: {
        shareRepresentativeProfile: true,
        shareTeamOverview: true,
        expectations: { supportAreas: ["RESEARCH_DIRECTION"], expectedPeriod: "4 tháng" },
      },
    });

    // Later edits to project settings do not rewrite the frozen invitation brief
    await db.project.update({
      where: { id: project },
      data: { mentorshipSummary: "Completely rewritten later project summary that should not overwrite snapshot" },
    });

    // Student revokes profile visibility -> personal fields redact immediately on subsequent reads
    await db.academicProfile.update({
      where: { userId: owner },
      data: { profileVisibility: "PRIVATE" },
    });

    const reread = await service.requestDetail(project, req.id, mentor);
    expect(reread.dossier?.project.abstract).toContain("hallucination mitigation");
    expect(reread.dossier?.project.abstract).not.toContain("Completely rewritten later");
    expect(reread.dossier?.team.representative?.redacted).toBe(true);
    expect(reread.dossier?.team.representative?.skills).toEqual([]);
    expect(reread.dossier?.team.representative?.publicLinks).toEqual([]);
  });

  it("handles legacy invitations safely and rejects unknown fields with strict DTO schemas", async () => {
    const legacy = await db.mentorshipRequest.create({
      data: {
        projectId: project,
        mentorUserId: mentor,
        requestedBy: owner,
        direction: "PROJECT_TO_LECTURER",
        mentorRole: "PRIMARY",
        message: "Legacy request message",
      },
    });
    const detail = await service.requestDetail(project, legacy.id, mentor);
    expect(detail.legacyPreview).toBe(true);
    expect(detail.dossier).toBeUndefined();
    expect(JSON.stringify(detail)).not.toContain("PRIVATE-INTERNAL-PROJECT-DESCRIPTION-DO-NOT-LEAK");

    expect(() =>
      requestMentorshipSchema.parse({
        mentorUserId: mentor,
        message: "Valid",
        dossier: { unexpectedField: "hack" },
      }),
    ).toThrow();

    expect(() =>
      previewDossierSchema.parse({
        mentorUserId: mentor,
        message: "Valid",
        extra: true,
      }),
    ).toThrow();

    const mail = buildMentorshipMail(
      { event: "MENTORSHIP_REQUEST_RECEIVED", projectId: project, requestId: legacy.id, projectTitle: "<script>Test</script>", actorName: "Owner" },
      "TS. Mentor",
      "vi",
      "https://lumigap.example",
    );
    expect(mail.html).not.toContain("<script>");
    expect(mail.text).toContain("view=incoming");
  });
});
