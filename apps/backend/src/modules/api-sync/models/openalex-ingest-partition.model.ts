import mongoose, { type InferSchemaType, Schema } from "mongoose";

const openAlexIngestPartitionSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestCampaign", required: true, index: true },
    partitionKey: { type: String, required: true },
    cohortId: { type: String, required: true },
    stratumKey: { type: String, required: true },
    filterExpression: { type: String, required: true },
    plannedPopulation: { type: Number, required: true, min: 0 },
    targetCount: { type: Number, required: true, min: 0 },
    selectionMethod: { type: String, enum: ["seeded-sample", "cursor", "repair"], required: true },
    seed: { type: Number },
    state: {
      type: String,
      enum: ["planned", "leased", "fetching", "writing", "checkpointing", "retry_wait", "completed", "dead_letter"],
      default: "planned",
      index: true,
    },
    checkpoint: {
      cursor: { type: String },
      acceptedCount: { type: Number, default: 0 },
      committedAttemptCount: { type: Number, default: 0 },
      version: { type: Number, default: 0 },
    },
    lease: {
      ownerId: { type: String },
      expiresAt: { type: Date, index: true },
      heartbeatAt: { type: Date },
    },
    lastError: { type: String, maxlength: 2_000 },
  },
  { timestamps: true },
);

openAlexIngestPartitionSchema.index({ campaignId: 1, partitionKey: 1 }, { unique: true });
openAlexIngestPartitionSchema.index({ campaignId: 1, state: 1, "lease.expiresAt": 1 });

export type OpenAlexIngestPartitionDoc = InferSchemaType<typeof openAlexIngestPartitionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const OpenAlexIngestPartitionModel = mongoose.model(
  "OpenAlexIngestPartition",
  openAlexIngestPartitionSchema,
  "openalex_ingest_partitions",
);
