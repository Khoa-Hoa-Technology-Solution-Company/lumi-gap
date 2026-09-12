import mongoose, { type InferSchemaType, Schema } from "mongoose";

/** api_sync_configs — saved sync configurations (what to pull, on what schedule). */
const apiSyncConfigSchema = new Schema(
  {
    providerId: { type: Schema.Types.ObjectId, ref: "ApiProvider", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    configName: { type: String, required: true },
    searchText: { type: String, required: true },
    fromPublicationYear: { type: Number },
    toPublicationYear: { type: Number },
    scheduleCron: { type: String },
    configStatus: { type: String, enum: ["enabled", "disabled"], default: "enabled" },
    lastRunAt: { type: Date },
    nextRunAt: { type: Date },
  },
  { timestamps: true },
);

export type ApiSyncConfigDoc = InferSchemaType<typeof apiSyncConfigSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ApiSyncConfigModel = mongoose.model(
  "ApiSyncConfig",
  apiSyncConfigSchema,
  "api_sync_configs",
);
