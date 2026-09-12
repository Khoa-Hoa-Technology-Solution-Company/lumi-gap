import mongoose, { type InferSchemaType, Schema } from "mongoose";

const paperFormatCheckSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileName: { type: String, required: true },
    preset: { type: String, required: true },
    passed: { type: Boolean, required: true },
    summary: { type: String, default: "" },
    measurements: { type: Schema.Types.Mixed, default: {} },
    reportMarkdown: { type: String, default: "" },
  },
  { timestamps: true },
);

export type PaperFormatCheckDoc = InferSchemaType<typeof paperFormatCheckSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PaperFormatCheckModel = mongoose.model(
  "PaperFormatCheck",
  paperFormatCheckSchema,
);
