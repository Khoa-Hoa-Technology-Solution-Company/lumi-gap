import { describe, expect, it } from "vitest";
import type { User } from "@trend/shared-types";
import { requiresAcademicProfile } from "./academic-profile";

const baseUser: User = {
  id: "user-1",
  email: "user@example.test",
  fullName: "Test User",
  role: "user",
  systemRole: "RESEARCH_USER",
  accountStatus: "ACTIVE",
  onboarding: { completed: false },
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

describe("requiresAcademicProfile", () => {
  it("requires onboarding for a regular user without an academic profile", () => {
    expect(requiresAcademicProfile(baseUser)).toBe(true);
  });

  it("allows a regular user after choosing an academic profile", () => {
    expect(requiresAcademicProfile({ ...baseUser, primaryPosition: "RESEARCH_STAFF", onboarding: { completed: true } })).toBe(false);
  });

  it("does not block privileged or legacy accounts", () => {
    expect(requiresAcademicProfile({ ...baseUser, role: "admin", systemRole: "ADMIN" })).toBe(false);
  });
});
