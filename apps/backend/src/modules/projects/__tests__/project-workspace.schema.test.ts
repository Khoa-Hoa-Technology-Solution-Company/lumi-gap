import { describe, expect, it } from "vitest";
import { createProjectSchema, inviteMemberSchema, updateProjectPaperSchema, updateProjectSchema } from "../project.controller.js";
import { taskBoardQuerySchema, taskQuerySchema } from "../dto/project-workspace.schema.js";

describe("project workspace request validation", () => {
  it("accepts task queries with completed-task sorting and date bounds", () => {
    const parsed = taskQuerySchema.parse({
      sort: "completed",
      completedSince: "2026-11-01T00:00:00.000Z",
      status: "DONE",
    });
    expect(parsed.sort).toBe("completed");
    expect(parsed.completedSince).toBe("2026-11-01T00:00:00.000Z");
    expect(parsed.status).toBe("DONE");

    const parsedAsc = taskQuerySchema.parse({ sort: "completed_asc" });
    expect(parsedAsc.sort).toBe("completed_asc");

    const boardParsed = taskBoardQuerySchema.parse({
      sort: "manual",
      todoPage: 1,
      progressPage: 1,
      blockedPage: 1,
      donePage: 1,
      completedSince: "2026-11-01T00:00:00.000Z",
    });
    expect(boardParsed.completedSince).toBe("2026-11-01T00:00:00.000Z");
  });

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
    expect(() => inviteMemberSchema.parse({ userId: "11111111-1111-4111-8111-111111111111", email: "another@example.com" })).toThrow();
  });

  it("validates research areas, keywords, approach and idempotency input", () => {
    expect(createProjectSchema.parse({ title: "Idea", visibility: "PUBLIC", researchField: "Artificial Intelligence", researchAreas: ["Artificial Intelligence"], keywords: ["LLM", "Vulnerability Detection"], researchApproach: "EXPLORATORY", idempotencyKey: crypto.randomUUID() })).toMatchObject({ visibility: "PUBLIC", keywords: ["LLM", "Vulnerability Detection"] });
    for (const input of [{ researchAreas: ["A", "B", "C", "D"] }, { researchAreas: ["Education", "education"] }, { researchAreas: [""] }, { keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) }, { researchApproach: "AI" }, { idempotencyKey: "invalid" }, { ownerId: "forged" }]) {
      expect(() => createProjectSchema.parse({ title: "Idea", ...input })).toThrow();
    }
  });
});
