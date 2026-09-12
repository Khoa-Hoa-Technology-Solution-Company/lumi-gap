import mongoose, { type InferSchemaType, Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    role: { type: String, enum: ["admin", "student", "lecturer", "researcher"], index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, required: true }, // e.g. "submission_pending", "submission_approved", "submission_rejected"
    paperId: { type: Schema.Types.ObjectId, ref: "Paper" },
    targetKind: { type: String, enum: ["paper", "report", "gap", "project"], index: true },
    targetId: { type: Schema.Types.ObjectId, index: true },
    readBy: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type NotificationDoc = InferSchemaType<typeof notificationSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const NotificationModel = mongoose.model("Notification", notificationSchema, "notifications");

// Code quality reviewed and formatted
