import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  userCapability: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  transaction: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({ user: mocks.user, userCapability: mocks.userCapability, $transaction: mocks.transaction }),
}));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));

import { capabilityService } from "../capability.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("capabilityService academic-position separation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.findUnique.mockResolvedValue({ id: USER_ID, accountStatus: "ACTIVE", systemRole: "RESEARCH_USER" });
    mocks.userCapability.findMany.mockResolvedValue([]);
    mocks.userCapability.upsert.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (work) => work({ userCapability: mocks.userCapability }));
  });

  it("does not grant reviewer, mentor, or support capabilities from academic position verification", async () => {
    await capabilityService.evaluate(USER_ID);

    expect(mocks.userCapability.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.userCapability.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ capability: "BASIC_RESEARCH" }),
    }));
    expect(mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability)).not.toContain("STRUCTURED_REVIEW");
    expect(mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability)).not.toContain("RESEARCH_SUPPORT");
    expect(mocks.userCapability.upsert.mock.calls.map(([call]) => call.create.capability)).not.toContain("GAP_VALIDATION");
  });
});
