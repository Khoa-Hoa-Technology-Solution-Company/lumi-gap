import mongoose, { Schema } from "mongoose";

const gapEvidenceRecordSchema = new Schema({
  gapId: { type: Schema.Types.ObjectId, ref: "ResearchGap", required: true, index: true },
  paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },
  evidenceKind: { type: String, enum: ["SUPPORTING", "COUNTER"], required: true, index: true },
  evidenceType: { type: String, trim: true, maxlength: 120 },
  excerpt: { type: String, trim: true, maxlength: 5000 },
  explanation: { type: String, required: true, trim: true, maxlength: 5000 },
  addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
gapEvidenceRecordSchema.index({ gapId: 1, paperId: 1, evidenceKind: 1 }, { unique: true });

const gapValidationSchema = new Schema({
  gapId: { type: Schema.Types.ObjectId, ref: "ResearchGap", required: true, index: true, immutable: true },
  reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  action: { type: String, enum: ["VALIDATE", "CHALLENGE", "REQUEST_EVIDENCE", "SUGGEST_EVIDENCE", "REFINE_SCOPE", "REJECT"], required: true, immutable: true },
  comment: { type: String, required: true, trim: true, maxlength: 10000, immutable: true },
  suggestedChanges: { type: String, trim: true, maxlength: 10000, immutable: true },
}, { timestamps: true, versionKey: false });
gapValidationSchema.index({ gapId: 1, createdAt: 1 });

export const GapEvidenceRecordModel = mongoose.model("GapEvidenceRecord", gapEvidenceRecordSchema, "gap_evidence_records");
export const GapValidationModel = mongoose.model("GapValidation", gapValidationSchema, "gap_validations");
