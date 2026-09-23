import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { ContributionModel, HumanReviewModel, ReviewResponseModel } from "../review.model.js";

const oid = () => new mongoose.Types.ObjectId();

describe("review and contribution persistence invariants", () => {
  it("keeps one review per real assignment", () => {
    const index = HumanReviewModel.schema.indexes().find(([fields]) => fields.assignmentId === 1);
    expect(index?.[1]).toMatchObject({ unique: true });
  });

  it("keeps one response per rubric criterion", () => {
    const index = ReviewResponseModel.schema.indexes().find(([fields]) => fields.reviewId === 1 && fields.criterionKey === 1);
    expect(index?.[1]).toMatchObject({ unique: true });
  });

  it("does not accept an invented contribution verification state", () => {
    const contribution = new ContributionModel({
      contributorId: oid(),
      contributionType: "REVIEW",
      provenance: "SELF_DECLARED",
      verificationStatus: "TRUST_ME",
    });
    expect(contribution.validateSync()?.errors.verificationStatus).toBeDefined();
  });

  it("makes review contributions idempotent by assignment", () => {
    const index = ContributionModel.schema.indexes().find(([fields]) => fields.sourceReviewAssignmentId === 1);
    expect(index?.[1]).toMatchObject({ unique: true, sparse: true });
  });
});
