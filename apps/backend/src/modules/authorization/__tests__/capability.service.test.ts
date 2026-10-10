import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  academicProfile: { findUnique: vi.fn() },
  affiliation: { findFirst: vi.fn() },
  institution: { findMany: vi.fn() },
  userCapability: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  transaction: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    user: mocks.user,
    academicProfile: mocks.academicProfile,
    affiliation: mocks.affiliation,
    institution: mocks.institution,
    userCapability: mocks.userCapability,
    $transaction: mocks.transaction,
  }),
}));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));
vi.mock("../../identity/participant-scope.service.js", () => ({ participantScopeForUser: vi.fn().mockResolvedValue("PENDING") }));

import { capabilityService } from "../capability.service.js";
import { participantScopeForUser } from "../../identity/participant-scope.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const participantScopeMock = vi.mocked(participantScopeForUser);

describe("capabilityService open platform and stale authorization", () => {
  const activeUser = { id: USER_ID, isActive: true, emailVerifiedAt: new Date(), accountStatus: "ACTIVE", systemRole: "USER" };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.findUnique.mockResolvedValue(activeUser);
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "LECTURER", roleVerificationStatus: "SELF_DECLARED", positionStatus: "NOT_SUBMITTED" });
    mocks.affiliation.findFirst.mockResolvedValue(null);
    mocks.institution.findMany.mockResolvedValue([]);
    mocks.userCapability.findMany.mockResolvedValue([]);
    mocks.userCapability.upsert.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (work) => work({ userCapability: mocks.userCapability }));
    participantScopeMock.mockResolvedValue("PENDING");
  });
  it("provides core capabilities to existing email-verified accounts without a FPT grant", async () => {
    expect(await capabilityService.list(USER_ID)).toEqual(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"]);
    await capabilityService.evaluate(USER_ID);
    expect(mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability)).toEqual(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"]);
  });
  it("rejects all grants for unverified or disabled accounts", async () => {
    mocks.user.findUnique.mockResolvedValue({ ...activeUser, emailVerifiedAt: null });
    mocks.userCapability.findMany.mockResolvedValue([{ capability: "CREATE_RESEARCH_PROJECT" }]);
    expect(await capabilityService.list(USER_ID)).toEqual([]);
    mocks.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });
    expect(await capabilityService.list(USER_ID)).toEqual([]);
  });
  it.each(["STUDENT", "RESEARCHER", "LECTURER"])("filters stale authority on an unverified %s", academicRole => {
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole, roleVerificationStatus: "SELF_DECLARED", positionStatus: "VERIFIED" });
    mocks.userCapability.findMany.mockResolvedValue(["STRUCTURED_REVIEW", "REVIEW_ARTIFACT", "MENTOR_PROJECT", "APPROVE_ACADEMIC_CONTRIBUTION", "MANAGE_SYSTEM"].map(capability => ({ capability })));
    return expect(capabilityService.list(USER_ID)).resolves.toEqual(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"]);
  });
  it("filters even verified Researcher review grants", async () => {
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "RESEARCHER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED" });
    mocks.userCapability.findMany.mockResolvedValue([{ capability: "STRUCTURED_REVIEW" }]);
    expect(await capabilityService.list(USER_ID)).not.toContain("STRUCTURED_REVIEW");
  });
  it("grants verified non-FPT Lecturers eligibility without institution-specific approval", async () => {
    participantScopeMock.mockResolvedValue("EXTERNAL");
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "LECTURER", roleVerificationStatus: "VERIFIED", positionStatus: "VERIFIED" });
    await capabilityService.evaluate(USER_ID);
    const grants = mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability);
    expect(grants).toEqual(expect.arrayContaining(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT", "STRUCTURED_REVIEW", "REVIEW_ARTIFACT", "MENTOR_PROJECT"]));
    expect(grants).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
  });
  it("revokes stored Lecturer privileges after role or position changes", async () => {
    mocks.userCapability.findMany.mockResolvedValueOnce([
      { id: "cap-basic", capability: "BASIC_RESEARCH", status: "ACTIVE", source: "SYSTEM_POLICY_V1" },
      { id: "cap-review", capability: "STRUCTURED_REVIEW", status: "ACTIVE", source: "SYSTEM_POLICY_V1" },
      { id: "cap-mentor", capability: "MENTOR_PROJECT", status: "ACTIVE", source: "SYSTEM_POLICY_V1" },
    ]).mockResolvedValue([]);
    await capabilityService.evaluate(USER_ID);
    expect(mocks.userCapability.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["cap-review", "cap-mentor"] } }, data: { status: "REVOKED" } });
  });
  it("admin status alone confers no formal academic role", async () => {
    mocks.user.findUnique.mockResolvedValue({ ...activeUser, systemRole: "ADMIN" });
    await capabilityService.evaluate(USER_ID);
    expect(mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability)).toEqual(["MANAGE_SYSTEM"]);
  });
});
