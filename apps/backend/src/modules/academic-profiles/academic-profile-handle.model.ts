import mongoose, { Schema } from "mongoose";

const academicProfileHandleSchema = new Schema(
  {
    handle: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true },
);

export const AcademicProfileHandleModel = mongoose.model(
  "AcademicProfileHandle",
  academicProfileHandleSchema,
  "academic_profile_handles",
);
