import mongoose, { type InferSchemaType, Schema } from "mongoose";

/** api_sync_runs — one row per sync execution, with live + final stats. */
const apiSyncRunSchema = new Schema(
  {
    syncConfigId: { type: Schema.Types.ObjectId, ref: "ApiSyncConfig" },
    providerId: { type: Schema.Types.ObjectId, ref: "ApiProvider", required: true },
    runStatus: {
      type: String,
      enum: ["running", "succeeded", "failed", "cancelled"],
      default: "running",
      index: true,
    },
    searchText: { type: String },
    startedAt: { type: Date, required: true, default: Date.now },
    finishedAt: { type: Date },
    totalFetched: { type: Number, default: 0 },
    totalInserted: { type: Number, default: 0 },
    totalUpdated: { type: Number, default: 0 },
    totalDuplicates: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  { timestamps: true },
);

apiSyncRunSchema.index({ startedAt: -1 });

export type ApiSyncRunDoc = InferSchemaType<typeof apiSyncRunSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ApiSyncRunModel = mongoose.model("ApiSyncRun", apiSyncRunSchema, "api_sync_runs");
