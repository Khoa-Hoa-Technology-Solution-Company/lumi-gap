import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * paper_source_records — audit trail of where each paper came from. One paper
 * can have many source records (OpenAlex, Semantic Scholar, ...). `rawMetadata`
 * stores the full provider JSON for debugging; `metadataHash` detects changes.
 */
const paperSourceRecordSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true },
    providerId: { type: Schema.Types.ObjectId, ref: "ApiProvider", required: true },
    externalRecordId: { type: String }, // e.g. "W2741809807" for OpenAlex
    rawMetadata: { type: Schema.Types.Mixed },
    metadataHash: { type: String, index: true },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

paperSourceRecordSchema.index({ paperId: 1, providerId: 1 });

export type PaperSourceRecordDoc = InferSchemaType<typeof paperSourceRecordSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const PaperSourceRecordModel = mongoose.model(
  "PaperSourceRecord",
  paperSourceRecordSchema,
  "paper_source_records",
);
