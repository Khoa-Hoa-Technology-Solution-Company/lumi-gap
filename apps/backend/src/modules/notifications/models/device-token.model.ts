import mongoose, { type InferSchemaType, Schema } from "mongoose";

const deviceTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ["android", "ios", "web", "unknown"], required: true },
    deviceName: { type: String, maxLength: 120 },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    disabledAt: { type: Date },
  },
  { timestamps: true },
);

deviceTokenSchema.index({ userId: 1, disabledAt: 1 });

export type DeviceTokenDoc = InferSchemaType<typeof deviceTokenSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const DeviceTokenModel = mongoose.model("DeviceToken", deviceTokenSchema, "device_tokens");
