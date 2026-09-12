import mongoose, { type InferSchemaType, Schema } from "mongoose";

const openAlexIngestPageAttemptSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestCampaign", required: true, index: true },
    partitionId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestPartition", required: true, index: true },
    idempotencyKey: { type: String, required: true },
    cursorBefore: { type: String },
    cursorAfter: { type: String },
    requestFingerprint: { type: String, required: true },
    responseHash: { type: String },
    state: { type: String, enum: ["started", "committed", "failed", "dead_letter"], default: "started", index: true },
    expectedResultCount: { type: Number, default: 0 },
    acceptedCount: { type: Number, default: 0 },
    rejectedCount: { type: Number, default: 0 },
    conflictCount: { type: Number, default: 0 },
    errorMessage: { type: String, maxlength: 2_000 },
    committedAt: { type: Date },
  },
  { timestamps: true },
);

openAlexIngestPageAttemptSchema.index({ partitionId: 1, idempotencyKey: 1 }, { unique: true });
openAlexIngestPageAttemptSchema.index({ campaignId: 1, state: 1, createdAt: 1 });

export type OpenAlexIngestPageAttemptDoc = InferSchemaType<typeof openAlexIngestPageAttemptSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const OpenAlexIngestPageAttemptModel = mongoose.model(
  "OpenAlexIngestPageAttempt",
  openAlexIngestPageAttemptSchema,
  "openalex_ingest_page_attempts",
);
