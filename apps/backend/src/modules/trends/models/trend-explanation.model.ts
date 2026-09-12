import mongoose, { type InferSchemaType, Schema } from "mongoose";

const trendExplanationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    topic: { type: String, default: null, index: true },
    language: { type: String, enum: ["en", "vi"], required: true },
    yearFrom: { type: Number, required: true },
    yearTo: { type: Number, required: true },
    scopeHash: { type: String, required: true, index: true },
    scopeLabel: { type: String, required: true },
    scopeFilters: { type: Schema.Types.Mixed, default: {} },
    explanation: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

trendExplanationSchema.index({ userId: 1, createdAt: -1 });
trendExplanationSchema.index({ userId: 1, topic: 1, scopeHash: 1, createdAt: -1 });

export type TrendExplanationDoc = InferSchemaType<typeof trendExplanationSchema> & { _id: mongoose.Types.ObjectId };

export const TrendExplanationModel = mongoose.model(
  "TrendExplanation",
  trendExplanationSchema,
  "trend_explanations",
);
