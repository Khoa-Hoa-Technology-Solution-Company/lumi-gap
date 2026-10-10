/**
 * Artifact status workflow, tied to academic review. PURE — no I/O.
 *
 * REVIEWING is owned by the review workflow: it is set when a review request is
 * created and locked while any request is active. FINAL needs a completed review.
 */
import type { ResearchArtifactStatus } from "@trend/shared-types";

export interface ArtifactReviewState {
  activeRequestCount: number;
  completedRequestCount: number;
}

/**
 * Returns why the artifact cannot be deleted, or null when it can. Reviewers' work hangs off the
 * artifact, so once a review was requested it can only be archived.
 */
export function artifactDeleteError(review: ArtifactReviewState): string | null {
  if (review.activeRequestCount > 0) return "This artifact is under review and cannot be deleted. Wait for the review to finish, then archive it.";
  if (review.completedRequestCount > 0) return "This artifact has completed reviews. Archive it instead of deleting it to keep the review record.";
  return null;
}

/** Returns why `next` is not allowed, or null when the change is valid. */
export function artifactStatusChangeError(next: ResearchArtifactStatus, review: ArtifactReviewState): string | null {
  if (review.activeRequestCount > 0) {
    return next === "REVIEWING" ? null : "This artifact is under review. Its status can change once the review is finished.";
  }
  if (next === "REVIEWING") return "Reviewing is set automatically when you submit the artifact for review.";
  if (next === "FINAL" && review.completedRequestCount === 0) return "An artifact can be finalized only after at least one completed review.";
  return null;
}
