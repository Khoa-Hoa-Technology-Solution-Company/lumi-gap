import { describe, expect, it } from "vitest";
import { decodeFeedbackItem, encodeFeedbackPriority, isSuggestionRevisionItem } from "../../reviews/academic-review.rules.js";

describe("Manuscript & Feedback Workspace — Suggestion & Revision Semantics", () => {
  it("encodes and decodes SUGGESTION items cleanly without leaking internal sentinel keys", () => {
    const encodedNoCriterion = encodeFeedbackPriority("SUGGESTION");
    expect(isSuggestionRevisionItem(encodedNoCriterion)).toBe(true);
    expect(decodeFeedbackItem(encodedNoCriterion)).toEqual({
      priority: "SUGGESTION",
      criterionKey: undefined,
    });

    const encodedWithCriterion = encodeFeedbackPriority("SUGGESTION", "methodology");
    expect(isSuggestionRevisionItem(encodedWithCriterion)).toBe(true);
    expect(decodeFeedbackItem(encodedWithCriterion)).toEqual({
      priority: "SUGGESTION",
      criterionKey: "methodology",
    });

    const majorItem = encodeFeedbackPriority("MAJOR", "methodology");
    expect(isSuggestionRevisionItem(majorItem)).toBe(false);
    expect(decodeFeedbackItem(majorItem)).toEqual({
      priority: "MAJOR",
      criterionKey: "methodology",
    });
  });
});
