import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * paper_downloads — tracks PDF download events per user/paper pair.
 * Used to:
 *  1. Deduct credits on first download (using paper.downloadCost).
 *  2. Charge a reduced "re-download" fee (REDOWNLOAD_COST) for subsequent downloads.
 *  3. Display download history to the requester.
 */
const paperDownloadSchema = new Schema(
  {
    paper: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    cost: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Unique compound index: each user can only have one "first download" record per paper.
paperDownloadSchema.index({ paper: 1, user: 1 }, { unique: true });

export type PaperDownloadDoc = InferSchemaType<typeof paperDownloadSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const PaperDownloadModel = mongoose.model(
  "PaperDownload",
  paperDownloadSchema,
  "paper_downloads",
);
