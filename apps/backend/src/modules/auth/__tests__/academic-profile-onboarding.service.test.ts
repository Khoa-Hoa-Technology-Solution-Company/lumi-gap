import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";

const baseUser = {
  id: USER_ID,
  legacyMongoId: null,
  email: "student@example.edu",
  fullName: "Nguyễn Đình Thanh",
  role: "user",
  systemRole: "USER",
  accountStatus: "ACTIVE",
  admissionBasis: "LEGACY",
  academicProfileType: null,
  avatarUrl: null,
  institution: null,
  researchInterests: [],
  points: 0,
  credits: 0,
  penaltyPoints: 0,
  emailVerifiedAt: new Date(),
  isActive: true,
  onboardingCompletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    academicProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    affiliation: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    institution: { findFirst: vi.fn(), upsert: vi.fn() },
    institutionDomain: { findUnique: vi.fn().mockResolvedValue(null) },
    campus: { findFirst: vi.fn() },
    academicProgram: { findFirst: vi.fn(), upsert: vi.fn() },
    userEmail: { findMany: vi.fn() },
    verificationEvidence: {
      create: vi.fn(), updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  evaluateCapabilities: vi.fn(),
  listCapabilities: vi.fn(),
  participantScopeForUser: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../../authorization/capability.service.js", () => ({
  capabilityService: {
    evaluate: mocks.evaluateCapabilities,
    list: mocks.listCapabilities,
  },
}));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: vi.fn() } }));
vi.mock("../../identity/participant-scope.service.js", () => ({ participantScopeForUser: mocks.participantScopeForUser }));

import { authService } from "../auth.service.js";

describe("authService.updateAcademicProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue(baseUser);
    mocks.prisma.user.update.mockResolvedValue({ ...baseUser, institution: "FPT University", onboardingCompletedAt: new Date() });
    mocks.prisma.academicProfile.findUnique.mockResolvedValue({
      id: PROFILE_ID,
      userId: USER_ID,
      primaryPosition: "STUDENT",
      positionTitle: "Sinh viên",
    });
    mocks.prisma.academicProfile.upsert.mockResolvedValue({ id: PROFILE_ID, userId: USER_ID });
    mocks.prisma.affiliation.findFirst.mockResolvedValue(null);
    mocks.prisma.affiliation.update.mockResolvedValue({});
    mocks.prisma.affiliation.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.affiliation.create.mockResolvedValue({});
    mocks.prisma.institution.findFirst.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", name: "FPT University", hostInstitution: true });
    mocks.prisma.campus.findFirst.mockResolvedValue(null);
    mocks.prisma.academicProgram.findFirst.mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", isActive: true });
    mocks.prisma.academicProgram.upsert.mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", isActive: true });
    mocks.prisma.verificationEvidence.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.userEmail.findMany.mockResolvedValue([]);
    mocks.prisma.verificationEvidence.create.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.evaluateCapabilities.mockResolvedValue(undefined);
    mocks.listCapabilities.mockResolvedValue([]);
    mocks.participantScopeForUser.mockResolvedValue("PENDING");
  });

  it("saves onboarding as self-declared profile data without creating a verification request", async () => {
    await authService.updateAcademicProfile(USER_ID, {
      academicRole: "STUDENT",
      programName: "Software Engineering",
      positionTitle: "Sinh viên",
      institutionName: "FPT University",
      department: "Software Engineering",
      researchAreas: ["Software Engineering"],
      researchInterests: ["Evidence synthesis"],
    });

    expect(mocks.prisma.academicProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        positionTitle: "Sinh viên",
        positionStatus: "NOT_SUBMITTED",
        affiliationStatus: "NOT_SUBMITTED",
        verificationStatus: "SELF_DECLARED",
      }),
      update: expect.objectContaining({
        positionTitle: "Sinh viên",
        positionStatus: "NOT_SUBMITTED",
        affiliationStatus: "NOT_SUBMITTED",
        verificationStatus: "SELF_DECLARED",
      }),
    }));
    expect(mocks.prisma.affiliation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        institutionName: "FPT University",
        positionTitle: "Sinh viên",
        verificationStatus: "NOT_SUBMITTED",
        positionStatus: "NOT_SUBMITTED",
        verificationSource: "SELF_DECLARED",
      }),
    }));
    expect(mocks.prisma.verificationEvidence.create).not.toHaveBeenCalled();
  });

  it("keeps onboarding incomplete when a profile exists but onboarding was never submitted", async () => {
    const result = await authService.me(USER_ID);
    expect(result.primaryPosition).toBe("STUDENT");
    expect(result.onboarding?.completed).toBe(false);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
    expect(mocks.prisma.academicProfile.upsert).not.toHaveBeenCalled();
  });

  it("reports completed onboarding only when the saved completion marker and position are present", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...baseUser, onboardingCompletedAt: new Date() });
    expect((await authService.me(USER_ID)).onboarding?.completed).toBe(true);
    mocks.prisma.academicProfile.findUnique.mockResolvedValue({ userId: USER_ID, primaryPosition: null });
    expect((await authService.me(USER_ID)).onboarding?.completed).toBe(false);
  });

  it("saves focused FPT Student onboarding fields", async () => {
    const campusId = "44444444-4444-4444-8444-444444444444";
    const programId = "55555555-5555-4555-8555-555555555555";
    mocks.prisma.campus.findFirst.mockResolvedValue({ id: campusId, institutionId: "33333333-3333-4333-8333-333333333333", isActive: true });
    mocks.prisma.academicProgram.findFirst.mockResolvedValue({
      id: programId,
      institutionId: "33333333-3333-4333-8333-333333333333",
      campusId,
      isActive: true,
    });

    await authService.updateAcademicProfile(USER_ID, {
      academicRole: "STUDENT",
      institutionName: "FPT University",
      campusId,
      programId,
      researchAreas: ["Software Engineering"],
      researchInterests: ["AI in education", "NLP"],
      skills: ["Python", "Screening papers"],
    });

    expect(mocks.prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        academicProfileType: "student",
        researchInterests: ["AI in education", "NLP"],
      }),
    }));
    expect(mocks.prisma.academicProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        academicRole: "STUDENT",
        roleVerificationStatus: "SELF_DECLARED",
        expertiseAreas: ["Software Engineering"],
        skills: ["Python", "Screening papers"],
      }),
    }));
    expect(mocks.prisma.affiliation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        campusId,
        programId,
        verificationStatus: "NOT_SUBMITTED",
      }),
    }));
  });

  it("saves focused FPT Researcher onboarding while keeping role self-declared", async () => {
    const campusId = "44444444-4444-4444-8444-444444444444";
    mocks.prisma.campus.findFirst.mockResolvedValue({ id: campusId, institutionId: "33333333-3333-4333-8333-333333333333", isActive: true });
    mocks.prisma.affiliation.findFirst.mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      institutionId: "33333333-3333-4333-8333-333333333333",
      verificationStatus: "VERIFIED",
    });

    await authService.updateAcademicProfile(USER_ID, {
      academicRole: "RESEARCHER",
      positionTitle: "Research Assistant",
      institutionName: "FPT University",
      campusId,
      department: "AI Lab",
      researchAreas: ["Software Engineering", "Information Retrieval"],
      researchInterests: ["LLM evaluation"],
      skills: ["Evidence synthesis"],
      researchKeywords: ["candidate research gaps"],
    });

    expect(mocks.prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        academicProfileType: "researcher",
        researchInterests: ["LLM evaluation"],
      }),
    }));
    expect(mocks.prisma.academicProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        academicRole: "RESEARCHER",
        roleVerificationStatus: "SELF_DECLARED",
        affiliationStatus: "VERIFIED",
        expertiseAreas: ["Software Engineering", "Information Retrieval"],
        skills: ["Evidence synthesis"],
        researchKeywords: ["candidate research gaps"],
      }),
    }));
    expect(mocks.prisma.affiliation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "77777777-7777-4777-8777-777777777777" },
      data: expect.objectContaining({
        campusId,
        department: "AI Lab",
        positionTitle: "Research Assistant",
        positionStatus: "NOT_SUBMITTED",
      }),
    }));
  });

  it("keeps affiliation verification but resets role verification when a Student changes to Lecturer", async () => {
    mocks.prisma.affiliation.findFirst.mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      institutionId: "33333333-3333-4333-8333-333333333333",
      verificationStatus: "VERIFIED",
    });

    await authService.updateAcademicProfile(USER_ID, {
      academicRole: "LECTURER",
      institutionName: "FPT University",
      department: "Software Engineering",
      researchAreas: ["Software Engineering"],
      researchInterests: ["Evidence synthesis"],
    });

    expect(mocks.prisma.academicProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        academicRole: "LECTURER",
        roleVerificationStatus: "SELF_DECLARED",
        roleVerificationMethod: null,
        roleVerifiedAt: null,
        affiliationStatus: "VERIFIED",
        positionStatus: "NOT_SUBMITTED",
      }),
    }));
    expect(mocks.prisma.affiliation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "66666666-6666-4666-8666-666666666666" },
      data: expect.objectContaining({
        positionTitle: "Lecturer",
        positionStatus: "NOT_SUBMITTED",
      }),
    }));
    expect(mocks.evaluateCapabilities).toHaveBeenCalledWith(USER_ID);
  });

  it("requires verification rather than privileges when a Researcher changes to Lecturer", async () => {
    mocks.prisma.academicProfile.findUnique.mockResolvedValue({
      id: PROFILE_ID,
      userId: USER_ID,
      academicRole: "RESEARCHER",
      primaryPosition: "RESEARCH_STAFF",
    });
    mocks.prisma.affiliation.findFirst.mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
      institutionId: "33333333-3333-4333-8333-333333333333",
      verificationStatus: "VERIFIED",
    });

    await authService.updateAcademicProfile(USER_ID, {
      academicRole: "LECTURER",
      positionTitle: "Lecturer",
      institutionName: "FPT University",
      researchAreas: ["Software Engineering"],
      researchInterests: ["Evidence synthesis"],
    });

    expect(mocks.prisma.academicProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        academicRole: "LECTURER",
        roleVerificationStatus: "SELF_DECLARED",
        roleVerificationMethod: null,
        roleVerifiedAt: null,
        affiliationStatus: "VERIFIED",
        positionStatus: "NOT_SUBMITTED",
      }),
    }));
    expect(mocks.evaluateCapabilities).toHaveBeenCalledWith(USER_ID);
  });

  it("allows an invited external collaborator to onboard as self-declared Lecturer without FPT authority", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...baseUser, admissionBasis: "INVITATION" });
    mocks.participantScopeForUser.mockResolvedValue("EXTERNAL");

    await authService.updateAcademicProfile(USER_ID, {
      academicRole: "LECTURER",
      positionTitle: "Lecturer",
      institutionName: "External University",
      expertiseAreas: ["Software Engineering"],
      researchInterests: ["Evidence synthesis"],
    });

    expect(mocks.prisma.academicProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        academicRole: "LECTURER",
        roleVerificationStatus: "SELF_DECLARED",
        positionStatus: "NOT_SUBMITTED",
        affiliationStatus: "NOT_SUBMITTED",
        expertiseAreas: ["Software Engineering"],
      }),
    }));
    expect(mocks.evaluateCapabilities).toHaveBeenCalledWith(USER_ID);
  });

  it("allows invited students at non-FPT institutions", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...baseUser, admissionBasis: "INVITATION" });
    mocks.participantScopeForUser.mockResolvedValue("EXTERNAL");

    mocks.prisma.institution.findFirst.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", name: "External University", hostInstitution: false });
    await authService.updateAcademicProfile(USER_ID, {
      academicRole: "STUDENT",
      programName: "Software Engineering",
      positionTitle: "Student",
      institutionName: "External University",
      researchAreas: ["Software Engineering"],
      researchInterests: ["Evidence synthesis"],
    });
    expect(mocks.prisma.academicProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ academicRole: "STUDENT", roleVerificationStatus: "SELF_DECLARED" }) }));
  });
});
