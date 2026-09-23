import mongoose, { Schema } from "mongoose";

const submissionSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorIds: { type: [Schema.Types.ObjectId], ref: "User", required: true },
    declaredConflictUserIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 300 },
    abstract: { type: String, trim: true, maxlength: 10000 },
    submissionType: {
      type: String,
      enum: ["RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "THESIS_DRAFT", "RESEARCH_PAPER", "SOFTWARE_RESEARCH_PROJECT"],
      index: true,
    },
    researchField: { type: String, trim: true, maxlength: 200, index: true },
    researchGoal: { type: String, trim: true, maxlength: 5000 },
    researchQuestions: { type: [String], default: [] },
    claimedResearchGap: { type: String, trim: true, maxlength: 5000 },
    claimedContribution: { type: String, trim: true, maxlength: 5000 },
    methodology: { type: String, trim: true, maxlength: 5000 },
    scope: { type: String, trim: true, maxlength: 5000 },
    keywords: { type: [String], default: [], index: true },
    expectedReviewWorkload: { type: String, trim: true, maxlength: 160 },
    status: {
      type: String,
      enum: ["draft", "submitted", "ai_pre_review", "ready_for_review", "under_review", "revision_requested", "revised", "completed", "accepted", "rejected", "withdrawn"],
      default: "submitted",
      index: true,
    },
    currentRevisionNumber: { type: Number, required: true, min: 1, default: 1 },
    currentRevisionId: { type: Schema.Types.ObjectId, ref: "SubmissionRevision" },
  },
  { timestamps: true },
);
submissionSchema.index({ projectId: 1, createdAt: -1 });
submissionSchema.index({ authorIds: 1, status: 1, updatedAt: -1 });
submissionSchema.index({ status: 1, submissionType: 1, researchField: 1, createdAt: -1 });

const submissionRevisionSchema = new Schema(
  {
    submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true, index: true, immutable: true },
    revisionNumber: { type: Number, required: true, min: 1, immutable: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    responseToReview: { type: String, trim: true, maxlength: 20000, immutable: true },
    storageUri: { type: String, required: true, immutable: true },
    checksumSha256: { type: String, required: true, match: /^[0-9a-f]{64}$/, immutable: true },
    sizeBytes: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024, immutable: true },
    originalFileName: { type: String, required: true, maxlength: 255, select: false, immutable: true },
  },
  { timestamps: true, versionKey: false },
);
submissionRevisionSchema.index({ submissionId: 1, revisionNumber: 1 }, { unique: true });

const reviewerAssignmentSchema = new Schema(
  {
    submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true, index: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    anonymousCode: { type: String, required: true, unique: true, index: true, select: false },
    status: {
      type: String,
      enum: ["assigned", "accepted", "declined", "completed", "cancelled"],
      default: "assigned",
      index: true,
    },
    decision: { type: String, enum: ["accept", "minor_revision", "major_revision", "reject"] },
    reviewText: { type: String, trim: true, maxlength: 20000 },
    dueAt: { type: Date },
    completedAt: { type: Date },
    conflictChecks: {
      selfOrAuthor: { type: Boolean, required: true, default: false },
      declared: { type: Boolean, required: true, default: false },
      sameInstitution: { type: Boolean, required: true, default: false },
      checkedAt: { type: Date, required: true },
    },
  },
  { timestamps: true },
);
reviewerAssignmentSchema.index({ submissionId: 1, reviewerId: 1 }, { unique: true });
reviewerAssignmentSchema.index({ reviewerId: 1, status: 1, createdAt: -1 });

export const SubmissionModel = mongoose.model("Submission", submissionSchema, "submissions");
export const SubmissionRevisionModel = mongoose.model("SubmissionRevision", submissionRevisionSchema, "submission_revisions");
export const ReviewerAssignmentModel = mongoose.model("ReviewerAssignment", reviewerAssignmentSchema, "reviewer_assignments");
