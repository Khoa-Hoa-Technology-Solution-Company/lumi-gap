import { describe, expect, it } from "vitest";
import { hasPermission } from "../../../common/authorization/permissions.js";
import { RegisterSchema, UpdateAcademicProfileSchema } from "../dto/auth.schema.js";

describe("academic profile onboarding contracts", () => {
  it("rejects attempts to assign an authorization role during registration", () => {
    const result = RegisterSchema.safeParse({
      email: "new-user@example.test",
      password: "Correct-horse-battery-staple1",
      fullName: "New User",
      role: "admin",
    });

    expect(result.success).toBe(false);
  });

  it.each(["STUDENT", "LECTURER", "RESEARCH_STAFF", "INDUSTRY_PRACTITIONER", "OTHER"] as const)(
    "accepts the supported primary position %s",
    (primaryPosition) => {
      expect(UpdateAcademicProfileSchema.safeParse({ primaryPosition, institutionName: "FPT University" }).success).toBe(true);
    },
  );

  it("rejects authorization roles as academic profile types", () => {
    expect(UpdateAcademicProfileSchema.safeParse({ primaryPosition: "ADMIN", institutionName: "FPT University" }).success).toBe(false);
  });

  it("gives the base user role normal contributor permissions", () => {
    expect(hasPermission("user", "forum:write")).toBe(true);
    expect(hasPermission("user", "community:moderate")).toBe(false);
  });
});
