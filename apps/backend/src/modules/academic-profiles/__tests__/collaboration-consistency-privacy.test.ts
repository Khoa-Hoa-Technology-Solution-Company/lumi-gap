import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const VISITOR_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_PUBLIC_ID = "44444444-4444-4444-8444-444444444444";
const PROJECT_PRIVATE_ID = "55555555-5555-4555-8555-555555555555";

const mocks = vi.hoisted(() => {
  const state: {
    user: Record<string, any>;
    profile: Record<string, any>;
    affiliation: Record<string, any>;
    projects: Record<string, any>[];
    mentorRelations: Record<string, any>[];
    submissions: Record<string, any>[];
  } = {
    user: {},
    profile: {},
    affiliation: {},
    projects: [],
    mentorRelations: [],
    submissions: [],
  };

  const prisma: Record<string, any> = { $queryRaw: vi.fn(async () => []) };
  prisma.user = {
    findUnique: vi.fn(async () => state.user),
    update: vi.fn(async ({ data }: any) => Object.assign(state.user, data)),
  };
  prisma.academicProfile = {
    upsert: vi.fn(async () => state.profile),
    findUnique: vi.fn(async () => state.profile),
    update: vi.fn(async ({ data }: any) => Object.assign(state.profile, data)),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  };
  prisma.affiliation = {
    findFirst: vi.fn(async () => state.affiliation),
    findMany: vi.fn(async () => [state.affiliation]),
    update: vi.fn(async ({ data }: any) => Object.assign(state.affiliation, data)),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  prisma.project = {
    findMany: vi.fn(async ({ where }: any = {}) => {
      if (where?.id?.in) return state.projects.filter(p => where.id.in.includes(p.id));
      if (where?.ownerId) return state.projects.filter(p => p.ownerId === where.ownerId);
      return state.projects;
    }),
  };
  prisma.mentorRelationship = {
    findMany: vi.fn(async () => state.mentorRelations),
  };
  prisma.submission = {
    findMany: vi.fn(async ({ where }: any = {}) =>
      where?.projectId?.in ? state.submissions.filter(s => where.projectId.in.includes(s.projectId)) : state.submissions,
    ),
  };
  for (const model of [
    "projectMember",
    "projectContributionProposal",
    "academicExternalIdentity",
    "academicIdentityLink",
    "academicFeaturedWork",
    "academicVerificationEvidence",
    "verificationEvidence",
    "auditLog",
    "institution",
    "academicProgram",
    "userDisplayNameChange",
  ]) {
    prisma[model] = {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    };
  }
  prisma.$transaction = vi.fn(async (cb: (tx: typeof prisma) => unknown) => cb(prisma));
  return { state, prisma };
});

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: vi.fn(async () => undefined) } }));
vi.mock("../../authorization/capability.service.js", () => ({
  capabilityService: { evaluate: vi.fn(async () => undefined), evaluateWithRetry: vi.fn(async () => undefined) },
}));
vi.mock("../../notifications/notification.service.js", () => ({ notificationService: { create: vi.fn(async () => undefined) } }));
vi.mock("../institutional-email-verification.service.js", () => ({ institutionalEmailVerificationService: { invalidate: vi.fn() } }));

import { academicProfileService } from "../academic-profile.service.js";

function resetVerifiedLecturer() {
  const now = new Date("2026-11-26T00:00:00.000Z");
  mocks.state.user = {
    id: USER_ID,
    legacyMongoId: null,
    accountStatus: "ACTIVE",
    isActive: true,
    emailVerifiedAt: now,
    fullName: "TS. Nguyễn Minh Anh",
    institution: "Đại học FPT",
    role: "user",
    points: 40,
    researchInterests: ["AI"],
  };
  mocks.state.affiliation = {
    id: "aff-1",
    userId: USER_ID,
    institutionName: "Đại học FPT",
    positionTitle: "Lecturer",
    positionCategory: "LECTURER",
    positionSource: "PREDEFINED",
    verificationStatus: "VERIFIED",
    positionStatus: "VERIFIED",
    isPrimary: true,
    isCurrent: true,
    updatedAt: now,
  };
  mocks.state.profile = {
    id: "ap-1",
    userId: USER_ID,
    academicRole: "LECTURER",
    primaryPosition: "LECTURER",
    positionTitle: "Lecturer",
    positionCategory: "LECTURER",
    positionSource: "PREDEFINED",
    roleVerificationStatus: "VERIFIED",
    positionStatus: "VERIFIED",
    affiliationStatus: "VERIFIED",
    emailStatus: "VERIFIED",
    identityStatus: "VERIFIED",
    orcidStatus: "NOT_SUBMITTED",
    verificationStatus: "VERIFIED",
    profileVisibility: "PUBLIC",
    showInResearcherSearch: true,
    allowCollaborationRequests: true,
    privacySettings: { orcid: "PUBLIC", researchInterests: "PUBLIC", expertise: "PUBLIC" },
    expertiseAreas: ["Trí tuệ nhân tạo"],
    researchSpecializations: [],
    skills: ["Python"],
    researchKeywords: [],
    supportAvailability: {
      enabled: true,
      types: ["RESEARCH_METHODOLOGY"],
      preferredTopics: ["Trí tuệ nhân tạo"],
      maxActiveProjects: 2,
      externalGroupCount: 3,
      preferredRoles: ["PRIMARY"],
      expectedFrequency: "WEEKLY",
      note: "Private note for mentoring",
    },
    reviewAvailability: {
      enabled: true,
      types: ["RESEARCH_PAPER"],
      preferredTopics: ["Trí tuệ nhân tạo"],
      maximumActiveReviews: 5,
    },
    createdAt: now,
    updatedAt: now,
  };
  mocks.state.projects = [
    {
      id: PROJECT_PUBLIC_ID,
      legacyMongoId: null,
      ownerId: "other-owner",
      title: "Public LLM Research",
      description: "Public research project",
      researchField: "AI",
      status: "IN_PROGRESS",
      visibility: "PUBLIC",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: PROJECT_PRIVATE_ID,
      legacyMongoId: null,
      ownerId: "other-owner-2",
      title: "Confidential Lab Project",
      description: "Private",
      researchField: "Security",
      status: "IN_PROGRESS",
      visibility: "PRIVATE",
      createdAt: now,
      updatedAt: now,
    },
  ];
  mocks.state.mentorRelations = [
    { projectId: PROJECT_PUBLIC_ID, mentorRole: "PRIMARY", status: "ACTIVE", startedAt: now, endedAt: null, updatedAt: now },
    { projectId: PROJECT_PRIVATE_ID, mentorRole: "SECONDARY", status: "ACTIVE", startedAt: now, endedAt: null, updatedAt: now },
  ];
  mocks.state.submissions = [
    { projectId: PROJECT_PUBLIC_ID, status: "under_review", updatedAt: now },
  ];
}

describe("Academic Profile collaboration consistency, independence & privacy", () => {
  beforeEach(() => {
    resetVerifiedLecturer();
  });

  it("preserves capacity and arrangement fields when updating supportAvailability via updateMine", async () => {
    await academicProfileService.updateMine(USER_ID, {
      supportAvailability: {
        enabled: true,
        types: ["RESEARCH_DIRECTION"],
        preferredTopics: ["Kỹ nghệ phần mềm"],
      },
    });

    expect(mocks.state.profile.supportAvailability).toMatchObject({
      enabled: true,
      types: ["RESEARCH_DIRECTION"],
      preferredTopics: ["Kỹ nghệ phần mềm"],
      maxActiveProjects: 2,
      externalGroupCount: 3,
      preferredRoles: ["PRIMARY"],
      expectedFrequency: "WEEKLY",
      note: "Private note for mentoring",
    });
  });

  it("keeps research collaboration, mentoring, and peer review independent", async () => {
    await academicProfileService.updateMine(USER_ID, {
      discoverability: { allowCollaborationRequests: false },
    });

    expect(mocks.state.profile.allowCollaborationRequests).toBe(false);
    expect(mocks.state.profile.supportAvailability.enabled).toBe(true);
    expect(mocks.state.profile.reviewAvailability.enabled).toBe(true);
  });

  it("blocks unverified lecturers from enabling mentoring or peer review via direct API calls", async () => {
    mocks.state.profile.positionStatus = "NOT_SUBMITTED";
    mocks.state.profile.roleVerificationStatus = "SELF_DECLARED";

    await expect(
      academicProfileService.updateMine(USER_ID, {
        supportAvailability: { enabled: true, types: [], preferredTopics: [] },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      academicProfileService.updateMine(USER_ID, {
        reviewAvailability: { enabled: true, types: ["RESEARCH_PAPER"], preferredTopics: [] },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("distinguishes configured vs effective mentoring availability when capacity is reached and redacts private workload on public profiles", async () => {
    // Owner has 2 active projects and maxActiveProjects = 2 -> capacityReached = true
    const ownerProfile = await academicProfileService.getMine(USER_ID);
    expect(ownerProfile.supportAvailability.enabled).toBe(true);
    expect(ownerProfile.portfolio?.mentoringActivity?.capacityReached).toBe(true);
    expect(ownerProfile.portfolio?.mentoringActivity?.acceptingNew).toBe(false);
    expect(ownerProfile.portfolio?.mentoringActivity?.externalGroupCount).toBe(3);

    // Public visitor projection
    const publicProfile = await academicProfileService.getPublic(USER_ID, VISITOR_ID);
    expect(publicProfile.supportAvailability.enabled).toBe(false);
    expect(publicProfile.supportAvailability.externalGroupCount).toBeNull();
    expect(publicProfile.supportAvailability.note).toBeUndefined();
    expect(publicProfile.portfolio?.mentoringActivity?.acceptingNew).toBe(false);
    expect(publicProfile.portfolio?.mentoringActivity?.capacityReached).toBe(true);
    expect(publicProfile.portfolio?.mentoringActivity?.externalGroupCount).toBeNull();
    expect(publicProfile.portfolio?.mentoringActivity?.privateActiveCount).toBe(0);
    // Internal submission workflow status ('under_review') must not leak publicly
    expect(publicProfile.portfolio?.mentoringActivity?.currentProjects).toHaveLength(1);
    expect(publicProfile.portfolio?.mentoringActivity?.currentProjects[0]?.publicationStatus).toBeNull();
  });

  it("exposes published status on public projects when officially published", async () => {
    mocks.state.submissions = [{ projectId: PROJECT_PUBLIC_ID, status: "published", updatedAt: new Date() }];
    const publicProfile = await academicProfileService.getPublic(USER_ID, VISITOR_ID);
    expect(publicProfile.portfolio?.mentoringActivity?.currentProjects[0]?.publicationStatus).toBe("published");
  });
});
