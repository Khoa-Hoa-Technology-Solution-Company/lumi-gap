import mongoose, { type InferSchemaType, Schema } from "mongoose";

const trustedInstitutionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    rorId: { type: String, trim: true, maxlength: 64 },
    domains: {
      type: [String],
      required: true,
      default: [],
      set: (values: string[]) => [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))],
    },
    verificationPolicy: {
      allowInstitutionalEmailVerification: { type: Boolean, default: true },
      autoVerifyMethods: {
        type: [String],
        enum: ["TRUSTED_SSO_FACULTY", "ORCID_AFFILIATION_MATCH", "INSTITUTION_EMPLOYMENT_API"],
        default: ["ORCID_AFFILIATION_MATCH"],
      },
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

trustedInstitutionSchema.index({ domains: 1, isActive: 1 });
trustedInstitutionSchema.index({ rorId: 1 }, { sparse: true });

export type TrustedInstitutionDoc = InferSchemaType<typeof trustedInstitutionSchema> & { _id: mongoose.Types.ObjectId };
export const TrustedInstitutionModel = mongoose.model(
  "TrustedInstitution",
  trustedInstitutionSchema,
  "trusted_institutions",
);
