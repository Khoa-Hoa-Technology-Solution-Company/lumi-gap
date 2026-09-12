import mongoose, { type InferSchemaType, Schema } from "mongoose";

/** journals — master list of venues (journals, conferences, repositories). */
const journalSchema = new Schema(
  {
    externalIds: {
      openalexId: { type: String, index: true, sparse: true, unique: true },
      issn: { type: [String], default: [] },
      eissn: { type: String },
      crossrefId: { type: String },
    },
    name: { type: String, required: true, index: "text" },
    publisher: { type: String },
    country: { type: String },
    type: {
      type: String,
      enum: ["journal", "conference", "repository", "book-series", "other"],
      default: "journal",
    },
    isOpenAccess: { type: Boolean, default: false },
    homepageUrl: { type: String },
    worksCount: { type: Number, default: 0 },
    citedByCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type JournalDoc = InferSchemaType<typeof journalSchema> & { _id: mongoose.Types.ObjectId };
export const JournalModel = mongoose.model("Journal", journalSchema, "journals");
