import mongoose, { Schema } from "mongoose";

const aiPreReviewSchema = new Schema({
  submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  provider: { type: String, trim: true, maxlength: 80 },
  model: { type: String, trim: true, maxlength: 160 },
  status: { type: String, enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"], required: true, default: "QUEUED", index: true },
  summary: { type: String, maxlength: 20000 },
  goalAlignment: { type: Schema.Types.Mixed },
  rqCoverage: { type: [Schema.Types.Mixed], default: [] },
  unsupportedClaims: { type: [Schema.Types.Mixed], default: [] },
  citationIssues: { type: [String], default: [] },
  contributionComparison: { type: String, maxlength: 20000 },
  reviewFocusAreas: { type: [String], default: [] },
  limitations: { type: [String], default: [] },
  rawStructuredOutput: { type: Schema.Types.Mixed },
  errorMessage: { type: String, maxlength: 1000, select: false },
  completedAt: { type: Date },
}, { timestamps: true });
aiPreReviewSchema.index({ submissionId: 1, createdAt: -1 });
aiPreReviewSchema.index({ submissionId: 1, status: 1 });

export const AiPreReviewModel = mongoose.model("AiPreReview", aiPreReviewSchema, "ai_pre_reviews");
