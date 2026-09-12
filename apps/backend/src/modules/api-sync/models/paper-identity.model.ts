import mongoose, { type InferSchemaType, Schema } from "mongoose";

const paperIdentitySchema = new Schema(
  {
    provider: { type: String, required: true, enum: ["doi", "openalex", "semanticscholar", "crossref", "arxiv", "pubmed"] },
    normalizedValue: { type: String, required: true },
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },
    firstSeenCampaignId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestCampaign" },
    lastVerifiedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

paperIdentitySchema.index({ provider: 1, normalizedValue: 1 }, { unique: true });

export type PaperIdentityDoc = InferSchemaType<typeof paperIdentitySchema> & { _id: mongoose.Types.ObjectId };
export const PaperIdentityModel = mongoose.model("PaperIdentity", paperIdentitySchema, "paper_identities");
