import mongoose, { type InferSchemaType, Schema } from "mongoose";

const criterionScoreSchema = new Schema(
  {
    score: { type: Number, required: true },
    comment: {
      en: { type: String, default: "" },
      vi: { type: String, default: "" },
    },
  },
  { _id: false },
);

const bilingualTextSchema = new Schema(
  {
    en: { type: String, default: "" },
    vi: { type: String, default: "" },
  },
  { _id: false },
);

const paperReviewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", index: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    strictness: {
      type: String,
      enum: ["lenient", "balanced", "strict"],
      default: "balanced",
    },
    model: { type: String, default: "gemini-3.6-flash" },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    recommendation: {
      type: String,
      default: "Borderline",
    },
    scores: { type: Schema.Types.Mixed, default: {} },
    profile: { type: Schema.Types.Mixed, default: {} },
    bilingualReview: { type: Schema.Types.Mixed, default: {} },
    reportMarkdown: { type: String },
    artifactsDir: { type: String },
    errorMessage: { type: String },
    creditsCharged: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type PaperReviewDoc = InferSchemaType<typeof paperReviewSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PaperReviewModel = mongoose.model("PaperReview", paperReviewSchema);
