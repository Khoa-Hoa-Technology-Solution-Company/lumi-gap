import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashOpaqueToken, tokenService } from "../token.service.js";

describe("tokenService", () => {
  it("signs and verifies RS256 access tokens with minimal claims", () => {
    const signed = tokenService.signAccessToken({ sub: "user-1", systemRole: "USER", sessionId: "session-1" });
    expect(jwt.decode(signed.token, { complete: true })?.header.alg).toBe("RS256");
    expect(tokenService.verifyAccessToken(signed.token)).toMatchObject({
      sub: "user-1", systemRole: "USER", sessionId: "session-1",
    });
  });

  it("creates opaque refresh tokens and stable SHA-256 hashes", () => {
    const token = createOpaqueToken();
    expect(token.split(".")).toHaveLength(1);
    expect(hashOpaqueToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOpaqueToken(token)).not.toBe(token);
  });

  it("accepts the super-admin role in signed access tokens", () => {
    const signed = tokenService.signAccessToken({ sub: "owner-1", systemRole: "ADMIN", sessionId: "session-owner" });
    expect(tokenService.verifyAccessToken(signed.token).systemRole).toBe("ADMIN");
  });
});
