import { describe, expect, it } from "vitest";
import { dedupeAcademicTerms, isKnownResearchMethodTerm, normalizeAcademicExpertise } from "@trend/shared-types";
import { UpdateAcademicProfileDetailsSchema } from "../dto/academic-profile.schema.js";

describe("Academic Profile expertise normalization & schema validation", () => {
  it("eliminates duplicate terms across legacy fields while separating Areas, Skills, and Methods", () => {
    const normalized = normalizeAcademicExpertise({
      expertiseAreas: ["An ninh mạng", "Kỹ nghệ phần mềm", "Secure Coding", "Thiết kế thí nghiệm", "Research Methods"],
      researchInterests: ["An ninh mạng", "Kỹ nghệ phần mềm"],
      skills: ["Secure Coding", "Thiết kế thí nghiệm", "Research Methods"],
      researchKeywords: ["An ninh mạng", "Kỹ nghệ phần mềm"],
    });

    expect(normalized.researchAreas).toEqual(["An ninh mạng", "Kỹ nghệ phần mềm"]);
    expect(normalized.skills).toEqual(["Secure Coding"]);
    expect(normalized.researchMethods).toEqual(["Thiết kế thí nghiệm", "Research Methods"]);
  });

  it("normalizes whitespace and deduplicates case-insensitively with Unicode/Vietnamese support", () => {
    expect(
      dedupeAcademicTerms(["  An  ninh   mạng ", "an ninh mạng", "Kỹ nghệ phần mềm", ""]),
    ).toEqual(["An ninh mạng", "Kỹ nghệ phần mềm"]);
  });

  it("preserves cross-language terms separately without auto-merging Vietnamese and English", () => {
    const normalized = normalizeAcademicExpertise({
      expertiseAreas: ["An ninh mạng", "Cybersecurity"],
      skills: ["Python", "TypeScript"],
      researchMethods: ["Experimental Research", "Thiết kế thí nghiệm"],
    });
    expect(normalized.researchAreas).toEqual(["An ninh mạng", "Cybersecurity"]);
    expect(normalized.researchMethods).toEqual(["Experimental Research", "Thiết kế thí nghiệm"]);
  });

  it("validates researchMethods and collapses whitespace in UpdateAcademicProfileDetailsSchema", () => {
    const parsed = UpdateAcademicProfileDetailsSchema.parse({
      expertiseAreas: ["  An   ninh mạng ", "an ninh mạng"],
      skills: ["Secure   Coding"],
      researchMethods: ["  Thiết kế  thí nghiệm ", "Systematic Literature Review", "systematic literature review"],
    });
    expect(parsed.expertiseAreas).toEqual(["An ninh mạng"]);
    expect(parsed.skills).toEqual(["Secure Coding"]);
    expect(parsed.researchMethods).toEqual(["Thiết kế thí nghiệm", "Systematic Literature Review"]);
    expect(isKnownResearchMethodTerm("Systematic Literature Review")).toBe(true);
    expect(isKnownResearchMethodTerm("Secure Coding")).toBe(false);
  });
});
