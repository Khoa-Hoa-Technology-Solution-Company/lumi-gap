import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * paper_quality_checks — 1:1 with a paper. Seven boolean field-presence checks
 * feed `qualityScore` (0..1) and `checkStatus`. Determines `isAiAnalyzable`.
 */
const paperQualityCheckSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true, unique: true },
    hasTitle: { type: Boolean, default: false },
    hasAbstract: { type: Boolean, default: false },
    hasDoi: { type: Boolean, default: false },
    hasJournal: { type: Boolean, default: false },
    hasPublicationYear: { type: Boolean, default: false },
    hasAuthors: { type: Boolean, default: false },
    hasOpenAccessUrl: { type: Boolean, default: false },
    qualityScore: { type: Number, min: 0, max: 1, default: 0 },
    checkStatus: { type: String, enum: ["pass", "warn", "fail"], default: "fail" },
    checkedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

paperQualityCheckSchema.index({ checkStatus: 1, checkedAt: -1 });

export type PaperQualityCheckDoc = InferSchemaType<typeof paperQualityCheckSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const PaperQualityCheckModel = mongoose.model(
  "PaperQualityCheck",
  paperQualityCheckSchema,
  "paper_quality_checks",
);
