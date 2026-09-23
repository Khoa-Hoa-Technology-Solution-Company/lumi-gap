import mongoose, { type InferSchemaType, Schema } from "mongoose";

const academicEmailVerificationChallengeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, default: 5, min: 1, max: 10 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
  },
  { timestamps: true },
);

academicEmailVerificationChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
academicEmailVerificationChallengeSchema.index({ userId: 1, email: 1 }, { unique: true });

export type AcademicEmailVerificationChallengeDoc = InferSchemaType<typeof academicEmailVerificationChallengeSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const AcademicEmailVerificationChallengeModel = mongoose.model(
  "AcademicEmailVerificationChallenge",
  academicEmailVerificationChallengeSchema,
  "academic_email_verification_challenges",
);
