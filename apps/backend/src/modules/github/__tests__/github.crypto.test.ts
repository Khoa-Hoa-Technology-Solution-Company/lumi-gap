import { expect, it, vi } from "vitest";
vi.mock("../../../config/env.js", () => ({ env: { INTERNAL_SERVICE_KEY: "github-test-encryption-no-real-secrets" } }));
import { openGithubToken, sealGithubToken } from "../github.crypto.js";
it("authenticates encrypted GitHub credentials to the exact user and rejects tampering", () => {
  const encrypted = sealGithubToken("synthetic-token", "user-a");
  expect(encrypted).not.toContain("synthetic-token");
  expect(openGithubToken(encrypted, "user-a")).toBe("synthetic-token");
  expect(() => openGithubToken(encrypted, "user-b")).toThrow("Reconnect GitHub");
  expect(() => openGithubToken(encrypted.slice(0, -4) + "abcd", "user-a")).toThrow();
  expect(sealGithubToken("synthetic-token", "user-a")).not.toBe(encrypted);
});
