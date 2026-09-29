import { describe, expect, it } from "vitest";
import { createProjectSchema, inviteMemberSchema, updateProjectPaperSchema, updateProjectSchema } from "../project.controller.js";

describe("project workspace request validation", () => {
  it("accepts the supported project lifecycle fields", () => {
    expect(createProjectSchema.parse({ title: "Evidence synthesis", researchField: "Health informatics", status: "ACTIVE", visibility: "INVITE_ONLY" })).toMatchObject({ status: "ACTIVE", visibility: "INVITE_ONLY" });
  });

  it("rejects unsupported roles and lifecycle values", () => {
    expect(() => createProjectSchema.parse({ title: "Project", status: "LECTURER" })).toThrow();
  });

  it("requires an exclusion reason when the service applies an exclusion decision", () => {
    const parsed = updateProjectPaperSchema.parse({ screeningStatus: "EXCLUDED", exclusionReason: "WRONG_RESEARCH_TOPIC", exclusionNote: "Focuses on hardware" });
    expect(parsed.screeningStatus).toBe("EXCLUDED");
    expect(parsed.exclusionReason).toBe("WRONG_RESEARCH_TOPIC");
    expect(() => updateProjectPaperSchema.parse({ screeningStatus: "UNKNOWN" })).toThrow();
    expect(() => updateProjectPaperSchema.parse({ screeningStatus: "EXCLUDED", exclusionReason: "Free-form reason" })).toThrow();
  });

  it("validates project-level screening criteria", () => {
    expect(updateProjectSchema.parse({ inclusionCriteria: ["Empirical software engineering"] }).inclusionCriteria).toEqual(["Empirical software engineering"]);
    expect(() => updateProjectSchema.parse({ exclusionCriteria: [" ".repeat(4)] })).toThrow();
    expect(() => updateProjectSchema.parse({ exclusionCriteria: Array.from({ length: 21 }, (_, index) => `Criterion ${index}`) })).toThrow();
  });

  it("requires either a user or valid email invitation target", () => {
    expect(() => inviteMemberSchema.parse({ message: "Join us" })).toThrow();
    expect(() => inviteMemberSchema.parse({ email: "not-an-email" })).toThrow();
    expect(inviteMemberSchema.parse({ email: "researcher@example.com" }).email).toBe("researcher@example.com");
  });
});
