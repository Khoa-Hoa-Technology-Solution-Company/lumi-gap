import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * keywords — lexicon. `normalizedName` (lowercase, trimmed) is the dedup key so
 * "LLM", "llm", and "Large Language Model" can be merged later.
 */
const keywordSchema = new Schema(
  {
    keywordName: { type: String, required: true },
    normalizedName: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true },
);

export type KeywordDoc = InferSchemaType<typeof keywordSchema> & { _id: mongoose.Types.ObjectId };
export const KeywordModel = mongoose.model("Keyword", keywordSchema, "keywords");
