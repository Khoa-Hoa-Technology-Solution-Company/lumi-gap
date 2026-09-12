import mongoose, { type InferSchemaType, Schema } from "mongoose";

const ingestDeadLetterSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestCampaign", required: true, index: true },
    partitionId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestPartition", index: true },
    attemptId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestPageAttempt" },
    state: { type: String, enum: ["open", "resolved", "ignored"], default: "open", index: true },
    reasonCode: { type: String, required: true, index: true },
    sourceIdentity: { type: String },
    requestFingerprint: { type: String },
    payloadHash: { type: String },
    details: { type: Schema.Types.Mixed },
    resolutionNote: { type: String, maxlength: 2_000 },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

ingestDeadLetterSchema.index({ campaignId: 1, state: 1, createdAt: -1 });

export type IngestDeadLetterDoc = InferSchemaType<typeof ingestDeadLetterSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const IngestDeadLetterModel = mongoose.model(
  "IngestDeadLetter",
  ingestDeadLetterSchema,
  "ingest_dead_letters",
);
