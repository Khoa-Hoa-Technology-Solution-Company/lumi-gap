import mongoose, { type InferSchemaType, Schema } from "mongoose";

const affiliationSchema = new Schema(
  {
    name: { type: String, required: true },
    country: { type: String },
    ror: { type: String }, // Research Organization Registry ID
  },
  { _id: false },
);

/** authors — master list of paper authors. */
const authorSchema = new Schema(
  {
    externalIds: {
      openalexId: { type: String, index: true, sparse: true, unique: true },
      orcid: { type: String, index: true, sparse: true },
      scholarId: { type: String },
    },
    displayName: { type: String, required: true, index: "text" },
    affiliations: { type: [affiliationSchema], default: [] },
    hIndex: { type: Number },
    citedByCount: { type: Number, default: 0 },
    worksCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type AuthorDoc = InferSchemaType<typeof authorSchema> & { _id: mongoose.Types.ObjectId };
export const AuthorModel = mongoose.model("Author", authorSchema, "authors");
