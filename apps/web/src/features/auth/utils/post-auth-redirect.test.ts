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
  it("verifies email before onboarding or invitations", () => {
    expect(resolvePostAuthPath({ ...member, emailVerifiedAt: undefined, onboarding: { completed: false } }, "/projects")).toBe("/verify-email");
    expect(resolvePostAuthPath({ ...member, emailVerifiedAt: undefined }, "/invitations/example")).toBe("/verify-email");
    expect(resolvePostAuthPath({ ...member, emailVerifiedAt: undefined }, "/home")).toBe("/verify-email");
    expect(resolvePostAuthPath({ ...member, onboarding: { completed: false } }, "/home")).toBe("/onboarding/academic-profile");
  });
  it.each(["/verify-email", "/onboarding/academic-profile"])("does not redirect completed accounts back into setup: %s", path => {
    expect(resolvePostAuthPath(member, path)).toBe("/home");
  });
  it("does not gate Home on FPT affiliation", () => {
    expect(resolvePostAuthPath({ ...member, participantScope: "PENDING" })).toBe("/home");
    expect(resolvePostAuthPath({ ...member, participantScope: "EXTERNAL" })).toBe("/home");
  });
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

  it.each(["/profile", "/home", "/invitations/example", "/projects"])(
    "requires onboarding for an unfinished account: %s", (path) => {
      const unfinished = { ...member, onboarding: { completed: false } };
      expect(resolvePostAuthPath(unfinished, path)).toBe("/onboarding/academic-profile");
    },
  );

  it("preserves the invitation destination after onboarding is complete", () => {
    expect(resolvePostAuthPath(member, "/invitations/example")).toBe("/invitations/example");
  });

  it("returns a signed-in user to a safe internal destination", () => {
    expect(resolvePostAuthPath(member, "/projects/abc?tab=team#members"))
      .toBe("/projects/abc?tab=team#members");
  });

  it.each(["/admin", "/admin?tab=users", "/admin#overview", "/admin/users", "/admin/academic-verifications"])(
    "does not return a regular user to an admin destination: %s", (path) => {
      expect(resolvePostAuthPath(member, path)).toBe("/home");
      expect(resolvePostAuthPath({ ...member, role: "admin" }, path)).toBe("/home");
    },
  );

  it("keeps the requested admin destination for an administrator", () => {
    expect(resolvePostAuthPath({ ...member, role: "admin", systemRole: "ADMIN" }, "/admin/users?tab=active"))
      .toBe("/admin/users?tab=active");
  });

  it("still requires onboarding for a newly recreated user returning from admin", () => {
    expect(resolvePostAuthPath({ ...member, onboarding: { completed: false } }, "/admin"))
      .toBe("/onboarding/academic-profile");
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
