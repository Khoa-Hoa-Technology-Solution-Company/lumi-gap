import mongoose, { type InferSchemaType, Schema } from "mongoose";

const openAlexRefreshWatermarkSchema = new Schema(
  {
    refreshPolicyKey: { type: String, required: true, unique: true },
    providerName: { type: String, required: true, default: "openalex" },
    lastSuccessfulAt: { type: Date },
    sourceUpdatedSince: { type: Date },
    overlapHours: { type: Number, required: true, min: 0, default: 72 },
    lastCampaignId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestCampaign" },
    state: { type: String, enum: ["idle", "running", "failed"], default: "idle" },
    failureReason: { type: String, maxlength: 2_000 },
  },
  { timestamps: true },
);

export type OpenAlexRefreshWatermarkDoc = InferSchemaType<typeof openAlexRefreshWatermarkSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const OpenAlexRefreshWatermarkModel = mongoose.model(
  "OpenAlexRefreshWatermark",
  openAlexRefreshWatermarkSchema,
  "openalex_refresh_watermarks",
);
