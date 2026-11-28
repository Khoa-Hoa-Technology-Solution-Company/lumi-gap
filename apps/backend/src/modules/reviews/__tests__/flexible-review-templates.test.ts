import { describe, expect, it } from "vitest";
import {
  isArtifactTypeCompatible,
  isLowRubricScore,
  planDraftResponseMigration,
  validateTemplateCriteriaConfig,
} from "../academic-review.rules.js";
import { validateScientificIntegrity } from "../scientific-review.rules.js";
import { scientificIntegrityChecks, type AcademicReviewInput } from "@trend/shared-types";

describe("flexible academic review template rules", () => {
  it("validates rubric, structured qualitative, and guided feedback criteria cleanly", () => {
    // Rubric requires >= 2 levels with unique integer scores; relative weights do not need to sum to 100
    expect(
      validateTemplateCriteriaConfig("RUBRIC_ASSESSMENT", [
        {
          title: "Architecture & Benchmarks",
          required: true,
          allowNotApplicable: false,
          weight: 2,
          levels: [
            { label: "Weak", score: 1 },
            { label: "Adequate", score: 2 },
            { label: "Strong", score: 3 },
          ],
        },
        {
          title: "Reproducibility",
          required: false,
          allowNotApplicable: true,
          weight: 1,
          levels: [
            { label: "Incomplete", score: 1 },
            { label: "Reproducible", score: 2 },
          ],
        },
      ]),
    ).toBeNull();

    // Duplicate level scores rejected
    expect(
      validateTemplateCriteriaConfig("RUBRIC_ASSESSMENT", [
        {
          title: "Invalid scale",
          required: true,
          allowNotApplicable: false,
          levels: [
            { label: "A", score: 3 },
            { label: "B", score: 3 },
          ],
        },
      ]),
    ).toContain("duplicate level scores");

    // Rubric with < 2 levels rejected
    expect(
      validateTemplateCriteriaConfig("RUBRIC_ASSESSMENT", [
        {
          title: "Single level",
          required: true,
          allowNotApplicable: false,
          levels: [{ label: "Only", score: 1 }],
        },
      ]),
    ).toContain("at least 2 performance levels");

    // Structured qualitative review and guided feedback do not require numerical levels or weights
    expect(
      validateTemplateCriteriaConfig("STRUCTURED_REVIEW", [
        { title: "Research feasibility", required: true, allowNotApplicable: false },
      ]),
    ).toBeNull();
    expect(
      validateTemplateCriteriaConfig("GUIDED_FEEDBACK", [
        { title: "Key methodological notes", required: true, allowNotApplicable: true },
      ]),
    ).toBeNull();

    // Empty criteria rejected
    expect(validateTemplateCriteriaConfig("GUIDED_FEEDBACK", [])).toContain("at least one criterion");
  });

  it("generalizes low-score feedback threshold across 5-point, 4-point, binary, and 10-point scales", () => {
    expect(isLowRubricScore(2, [1, 2, 3, 4, 5])).toBe(true);
    expect(isLowRubricScore(3, [1, 2, 3, 4, 5])).toBe(false);
    expect(isLowRubricScore(2, [1, 2, 3, 4])).toBe(true);
    expect(isLowRubricScore(3, [1, 2, 3, 4])).toBe(false);
    expect(isLowRubricScore(1, [1, 2])).toBe(true);
    expect(isLowRubricScore(2, [1, 2])).toBe(false);
    expect(isLowRubricScore(4, [0, 2, 4, 6, 8, 10])).toBe(true);
    expect(isLowRubricScore(6, [0, 2, 4, 6, 8, 10])).toBe(false);
  });

  it("checks artifact type compatibility while letting generic templates apply broadly", () => {
    expect(isArtifactTypeCompatible(null, "RESEARCH_PAPER")).toBe(true);
    expect(isArtifactTypeCompatible("MANUSCRIPT", "SOFTWARE_RESEARCH_PROJECT")).toBe(true);
    expect(isArtifactTypeCompatible("GENERAL_REPORT", "RESEARCH_PROPOSAL")).toBe(true);
    expect(isArtifactTypeCompatible("RESEARCH_PROPOSAL", "RESEARCH_PROPOSAL")).toBe(true);
    expect(isArtifactTypeCompatible("RESEARCH_PROPOSAL", "RESEARCH_PAPER")).toBe(false);
    expect(isArtifactTypeCompatible("RESEARCH_PROPOSAL", null)).toBe(true);
  });

  it("safely migrates compatible draft criterion responses and removes orphan keys without touching overall feedback", () => {
    const existing = [
      {
        id: "r1",
        criterionKey: "methodology",
        comment: "Solid experimental setup.",
        evidence: "Section 3",
        assessment: null,
        performanceLevelId: "lvl-old-4",
        score: 4,
        notApplicable: false,
      },
      {
        id: "r2",
        criterionKey: "obsolete_key",
        comment: "Old criterion comment",
        evidence: null,
        assessment: null,
        performanceLevelId: "lvl-old-2",
        score: 2,
        notApplicable: false,
      },
      {
        id: "r3",
        criterionKey: "ethics",
        comment: "",
        evidence: null,
        assessment: "NOT_APPLICABLE",
        performanceLevelId: null,
        score: null,
        notApplicable: true,
      },
    ];

    const plan = planDraftResponseMigration(
      existing,
      [
        { key: "methodology", allowNotApplicable: false, levels: [] },
        { key: "ethics", allowNotApplicable: false, levels: [] },
      ],
      "STRUCTURED_REVIEW",
    );

    expect(plan.deleteIds).toEqual(["r2"]);
    expect(plan.updates).toEqual([
      {
        id: "r1",
        performanceLevelId: null,
        score: null,
        assessment: null,
        notApplicable: false,
      },
      {
        id: "r3",
        performanceLevelId: null,
        score: null,
        assessment: null,
        notApplicable: false,
      },
    ]);
    expect(plan.incompatibleCount).toBe(3);
  });

  it("keeps research integrity mandatory on MENTOR_GUIDANCE even when using a personal qualitative template with empty guidelines", () => {
    const incomplete: AcademicReviewInput = {
      overallAssessment: "MINOR_REVISION",
      overallComment: "Qualitative feedback without numerical scores.",
      responses: [{ criterionKey: "feasibility", assessment: "ADEQUATE", comment: "" }],
    };
    expect(() => validateScientificIntegrity(incomplete, [], "MENTOR_GUIDANCE", true)).toThrow(
      /integrity checklist/i,
    );

    const completeWithConcern: AcademicReviewInput = {
      ...incomplete,
      overallAssessment: "STRONG",
      integrityChecks: Object.fromEntries(
        scientificIntegrityChecks.map(c => [
          c.key,
          c.key === "data"
            ? { status: "CONCERN" as const, note: "Raw dataset provenance is missing from section 3." }
            : { status: "CHECKED" as const },
        ]),
      ),
    };
    expect(() => validateScientificIntegrity(completeWithConcern, [], "MENTOR_GUIDANCE", true)).toThrow(
      /Unresolved integrity concerns/i,
    );
  });
});
