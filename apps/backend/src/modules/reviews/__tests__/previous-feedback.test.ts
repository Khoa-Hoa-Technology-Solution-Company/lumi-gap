import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  reviewerAssignment: { findFirst: vi.fn() },
  reviewRequest: { findUnique: vi.fn() },
  submission: { findUniqueOrThrow: vi.fn() },
  project: { findUnique: vi.fn() },
  submissionRevision: { findFirst: vi.fn(), findMany: vi.fn() },
  humanReview: { findMany: vi.fn() },
  reviewResponse: { findMany: vi.fn() },
  reviewRevisionItem: { findMany: vi.fn() },
  reviewRevisionResponse: { findMany: vi.fn() },
  reviewTemplateVersion: { findMany: vi.fn() },
  reviewCriterion: { findMany: vi.fn() },
  reviewCriterionLevel: { findMany: vi.fn() },
}));

const authMocks = vi.hoisted(() => ({
  assertPeerReviewer: vi.fn(),
  assertMentorReviewAccess: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => prismaMock,
}));

vi.mock("../peer-review-access.js", () => ({
  assertPeerReviewer: authMocks.assertPeerReviewer,
  assertReviewerInTransaction: vi.fn(),
  lockReviewerAndSubmission: vi.fn(),
  refreshSubmissionReviewStatus: vi.fn(),
}));

vi.mock("../mentor-review-access.js", () => ({
  assertMentorReviewAccess: authMocks.assertMentorReviewAccess,
  visibleMentorReviewAssignments: vi.fn(),
}));

import { reviewService } from "../review.service.js";

const REVIEWER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_REVIEWER_ID = "22222222-2222-4222-8222-222222222222";
const ASSIGNMENT_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const SUBMISSION_ID = "55555555-5555-4555-8555-555555555555";
const PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const REV_1 = "77777777-7777-4777-8777-777777777771";
const REV_3 = "77777777-7777-4777-8777-777777777773";
const REV_4 = "77777777-7777-4777-8777-777777777774";
const TPL_V1 = "88888888-8888-4888-8888-888888888881";

describe("reviewService.getPreviousFeedback (BR-01..BR-15, AC-01..AC-09)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findFirst.mockResolvedValue({ id: REVIEWER_ID, fullName: "Dr. Minh", isActive: true });
    authMocks.assertPeerReviewer.mockResolvedValue({ user: { id: REVIEWER_ID } });
    authMocks.assertMentorReviewAccess.mockResolvedValue(undefined);
    prismaMock.reviewerAssignment.findFirst.mockResolvedValue({
      id: ASSIGNMENT_ID,
      legacyMongoId: null,
      reviewerId: REVIEWER_ID,
      submissionId: SUBMISSION_ID,
      reviewRequestId: REQUEST_ID,
      artifactRevisionId: REV_4,
      status: "accepted",
      anonymousCode: "R-abc",
    });
    prismaMock.reviewRequest.findUnique.mockResolvedValue({
      id: REQUEST_ID,
      submissionId: SUBMISSION_ID,
      projectId: PROJECT_ID,
      artifactRevisionId: REV_4,
      origin: "MENTOR_GUIDANCE",
      status: "RESUBMITTED",
    });
    prismaMock.submission.findUniqueOrThrow.mockResolvedValue({ id: SUBMISSION_ID, projectId: PROJECT_ID, title: "Study" });
    prismaMock.project.findUnique.mockResolvedValue({ deletedAt: null, title: "Project A" });
    prismaMock.submissionRevision.findFirst.mockResolvedValue({
      id: REV_4,
      submissionId: SUBMISSION_ID,
      revisionNumber: 4,
      contentType: "PDF",
    });
    prismaMock.submissionRevision.findMany.mockResolvedValue([]);
    prismaMock.humanReview.findMany.mockResolvedValue([]);
    prismaMock.reviewResponse.findMany.mockResolvedValue([]);
    prismaMock.reviewRevisionItem.findMany.mockResolvedValue([]);
    prismaMock.reviewRevisionResponse.findMany.mockResolvedValue([]);
    prismaMock.reviewTemplateVersion.findMany.mockResolvedValue([]);
    prismaMock.reviewCriterion.findMany.mockResolvedValue([]);
    prismaMock.reviewCriterionLevel.findMany.mockResolvedValue([]);
  });

  it("returns empty rounds for Round 1 or newly assigned reviewer with no prior submitted reviews (AC-01, BR-01, BR-02)", async () => {
    prismaMock.humanReview.findMany.mockResolvedValue([
      { id: "draft-1", assignmentId: ASSIGNMENT_ID, roundNumber: 1, revisionId: REV_4, status: "DRAFT" },
    ]);

    const result = await reviewService.getPreviousFeedback(ASSIGNMENT_ID, REVIEWER_ID);
    expect(result.rounds).toEqual([]);
    expect(result.currentRoundNumber).toBe(1);
    expect(prismaMock.reviewResponse.findMany).not.toHaveBeenCalled();
    expect(prismaMock.reviewRevisionItem.findMany).not.toHaveBeenCalled();
  });

  it("returns multi-round submitted feedback with distinct roundNumber vs document revisionNumber, rubric metadata, and batched author responses (AC-02, AC-03, BR-07, BR-15)", async () => {
    prismaMock.humanReview.findMany.mockResolvedValue([
      {
        id: "rev-draft-3",
        assignmentId: ASSIGNMENT_ID,
        roundNumber: 3,
        revisionId: REV_4,
        status: "DRAFT",
        overallComment: "Current draft should never appear in previous rounds",
      },
      {
        id: "rev-sub-2",
        assignmentId: ASSIGNMENT_ID,
        roundNumber: 2,
        revisionId: REV_3,
        templateVersionId: TPL_V1,
        status: "SUBMITTED",
        overallComment: "Round 2 overall feedback on v3.",
        keyStrengths: "Clear experimental setup.",
        keyConcerns: "Sample size justification still brief.",
        overallAssessment: "MINOR_REVISION",
        recommendation: "MINOR_REVISION",
        weightedScore: 4.1,
        submittedAt: new Date("2026-11-22T10:00:00Z"),
      },
      {
        id: "rev-sub-1",
        assignmentId: ASSIGNMENT_ID,
        roundNumber: 1,
        revisionId: REV_1,
        templateVersionId: TPL_V1,
        status: "SUBMITTED",
        overallComment: "Round 1 overall feedback on v1.",
        keyStrengths: "Relevant problem statement.",
        keyConcerns: "Missing baseline comparison.",
        overallAssessment: "MAJOR_REVISION",
        recommendation: "MAJOR_REVISION",
        weightedScore: 3.0,
        submittedAt: new Date("2026-11-18T09:00:00Z"),
      },
    ]);

    prismaMock.reviewTemplateVersion.findMany.mockResolvedValue([
      { id: TPL_V1, versionNumber: 1, reviewMode: "RUBRIC_ASSESSMENT", guidelines: ["LUMIGAP_SCIENTIFIC_REVIEW_V1"] },
    ]);
    prismaMock.reviewCriterion.findMany.mockResolvedValue([
      { id: "crit-1", versionId: TPL_V1, key: "methodology", label: "Methodology", weight: 40, order: 1 },
    ]);
    prismaMock.reviewCriterionLevel.findMany.mockResolvedValue([
      { id: "lvl-4", criterionId: "crit-1", label: "Good", score: 4 },
      { id: "lvl-5", criterionId: "crit-1", label: "Strong", score: 5 },
    ]);
    prismaMock.reviewResponse.findMany.mockResolvedValue([
      {
        reviewId: "rev-sub-2",
        criterionKey: "methodology",
        comment: "Improved protocol on page 4.",
        evidence: "Page 4, Section 3.1",
        assessment: null,
        performanceLevelId: "lvl-4",
        score: 4,
        notApplicable: false,
      },
    ]);
    prismaMock.reviewRevisionItem.findMany.mockResolvedValue([
      {
        id: "item-1",
        reviewId: "rev-sub-1",
        position: 0,
        priority: "MAJOR",
        description: "Add baseline comparison table",
        criterionKey: "methodology",
        locator: "Trang 5, Mục 3.2",
        quotation: "We evaluated only one model.",
        status: "ADDRESSED",
        createdAt: new Date("2026-11-18T09:00:00Z"),
      },
    ]);
    prismaMock.reviewRevisionResponse.findMany.mockResolvedValue([
      {
        revisionItemId: "item-1",
        submissionRevisionId: REV_3,
        responseText: "Added Table 2 comparing 3 baselines.",
        status: "ADDRESSED",
        createdAt: new Date("2026-11-21T12:00:00Z"),
      },
    ]);
    prismaMock.submissionRevision.findMany.mockResolvedValue([
      { id: REV_1, revisionNumber: 1 },
      { id: REV_3, revisionNumber: 3 },
    ]);

    const result = await reviewService.getPreviousFeedback(ASSIGNMENT_ID, REVIEWER_ID);

    expect(result.currentRoundNumber).toBe(3);
    expect(result.rounds).toHaveLength(2);
    // Ordered newest round first; Round 2 != v3 (BR-15)
    expect(result.rounds[0]).toMatchObject({
      id: "rev-sub-2",
      roundNumber: 2,
      revisionId: REV_3,
      revisionNumber: 3,
      reviewerName: "Dr. Minh",
      keyStrengths: "Clear experimental setup.",
      keyConcerns: "Sample size justification still brief.",
      weightedScore: 4.1,
    });
    expect(result.rounds[0]!.responses[0]).toMatchObject({
      criterionKey: "methodology",
      criterionTitle: "Methodology",
      score: 4,
      maxScore: 5,
      levelLabel: "Good",
    });
    expect(result.rounds[1]).toMatchObject({
      id: "rev-sub-1",
      roundNumber: 1,
      revisionId: REV_1,
      revisionNumber: 1,
    });
    expect(result.rounds[1]!.revisionItems[0]).toMatchObject({
      id: "item-1",
      locator: "Trang 5, Mục 3.2",
      quotation: "We evaluated only one model.",
    });
    expect(result.rounds[1]!.revisionItems[0]!.responses[0]).toMatchObject({
      submissionRevisionId: REV_3,
      submissionRevisionNumber: 3,
      responseText: "Added Table 2 comparing 3 baselines.",
    });
    // Single batched query for reviewRevisionResponse (no N+1) and excludes DRAFT
    expect(prismaMock.reviewRevisionResponse.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.reviewRevisionResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: "DRAFT" } }),
      }),
    );
  });

  it("blocks IDOR/BOLA when another reviewer requests someone else's assignmentId (AC-09, BR-12)", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: OTHER_REVIEWER_ID, fullName: "Other", isActive: true });
    prismaMock.reviewerAssignment.findFirst.mockResolvedValue(null);

    await expect(reviewService.getPreviousFeedback(ASSIGNMENT_ID, OTHER_REVIEWER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prismaMock.humanReview.findMany).not.toHaveBeenCalled();
  });

  it("blocks unaccepted assignment before accessing previous feedback (BR-12)", async () => {
    prismaMock.reviewerAssignment.findFirst.mockResolvedValue({
      id: ASSIGNMENT_ID,
      reviewerId: REVIEWER_ID,
      submissionId: SUBMISSION_ID,
      reviewRequestId: REQUEST_ID,
      artifactRevisionId: REV_4,
      status: "assigned",
      anonymousCode: "R-abc",
    });

    await expect(reviewService.getPreviousFeedback(ASSIGNMENT_ID, REVIEWER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("enforces mentor review access revocation on MENTOR_GUIDANCE requests (BR-12)", async () => {
    authMocks.assertMentorReviewAccess.mockRejectedValueOnce(Object.assign(new Error("Revoked"), { statusCode: 403 }));
    await expect(reviewService.getPreviousFeedback(ASSIGNMENT_ID, REVIEWER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
