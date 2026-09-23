import mongoose, { type InferSchemaType, Schema } from "mongoose";

const openingSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 180 },
    description: { type: String, required: true, trim: true, minlength: 1, maxlength: 10000 },
    requirements: { type: [String], default: [] },
    capacity: { type: Number, min: 1, max: 100, default: 1 },
    acceptedCount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["open", "closed", "archived"], default: "open", index: true },
    closesAt: { type: Date },
  },
  { timestamps: true },
);
openingSchema.index({ projectId: 1, status: 1, createdAt: -1 });

const applicationSchema = new Schema(
  {
    openingId: { type: Schema.Types.ObjectId, ref: "RecruitmentOpening", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    applicantId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    coverLetter: { type: String, required: true, trim: true, minlength: 1, maxlength: 10000 },
    skills: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["submitted", "shortlisted", "accepted", "rejected", "withdrawn"],
      default: "submitted",
      index: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);
applicationSchema.index({ openingId: 1, applicantId: 1 }, { unique: true });
applicationSchema.index({ openingId: 1, status: 1, createdAt: -1 });

export const RecruitmentOpeningModel = mongoose.model("RecruitmentOpening", openingSchema, "recruitment_openings");
export const RecruitmentApplicationModel = mongoose.model("RecruitmentApplication", applicationSchema, "recruitment_applications");
export type RecruitmentApplicationDoc = InferSchemaType<typeof applicationSchema> & { _id: mongoose.Types.ObjectId };
