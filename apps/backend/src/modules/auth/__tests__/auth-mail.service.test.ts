import { describe, expect, it, vi } from "vitest";
import { authMailService, buildPasswordResetContent, resolvePasswordResetOrigin } from "../auth-mail.service.js";

import { env } from "../../../config/env.js";

describe("password reset email content", () => {
  it("skips disabled verification delivery before resolving a production localhost origin", async () => {
    const original = { mode: env.EMAIL_DELIVERY_MODE, nodeEnv: env.NODE_ENV, origin: env.CORS_ORIGIN };
    try {
      env.EMAIL_DELIVERY_MODE = "disabled"; env.NODE_ENV = "production"; env.CORS_ORIGIN = "http://localhost:8080";
      await expect(authMailService.sendEmailVerification("synthetic@example.test", "secret-test-token")).resolves.toBe(false);
      expect(() => resolvePasswordResetOrigin(env.CORS_ORIGIN, env.NODE_ENV)).toThrow("must use HTTPS");
    } finally { env.EMAIL_DELIVERY_MODE = original.mode; env.NODE_ENV = original.nodeEnv; env.CORS_ORIGIN = original.origin; vi.restoreAllMocks(); }
  });
  it("includes the LumiGap branded reset details in HTML and plain text", () => {
    const resetUrl = "https://app.example.test/reset-password?token=single-use-token";
    const content = buildPasswordResetContent("Nguyễn Đình Thanh", resetUrl);

    expect(content.html).toContain("cid:lumigap-logo");
    expect(content.html).toContain("Reset your password");
    expect(content.html).toContain("Hi Nguyễn Đình Thanh,");
    expect(content.html).toContain("30 minutes");
    expect(content.html).toContain("can only be used once");
    expect(content.html).toContain("If you didn't request a password reset");
    expect(content.html).toContain("https://app.example.test/reset-password?token=single-use-token");
    expect(content.text).toContain(`Hi Nguyễn Đình Thanh,`);
    expect(content.text).toContain(resetUrl);
    expect(content.text).toContain("Academic research & collaboration platform");
  });

  it("escapes a user name before inserting it into HTML", () => {
    const content = buildPasswordResetContent(
      `<img src=x onerror="alert('x')">`,
      "https://app.example.test/reset-password?token=t",
    );

    expect(content.html).toContain("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;");
    expect(content.html).not.toContain(`<img src=x onerror="alert('x')">`);
  });

  it("rejects non-web reset URLs", () => {
    expect(() => buildPasswordResetContent("Researcher", "javascript:alert(1)")).toThrow("must use HTTP(S)");
  });

  it("requires HTTPS for deployed reset links while allowing local HTTP development", () => {
    expect(resolvePasswordResetOrigin("https://research.example.test/app", "production")).toBe("https://research.example.test");
    expect(resolvePasswordResetOrigin("http://localhost:3000", "development")).toBe("http://localhost:3000");
    expect(() => resolvePasswordResetOrigin("http://research.example.test", "production")).toThrow("must use HTTPS");
    expect(() => resolvePasswordResetOrigin("https://user:pass@research.example.test", "production")).toThrow("must not contain credentials");
  });
});
