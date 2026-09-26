import { describe, expect, it, vi } from "vitest";

vi.mock("../../../infrastructure/redis.js", () => ({
  redis: { set: vi.fn(), getdel: vi.fn() },
}));

import { resolveOAuthReturnOrigin } from "../google-oidc.service.js";

describe("Google OAuth return origin", () => {
  it("allows configured local web origins", () => {
    expect(resolveOAuthReturnOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(resolveOAuthReturnOrigin("http://localhost:5173")).toBe("http://localhost:5173");
  });

  it("rejects unconfigured and malformed origins", () => {
    expect(resolveOAuthReturnOrigin("https://attacker.example")).toBe("http://localhost:3000");
    expect(resolveOAuthReturnOrigin("not-a-url")).toBe("http://localhost:3000");
  });
});
