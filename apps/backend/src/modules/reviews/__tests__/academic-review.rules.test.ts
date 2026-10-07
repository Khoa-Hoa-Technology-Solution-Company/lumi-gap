import { describe, expect, it } from "vitest";
import {
  canCancelReviewRequest,
  canResubmitReviewRequest,
  canReviewerDeclineRequest,
  canUseOpenReviewOpportunities,
  canViewReviewRequest,
  nextTemplateVersionNumber,
  reviewOutcome,
  eligiblePeerReviewer,
  submissionReviewStatus,
  weightedRubricScore,
} from "../academic-review.rules.js";

describe("academic review lifecycle rules", () => {
  it("requests revision without converting an academic score into pass/fail", () => {
    expect(reviewOutcome("MAJOR_REVISION", 0)).toEqual({ requestStatus: "REVISION_REQUESTED", submissionStatus: "revision_requested", assignmentStatus: "accepted" });
    expect(reviewOutcome("STRONG", 1).requestStatus).toBe("REVISION_REQUESTED");
    expect(reviewOutcome("STRONG", 0).requestStatus).toBe("COMPLETED");
    expect(reviewOutcome("NOT_READY", 0).requestStatus).toBe("COMPLETED");
  });

  it("limits cancellation and resubmission to their explicit lifecycle states", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const createdAt = new Date("2026-10-01T12:00:00Z");
    const future = new Date("2026-10-20T12:00:00Z");
    const past = new Date("2026-10-05T12:00:00Z");
    expect(canCancelReviewRequest({ status: "REQUESTED", dueAt: future, createdAt }, now)).toBe(true);
    // Accepted reviews cannot be cancelled before they are overdue.
    expect(canCancelReviewRequest({ status: "ACCEPTED", dueAt: future, createdAt }, now)).toBe(false);
    expect(canCancelReviewRequest({ status: "IN_REVIEW", dueAt: future, createdAt }, now)).toBe(false);
    expect(canCancelReviewRequest({ status: "ACCEPTED", dueAt: past, createdAt }, now)).toBe(true);
    expect(canCancelReviewRequest({ status: "IN_REVIEW", dueAt: past, createdAt }, now)).toBe(true);
    // Without a due date the default review window applies.
    expect(canCancelReviewRequest({ status: "ACCEPTED", dueAt: null, createdAt }, now)).toBe(false);
    expect(canCancelReviewRequest({ status: "ACCEPTED", dueAt: null, createdAt: new Date("2026-08-01T00:00:00Z") }, now)).toBe(true);
    expect(canCancelReviewRequest({ status: "REVISION_REQUESTED", dueAt: past, createdAt }, now)).toBe(false);
    expect(canCancelReviewRequest({ status: "COMPLETED", dueAt: past, createdAt }, now)).toBe(false);
    expect(canResubmitReviewRequest("REVISION_REQUESTED")).toBe(true);
    expect(canResubmitReviewRequest("SUBMITTED")).toBe(false);
  });

  it("lets reviewers decline or withdraw only before any round is submitted", () => {
    expect(canReviewerDeclineRequest("REQUESTED", 0)).toBe(true);
    expect(canReviewerDeclineRequest("ACCEPTED", 0)).toBe(true);
    expect(canReviewerDeclineRequest("IN_REVIEW", 0)).toBe(true);
    expect(canReviewerDeclineRequest("IN_REVIEW", 1)).toBe(false);
    expect(canReviewerDeclineRequest("REVISION_REQUESTED", 1)).toBe(false);
    expect(canReviewerDeclineRequest("COMPLETED", 1)).toBe(false);
  });

  it("keeps review request visibility assignment-scoped", () => {
    expect(canViewReviewRequest({ actorId: "requester", requesterId: "requester", reviewerId: "reviewer" })).toBe(true);
    expect(canViewReviewRequest({ actorId: "reviewer", requesterId: "requester", reviewerId: "reviewer" })).toBe(true);
    expect(canViewReviewRequest({ actorId: "project-member", requesterId: "requester", reviewerId: "reviewer" })).toBe(false);
  });

  it("permits qualified reviewers from either participant scope", () => {
    expect(canUseOpenReviewOpportunities("INTERNAL")).toBe(true);
    expect(canUseOpenReviewOpportunities("PENDING")).toBe(true);
    expect(canUseOpenReviewOpportunities("EXTERNAL")).toBe(true);
  });

  it("calculates rubric scores only from applicable weighted levels", () => {
    expect(weightedRubricScore([{ score: 4, weight: 2 }, { score: 2, weight: 1 }])).toBeCloseTo(10 / 3);
    expect(weightedRubricScore([])).toBeUndefined();
    expect(weightedRubricScore([{ score: 4, weight: 0 }])).toBeUndefined();
  });

  it("creates a new version number instead of mutating a published version", () => {
    expect(nextTemplateVersionNumber([{ versionNumber: 1, status: "PUBLISHED" }])).toBe(2);
    expect(nextTemplateVersionNumber([{ versionNumber: 1, status: "PUBLISHED" }, { versionNumber: 2, status: "DRAFT" }])).toBe(3);
  });
  it("requires verified Lecturer or Researcher role even when capabilities are stale", () => {
    expect(eligiblePeerReviewer("STUDENT", "VERIFIED")).toBe(false);
    expect(eligiblePeerReviewer("RESEARCHER", "SELF_DECLARED")).toBe(false);
    expect(eligiblePeerReviewer("RESEARCHER", "VERIFIED")).toBe(true);
    expect(eligiblePeerReviewer("LECTURER", "VERIFIED")).toBe(true);
  });
  it("does not complete the article while another reviewer is working or requests revision", () => {
    expect(submissionReviewStatus([{ status: "completed", requestStatus: "COMPLETED" }, { status: "accepted", requestStatus: "IN_REVIEW" }])).toBe("under_review");
    expect(submissionReviewStatus([{ status: "completed", requestStatus: "COMPLETED" }, { status: "accepted", requestStatus: "REVISION_REQUESTED" }])).toBe("revision_requested");
    expect(submissionReviewStatus([{ status: "completed", requestStatus: "COMPLETED" }, { status: "declined" }])).toBe("completed");
  });

});
