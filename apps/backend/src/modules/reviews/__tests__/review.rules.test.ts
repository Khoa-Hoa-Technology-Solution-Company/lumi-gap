import { describe, expect, it } from "vitest";
import type { ReviewAvailabilitySettings } from "@trend/shared-types";
import { basicConflictReason, canUseReviewerWorkspace, reviewCapacityIssue } from "../review.rules.js";

const settings: ReviewAvailabilitySettings = {
  availableForReview: true,
  acceptedFields: ["Software Engineering"],
  acceptedTopics: ["LLM evaluation"],
  acceptedSubmissionTypes: ["RESEARCH_PAPER"],
  maximumActiveReviews: 2,
  autoRecommendationEnabled: true,
  activeReviewCount: 0,
};

describe("peer-review business rules", () => {
  it("allows lecturer and researcher profiles, but not students", () => {
    expect(canUseReviewerWorkspace("lecturer")).toBe(true);
    expect(canUseReviewerWorkspace("researcher")).toBe(true);
    expect(canUseReviewerWorkspace("student")).toBe(false);
    expect(canUseReviewerWorkspace(undefined)).toBe(false);
  });

  it("requires explicit opt-in and enforces maximum active workload", () => {
    expect(reviewCapacityIssue({ ...settings, availableForReview: false })).toMatch(/Enable/);
    expect(reviewCapacityIssue({ ...settings, activeReviewCount: 2 })).toMatch(/Maximum/);
    expect(reviewCapacityIssue({ ...settings, activeReviewCount: 1 })).toBeUndefined();
  });

  it("honors a temporary unavailability window deterministically", () => {
    const now = new Date("2026-09-23T00:00:00.000Z");
    expect(reviewCapacityIssue({ ...settings, temporarilyUnavailableUntil: "2026-09-24T00:00:00.000Z" }, now)).toMatch(/paused/);
    expect(reviewCapacityIssue({ ...settings, temporarilyUnavailableUntil: "2026-09-22T00:00:00.000Z" }, now)).toBeUndefined();
  });

  it("blocks self-review, declared conflicts, and project contributors", () => {
    expect(basicConflictReason({ reviewerId: "r1", authorIds: ["r1"], declaredConflictUserIds: [], isProjectContributor: false })).toMatch(/own/);
    expect(basicConflictReason({ reviewerId: "r1", authorIds: [], declaredConflictUserIds: ["r1"], isProjectContributor: false })).toMatch(/declared/);
    expect(basicConflictReason({ reviewerId: "r1", authorIds: [], declaredConflictUserIds: [], isProjectContributor: true })).toMatch(/contributors/);
    expect(basicConflictReason({ reviewerId: "r1", authorIds: [], declaredConflictUserIds: [], isProjectContributor: false })).toBeUndefined();
  });
});
