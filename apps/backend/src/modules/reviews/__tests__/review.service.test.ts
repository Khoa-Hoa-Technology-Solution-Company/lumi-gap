import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultReviewCriteria } from "../review.constants.js";

const mocks = vi.hoisted(() => ({
  assignmentFindOne: vi.fn(), assignmentCount: vi.fn(), assignmentFind: vi.fn(),
  submissionFindById: vi.fn(), submissionUpdate: vi.fn(),
  reviewFindOne: vi.fn(), responseUpsert: vi.fn(), responseDelete: vi.fn(), responseFind: vi.fn(),
  contributionUpdate: vi.fn(), audit: vi.fn(),
}));

vi.mock("../../submissions/submission.model.js", () => ({
  ReviewerAssignmentModel: { findOne: mocks.assignmentFindOne, countDocuments: mocks.assignmentCount, find: mocks.assignmentFind },
  SubmissionModel: { findById: mocks.submissionFindById, updateOne: mocks.submissionUpdate },
}));
vi.mock("../review.model.js", () => {
  class MockHumanReview {
    static findOne = mocks.reviewFindOne;
    _id = "review-record-id";
    id = this._id;
    status = "DRAFT";
    overallComment?: string;
    recommendation?: string;
    submittedAt?: Date;

    constructor(public value: Record<string, unknown>) {}
    async save() { return this; }
    toObject() { return { _id: this._id, status: this.status, overallComment: this.overallComment, recommendation: this.recommendation }; }
  }

  return {
    HumanReviewModel: MockHumanReview,
    ReviewResponseModel: { findOneAndUpdate: mocks.responseUpsert, deleteMany: mocks.responseDelete, find: mocks.responseFind },
    ContributionModel: { updateOne: mocks.contributionUpdate },
    ReviewConflictModel: {}, ReviewTemplateModel: {}, ReviewCriterionModel: {},
  };
});
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));
vi.mock("../../academic-profiles/academic-profile.model.js", () => ({ AcademicProfileModel: {} }));
vi.mock("../../auth/models/user.model.js", () => ({ UserModel: {} }));
vi.mock("../../projects/models/project.model.js", () => ({ ProjectModel: {} }));

import { reviewService } from "../review.service.js";

const assignmentId = new mongoose.Types.ObjectId().toString();
const reviewerId = new mongoose.Types.ObjectId().toString();
const submissionId = new mongoose.Types.ObjectId();
const revisionId = new mongoose.Types.ObjectId();
const projectId = new mongoose.Types.ObjectId();

const query = (value: unknown) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });

describe("reviewService completion rules", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.reviewFindOne.mockResolvedValue(null);
    mocks.responseUpsert.mockResolvedValue({});
    mocks.responseDelete.mockResolvedValue({ deletedCount: 0 });
    mocks.responseFind.mockReturnValue({ sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) });
    mocks.contributionUpdate.mockResolvedValue({ acknowledged: true });
    mocks.submissionUpdate.mockResolvedValue({ acknowledged: true });
    mocks.audit.mockResolvedValue(undefined);
  });

  it("only lets the assigned reviewer submit", async () => {
    mocks.assignmentFindOne.mockResolvedValue(null);
    await expect(reviewService.saveReview(assignmentId, reviewerId, {
      overallComment: "A complete and constructive overall assessment.", recommendation: "MAJOR_REVISION", responses: [],
    }, true)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.contributionUpdate).not.toHaveBeenCalled();
  });

  it("creates one verified LumiGap contribution after a complete rubric", async () => {
    const assignment = {
      _id: new mongoose.Types.ObjectId(assignmentId), id: assignmentId, submissionId, reviewerId: new mongoose.Types.ObjectId(reviewerId),
      status: "accepted", save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.assignmentFindOne.mockResolvedValue(assignment);
    mocks.submissionFindById.mockReturnValue(query({ currentRevisionId: revisionId, projectId, title: "Evidence-aware study" }));
    const responses = defaultReviewCriteria.map(([criterionKey]) => ({ criterionKey, comment: `Evidence-based assessment for ${criterionKey}.` }));

    await reviewService.saveReview(assignmentId, reviewerId, {
      overallComment: "The manuscript requires a clearer evidence chain before acceptance.", recommendation: "MAJOR_REVISION", responses,
    }, true);

    expect(assignment.status).toBe("completed");
    expect(assignment.save).toHaveBeenCalled();
    expect(mocks.contributionUpdate).toHaveBeenCalledWith(
      { sourceReviewAssignmentId: assignment._id },
      expect.objectContaining({ $setOnInsert: expect.objectContaining({
        contributorId: reviewerId,
        contributionType: "REVIEW",
        provenance: "LUMIGAP_REVIEW",
        verificationStatus: "VERIFIED_BY_LUMIGAP",
      }) }),
      { upsert: true },
    );
  });
});
