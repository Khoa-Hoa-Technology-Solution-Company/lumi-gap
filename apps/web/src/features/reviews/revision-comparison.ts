import type { ResearchVersion } from "@trend/shared-types";
import type { ReviewWorkspace } from "./api/reviews.api";

export type ComparisonBaselineResolution =
  | {
      status: "available";
      defaultBefore: ResearchVersion;
      after: ResearchVersion;
      selectableBaselines: ResearchVersion[];
      baselineRoundNumber?: number;
    }
  | {
      status: "missing_previous";
      after?: ResearchVersion;
      expectedRevisionNumber?: number;
      expectedRoundNumber?: number;
    }
  | {
      status: "none";
    };

/**
 * Resolve the true comparison baseline from actual review history rather than blindly
 * taking the last array entry. Never substitutes latest submission revision for assigned
 * revision and never silently falls back to an unrelated revision when the previously
 * reviewed snapshot is missing/unshared.
 */
export function resolveComparisonBaseline(params: {
  artifactRevision?: ReviewWorkspace["artifactRevision"];
  comparisonVersions?: ResearchVersion[];
  previousReviews?: ReviewWorkspace["previousReviews"];
  previousRevisionItems?: ReviewWorkspace["previousRevisionItems"];
}): ComparisonBaselineResolution {
  const { artifactRevision, comparisonVersions = [], previousReviews = [], previousRevisionItems = [] } = params;
  if (!artifactRevision) return { status: "none" };

  const byId = new Map(comparisonVersions.map(v => [v.id, v]));
  const after = byId.get(artifactRevision.id);

  // Ordered prior submitted reviews (most recent review round first)
  const orderedPriorReviews = [...previousReviews]
    .filter(r => r.revisionId && r.revisionId !== artifactRevision.id)
    .sort((a, b) => b.roundNumber - a.roundNumber);

  // Authorized historical candidates present in comparisonVersions (excluding assigned revision)
  const authorizedOtherVersions = comparisonVersions
    .filter(v => v.id !== artifactRevision.id)
    .sort((a, b) => b.revisionNumber - a.revisionNumber);

  // Priority 1: Exact revision from the most recent submitted review round
  if (orderedPriorReviews.length > 0) {
    const mostRecentPrior = orderedPriorReviews[0]!;
    const matchedBefore = byId.get(mostRecentPrior.revisionId);
    if (!matchedBefore || !after) {
      return {
        status: "missing_previous",
        after,
        expectedRevisionNumber: mostRecentPrior.revisionNumber,
        expectedRoundNumber: mostRecentPrior.roundNumber,
      };
    }
    const selectableBaselines = orderedPriorReviews
      .map(r => byId.get(r.revisionId))
      .filter((v): v is ResearchVersion => Boolean(v))
      .filter((v, idx, arr) => arr.findIndex(item => item.id === v.id) === idx);
    return {
      status: "available",
      defaultBefore: matchedBefore,
      after,
      selectableBaselines: selectableBaselines.length > 0 ? selectableBaselines : [matchedBefore],
      baselineRoundNumber: mostRecentPrior.roundNumber,
    };
  }

  // Priority 2: Revision explicitly linked from previousRevisionItems (when previousReviews array omitted)
  const itemRevisionId = previousRevisionItems.find(
    item => item.revisionId && item.revisionId !== artifactRevision.id,
  )?.revisionId;
  if (itemRevisionId) {
    const matchedBefore = byId.get(itemRevisionId);
    if (!matchedBefore || !after) {
      const sample = previousRevisionItems.find(item => item.revisionId === itemRevisionId);
      return {
        status: "missing_previous",
        after,
        expectedRevisionNumber: sample?.revisionNumber,
        expectedRoundNumber: sample?.roundNumber,
      };
    }
    return {
      status: "available",
      defaultBefore: matchedBefore,
      after,
      selectableBaselines: authorizedOtherVersions.length > 0 ? authorizedOtherVersions : [matchedBefore],
      baselineRoundNumber: previousRevisionItems.find(item => item.revisionId === itemRevisionId)?.roundNumber,
    };
  }

  // Fallback for legacy payloads that supply comparisonVersions without previousReviews metadata
  if (authorizedOtherVersions.length > 0 && after) {
    return {
      status: "available",
      defaultBefore: authorizedOtherVersions[0]!,
      after,
      selectableBaselines: authorizedOtherVersions,
    };
  }

  return { status: "none" };
}

/**
 * Scope an item's author responses strictly to the currently assigned revision.
 * Historical responses from earlier versions stay separated and never disguise as new responses.
 */
export function scopeRevisionResponses<
  T extends { submissionRevisionId: string; responseText: string; status: string; createdAt?: string },
>(responses: T[], assignedRevisionId?: string): { current?: T; historical: T[] } {
  if (!assignedRevisionId) {
    return { current: undefined, historical: responses };
  }
  const current = responses.find(r => r.submissionRevisionId === assignedRevisionId);
  const historical = responses.filter(r => r.submissionRevisionId !== assignedRevisionId);
  return { current, historical };
}

/**
 * Extract a positive 1-based page number from a human-written locator such as
 * "Trang 5", "Tr. 12", "Page 4, Section 3.2", or "p. 7".
 */
export function parseLocatorPage(locator?: string | null): number | null {
  if (!locator) return null;
  const match = locator.match(/(?:\b(?:trang|tr\.?|page|pg\.?|p\.?)\s*[:#]?\s*)(\d{1,4})\b/i);
  if (!match) return null;
  const page = Number.parseInt(match[1]!, 10);
  return Number.isFinite(page) && page >= 1 && page <= 1000 ? page : null;
}

export interface PreviousRevisionStats {
  totalMandatory: number;
  acceptedMandatory: number;
  reopenedMandatory: number;
  pendingReviewMandatory: number; // ADDRESSED (waiting for mentor check)
  awaitingAuthorMandatory: number; // OPEN
  reviewedMandatory: number; // ACCEPTED + REOPENED
  suggestionCount: number;
  allMandatoryResolved: boolean; // true ONLY when every mandatory item is ACCEPTED
}

/**
 * Distinguish reviewed vs accepted counts so 100% completion is NEVER reported
 * while REOPENED or OPEN mandatory items remain.
 */
export function computePreviousRevisionStats(
  items: Array<{ status: string; priority?: "MAJOR" | "MINOR" | "SUGGESTION" }>,
): PreviousRevisionStats {
  const mandatory = items.filter(item => item.priority !== "SUGGESTION");
  const suggestionCount = items.length - mandatory.length;
  const acceptedMandatory = mandatory.filter(item => item.status === "ACCEPTED").length;
  const reopenedMandatory = mandatory.filter(item => item.status === "REOPENED").length;
  const pendingReviewMandatory = mandatory.filter(item => item.status === "ADDRESSED").length;
  const awaitingAuthorMandatory = mandatory.filter(item => item.status === "OPEN").length;
  const reviewedMandatory = acceptedMandatory + reopenedMandatory;

  return {
    totalMandatory: mandatory.length,
    acceptedMandatory,
    reopenedMandatory,
    pendingReviewMandatory,
    awaitingAuthorMandatory,
    reviewedMandatory,
    suggestionCount,
    allMandatoryResolved: mandatory.length > 0 && acceptedMandatory === mandatory.length,
  };
}

export interface CompatiblePriorCriterionRef {
  roundNumber: number;
  revisionNumber?: number;
  score?: number | null;
  assessment?: string | null;
  comment?: string | null;
  notApplicable: boolean;
}

/**
 * Build a map of compatible prior-round criterion scores & comments ONLY when
 * the prior submitted review used the exact same template version (same reviewer,
 * same template, same criterion keys, same performance scale).
 */
export function buildCompatiblePriorCriteriaMap(params: {
  previousReviews?: ReviewWorkspace["previousReviews"];
  currentTemplateVersionId?: string;
}): Record<string, CompatiblePriorCriterionRef> {
  const { previousReviews = [], currentTemplateVersionId } = params;
  if (!currentTemplateVersionId || previousReviews.length === 0) return {};

  const compatibleReview = [...previousReviews]
    .sort((a, b) => b.roundNumber - a.roundNumber)
    .find(
      review =>
        review.templateVersionId === currentTemplateVersionId &&
        Array.isArray(review.responses) &&
        review.responses.length > 0,
    );
  if (!compatibleReview?.responses) return {};

  const map: Record<string, CompatiblePriorCriterionRef> = {};
  for (const resp of compatibleReview.responses) {
    map[resp.criterionKey] = {
      roundNumber: compatibleReview.roundNumber,
      revisionNumber: compatibleReview.revisionNumber,
      score: resp.score ?? null,
      assessment: resp.assessment ?? null,
      comment: resp.comment?.trim() ? resp.comment.trim() : null,
      notApplicable: resp.notApplicable,
    };
  }
  return map;
}
