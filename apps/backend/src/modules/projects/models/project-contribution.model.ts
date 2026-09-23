import mongoose, { Schema } from "mongoose";

export const projectContributionRoles = [
  "SUPERVISION",
  "METHODOLOGY",
  "VALIDATION",
  "SOFTWARE",
  "CONCEPTUALIZATION",
  "WRITING_ORIGINAL_DRAFT",
  "WRITING_REVIEW_EDITING",
  "PROJECT_ADMINISTRATION",
  "OTHER",
] as const;

const historySchema = new Schema({
  action: { type: String, enum: ["PROPOSED", "CONFIRMED", "REJECTED", "WITHDRAWN"], required: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  note: { type: String, trim: true, maxlength: 1000 },
  createdAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const projectContributionProposalSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  contributorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  roles: [{ type: String, enum: projectContributionRoles, required: true }],
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  evidence: { type: String, trim: true, maxlength: 5000 },
  visibility: { type: String, enum: ["PUBLIC", "PRIVATE"], default: "PUBLIC" },
  status: {
    type: String,
    enum: ["PENDING_CONFIRMATION", "CONFIRMING", "CONFIRMED", "REJECTED", "WITHDRAWN"],
    default: "PENDING_CONFIRMATION",
    index: true,
  },
  confirmationRequiredFrom: { type: String, enum: ["OWNER", "CONTRIBUTOR"], required: true },
  proposedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  confirmedBy: { type: Schema.Types.ObjectId, ref: "User" },
  confirmedAt: Date,
  rejectedBy: { type: Schema.Types.ObjectId, ref: "User" },
  rejectedAt: Date,
  rejectionReason: { type: String, trim: true, maxlength: 1000 },
  history: { type: [historySchema], default: [] },
}, { timestamps: true });

projectContributionProposalSchema.index({ projectId: 1, createdAt: -1 });
projectContributionProposalSchema.index(
  { projectId: 1, contributorId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["PENDING_CONFIRMATION", "CONFIRMING"] } } },
);

export const ProjectContributionProposalModel = mongoose.model(
  "ProjectContributionProposal",
  projectContributionProposalSchema,
  "project_contribution_proposals",
);
