import { describe, expect, it } from "vitest";
import { canViewGapValidation, gapValidationConflict } from "../gap-validation.rules.js";

const outsider = { isCreator: false, isProjectMember: false, isExpert: false };
const expert = { ...outsider, isExpert: true };

describe("canViewGapValidation", () => {
  it("always lets the creator and project members see evidence and validations", () => {
    expect(canViewGapValidation({ ...outsider, isCreator: true }, "CANDIDATE")).toBe(true);
    expect(canViewGapValidation({ ...outsider, isProjectMember: true }, "DRAFT")).toBe(true);
  });

  it("shares a gap with experts only after its owner requested validation", () => {
    expect(canViewGapValidation(expert, "CANDIDATE")).toBe(false);
    expect(canViewGapValidation(expert, "UNDER_VALIDATION")).toBe(true);
    expect(canViewGapValidation(expert, "VALIDATED")).toBe(true);
  });

  it("never shows a gap to an unrelated user without the capability", () => {
    expect(canViewGapValidation(outsider, "UNDER_VALIDATION")).toBe(false);
    expect(canViewGapValidation(outsider, "VALIDATED")).toBe(false);
  });
});

describe("gapValidationConflict", () => {
  it("blocks the creator and members of the gap's project", () => {
    expect(gapValidationConflict({ isCreator: true, isProjectMember: false })).not.toBeNull();
    expect(gapValidationConflict({ isCreator: false, isProjectMember: true })).not.toBeNull();
  });

  it("allows an independent expert", () => {
    expect(gapValidationConflict({ isCreator: false, isProjectMember: false })).toBeNull();
  });
});
