import mongoose, { type InferSchemaType, Schema } from "mongoose";

const externalIdentitySchema = new Schema(
  {
    provider: { type: String, enum: ["ORCID", "GITHUB"], required: true },
    externalId: { type: String, trim: true, maxlength: 200 },
    profileUrl: { type: String, trim: true, maxlength: 500 },
    verificationStatus: {
      type: String,
      enum: ["UNVERIFIED", "LINKED", "VERIFIED"],
      default: "UNVERIFIED",
      required: true,
    },
  },
  { _id: false },
);

const supportAvailabilitySchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    types: {
      type: [String],
      enum: [
        "RESEARCH_DIRECTION", "LITERATURE_REVIEW", "RESEARCH_GAP_VALIDATION",
        "METHODOLOGY", "EXPERIMENT_DESIGN", "DATA_ANALYSIS", "ACADEMIC_WRITING",
        "PAPER_REVIEW", "SOFTWARE_TECHNICAL_REVIEW",
      ],
      default: [],
    },
    preferredTopics: { type: [String], default: [] },
    note: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const reviewAvailabilitySchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    types: {
      type: [String],
      enum: [
        "RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "RESEARCH_GAP", "METHODOLOGY",
        "EXPERIMENT_REPORT", "MANUSCRIPT", "SOFTWARE_RESEARCH_PROJECT",
      ],
      default: [],
    },
    preferredTopics: { type: [String], default: [] },
    note: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const academicProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    bio: { type: String, trim: true, maxlength: 3000 },
    department: { type: String, trim: true, maxlength: 200 },
    academicTitle: { type: String, trim: true, maxlength: 160 },
    institutionalEmail: { type: String, trim: true, lowercase: true, maxlength: 320 },
    expertiseAreas: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    externalIdentities: { type: [externalIdentitySchema], default: [] },
    supportAvailability: { type: supportAvailabilitySchema, default: () => ({}) },
    reviewAvailability: { type: reviewAvailabilitySchema, default: () => ({}) },
    verificationStatus: {
      type: String,
      enum: ["SELF_DECLARED", "PENDING", "VERIFIED", "REJECTED"],
      default: "SELF_DECLARED",
      required: true,
      index: true,
    },
    verificationRequestedAt: { type: Date },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    verificationNote: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

academicProfileSchema.index({ verificationStatus: 1, verificationRequestedAt: 1 });
academicProfileSchema.index({ "supportAvailability.enabled": 1, updatedAt: -1 });
academicProfileSchema.index({ "reviewAvailability.enabled": 1, updatedAt: -1 });

export type AcademicProfileDoc = InferSchemaType<typeof academicProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const AcademicProfileModel = mongoose.model(
  "AcademicProfile",
  academicProfileSchema,
  "academic_profiles",
);
