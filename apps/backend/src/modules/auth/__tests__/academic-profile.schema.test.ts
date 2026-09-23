import { describe, expect, it } from "vitest";
import { hasPermission } from "../../../common/authorization/permissions.js";
import { RegisterSchema, UpdateAcademicProfileSchema } from "../dto/auth.schema.js";

describe("academic profile onboarding contracts", () => {
  it("rejects attempts to assign an authorization role during registration", () => {
    const result = RegisterSchema.safeParse({
      email: "new-user@example.test",
      password: "correct-horse-battery-staple",
      fullName: "New User",
      role: "admin",
    });

    expect(result.success).toBe(false);
  });

  it.each(["student", "researcher", "lecturer"] as const)(
    "accepts the supported academic profile type %s",
    (academicProfileType) => {
      expect(UpdateAcademicProfileSchema.safeParse({ academicProfileType }).success).toBe(true);
    },
  );

  it("rejects authorization roles as academic profile types", () => {
    expect(UpdateAcademicProfileSchema.safeParse({ academicProfileType: "admin" }).success).toBe(false);
  });

  it("gives the base user role normal contributor permissions", () => {
    expect(hasPermission("user", "forum:write")).toBe(true);
    expect(hasPermission("user", "community:moderate")).toBe(false);
  });
});
