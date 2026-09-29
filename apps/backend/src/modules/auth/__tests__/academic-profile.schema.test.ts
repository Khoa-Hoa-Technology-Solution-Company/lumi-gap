import { describe, expect, it } from "vitest";
import { hasPermission } from "../../../common/authorization/permissions.js";
import { RegisterSchema, UpdateAcademicProfileSchema, UpdateProfileSchema } from "../dto/auth.schema.js";

const PROGRAM_ID = "55555555-5555-4555-8555-555555555555";
const minimalResearchContext = {
  researchAreas: ["Software Engineering"],
  researchInterests: ["Evidence synthesis"],
};

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

  it("accepts the minimal focused Student onboarding payload", () => {
    expect(UpdateAcademicProfileSchema.safeParse({
      academicRole: "STUDENT",
      institutionName: "FPT University",
      programId: PROGRAM_ID,
      ...minimalResearchContext,
    }).success).toBe(true);
  });

  it.each(["RESEARCHER", "LECTURER"] as const)(
    "accepts the minimal focused %s onboarding payload",
    (academicRole) => {
      expect(UpdateAcademicProfileSchema.safeParse({
        academicRole,
        positionTitle: academicRole === "LECTURER" ? "Lecturer" : "Research Assistant",
        institutionName: "FPT University",
        ...minimalResearchContext,
      }).success).toBe(true);
    },
  );

  it("accepts primary position only as supplemental academic profile data", () => {
    expect(UpdateAcademicProfileSchema.safeParse({
      academicRole: "RESEARCHER",
      primaryPosition: "RESEARCH_STAFF",
      positionTitle: "Research Assistant",
      institutionName: "FPT University",
      ...minimalResearchContext,
    }).success).toBe(true);
  });

  it("rejects authorization roles as academic profile types", () => {
    expect(UpdateAcademicProfileSchema.safeParse({
      academicRole: "ADMIN",
      institutionName: "FPT University",
      ...minimalResearchContext,
    }).success).toBe(false);
  });

  it("requires an academic role during onboarding", () => {
    expect(UpdateAcademicProfileSchema.safeParse({
      institutionName: "FPT University",
      programId: PROGRAM_ID,
      ...minimalResearchContext,
    }).success).toBe(false);
  });

  it("requires Student program or major selection", () => {
    const result = UpdateAcademicProfileSchema.safeParse({
      academicRole: "STUDENT",
      institutionName: "FPT University",
      ...minimalResearchContext,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ["programId"] })]));
  });

  it("does not allow Student onboarding without a current institution", () => {
    const result = UpdateAcademicProfileSchema.safeParse({
      academicRole: "STUDENT",
      noAffiliation: true,
      programId: PROGRAM_ID,
      ...minimalResearchContext,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ["institutionName"] })]));
  });

  it("requires research areas and interests for personalization", () => {
    const result = UpdateAcademicProfileSchema.safeParse({
      academicRole: "RESEARCHER",
      positionTitle: "Research Assistant",
      institutionName: "FPT University",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["researchAreas"] }),
        expect.objectContaining({ path: ["researchInterests"] }),
      ]));
    }
  });

  it("keeps verification-only and profile-only fields out of onboarding", () => {
    expect(UpdateAcademicProfileSchema.safeParse({
      academicRole: "STUDENT",
      institutionName: "FPT University",
      programId: PROGRAM_ID,
      studentCode: "SE184001",
      cohort: "K18",
      biography: "Learning systematic literature review methods.",
      ...minimalResearchContext,
    }).success).toBe(false);
  });

  it("trims updated display names and rejects whitespace-only values", () => {
    expect(UpdateProfileSchema.parse({ fullName: "  Ada Lovelace  " }).fullName).toBe("Ada Lovelace");
    expect(UpdateProfileSchema.safeParse({ fullName: "   " }).success).toBe(false);
  });

  it("gives the base user role normal contributor permissions", () => {
    expect(hasPermission("user", "forum:write")).toBe(true);
    expect(hasPermission("user", "community:moderate")).toBe(false);
  });
});
