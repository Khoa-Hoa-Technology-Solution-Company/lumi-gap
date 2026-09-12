import mongoose, { type InferSchemaType, Schema } from "mongoose";

/** quality_evaluations — one LLM-as-judge result per target (report / gap / paper). */
const qualityEvaluationSchema = new Schema(
  {
    targetKind: { type: String, enum: ["report", "gap", "paper"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    relevance: { type: Number, min: 1, max: 5, required: true },
    groundedness: { type: Number, min: 1, max: 5, required: true },
    completeness: { type: Number, min: 1, max: 5, required: true },
    overall: { type: Number, min: 1, max: 5, required: true },
    rationale: { type: String, default: "" },
    model: { type: String, default: "" },
    promptVersion: { type: String, default: "" },
  },
  { timestamps: true },
);

// One evaluation per target — re-judge overwrites via upsert.
qualityEvaluationSchema.index({ targetKind: 1, targetId: 1 }, { unique: true });

export type QualityEvaluationDoc = InferSchemaType<typeof qualityEvaluationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const QualityEvaluationModel = mongoose.model(
  "QualityEvaluation",
  qualityEvaluationSchema,
  "quality_evaluations",
);
