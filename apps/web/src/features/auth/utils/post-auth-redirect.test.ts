import { describe, expect, it } from "vitest";
import type { User } from "@trend/shared-types";

import { resolvePostAuthPath } from "./post-auth-redirect";

const member: User = {
  id: "user-1",
  email: "researcher@example.test",
  fullName: "Researcher",
  role: "user",
  systemRole: "USER",
  accountStatus: "ACTIVE",
  academicProfileType: "researcher",
  primaryPosition: "RESEARCH_STAFF",
  onboarding: { completed: true },
  emailVerifiedAt: "2026-09-23T00:00:00.000Z",
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
};

describe("resolvePostAuthPath", () => {
  it("sends a regular member to the personalized home cockpit", () => {
    expect(resolvePostAuthPath(member)).toBe("/home");
  });

  it("sends an admin to the admin workspace", () => {
    expect(resolvePostAuthPath({ ...member, role: "admin", systemRole: "ADMIN" })).toBe("/admin");
  });

  it("requires academic onboarding before any requested destination", () => {
    expect(resolvePostAuthPath({ ...member, primaryPosition: undefined, onboarding: { completed: false } }, "/projects"))
      .toBe("/onboarding/academic-profile");
  });

  it("returns a signed-in user to a safe internal destination", () => {
    expect(resolvePostAuthPath(member, "/projects/abc?tab=team#members"))
      .toBe("/projects/abc?tab=team#members");
  });

  it.each([
    "https://example.test/phishing",
    "//example.test/phishing",
    "/\\example.test/phishing",
    "/login",
  ])("rejects unsafe or auth-loop destinations: %s", (path) => {
    expect(resolvePostAuthPath(member, path)).toBe("/home");
  });
});
