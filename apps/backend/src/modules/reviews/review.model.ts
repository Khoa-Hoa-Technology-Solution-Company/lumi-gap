import mongoose, { Schema } from "mongoose";

const reviewConflictSchema = new Schema({
  submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true, index: true },
  reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status: { type: String, enum: ["DECLARED", "SYSTEM_DETECTED", "CLEARED", "BLOCKED"], required: true },
  reason: { type: String, trim: true, maxlength: 1000 },
  detectedBy: { type: String, enum: ["REVIEWER", "SYSTEM", "ADMIN"], required: true },
  resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
  resolvedAt: { type: Date },
}, { timestamps: true });
reviewConflictSchema.index({ submissionId: 1, reviewerId: 1 }, { unique: true });

const reviewTemplateSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 1000 },
  submissionType: { type: String, trim: true, index: true },
  active: { type: Boolean, default: true, index: true },
  version: { type: Number, required: true, min: 1, default: 1 },
}, { timestamps: true });

const reviewCriterionSchema = new Schema({
  templateId: { type: Schema.Types.ObjectId, ref: "ReviewTemplate", required: true, index: true },
  key: { type: String, required: true, trim: true, maxlength: 80 },
  label: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1000 },
  weight: { type: Number, min: 0, max: 100 },
  order: { type: Number, required: true, min: 0 },
}, { timestamps: true });
reviewCriterionSchema.index({ templateId: 1, key: 1 }, { unique: true });

const humanReviewSchema = new Schema({
  assignmentId: { type: Schema.Types.ObjectId, ref: "ReviewerAssignment", required: true, unique: true, index: true },
  reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true, index: true },
  revisionId: { type: Schema.Types.ObjectId, ref: "SubmissionRevision", required: true },
  templateId: { type: Schema.Types.ObjectId, ref: "ReviewTemplate" },
  status: { type: String, enum: ["DRAFT", "SUBMITTED"], default: "DRAFT", index: true },
  overallComment: { type: String, trim: true, maxlength: 20000 },
  recommendation: { type: String, enum: ["ACCEPT", "MINOR_REVISION", "MAJOR_REVISION", "REJECT"] },
  submittedAt: { type: Date },
}, { timestamps: true });

const reviewResponseSchema = new Schema({
  reviewId: { type: Schema.Types.ObjectId, ref: "HumanReview", required: true, index: true },
  criterionKey: { type: String, required: true, trim: true, maxlength: 80 },
  comment: { type: String, required: true, trim: true, maxlength: 10000 },
  evidence: { type: String, trim: true, maxlength: 10000 },
  rating: { type: Number, min: 1, max: 5 },
}, { timestamps: true });
reviewResponseSchema.index({ reviewId: 1, criterionKey: 1 }, { unique: true });

const contributionSchema = new Schema({
  contributorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
  submissionId: { type: Schema.Types.ObjectId, ref: "Submission", index: true },
  contributionType: {
    type: String,
    enum: ["REVIEW", "SUPERVISION", "METHODOLOGY", "VALIDATION", "SOFTWARE", "CONCEPTUALIZATION", "WRITING_ORIGINAL_DRAFT", "WRITING_REVIEW_EDITING", "PROJECT_ADMINISTRATION", "OTHER"],
    required: true,
    index: true,
  },
  description: { type: String, trim: true, maxlength: 5000 },
  evidence: { type: String, trim: true, maxlength: 5000 },
  provenance: { type: String, enum: ["LUMIGAP_REVIEW", "PROJECT_CONFIRMATION", "EXTERNAL", "SELF_DECLARED"], required: true },
  verificationStatus: { type: String, enum: ["SELF_DECLARED", "PENDING_CONFIRMATION", "VERIFIED_BY_LUMIGAP", "EXTERNALLY_VERIFIED", "REJECTED"], required: true, index: true },
  visibility: { type: String, enum: ["PUBLIC", "PRIVATE"], default: "PUBLIC" },
  verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
  verifiedAt: { type: Date },
  sourceReviewAssignmentId: { type: Schema.Types.ObjectId, ref: "ReviewerAssignment", unique: true, sparse: true },
  sourceProjectContributionId: { type: Schema.Types.ObjectId, ref: "ProjectContributionProposal", index: true, sparse: true },
}, { timestamps: true });
contributionSchema.index({ contributorId: 1, createdAt: -1 });
contributionSchema.index(
  { sourceProjectContributionId: 1, contributionType: 1 },
  { unique: true, partialFilterExpression: { sourceProjectContributionId: { $exists: true } } },
);

export const ReviewConflictModel = mongoose.model("ReviewConflict", reviewConflictSchema, "review_conflicts");
export const ReviewTemplateModel = mongoose.model("ReviewTemplate", reviewTemplateSchema, "review_templates");
export const ReviewCriterionModel = mongoose.model("ReviewCriterion", reviewCriterionSchema, "review_criteria");
export const HumanReviewModel = mongoose.model("HumanReview", humanReviewSchema, "human_reviews");
export const ReviewResponseModel = mongoose.model("ReviewResponse", reviewResponseSchema, "review_responses");
export const ContributionModel = mongoose.model("Contribution", contributionSchema, "research_contributions");
