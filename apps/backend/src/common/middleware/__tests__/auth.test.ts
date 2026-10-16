import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  refreshToken: { findFirst: vi.fn() },
  academicProfile: { findUnique: vi.fn() },
  verifyAccessToken: vi.fn(),
  listCapabilities: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({ user: mocks.user, refreshToken: mocks.refreshToken, academicProfile: mocks.academicProfile }),
}));
vi.mock("../../../modules/auth/token.service.js", () => ({ tokenService: { verifyAccessToken: mocks.verifyAccessToken } }));
vi.mock("../../../modules/user-ai/user-ai.runtime.js", () => ({ withUserAi: async (_userId: string, run: () => unknown) => run() }));
vi.mock("../../../modules/authorization/research-access.service.js", () => ({ assertResearchWorkflowAccess: vi.fn() }));
vi.mock("../../../modules/authorization/capability.service.js", () => ({ capabilityService: { list: mocks.listCapabilities } }));

import { requireAuth } from "../auth.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAccessToken.mockReturnValue({ sub: USER_ID, systemRole: "USER", sessionId: "session-1" });
    mocks.user.findUnique.mockResolvedValue({ id: USER_ID, systemRole: "USER", accountStatus: "ACTIVE", academicProfileType: null, isActive: true });
    mocks.refreshToken.findFirst.mockResolvedValue({ id: "token-1" });
    mocks.academicProfile.findUnique.mockResolvedValue({ primaryPosition: "STUDENT" });
  });

  const run = async () => {
    const req = { headers: { authorization: "Bearer token" } } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    await requireAuth(req, {} as Response, next);
    return { req, next };
  };

  it("authenticates a valid token without loading the user's capabilities", async () => {
    const { req, next } = await run();

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({ sub: USER_ID, role: "user", accountStatus: "ACTIVE", primaryPosition: "STUDENT" });
    // Nothing reads capabilities from the token claims; requireCapability and /auth/me look them up themselves.
    expect(mocks.listCapabilities).not.toHaveBeenCalled();
    expect(req.user?.capabilities).toBeUndefined();
  });

  it("rejects a token whose session was revoked", async () => {
    mocks.refreshToken.findFirst.mockResolvedValue(null);

    const { req, next } = await run();

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(mocks.listCapabilities).not.toHaveBeenCalled();
  });
});
