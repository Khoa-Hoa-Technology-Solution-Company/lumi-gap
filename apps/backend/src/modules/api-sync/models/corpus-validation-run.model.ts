import mongoose, { type InferSchemaType, Schema } from "mongoose";

const validationCheckSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    status: { type: String, enum: ["pending", "info", "pass", "warning", "fail"], required: true },
    actual: { type: Schema.Types.Mixed, required: true },
    target: { type: String, required: true },
    detail: { type: String, required: true, maxlength: 2_000 },
  },
  { _id: false },
);

const corpusValidationRunSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestCampaign", required: true, index: true },
    state: { type: String, enum: ["queued", "running", "completed", "failed"], default: "queued", index: true },
    overallStatus: { type: String, enum: ["in_progress", "pass", "warning", "fail"] },
    decision: {
      type: String,
      enum: ["pass_to_continue", "continue_with_warning", "pause_and_remediate", "final_pass", "final_warning", "final_fail"],
    },
    validatorVersion: { type: String, required: true, immutable: true },
    snapshotCommittedPages: { type: Number, required: true, min: 0, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    activeKey: { type: String },
    executionToken: { type: String },
    metrics: { type: Schema.Types.Mixed },
    checks: { type: [validationCheckSchema], default: [] },
    failureReason: { type: String, maxlength: 2_000 },
    requestedAt: { type: Date, required: true, default: Date.now },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

corpusValidationRunSchema.index({ campaignId: 1, createdAt: -1 });
corpusValidationRunSchema.index({ state: 1, createdAt: 1 });
corpusValidationRunSchema.index({ idempotencyKey: 1 }, { unique: true });
corpusValidationRunSchema.index({ activeKey: 1 }, { unique: true, sparse: true });

export type CorpusValidationRunDoc = InferSchemaType<typeof corpusValidationRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CorpusValidationRunModel = mongoose.model(
  "CorpusValidationRun",
  corpusValidationRunSchema,
  "corpus_validation_runs",
);
