import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../common/exceptions/app-error.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../password.service.js", () => ({
  passwordService: {
    hash: mocks.hashPassword,
    verify: mocks.verifyPassword,
  },
}));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.auditLog } }));
vi.mock("../../authorization/capability.service.js", () => ({ capabilityService: { list: vi.fn(), evaluate: vi.fn() } }));

import { authService } from "../auth.service.js";

describe("authService.changePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.user.update.mockResolvedValue({});
    mocks.prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.hashPassword.mockResolvedValue("new-password-hash");
  });

  it("lets a Google-only account set its first LumiGap password on the same user", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: USER_ID, passwordHash: null });

    await authService.changePassword(USER_ID, { newPassword: "StrongPassword123" });

    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { passwordHash: "new-password-hash" },
    });
    expect(mocks.prisma.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: USER_ID, revokedAt: null },
      data: expect.objectContaining({ revocationReason: "PASSWORD_CHANGED" }),
    }));
    expect(mocks.auditLog).toHaveBeenCalledWith("auth.password.set", expect.objectContaining({ userId: USER_ID }));
  });

  it("still requires the current password after password login is enabled", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: USER_ID, passwordHash: "existing-hash" });

    await expect(authService.changePassword(USER_ID, { newPassword: "AnotherStrong123" })).rejects.toBeInstanceOf(AppError);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});
