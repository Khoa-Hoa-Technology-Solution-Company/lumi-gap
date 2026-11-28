import { describe, expect, it } from "vitest";
import {
  SCIENTIFIC_REVIEW_POLICY,
  SCIENTIFIC_REVIEW_POLICY_V2,
  SYSTEM_RUBRIC_V2_CATALOG,
  requiresScientificIntegrity,
} from "@trend/shared-types";
import { decodeFeedbackItem, encodeFeedbackPriority, isSuggestionRevisionItem, reviewOutcome, weightedRubricScore } from "../academic-review.rules.js";

describe("feedback-first priority encoding & review outcomes", () => {
  it("encodes and decodes SUGGESTION items without requiring a schema break", () => {
    const plain = encodeFeedbackPriority("SUGGESTION");
    expect(plain).toEqual({ priority: "MINOR", criterionKey: "__suggestion__" });
    expect(isSuggestionRevisionItem(plain)).toBe(true);
    expect(decodeFeedbackItem({ ...plain, description: "Add a diagram" })).toEqual({
      priority: "SUGGESTION",
      criterionKey: undefined,
      description: "Add a diagram",
    });

    const scoped = encodeFeedbackPriority("SUGGESTION", "methodology");
    expect(scoped).toEqual({ priority: "MINOR", criterionKey: "methodology:suggestion" });
    expect(isSuggestionRevisionItem(scoped)).toBe(true);
    expect(decodeFeedbackItem({ ...scoped, description: "Clarify parameter" })).toEqual({
      priority: "SUGGESTION",
      criterionKey: "methodology",
      description: "Clarify parameter",
    });
  });

  it("preserves MAJOR and MINOR items untouched", () => {
    const major = encodeFeedbackPriority("MAJOR", "data_evaluation");
    expect(major).toEqual({ priority: "MAJOR", criterionKey: "data_evaluation" });
    expect(isSuggestionRevisionItem(major)).toBe(false);
    expect(decodeFeedbackItem({ ...major, description: "Fix train/test split" })).toEqual({
      priority: "MAJOR",
      criterionKey: "data_evaluation",
      description: "Fix train/test split",
    });
  });

  it("computes weighted score strictly over assessed applicable weights", () => {
    expect(weightedRubricScore([])).toBeUndefined();
    expect(weightedRubricScore([{ score: 5, weight: 10 }])).toBe(5);
    expect(weightedRubricScore([{ score: 5, weight: 10 }, { score: 3, weight: 20 }])).toBeCloseTo(110 / 30);
  });

  it("maps continue/comment-only without blocking items to COMPLETED and resubmit to REVISION_REQUESTED", () => {
    expect(reviewOutcome(undefined, 0).requestStatus).toBe("COMPLETED");
    expect(reviewOutcome("STRONG", 0).requestStatus).toBe("COMPLETED");
    expect(reviewOutcome("MINOR_REVISION", 1).requestStatus).toBe("REVISION_REQUESTED");
    expect(reviewOutcome("MAJOR_REVISION", 2).requestStatus).toBe("REVISION_REQUESTED");
  });

  it("recognizes both v1.0 and v2.0 LumiGap system rubric policies and ships 7 versioned v2 templates", () => {
    expect(requiresScientificIntegrity([SCIENTIFIC_REVIEW_POLICY])).toBe(true);
    expect(requiresScientificIntegrity([SCIENTIFIC_REVIEW_POLICY_V2])).toBe(true);
    expect(Object.keys(SYSTEM_RUBRIC_V2_CATALOG)).toHaveLength(7);
    for (const tpl of Object.values(SYSTEM_RUBRIC_V2_CATALOG)) {
      expect(tpl.versionNumber).toBe(2);
      expect(tpl.criteria.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    }
  });
});
