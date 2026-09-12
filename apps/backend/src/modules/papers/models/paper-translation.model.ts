import mongoose, { type InferSchemaType, Schema } from "mongoose";

const paperTranslationSchema = new Schema(
  {
    paper: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },
    sourceLanguage: { type: String, required: true },
    targetLanguage: { type: String, required: true },
    sourceTextHash: { type: String, required: true },
    translatedTitle: { type: String, required: true },
    translatedAbstract: { type: String, default: "" },
    provider: { type: String, required: true },
    providerVersion: { type: String, required: true },
  },
  { timestamps: true },
);

paperTranslationSchema.index(
  { paper: 1, targetLanguage: 1, sourceTextHash: 1, provider: 1, providerVersion: 1 },
  { unique: true, name: "paper_translation_cache_v1" },
);

export type PaperTranslationDoc = InferSchemaType<typeof paperTranslationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PaperTranslationModel = mongoose.model(
  "PaperTranslation",
  paperTranslationSchema,
  "paper_translations",
);
