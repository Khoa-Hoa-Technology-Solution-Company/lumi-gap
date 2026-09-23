import mongoose, { Schema } from "mongoose";

export const AI_JOB_TYPES = ["gap_analysis", "report_generation", "draft_assistance", "citation_check"] as const;
export type AiJobType = (typeof AI_JOB_TYPES)[number];

const aiRunSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "DraftWorkspace" },
    jobType: { type: String, enum: AI_JOB_TYPES, required: true, index: true },
    prompt: { type: String, trim: true, maxlength: 10000 },
    evidenceIds: { type: [Schema.Types.ObjectId], default: [] },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "cancelled"],
      default: "queued",
      index: true,
    },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    maxAttempts: { type: Number, required: true, min: 1, max: 5, default: 3 },
    queueJobId: { type: String, maxlength: 200 },
    costUsd: { type: Number, min: 0 },
    latencyMs: { type: Number, min: 0 },
    resultSummary: { type: String, maxlength: 20000 },
    errorCode: { type: String, maxlength: 120 },
    errorMessage: { type: String, maxlength: 2000 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelRequestedAt: { type: Date },
  },
  { timestamps: true },
);
aiRunSchema.index({ ownerId: 1, createdAt: -1 });
aiRunSchema.index({ projectId: 1, status: 1, createdAt: -1 });

export const AiRunModel = mongoose.model("AiRun", aiRunSchema, "ai_runs");
