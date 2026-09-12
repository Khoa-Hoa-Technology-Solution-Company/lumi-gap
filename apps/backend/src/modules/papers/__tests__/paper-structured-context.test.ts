import { describe, expect, it } from "vitest";
import { buildStructuredPaperContext } from "../paper-structured-context.js";

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

    expect(context).toContain("Structured analysis:");
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
});
