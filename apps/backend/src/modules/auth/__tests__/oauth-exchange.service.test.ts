import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse } from "@trend/shared-types";

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  getdel: vi.fn(),
}));

vi.mock("../../../infrastructure/redis.js", () => ({ redis: redisMock }));

import { oauthExchangeService } from "../oauth-exchange.service.js";

const authResult: AuthResponse = {
  user: {
    id: "user-1",
    email: "researcher@example.test",
    fullName: "Researcher",
    role: "researcher",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  tokens: {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    accessTokenExpiresAt: "2026-01-01T00:15:00.000Z",
  },
};

describe("oauthExchangeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores a short-lived exchange result without putting tokens in the code", async () => {
    redisMock.set.mockResolvedValue("OK");

    const code = await oauthExchangeService.create(authResult);

    expect(code).not.toContain(authResult.tokens.accessToken);
    expect(code).not.toContain(authResult.tokens.refreshToken);
    expect(redisMock.set).toHaveBeenCalledWith(
      expect.stringMatching(/^oauth:exchange:[a-f0-9]{64}$/),
      JSON.stringify(authResult),
      "EX",
      60,
      "NX",
    );
  });

  it("atomically consumes a code once", async () => {
    redisMock.getdel.mockResolvedValueOnce(JSON.stringify(authResult)).mockResolvedValueOnce(null);

    await expect(oauthExchangeService.consume("one-time-code")).resolves.toEqual(authResult);
    await expect(oauthExchangeService.consume("one-time-code")).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
  });
});
