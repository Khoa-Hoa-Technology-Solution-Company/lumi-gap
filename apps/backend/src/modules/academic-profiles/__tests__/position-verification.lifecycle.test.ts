import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => {
  const state: { user: Record<string, any>; admin: Record<string, any>; profile: Record<string, any>; affiliation: Record<string, any>; requests: Record<string, any>[]; displayNameChanges: Array<{ changedAt: Date }> } = { user: {}, admin: {}, profile: {}, affiliation: {}, requests: [], displayNameChanges: [] };
  const prisma: Record<string, any> = { $queryRaw: vi.fn(async () => []) };
  const matches = (row: Record<string, any>, where: Record<string, any> = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
    return row[key] === value;
  });

  prisma.user = {
    findUnique: vi.fn(async ({ where }: any) => where.id === ADMIN_ID ? state.admin : state.user),
    update: vi.fn(async ({ data }: any) => Object.assign(state.user, data)),
  };
  prisma.academicProfile = {
    upsert: vi.fn(async () => state.profile),
    findUnique: vi.fn(async ({ where }: any) => where.userId ? state.profile : state.profile),
    update: vi.fn(async ({ data }: any) => Object.assign(state.profile, data)),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if (!matches(state.profile, where)) return { count: 0 };
      Object.assign(state.profile, data);
      return { count: 1 };
    }),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  };
  prisma.affiliation = {
    findFirst: vi.fn(async () => state.affiliation),
    findMany: vi.fn(async () => [state.affiliation]),
    update: vi.fn(async ({ data }: any) => Object.assign(state.affiliation, data)),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if (!matches(state.affiliation, where)) return { count: 0 };
      Object.assign(state.affiliation, data);
      return { count: 1 };
    }),
    create: vi.fn(async ({ data }: any) => Object.assign(state.affiliation, data)),
  };
  prisma.verificationEvidence = {
    findFirst: vi.fn(async ({ where }: any) => state.requests.find((request) => matches(request, where)) ?? null),
    findUnique: vi.fn(async ({ where }: any) => state.requests.find((request) => matches(request, where)) ?? null),
    findMany: vi.fn(async ({ where }: any = {}) => state.requests.filter((request) => matches(request, where))),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: `00000000-0000-4000-8000-${String(state.requests.length + 1).padStart(12, "0")}`, submittedAt: new Date(), reviewedAt: null, reviewedById: null, rejectionReason: null, invalidatedAt: null, ...data };
      state.requests.push(row);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const found = state.requests.filter((request) => matches(request, where));
      found.forEach((request) => Object.assign(request, data));
      return { count: found.length };
    }),
  };
  for (const model of ["academicExternalIdentity", "academicIdentityLink", "academicFeaturedWork", "academicVerificationEvidence", "auditLog"]) {
    prisma[model] = { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) };
  }
  prisma.userDisplayNameChange = {
    findMany: vi.fn(async ({ where, take }: any) => state.displayNameChanges
      .filter((change) => change.changedAt > where.changedAt.gt)
      .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())
      .slice(0, take)),
    create: vi.fn(async ({ data }: any) => { const change = { changedAt: data.changedAt }; state.displayNameChanges.push(change); return change; }),
  };
  prisma.institution = { findMany: vi.fn(async () => []) };
  prisma.academicProgram = { findMany: vi.fn(async () => []) };
  prisma.$transaction = vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return {
    state, prisma,
    auditLog: vi.fn(async () => undefined),
    evaluateCapabilities: vi.fn(async () => undefined),
    notify: vi.fn(async () => undefined),
  };
});

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.auditLog } }));
vi.mock("../../authorization/capability.service.js", () => ({ capabilityService: { evaluate: mocks.evaluateCapabilities } }));
vi.mock("../../notifications/notification.service.js", () => ({ notificationService: { create: mocks.notify } }));
vi.mock("../institutional-email-verification.service.js", () => ({ institutionalEmailVerificationService: { invalidate: vi.fn() } }));

import { academicProfileService } from "../academic-profile.service.js";

function resetState() {
  Object.assign(mocks.state, {
    user: { id: USER_ID, accountStatus: "ACTIVE", isActive: true, fullName: "Ada Researcher", institution: "FPT University", role: "user", points: 0, researchInterests: [] },
    admin: { id: ADMIN_ID, systemRole: "ADMIN", accountStatus: "ACTIVE", isActive: true, fullName: "Admin", institution: null, role: "admin", points: 0, researchInterests: [] },
    profile: {
      id: "profile-1", userId: USER_ID, primaryPosition: "LECTURER", positionTitle: "Lecturer", positionCategory: "LECTURER", positionSource: "PREDEFINED",
      positionStatus: "NOT_SUBMITTED", affiliationStatus: "VERIFIED", identityStatus: "VERIFIED", emailStatus: "VERIFIED", orcidStatus: "NOT_SUBMITTED",
      verificationStatus: "SELF_DECLARED", profileVisibility: "PUBLIC", showInResearcherSearch: true, allowCollaborationRequests: true, privacySettings: {}, expertiseAreas: [], skills: [], researchKeywords: [],
      supportAvailability: {}, reviewAvailability: {}, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
    },
    affiliation: { id: "affiliation-1", userId: USER_ID, institutionName: "FPT University", isPrimary: true, isCurrent: true, updatedAt: new Date("2026-01-01"), validUntil: null, verificationStatus: "VERIFIED", positionStatus: "NOT_SUBMITTED", positionTitle: "Lecturer", positionCategory: "LECTURER", positionSource: "PREDEFINED" },
    requests: [],
    displayNameChanges: [],
  });
  vi.clearAllMocks();
}

const requestInput = { type: "POSITION" as const, evidenceType: "INSTITUTIONAL_PROFILE" as const, reference: "https://fpt.edu.vn/people/ada" };

describe("academic position verification lifecycle", () => {
  beforeEach(resetState);

  it("persists a position request as pending and admin approval as verified", async () => {
    await academicProfileService.requestVerification(USER_ID, requestInput);
    expect(mocks.state.profile.positionStatus).toBe("PENDING");
    expect(mocks.state.requests[0]).toEqual(expect.objectContaining({ status: "PENDING", verificationType: "POSITION", metadata: expect.objectContaining({ positionTitle: "Lecturer", institutionName: "FPT University" }) }));

    await academicProfileService.decideVerification(mocks.state.requests[0]!.id, { decision: "approve" }, ADMIN_ID);
    expect(mocks.state.requests[0]).toEqual(expect.objectContaining({ status: "VERIFIED", reviewedById: ADMIN_ID }));
    expect(mocks.state.profile.positionStatus).toBe("VERIFIED");
    expect(mocks.state.profile.affiliationStatus).toBe("VERIFIED");
  });

  it("persists a rejection reason without changing affiliation verification", async () => {
    await academicProfileService.requestVerification(USER_ID, requestInput);
    await academicProfileService.decideVerification(mocks.state.requests[0]!.id, { decision: "reject", reason: "The institutional page does not confirm this position." }, ADMIN_ID);

    expect(mocks.state.requests[0]).toEqual(expect.objectContaining({ status: "REJECTED", rejectionReason: "The institutional page does not confirm this position.", reviewedById: ADMIN_ID }));
    expect(mocks.state.profile.positionStatus).toBe("REJECTED");
    expect(mocks.state.profile.affiliationStatus).toBe("VERIFIED");
  });

  it("does not accept ORCID alone as Lecturer employment evidence", async () => {
    await expect(academicProfileService.requestVerification(USER_ID, {
      type: "POSITION",
      evidenceType: "ORCID",
      reference: "https://orcid.org/0000-0002-1825-0097",
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.state.requests).toHaveLength(0);
  });

  it("invalidates a pending position request when its declared position changes", async () => {
    await academicProfileService.requestVerification(USER_ID, requestInput);
    await academicProfileService.updateMine(USER_ID, { positionTitle: "Senior Lecturer" });

    expect(mocks.state.requests[0]).toEqual(expect.objectContaining({ status: "INVALIDATED", rejectionReason: null, invalidatedAt: expect.any(Date) }));
    expect(mocks.state.profile.positionTitle).toBe("Senior Lecturer");
    expect(mocks.state.profile.positionStatus).toBe("NOT_SUBMITTED");
    expect(mocks.state.profile.affiliationStatus).toBe("VERIFIED");
  });

  it("invalidates only the old position verification after a verified position changes", async () => {
    await academicProfileService.requestVerification(USER_ID, requestInput);
    await academicProfileService.decideVerification(mocks.state.requests[0]!.id, { decision: "approve" }, ADMIN_ID);
    const reviewedAt = mocks.state.requests[0]!.reviewedAt;
    await academicProfileService.updateMine(USER_ID, { positionTitle: "Professor" });

    expect(mocks.state.requests[0]).toMatchObject({ status: "VERIFIED", invalidatedAt: expect.any(Date), reviewedAt, reviewedById: ADMIN_ID });
    expect(mocks.state.profile.positionStatus).toBe("NOT_SUBMITTED");
    expect(mocks.state.profile.affiliationStatus).toBe("VERIFIED");
    expect(mocks.state.profile.identityStatus).toBe("VERIFIED");
    expect(mocks.state.profile.emailStatus).toBe("VERIFIED");
  });

  it("persists an owner display name change and exposes the remaining quota", async () => {
    const updated = await academicProfileService.updateMine(USER_ID, { displayName: "Ada Lovelace" });

    expect(mocks.state.user.fullName).toBe("Ada Lovelace");
    expect(mocks.state.displayNameChanges).toHaveLength(1);
    expect(updated.displayNamePolicy).toMatchObject({ maxChanges: 2, remainingChanges: 1, windowDays: 30 });
  });

  it("blocks profile name changes when the owner has already used two in 30 days", async () => {
    mocks.state.displayNameChanges = [
      { changedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1_000) },
      { changedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000) },
    ];

    await expect(academicProfileService.updateMine(USER_ID, { displayName: "Ada Lovelace" })).rejects.toMatchObject({ statusCode: 429 });
    expect(mocks.state.user.fullName).toBe("Ada Researcher");
    expect(mocks.state.displayNameChanges).toHaveLength(2);
  });

  it("persists display name, visibility, and discoverability from one profile edit", async () => {
    const updated = await academicProfileService.updateMine(USER_ID, {
      displayName: "Ada Lovelace",
      profileVisibility: "MEMBERS_ONLY",
      discoverability: { showInResearcherSearch: false, allowCollaborationRequests: false },
    });

    expect(mocks.state.user.fullName).toBe("Ada Lovelace");
    expect(mocks.state.displayNameChanges).toHaveLength(1);
    expect(mocks.state.profile).toMatchObject({
      profileVisibility: "MEMBERS_ONLY",
      showInResearcherSearch: false,
      allowCollaborationRequests: false,
    });
    expect(updated).toMatchObject({
      profileVisibility: "MEMBERS_ONLY",
      discoverability: { showInResearcherSearch: false, allowCollaborationRequests: false },
    });
  });

  it("prevents self-approval and confirms request submission is audited", async () => {
    await academicProfileService.requestVerification(USER_ID, requestInput);
    const requestId = mocks.state.requests[0]!.id;
    await expect(academicProfileService.decideVerification(requestId, { decision: "approve" }, USER_ID)).rejects.toThrow("Only a pending verification can be decided by another user");
    expect(mocks.state.requests[0]!.status).toBe("PENDING");
    expect(mocks.auditLog).toHaveBeenCalledWith("academic_profile.verification.requested", expect.objectContaining({ targetRecordId: requestId }));
  });
});
