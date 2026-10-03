import { describe, expect, it } from "vitest";
import type { SubmittedVersionReview } from "@trend/shared-types";
import { compareCriterionScore, compareReviewScores, latestReviewsByReviewerAndRubric } from "./score-comparison";

const review = (overrides: Partial<SubmittedVersionReview> = {}): SubmittedVersionReview => ({ id: "r1", reviewerId: "lecturer", reviewerName: "Lecturer", reviewerAcademicRole: "LECTURER", revisionId: "v1", roundNumber: 1, templateVersionId: "rubric1", weightedScore: 2, overallAssessment: "STRONG", keyStrengths: null, keyConcerns: null, overallComment: null, submittedAt: "2026-10-03T01:00:00Z", responses: [{ criterionKey: "method", comment: "", evidence: null, assessment: null, score: 2, notApplicable: false }], requiredRevisions: [], ...overrides });

describe("research version score comparison", () => {
  it("computes a delta only for the same reviewer, rubric and applicable criteria", () => {
    expect(compareReviewScores(review(), review({ weightedScore: 4 })).delta).toBe(2);
    expect(compareReviewScores(review(), review({ reviewerId: "researcher" })).delta).toBeUndefined();
    expect(compareReviewScores(review(), review({ templateVersionId: "rubric2" })).delta).toBeUndefined();
    expect(compareReviewScores(review(), review({ responses: [] })).delta).toBeUndefined();
  });
  it("does not assign a score to an unreviewed version, a qualitative review or a legacy rubric", () => {
    expect(compareReviewScores(review(), undefined).delta).toBeUndefined();
    expect(compareReviewScores(review(), review({ weightedScore: null })).delta).toBeUndefined();
    expect(compareReviewScores(review({ templateVersionId: null }), review({ templateVersionId: null })).delta).toBeUndefined();
  });
  it("selects the most recently submitted round within each reviewer/rubric pair", () => {
    const later = review({ id: "r2", roundNumber: 2, submittedAt: "2026-10-03T02:00:00Z" });
    expect(latestReviewsByReviewerAndRubric([later, review()]).get("lecturer:rubric1")?.id).toBe("r2");
    expect(latestReviewsByReviewerAndRubric([later, review({ templateVersionId: "rubric2" })]).size).toBe(2);
  });
  it("keeps criterion deltas separate from missing and not-applicable scores", () => {
    const before = review(), after = review({ responses: [{ ...review().responses[0]!, score: 4 }] });
    expect(compareCriterionScore(before, after, "method")).toBe(2);
    expect(compareCriterionScore(before, review({ responses: [{ ...after.responses[0]!, notApplicable: true }] }), "method")).toBeUndefined();
    expect(compareCriterionScore(before, review({ reviewerId: "other" }), "method")).toBeUndefined();
  });
});
