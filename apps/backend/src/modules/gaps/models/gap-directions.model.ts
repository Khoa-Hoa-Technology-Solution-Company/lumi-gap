import mongoose, { type InferSchemaType, Schema } from "mongoose";

/** A single AI-suggested research direction (embedded; no own _id). */
const directionItemSchema = new Schema(
  {
    title: { type: String, required: true },
    rationale: { type: String, default: "" },
    suggestedApproach: { type: String, default: "" },
    relatedPaperIds: { type: [Schema.Types.ObjectId], ref: "Paper", default: [] },
  },
  { _id: false },
);

/**
 * gap_research_directions — one document per gap holding the latest AI-suggested
 * next research directions. Advisory only; never affects tier/credit/approval.
 * Re-generate overwrites via upsert (one doc per gap).
 */
const gapDirectionsSchema = new Schema(
  {
    gapId: { type: Schema.Types.ObjectId, ref: "ResearchGap", required: true },
    directions: { type: [directionItemSchema], default: [] },
    model: { type: String, default: "" },
    promptVersion: { type: String, default: "" },
    evidenceHash: { type: String, default: "" },
    creditTransactionId: { type: Schema.Types.ObjectId, ref: "CreditTransaction" },
    creditCost: { type: Number },
  },
  { timestamps: true },
);

gapDirectionsSchema.index({ gapId: 1 }, { unique: true });

export type GapDirectionsDoc = InferSchemaType<typeof gapDirectionsSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const GapDirectionsModel = mongoose.model(
  "GapDirections",
  gapDirectionsSchema,
  "gap_research_directions",
);
