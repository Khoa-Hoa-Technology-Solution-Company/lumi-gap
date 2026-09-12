import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * gap_analyses — one document per standalone gap-analysis request. Tracks the
 * async pipeline lifecycle (queued → analyzing → ready/failed) and links to the
 * ResearchGap documents it produced. Mirrors the Report status pattern.
 */

const gapAnalysisSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    topic: { type: String, required: true },
    yearFrom: { type: Number },
    yearTo: { type: Number },
    selectedPaperIds: { type: [Schema.Types.ObjectId], ref: "Paper", default: [] },
    evidenceMode: {
      type: String,
      enum: ["auto", "selected", "hybrid"],
      default: "auto",
    },
    status: {
      type: String,
      enum: ["queued", "analyzing", "ready", "failed"],
      default: "queued",
      index: true,
    },
    gapIds: { type: [Schema.Types.ObjectId], ref: "ResearchGap", default: [] },
    errorMessage: { type: String },
    promptVersion: { type: String, default: "" },
    modelVersion: { type: String, default: "" },
    creditTransactionId: { type: Schema.Types.ObjectId, ref: "CreditTransaction" },
    creditCost: { type: Number },
    creditAction: { type: String },
    creditRefundedAt: { type: Date },
  },
  { timestamps: true },
);

export type GapAnalysisDoc = InferSchemaType<typeof gapAnalysisSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const GapAnalysisModel = mongoose.model(
  "GapAnalysis",
  gapAnalysisSchema,
  "gap_analyses",
);
