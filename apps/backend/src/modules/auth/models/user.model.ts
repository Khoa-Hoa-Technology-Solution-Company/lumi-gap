import mongoose, { type InferSchemaType, Schema } from "mongoose";
import { env } from "../../../config/env.js";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true, index: true },
    fullName: { type: String, required: true },
    role: {
      type: String,
      enum: ["student", "lecturer", "researcher", "admin"],
      default: "student",
      required: true,
    },
    avatarUrl: { type: String },
    institution: { type: String },
    researchInterests: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    points: { type: Number, default: 0 },
    credits: { type: Number, default: () => env.INITIAL_USER_CREDITS },
    penaltyPoints: { type: Number, default: 0, min: 0 },
    personalGeminiKey: { type: String },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };
export type UserHydrated = mongoose.HydratedDocument<InferSchemaType<typeof userSchema>>;
export const UserModel = mongoose.model("User", userSchema);

/** Refresh tokens are stored hashed so a DB leak does not grant valid sessions. */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    userAgent: { type: String },
    ipAddress: { type: String },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

export type RefreshTokenDoc = InferSchemaType<typeof refreshTokenSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const RefreshTokenModel = mongoose.model("RefreshToken", refreshTokenSchema);
