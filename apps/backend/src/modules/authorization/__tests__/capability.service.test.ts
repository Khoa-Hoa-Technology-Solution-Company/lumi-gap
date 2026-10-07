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

describe("capabilityService academic-position separation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.findUnique.mockResolvedValue({ id: USER_ID, accountStatus: "ACTIVE", systemRole: "USER" });
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "LECTURER", roleVerificationStatus: "SELF_DECLARED" });
    mocks.affiliation.findFirst.mockResolvedValue(null);
    mocks.institution.findMany.mockResolvedValue([{ id: "33333333-3333-4333-8333-333333333333" }]);
    mocks.userCapability.findMany.mockResolvedValue([]);
    mocks.userCapability.upsert.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (work) => work({ userCapability: mocks.userCapability }));
    participantScopeMock.mockResolvedValue("PENDING");
  });

  it("does not grant reviewer, mentor, or support capabilities from academic position verification", async () => {
    await capabilityService.evaluate(USER_ID);

    expect(mocks.userCapability.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.userCapability.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ capability: "BASIC_RESEARCH" }),
    }));
    expect(mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability)).not.toContain("STRUCTURED_REVIEW");
    expect(mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability)).not.toContain("RESEARCH_SUPPORT");
    expect(mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability)).not.toContain("GAP_VALIDATION");
  });

  it("grants mentoring, review, and contribution approval only after internal Lecturer verification", async () => {
    participantScopeMock.mockResolvedValue("INTERNAL");
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "LECTURER", roleVerificationStatus: "VERIFIED" });
    mocks.affiliation.findFirst.mockResolvedValue({ id: "affiliation-1" });

    await capabilityService.evaluate(USER_ID);

    expect(mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability)).toEqual(expect.arrayContaining([
      "BASIC_RESEARCH",
      "CREATE_RESEARCH_PROJECT",
      "STRUCTURED_REVIEW",
      "APPROVE_ACADEMIC_CONTRIBUTION",
      "MENTOR_PROJECT",
      "REVIEW_ARTIFACT",
    ]));
  });

  it("does not grant internal Lecturer authority from a prior external position verification", async () => {
    participantScopeMock.mockResolvedValue("INTERNAL");
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "LECTURER", roleVerificationStatus: "VERIFIED" });
    mocks.affiliation.findFirst.mockResolvedValue(null);

    await capabilityService.evaluate(USER_ID);

    const granted = mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability);
    expect(granted).toEqual(expect.arrayContaining(["BASIC_RESEARCH", "CREATE_RESEARCH_PROJECT"]));
    expect(granted).toContain("STRUCTURED_REVIEW");
    expect(granted).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(granted).not.toContain("MENTOR_PROJECT");
  });

  it("grants external verified Lecturers structured-review capability without FPT authority", async () => {
    participantScopeMock.mockResolvedValue("EXTERNAL");
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "LECTURER", roleVerificationStatus: "VERIFIED" });

    await capabilityService.evaluate(USER_ID);

    const granted = mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability);
    expect(granted).toEqual(expect.arrayContaining(["BASIC_RESEARCH", "STRUCTURED_REVIEW", "REVIEW_ARTIFACT"]));
    expect(granted).not.toContain("CREATE_RESEARCH_PROJECT");
    expect(granted).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
    expect(granted).not.toContain("MENTOR_PROJECT");
  });

  it("does not grant academic review authority to an admin without a verified Lecturer profile", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: USER_ID, accountStatus: "ACTIVE", systemRole: "ADMIN" });
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "RESEARCHER", roleVerificationStatus: "SELF_DECLARED" });
    participantScopeMock.mockResolvedValue("INTERNAL");

    await capabilityService.evaluate(USER_ID);

    const granted = mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability);
    expect(granted).toEqual(["MANAGE_SYSTEM"]);
    expect(granted).not.toContain("STRUCTURED_REVIEW");
    expect(granted).not.toContain("APPROVE_ACADEMIC_CONTRIBUTION");
  });

  it("recalculates dual-role admin capabilities when the admin also satisfies Lecturer policy", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: USER_ID, accountStatus: "ACTIVE", systemRole: "ADMIN" });
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "LECTURER", roleVerificationStatus: "VERIFIED" });
    participantScopeMock.mockResolvedValue("INTERNAL");
    mocks.affiliation.findFirst.mockResolvedValue({ id: "affiliation-1" });

    await capabilityService.evaluate(USER_ID);

    const granted = mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability);
    expect(granted).toEqual(expect.arrayContaining([
      "MANAGE_SYSTEM",
      "STRUCTURED_REVIEW",
      "REVIEW_ARTIFACT",
      "APPROVE_ACADEMIC_CONTRIBUTION",
      "MENTOR_PROJECT",
    ]));
  });

  it("revokes active Lecturer-only capabilities when verification is invalidated", async () => {
    participantScopeMock.mockResolvedValue("INTERNAL");
    mocks.academicProfile.findUnique.mockResolvedValue({ academicRole: "LECTURER", roleVerificationStatus: "INVALIDATED" });
    mocks.userCapability.findMany.mockResolvedValueOnce([
      { id: "cap-basic", capability: "BASIC_RESEARCH", status: "ACTIVE", source: "SYSTEM_POLICY_V1" },
      { id: "cap-create", capability: "CREATE_RESEARCH_PROJECT", status: "ACTIVE", source: "SYSTEM_POLICY_V1" },
      { id: "cap-mentor", capability: "MENTOR_PROJECT", status: "ACTIVE", source: "SYSTEM_POLICY_V1" },
      { id: "cap-review", capability: "STRUCTURED_REVIEW", status: "ACTIVE", source: "SYSTEM_POLICY_V1" },
      { id: "cap-approve", capability: "APPROVE_ACADEMIC_CONTRIBUTION", status: "ACTIVE", source: "SYSTEM_POLICY_V1" },
    ]).mockResolvedValueOnce([
      { capability: "BASIC_RESEARCH" },
      { capability: "CREATE_RESEARCH_PROJECT" },
    ]);

    await capabilityService.evaluate(USER_ID);

    expect(mocks.userCapability.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["cap-mentor", "cap-review", "cap-approve"] } },
      data: { status: "REVOKED" },
    });
  });
});
