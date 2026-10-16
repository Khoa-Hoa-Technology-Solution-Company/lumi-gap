import { describe, expect, it } from "vitest";
import { buildPaperEvidenceText, buildStructuredPaperContext } from "../paper-structured-context.js";

describe("buildStructuredPaperContext", () => {
  it("renders grounded aiAnalysis fields in a compact stable order", () => {
    const context = buildStructuredPaperContext({
      summary: "Studies LLM feedback in education.",
      methods: "Mixed-method survey",
      dataset: "120 student submissions",
      findings: ["Feedback improved revision quality"],
      limitations: ["Single university sample"],
      contributions: ["Rubric for LLM-assisted review"],
      futureWork: ["Validate across multiple institutions"],
      keyTerms: ["LLM feedback", "education"],
    });

    expect(context).toContain("AI-extracted notes");
    expect(context).toContain("Summary: Studies LLM feedback in education.");
    expect(context).toContain("Methods: Mixed-method survey");
    expect(context).toContain("Dataset: 120 student submissions");
    expect(context).toContain("Findings: Feedback improved revision quality");
    expect(context).toContain("Limitations: Single university sample");
    expect(context).toContain("Contributions: Rubric for LLM-assisted review");
    expect(context).toContain("Future work: Validate across multiple institutions");
    expect(context).toContain("Key terms: LLM feedback; education");
  });

  it("returns null when aiAnalysis has no useful content", () => {
    expect(buildStructuredPaperContext(undefined)).toBeNull();
    expect(
      buildStructuredPaperContext({
        summary: null,
        methods: null,
        dataset: null,
        findings: [],
        limitations: [],
        contributions: [],
        futureWork: [],
        keyTerms: [],
      }),
    ).toBeNull();
  });

  it("puts the source abstract first and budgets the AI notes separately", () => {
    const text = buildPaperEvidenceText(
      { abstractText: "Short original abstract.", aiAnalysis: { summary: "s".repeat(500), methods: "m".repeat(500) } },
      { abstractChars: 600, notesChars: 400 },
    );
    expect(text.startsWith("Abstract: Short original abstract.")).toBe(true);
    expect(text.indexOf("Abstract:")).toBeLessThan(text.indexOf("AI-extracted notes"));
    const notes = text.slice(text.indexOf("AI-extracted notes"));
    expect(notes.length).toBeLessThanOrEqual(400);
  });

  it("truncates a long abstract without touching the notes label", () => {
    const text = buildPaperEvidenceText({ abstractText: "a".repeat(2000), aiAnalysis: { summary: "ok" } }, { abstractChars: 100 });
    expect(text).not.toContain("a".repeat(101));
    expect(text).toContain("AI-extracted notes");
  });

  it("returns only the abstract when there is no analysis", () => {
    expect(buildPaperEvidenceText({ abstractText: "Only abstract" })).toBe("Abstract: Only abstract");
  });
});
