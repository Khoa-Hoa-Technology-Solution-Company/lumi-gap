import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  buildResearchTeamDossier,
  clarificationMessageSchema,
  computeProspectivePolicyHash,
  counterProposalSchema,
  formalMentorshipProposalSchema,
  memberMentorshipConsentSchema,
  mentorRecruitmentProfileInputSchema,
  normalizeProspectiveAccessForSave,
  parseMentorshipProfile,
  parseTermsSnapshot,
} from "../mentorship-two-way.js";
import { projectMentorshipService } from "../project-mentorship.service.js";
import { buildMentorshipMail } from "../mentorship-mail.service.js";

describe("two-way research mentorship domain, consent, privacy & security rules", () => {
  it("computes deterministic policy hashes independent of permission order and sensitive to material edits", () => {
    const h1 = computeProspectivePolicyHash({
      preset: "ADVISOR",
      permissions: ["MENTOR_CHAT", "OVERVIEW_VIEW", "PAPERS_VIEW"],
      expiresAt: null,
      scopeNote: "Read shared papers only",
    });
    const h2 = computeProspectivePolicyHash({
      preset: "ADVISOR",
      permissions: ["OVERVIEW_VIEW", "PAPERS_VIEW", "MENTOR_CHAT"],
      expiresAt: null,
      scopeNote: "Read shared papers only",
    });
    const h3 = computeProspectivePolicyHash({
      preset: "REVIEWER",
      permissions: ["OVERVIEW_VIEW", "PAPERS_VIEW", "MENTOR_CHAT"],
      expiresAt: null,
      scopeNote: "Read shared papers only",
    });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).not.toBe(h3);
  });

  it("enforces permission dependencies and future expiry when saving prospective access policy", () => {
    expect(() =>
      normalizeProspectiveAccessForSave(
        { preset: "ADVISOR", permissions: ["MANUSCRIPTS_COMMENT"], expiresAt: null },
        randomUUID(),
      ),
    ).toThrow(/cần có quyền xem/);

    expect(() =>
      normalizeProspectiveAccessForSave(
        { preset: "OBSERVER", permissions: ["OVERVIEW_VIEW"], expiresAt: new Date(Date.now() - 60_000).toISOString() },
        randomUUID(),
      ),
    ).toThrow(/tương lai/);

    const ownerId = randomUUID();
    const saved = normalizeProspectiveAccessForSave(
      { preset: "ADVISOR", permissions: ["OVERVIEW_VIEW", "MENTOR_CHAT"], expiresAt: null, scopeNote: "Weekly guidance" },
      ownerId,
    );
    expect(saved.approvedById).toBe(ownerId);
    expect(saved.policyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects lecturer attempts to self-grant project access permissions in formal proposal payloads", async () => {
    await expect(
      projectMentorshipService.propose(randomUUID(), randomUUID(), {
        mentorRole: "PRIMARY",
        supportAreas: ["RESEARCH_METHODOLOGY"],
        message: "I can advise on experimental design and statistical evaluation.",
        consentConfirmed: true,
        expectedDiscoveryVersion: 2,
        expectedPolicyHash: "a".repeat(64),
        idempotencyKey: randomUUID(),
        access: { preset: "REVIEWER", permissions: ["OVERVIEW_VIEW", "MANUSCRIPTS_VIEW", "MANUSCRIPTS_REVIEW"], expiresAt: null },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("validates formal proposal, counter-proposal, consent, and clarification schemas strictly", () => {
    const validProposal = formalMentorshipProposalSchema.safeParse({
      mentorRole: "SECONDARY",
      supportAreas: ["RESEARCH_METHODOLOGY", "DATA_ANALYSIS"],
      availability: { frequency: "BIWEEKLY", duration: "1_SEMESTER", mode: "ONLINE" },
      message: "I can help refine your experimental evaluation methodology and statistical testing.",
      consentConfirmed: true,
      expectedDiscoveryVersion: 3,
      expectedPolicyHash: "b".repeat(64),
      idempotencyKey: randomUUID(),
    });
    expect(validProposal.success).toBe(true);

    // Missing explicit consent must fail
    const noConsent = formalMentorshipProposalSchema.safeParse({
      mentorRole: "PRIMARY",
      supportAreas: ["RESEARCH_DIRECTION"],
      message: "I can help guide your literature review and research framing.",
      consentConfirmed: false,
      expectedDiscoveryVersion: 1,
      expectedPolicyHash: "b".repeat(64),
      idempotencyKey: randomUUID(),
    });
    expect(noConsent.success).toBe(false);

    // Extra access field must fail strict schema
    const extraField = formalMentorshipProposalSchema.safeParse({
      mentorRole: "PRIMARY",
      supportAreas: ["RESEARCH_DIRECTION"],
      message: "I can help guide your literature review and research framing.",
      consentConfirmed: true,
      expectedDiscoveryVersion: 1,
      expectedPolicyHash: "b".repeat(64),
      idempotencyKey: randomUUID(),
      access: { preset: "REVIEWER" },
    });
    expect(extraField.success).toBe(false);

    expect(counterProposalSchema.safeParse({
      mentorRole: "SECONDARY",
      supportAreas: ["ACADEMIC_WRITING"],
      changeSummary: "Adjusted role to secondary mentor for writing review",
      message: "Proposing secondary mentor role focused on manuscript writing feedback.",
      expectedProposalVersion: 1,
      idempotencyKey: randomUUID(),
    }).success).toBe(true);

    expect(memberMentorshipConsentSchema.safeParse({ shared: true, roleNote: "Literature screening" }).success).toBe(true);
    expect(clarificationMessageSchema.safeParse({ body: "Too", clientKey: randomUUID() }).success).toBe(false);
    expect(clarificationMessageSchema.safeParse({ body: "Could you clarify the dataset scope?", clientKey: randomUUID() }).success).toBe(true);
    expect(mentorRecruitmentProfileInputSchema.safeParse({ expectedDuration: "1_SEMESTER", recruitingRoles: ["PRIMARY", "SECONDARY"] }).success).toBe(true);
  });

  it("enforces contextual member profile sharing consent and never leaks unconsented or PRIVATE members in Team Dossier", async () => {
    const projectId = randomUUID();
    const ownerId = randomUUID();
    const consentedMemberId = randomUUID();
    const unconsentedMemberId = randomUUID();
    const privateProfileMemberId = randomUUID();
    const lecturerId = randomUUID();
    const prospective = normalizeProspectiveAccessForSave(
      { preset: "ADVISOR", permissions: ["OVERVIEW_VIEW", "MENTOR_CHAT"], expiresAt: null },
      ownerId,
    );

    const mockDb = {
      projectMember: {
        findMany: vi.fn().mockResolvedValue([
          { userId: ownerId, role: "OWNER", mentorshipProfileShared: true, mentorshipRoleNote: "Lead investigator" },
          { userId: consentedMemberId, role: "MEMBER", mentorshipProfileShared: true, mentorshipRoleNote: "Statistical analysis" },
          { userId: unconsentedMemberId, role: "MEMBER", mentorshipProfileShared: false, mentorshipRoleNote: "SECRET-UNCONSENTED-NOTE" },
          { userId: privateProfileMemberId, role: "MEMBER", mentorshipProfileShared: true, mentorshipRoleNote: "PRIVATE-PROFILE-NOTE" },
        ]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: ownerId, legacyMongoId: null, fullName: "Student Owner", avatarUrl: null, institution: "FPT University", researchInterests: ["NLP"] },
          { id: consentedMemberId, legacyMongoId: null, fullName: "Consented Member", avatarUrl: "https://example.test/c.png", institution: "FPT University", researchInterests: ["Biomedical AI"] },
          { id: privateProfileMemberId, legacyMongoId: null, fullName: "SECRET-PRIVATE-MEMBER", avatarUrl: "https://example.test/p.png", institution: "Secret Inst", researchInterests: ["Hidden"] },
        ]),
      },
      academicProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: randomUUID(), userId: ownerId, publicHandle: "student-owner", academicRole: "STUDENT", positionTitle: "Undergraduate Student",
            headline: "NLP researcher", biography: "Exploring evaluation benchmarks", affiliationStartYear: 2023,
            expertiseAreas: ["Natural Language Processing"], researchSpecializations: [], skills: ["Python", "PyTorch"], researchKeywords: [],
            profileVisibility: "PUBLIC", privacySettings: { researchMethods: ["Experimental research"] }, positionStatus: "VERIFIED",
          },
          {
            id: randomUUID(), userId: consentedMemberId, publicHandle: "consented-member", academicRole: "STUDENT", positionTitle: "Student",
            headline: "Stats", biography: null, affiliationStartYear: 2024,
            expertiseAreas: ["Biostatistics"], researchSpecializations: [], skills: ["R", "Python"], researchKeywords: [],
            profileVisibility: "MEMBERS_ONLY", privacySettings: { researchMethods: ["Survey design"] }, positionStatus: "NOT_SUBMITTED",
          },
          {
            id: randomUUID(), userId: privateProfileMemberId, publicHandle: "private-member", academicRole: "STUDENT", positionTitle: "Student",
            headline: "SECRET-HEADLINE", biography: "SECRET-BIO", affiliationStartYear: 2024,
            expertiseAreas: ["Secret"], researchSpecializations: [], skills: ["SecretSkill"], researchKeywords: [],
            profileVisibility: "PRIVATE", privacySettings: {}, positionStatus: "NOT_SUBMITTED",
          },
        ]),
      },
      affiliation: { findMany: vi.fn().mockResolvedValue([]) },
      academicFeaturedWork: { findMany: vi.fn().mockResolvedValue([]) },
      academicProgram: { findMany: vi.fn().mockResolvedValue([]) },
      mentorshipAttachment: { findMany: vi.fn().mockResolvedValue([]) },
      mentorRelationship: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      mentorshipRequest: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({ id: "req-incoming-1", direction: "PROJECT_TO_LECTURER", status: "PENDING" }),
      },
      mentorInvitationPlan: { findFirst: vi.fn().mockResolvedValue(null) },
    } as never;

    const fakeProject = {
      id: projectId,
      legacyMongoId: null,
      ownerId,
      title: "Evaluating Clinical NLP Hallucinations",
      status: "ACTIVE",
      mentorshipDiscovery: "SEEKING_MENTOR",
      mentorshipSummary: "We evaluate factual consistency in clinical NLP summaries.",
      mentorshipResearchAreas: ["Natural Language Processing"],
      mentorshipExpertise: ["Evaluation Benchmarks"],
      mentorshipMethodologies: ["Experimental research"],
      mentorshipSupportTypes: ["RESEARCH_METHODOLOGY"],
      mentorshipNeeds: "Advice on study design and statistical rigor",
      mentorshipClassification: {},
      mentorshipProfile: {
        researchProblem: "Clinical summaries contain unsupported claims.",
        researchObjectives: ["Build benchmark", "Measure inter-rater agreement"],
        prospectiveAccess: prospective,
      },
      version: 4,
    } as never;

    const dossier = await buildResearchTeamDossier(mockDb, fakeProject, "tok-1", { viewerUserId: lecturerId });

    // Team size is 4, only 2 consented non-PRIVATE members are exposed, 2 are omitted
    expect(dossier.team.teamMemberCount).toBe(4);
    expect(dossier.team.consentedMembers).toHaveLength(2);
    expect(dossier.team.unsharedMemberCount).toBe(2);

    // Zero leakage of unconsented or PRIVATE members anywhere in serialized payload
    const serialized = JSON.stringify(dossier);
    expect(serialized).not.toContain(unconsentedMemberId);
    expect(serialized).not.toContain(privateProfileMemberId);
    expect(serialized).not.toContain("SECRET-UNCONSENTED-NOTE");
    expect(serialized).not.toContain("SECRET-PRIVATE-MEMBER");
    expect(serialized).not.toContain("SECRET-HEADLINE");

    // Skills and researchMethods remain cleanly separated
    const ownerEntry = dossier.team.consentedMembers.find(m => m.userId === ownerId)!;
    expect(ownerEntry.skills).toEqual(["Python", "PyTorch"]);
    expect(ownerEntry.researchMethods).toEqual(["Experimental research"]);

    // Cross-direction duplicate detection in viewerState
    expect(dossier.viewerState).toMatchObject({
      canPropose: false,
      blockedReason: "INCOMING_INVITATION_EXISTS",
      existingRequestId: "req-incoming-1",
      existingRequestDirection: "PROJECT_TO_LECTURER",
    });
  });

  it("gracefully parses empty or malformed mentorshipProfile and termsSnapshot and formats MENTORSHIP_TERMS_CHANGED mail", () => {
    expect(parseMentorshipProfile(null)).toEqual({});
    expect(parseMentorshipProfile("invalid")).toEqual({});
    expect(parseTermsSnapshot(null)).toBeUndefined();
    expect(parseTermsSnapshot({ proposalKind: "UNKNOWN" })).toBeUndefined();

    const viMail = buildMentorshipMail(
      { event: "MENTORSHIP_TERMS_CHANGED", projectId: randomUUID(), projectTitle: "AI Safety Study", actorName: "Dr. Lan", requestId: randomUUID() },
      "Minh",
      "vi",
      "http://localhost:8080",
    );
    expect(viMail.subject).toContain("điều chỉnh");
    const enMail = buildMentorshipMail(
      { event: "MENTORSHIP_TERMS_CHANGED", projectId: randomUUID(), projectTitle: "AI Safety Study", actorName: "Dr. Lan", requestId: randomUUID() },
      "Minh",
      "en",
      "http://localhost:8080",
    );
    expect(enMail.subject).toContain("updated mentorship terms");
  });
});
