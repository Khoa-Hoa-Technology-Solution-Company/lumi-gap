import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * rag_queries — audit trail of every RAG execution: what was asked, which
 * papers were retrieved (with scores), how long each stage took, and whether
 * the LLM call was served from cache. One row per pipeline run.
 *
 * The retrieved list is EMBEDDED (bounded by REPORT_TOP_K <= 10 and always
 * read with its parent) — this intentionally folds the `rag_retrieved_contexts`
 * collection from the original plan into an array, per the §6 embed rule.
 */

const retrievedPaperSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true },
    score: { type: Number, required: true },
    rank: { type: Number, required: true },
  },
  { _id: false },
);

const ragQuerySchema = new Schema(
  {
    reportId: { type: Schema.Types.ObjectId, ref: "Report", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    queryText: { type: String, required: true },
    topK: { type: Number, required: true },
    filters: {
      yearFrom: { type: Number },
      yearTo: { type: Number },
    },
    retrieved: { type: [retrievedPaperSchema], default: [] },
    /** Stage timings (ms) — shown in the demo to prove the pipeline is real. */
    embeddingMs: { type: Number, default: 0 },
    searchMs: { type: Number, default: 0 },
    llmMs: { type: Number, default: 0 },
    /** True when the Gemini call was skipped thanks to the Redis cache. */
    cacheHit: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type RagQueryDoc = InferSchemaType<typeof ragQuerySchema> & {
  _id: mongoose.Types.ObjectId;
};

// Explicit collection name — see CLAUDE.md gotcha dd9c2d8.
export const RagQueryModel = mongoose.model("RagQuery", ragQuerySchema, "rag_queries");
