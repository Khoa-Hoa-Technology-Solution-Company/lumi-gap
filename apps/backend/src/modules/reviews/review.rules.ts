import type { ReviewAvailabilitySettings } from "@trend/shared-types";

export function reviewCapacityIssue(settings: ReviewAvailabilitySettings, now = new Date()): string | undefined {
  if (!settings.availableForReview) return "Enable Available for Review before accepting opportunities";
  if (settings.temporarilyUnavailableUntil && new Date(settings.temporarilyUnavailableUntil) > now) {
    return "Your reviewer availability is temporarily paused";
  }
  if (settings.activeReviewCount >= settings.maximumActiveReviews) {
    return "Maximum active review workload reached";
  }
  return undefined;
}

export function basicConflictReason(input: {
  reviewerId: string;
  authorIds: string[];
  declaredConflictUserIds: string[];
  isProjectContributor: boolean;
}): string | undefined {
  if (input.authorIds.includes(input.reviewerId)) return "You cannot review your own submission";
  if (input.declaredConflictUserIds.includes(input.reviewerId)) return "A conflict was declared for this reviewer";
  if (input.isProjectContributor) return "Project contributors cannot review this submission";
  return undefined;
}
