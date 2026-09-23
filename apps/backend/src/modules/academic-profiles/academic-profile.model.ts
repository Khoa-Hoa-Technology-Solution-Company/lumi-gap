import mongoose, { type InferSchemaType, Schema } from "mongoose";

const academicTitles = [
  "Lecturer", "Senior Lecturer", "Assistant Professor", "Associate Professor",
  "Professor", "Research Fellow", "Other",
] as const;

const affiliationSchema = new Schema(
  {
    rorId: { type: String, trim: true, maxlength: 64 },
    department: { type: String, trim: true, maxlength: 200 },
    position: { type: String, trim: true, maxlength: 160 },
    startYear: { type: Number, min: 1900, max: 2200 },
    institutionalEmail: { type: String, trim: true, lowercase: true, maxlength: 320 },
    institutionalEmailVerifiedAt: { type: Date },
  },
  { _id: false },
);

const externalIdentitySchema = new Schema(
  {
    provider: {
      type: String,
      enum: ["ORCID", "GITHUB", "OPENALEX", "GOOGLE_SCHOLAR", "SEMANTIC_SCHOLAR", "OTHER"],
      required: true,
    },
    externalId: { type: String, trim: true, maxlength: 200 },
    profileUrl: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ["UNVERIFIED", "LINKED", "VERIFIED"],
      default: "UNVERIFIED",
      required: true,
    },
    source: {
      type: String,
      enum: ["SELF_ASSERTED", "OAUTH", "SYSTEM", "ADMIN"],
      default: "SELF_ASSERTED",
      required: true,
    },
    linkedAt: { type: Date },
    verifiedAt: { type: Date },
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
        "RESEARCH_METHODOLOGY", "EXPERIMENT_DESIGN", "DATA_ANALYSIS",
        "ACADEMIC_WRITING", "SOFTWARE_TECHNICAL_GUIDANCE",
      ],
      default: [],
    },
    preferredTopics: { type: [String], default: [] },
    note: { type: String, trim: true, maxlength: 1000 },
    updatedAt: { type: Date },
  },
  { _id: false },
);

const reviewAvailabilitySchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    types: {
      type: [String],
      enum: [
        "RESEARCH_PROPOSAL", "LITERATURE_REVIEW", "THESIS_DRAFT", "RESEARCH_GAP", "METHODOLOGY",
        "EXPERIMENTAL_RESULTS", "RESEARCH_PAPER", "SOFTWARE_RESEARCH_PROJECT",
      ],
      default: [],
    },
    preferredTopics: { type: [String], default: [] },
    acceptedFields: { type: [String], default: [] },
    maximumActiveReviews: { type: Number, min: 1, max: 20, default: 3 },
    preferredReviewWorkload: { type: String, trim: true, maxlength: 160 },
    note: { type: String, trim: true, maxlength: 1000 },
    temporarilyUnavailableUntil: { type: Date },
    autoRecommendationEnabled: { type: Boolean, default: true },
    updatedAt: { type: Date },
  },
  { _id: false },
);

const featuredWorkSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper" },
    doi: { type: String, trim: true, lowercase: true, maxlength: 300 },
    title: { type: String, trim: true, maxlength: 500 },
    year: { type: Number, min: 1000, max: 2200 },
    source: { type: String, enum: ["LUMIGAP", "ORCID", "MANUAL"], required: true },
  },
  { _id: false },
);

const verificationEvidenceSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "INSTITUTIONAL_EMAIL", "TRUSTED_INSTITUTION", "ORCID", "ORCID_OWNERSHIP",
        "ORCID_AFFILIATION_MATCH", "TRUSTED_SSO_FACULTY", "INSTITUTION_EMPLOYMENT_API",
        "INSTITUTION_PROFILE", "ADMIN_REVIEW", "OTHER",
      ],
      required: true,
    },
    value: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["SUBMITTED", "VALIDATED", "REJECTED"], required: true },
    source: { type: String, enum: ["USER", "SYSTEM", "ADMIN"], required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    validatedAt: { type: Date },
  },
  { _id: false },
);

const academicProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    publicHandle: { type: String, trim: true, lowercase: true, maxlength: 40, unique: true, sparse: true },
    coverStorageKey: { type: String, trim: true, maxlength: 160 },
    coverUpdatedAt: { type: Date },
    profileVisibility: {
      type: String,
      enum: ["PUBLIC", "MEMBERS_ONLY", "PRIVATE"],
      default: "PUBLIC",
      required: true,
      index: true,
    },
    headline: { type: String, trim: true, maxlength: 180 },
    biography: { type: String, trim: true, maxlength: 3000 },
    academicTitle: { type: String, enum: academicTitles },
    affiliation: { type: affiliationSchema, default: () => ({}) },
    expertiseAreas: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    researchKeywords: { type: [String], default: [] },
    externalIdentities: { type: [externalIdentitySchema], default: [] },
    featuredWorks: { type: [featuredWorkSchema], default: [] },
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
    rejectedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    verificationMethod: { type: String, trim: true, maxlength: 120 },
    verificationNote: { type: String, trim: true, maxlength: 1000 },
    verificationEvidence: { type: [verificationEvidenceSchema], default: [] },

    // Read-only compatibility fields for AcademicProfile documents written by the first MVP.
    bio: { type: String, trim: true, maxlength: 3000 },
    department: { type: String, trim: true, maxlength: 200 },
    institutionalEmail: { type: String, trim: true, lowercase: true, maxlength: 320 },
  },
  { timestamps: true },
);

academicProfileSchema.index({ verificationStatus: 1, verificationRequestedAt: 1 });
academicProfileSchema.index({ profileVisibility: 1, verificationStatus: 1, updatedAt: -1 });
academicProfileSchema.index({ "affiliation.rorId": 1 }, { sparse: true });
academicProfileSchema.index({ expertiseAreas: 1 });
academicProfileSchema.index({ "supportAvailability.enabled": 1, updatedAt: -1 });
academicProfileSchema.index({ "reviewAvailability.enabled": 1, updatedAt: -1 });
academicProfileSchema.index({ "reviewAvailability.enabled": 1, "reviewAvailability.preferredTopics": 1 });

export type AcademicProfileDoc = InferSchemaType<typeof academicProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const AcademicProfileModel = mongoose.model(
  "AcademicProfile",
  academicProfileSchema,
  "academic_profiles",
);
