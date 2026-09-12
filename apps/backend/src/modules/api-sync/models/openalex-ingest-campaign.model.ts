import mongoose, { type InferSchemaType, Schema } from "mongoose";

const campaignManifestSchema = new Schema(
  {
    planningAsOf: { type: Date, required: true },
    policyVersion: { type: String, required: true },
    providerContractVersion: { type: String, required: true },
    eligibilityFilter: { type: String, required: true },
    baselineTarget: { type: Number, required: true, min: 0 },
    priorityTarget: { type: Number, required: true, min: 0 },
    sourceCounts: { type: Schema.Types.Mixed, required: true },
    requestFingerprints: { type: [String], default: [] },
  },
  { _id: false },
);

const openAlexIngestCampaignSchema = new Schema(
  {
    campaignKey: { type: String, required: true, unique: true, immutable: true },
    providerName: { type: String, required: true, default: "openalex", immutable: true },
    campaignKind: { type: String, enum: ["backfill", "refresh", "repair"], required: true },
    state: {
      type: String,
      enum: ["draft", "preflight", "planned", "running", "paused", "completed", "completed_with_shortfall", "failed", "cancelling", "cancelled"],
      default: "draft",
      index: true,
    },
    targetUniqueWorks: { type: Number, required: true, min: 1 },
    manifest: { type: campaignManifestSchema, required: true },
    progress: {
      plannedPartitions: { type: Number, default: 0 },
      completedPartitions: { type: Number, default: 0 },
      committedPages: { type: Number, default: 0 },
      acceptedWorks: { type: Number, default: 0 },
      uniqueWorks: { type: Number, default: 0 },
      rejectedWorks: { type: Number, default: 0 },
      conflictWorks: { type: Number, default: 0 },
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    failureReason: { type: String, maxlength: 2_000 },
    completionNote: { type: String, maxlength: 2_000 },
  },
  { timestamps: true },
);

openAlexIngestCampaignSchema.index({ state: 1, createdAt: -1 });

export type OpenAlexIngestCampaignDoc = InferSchemaType<typeof openAlexIngestCampaignSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const OpenAlexIngestCampaignModel = mongoose.model(
  "OpenAlexIngestCampaign",
  openAlexIngestCampaignSchema,
  "openalex_ingest_campaigns",
);
