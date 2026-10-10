import { describe, expect, it } from "vitest";
import { getResearchSuggestions, researchInterestOptions, researchSkillOptions } from "./research-suggestions";

describe("research suggestions", () => {
  it("suggests different topics and skills for different fields", () => {
    const software = getResearchSuggestions(["Software Engineering"]);
    const education = getResearchSuggestions(["Education"]);
    expect(software.interests).toContain("Automated Testing");
    expect(software.interests).not.toContain("Public Health");
    expect(education.interests).toContain("Educational Technology");
    expect(education.interests).not.toContain("Automated Testing");
    expect(education.skillGroups.flatMap(group => group.options)).toContain("Survey Design");
    expect(software.skillGroups.flatMap(group => group.options)).toContain("Test Automation");
  });
  it("combines multiple fields without duplicate topics or skills", () => {
    const result = getResearchSuggestions(["Software Engineering", "Education", " education "]);
    expect(result.interests).toEqual(expect.arrayContaining(["Automated Testing", "Educational Technology"]));
    expect(new Set(result.interests).size).toBe(result.interests.length);
    const skills = result.skillGroups.flatMap(group => group.options);
    expect(new Set(skills).size).toBe(skills.length);
  });
  it("adapts skills to freely selected topics from another field", () => {
    const result = getResearchSuggestions(["Education"], ["LLM for Software Engineering", "Systematic Review"]);
    expect(result.skillGroups.flatMap(group => group.options)).toEqual(expect.arrayContaining(["Python", "Machine Learning", "Model Evaluation", "Evidence Extraction"]));
  });
  it("provides general suggestions for unknown fields and arbitrary custom topics", () => {
    const result = getResearchSuggestions(["A new interdisciplinary field"], ["__proto__", "constructor", "My topic"]);
    expect(result.interests).toEqual(["Systematic Review", "Interdisciplinary Research"]);
    expect(result.skillGroups.flatMap(group => group.options)).toContain("Academic Writing");
  });
  it("keeps suggestions in the freely searchable catalog", () => {
    for (const area of ["Education", "Software Engineering", "Medicine", "Chemistry", "Arts and Humanities", "Physics and Astronomy", "Environmental Science"]) {
      const result = getResearchSuggestions([area]);
      expect(result.interests.every(value => researchInterestOptions.includes(value))).toBe(true);
      expect(result.skillGroups.flatMap(group => group.options).every(value => researchSkillOptions.includes(value))).toBe(true);
    }
  });
});
