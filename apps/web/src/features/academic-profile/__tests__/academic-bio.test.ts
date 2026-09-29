import { describe, expect, it } from "vitest";
import { combineAcademicBio } from "../utils/academic-bio";

describe("combineAcademicBio", () => {
  it("preserves both legacy headline and biography in one field", () => {
    expect(combineAcademicBio("Research focus", "Background and experience"))
      .toBe("Research focus\n\nBackground and experience");
  });

  it("falls back to legacy bio when biography is empty", () => {
    expect(combineAcademicBio(undefined, "", "Legacy biography")).toBe("Legacy biography");
  });

  it("does not duplicate identical headline and biography text", () => {
    expect(combineAcademicBio("Research focus", "Research focus")).toBe("Research focus");
  });

  it("does not duplicate a headline already at the start of the biography", () => {
    expect(combineAcademicBio("Research focus", "Research focus\n\nBackground"))
      .toBe("Research focus\n\nBackground");
  });
});
