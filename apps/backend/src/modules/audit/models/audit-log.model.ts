import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * audit_logs — cross-cutting. Every important action (sync.started,
 * paper.upserted, sync.completed, ...) writes one row. `targetRecordId` is a
 * string to stay polymorphic across collections. TTL: 90 days.
 */
const auditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" }, // null for system actions
    actionName: { type: String, required: true },
    targetTableName: { type: String },
    targetRecordId: { type: String },
    detailsText: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ actionName: 1, createdAt: -1 });
// TTL — drop audit rows after 90 days to keep the M0 free tier lean.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const AuditLogModel = mongoose.model("AuditLog", auditLogSchema, "audit_logs");
