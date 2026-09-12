import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * research_papers — the master paper collection. Authors, keywords, and topics
 * are EMBEDDED (bounded lists always read with the parent). Source records and
 * quality checks are REFERENCED in their own collections.
 *
 * Field names (`abstractText`, `topics`, `dataStatus`, `embedding`) are aligned
 * with the Atlas Vector Search index `paper_vector_index` and the Phase A spec.
 */

const paperAuthorSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "Author" },
    displayName: { type: String, required: true },
    position: { type: Number, required: true },
    isCorresponding: { type: Boolean, default: false },
  },
  { _id: false },
);

const paperKeywordSchema = new Schema(
  {
    keywordId: { type: Schema.Types.ObjectId, ref: "Keyword" },
    keywordName: { type: String, required: true },
    detectedBy: { type: String, enum: ["openalex", "ai", "user"], default: "openalex" },
    confidence: { type: Number, min: 0, max: 1 },
  },
  { _id: false },
);

const paperTopicSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: "ResearchTopic" },
    openalexTopicId: { type: String },
    topicName: { type: String, required: true },
    detectedBy: { type: String, enum: ["openalex", "ai", "user"], default: "openalex" },
    confidence: { type: Number, min: 0, max: 1 },
    isPrimary: { type: Boolean, default: false },
    subfieldId: { type: String },
    subfieldName: { type: String },
    fieldId: { type: String },
    fieldName: { type: String },
    domainId: { type: String },
    domainName: { type: String },
  },
  { _id: false },
);

const paperAiAnalysisSchema = new Schema(
  {
    summary: { type: String, default: null },
    methods: { type: String, default: null },
    dataset: { type: String, default: null },
    findings: { type: [String], default: [] },
    limitations: { type: [String], default: [] },
    contributions: { type: [String], default: [] },
    futureWork: { type: [String], default: [] },
    keyTerms: { type: [String], default: [] },
    extractedBy: { type: String, enum: ["llm"], default: "llm" },
    analysisPromptVersion: { type: String, required: true },
    extractedAt: { type: Date, required: true },
  },
  { _id: false },
);

const paperSchema = new Schema(
  {
    externalIds: {
      doi: { type: String, index: true, sparse: true, unique: true },
      openalexId: { type: String, index: true, sparse: true },
      semanticScholarId: { type: String, index: true, sparse: true },
      arxivId: { type: String, index: true, sparse: true },
      pubmedId: { type: String, index: true, sparse: true },
    },
    title: { type: String, required: true },
    abstractText: { type: String },
    authors: { type: [paperAuthorSchema], default: [] },
    journalId: { type: Schema.Types.ObjectId, ref: "Journal" },
    journalName: { type: String },
    publicationYear: { type: Number, required: true, index: true },
    publicationDate: { type: Date },
    paperKind: {
      type: String,
      enum: ["article", "proceedings", "preprint", "review", "book-chapter", "other"],
      default: "article",
    },
    language: { type: String, default: "und", lowercase: true, trim: true, index: true },
    // OpenAlex exposes ISO language codes such as `ko` and `id`. MongoDB's
    // text-index language override accepts a different, limited vocabulary, so
    // keep the provider fact separate from the deterministic index setting.
    textSearchLanguage: { type: String, default: "none", select: false },
    openAccessStatus: {
      type: String,
      enum: ["gold", "green", "hybrid", "bronze", "closed", "unknown"],
      default: "unknown",
    },
    openAccessUrl: { type: String },
    paperLink: { type: String }, // Direct link to source paper (required for requests)
    licenseName: { type: String },
    citationCount: { type: Number, default: 0, index: true },
    fwci: { type: Number },
    citationNormalizedPercentile: {
      type: new Schema(
        {
          value: { type: Number, min: 0, max: 1 },
          isInTop1Percent: Boolean,
          isInTop10Percent: Boolean,
        },
        { _id: false },
      ),
      default: undefined,
    },
    relatedWorksCount: { type: Number, default: 0 },
    keywords: { type: [paperKeywordSchema], default: [] },
    topics: { type: [paperTopicSchema], default: [] },
    primaryProvider: {
      type: String,
      enum: ["openalex", "semanticscholar", "crossref", "arxiv", "user"],
      required: true,
    },
    pdfPath: { type: String },
    // --- User submission / request fields (Legacy-compatible) ---
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", index: true }, // Who created the request
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", index: true },  // Who uploaded the PDF
    uploadedAt: { type: Date },
    uploadRewardedAt: { type: Date }, // When the upload credit reward was granted
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    /** paperStatus: the user-facing workflow state (mirrors Legacy status field).
     *  dataStatus is kept separately for AI/Search pipeline compatibility. */
    paperStatus: {
      type: String,
      enum: ["pending", "not-downloaded", "downloaded", "rejected", "pending-requester-acceptance"],
      default: "pending",
      index: true,
    },
    // --- AI/Sync pipeline status ---
    dataStatus: {
      type: String,
      enum: ["draft", "active", "low-quality", "archived"],
      default: "draft",
      index: true,
    },
    dataQualityScore: { type: Number, min: 0, max: 1, default: 0 },
    isAiAnalyzable: { type: Boolean, default: false, index: true },
    // --- Quality scoring ---
    metadataScore: { type: Number, default: 0 },
    sourceScore: { type: Number, default: 0 },
    duplicateScore: { type: Number, default: 0 },
    relevanceScore: { type: Number, default: 0 },
    prestigeScore: { type: Number, default: 0 },
    utilityScore: { type: Number, default: 0 },
    qualityScore: { type: Number, default: 0 },
    qualityTier: { type: Number, default: 0 },
    qualityTierName: { type: String, default: "Invalid" },
    downloadCost: { type: Number, default: null },
    uploadCreditReward: { type: Number, default: 0 },
    // --- Stats ---
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    /** Vector embedding for Atlas Vector Search. 768 dim from gemini-embedding-2.
     *  Populated in Phase B; select:false so list queries don't carry vectors. */
    embedding: { type: [Number], default: undefined, select: false },
    /** Provenance lets the worker identify vectors produced by an obsolete
     * model/configuration and backfill them without deleting legacy data. */
    embeddingModel: { type: String, default: undefined, select: false },
    embeddingVersion: { type: String, default: undefined, select: false },
    embeddingDimensions: { type: Number, default: undefined, select: false },
    embeddingUpdatedAt: { type: Date, default: undefined, select: false },
    /** OpenAlex IDs this paper cites (referenced_works). select:false — heavy. */
    referencedWorks: { type: [String], default: [], select: false },
    /** OpenAlex IDs algorithmically related to this paper. select:false — heavy. */
    relatedWorks: { type: [String], default: [], select: false },
    aiScore: {
      type: new Schema(
        {
          recencyScore: Number,
          citationImpactScore: Number,
          citationPercentileScore: Number,
          fwciScore: Number,
          metadataQualityScore: Number,
          finalScore: Number,
          scoreBasis: {
            type: String,
            enum: ["openalex-percentile-fwci", "openalex-fwci", "citations-per-year-fallback"],
          },
          modelVersion: String,
          computedAt: Date,
        },
        { _id: false },
      ),
      default: undefined,
    },
    aiAnalysis: {
      type: paperAiAnalysisSchema,
      default: undefined,
    },
  },
  { timestamps: true },
);

// Compound indexes for the main "topic + year" and "year + citations" queries.
paperSchema.index({ "topics.topicName": 1, publicationYear: -1 });
paperSchema.index({ "topics.openalexTopicId": 1, publicationYear: -1 });
paperSchema.index({ "topics.subfieldName": 1, publicationYear: -1 });
paperSchema.index({ "topics.fieldName": 1, publicationYear: -1 });
paperSchema.index({ "topics.domainName": 1, publicationYear: -1 });
paperSchema.index({ publicationYear: -1, citationCount: -1 });
paperSchema.index({ "aiScore.finalScore": -1 });
paperSchema.index({ isAiAnalyzable: 1, dataStatus: 1, "aiAnalysis.analysisPromptVersion": 1 });
paperSchema.index(
  { title: "text", abstractText: "text" },
  {
    name: "paper_search_text",
    default_language: "none",
    language_override: "textSearchLanguage",
    weights: { title: 10, abstractText: 2 },
  },
);

/** Lean (plain-object) type — use for `.lean()` reads. */
export type PaperDoc = InferSchemaType<typeof paperSchema> & { _id: mongoose.Types.ObjectId };
/** Hydrated Mongoose document type — has `.save()`, use for mutations. */
export type PaperHydrated = mongoose.HydratedDocument<InferSchemaType<typeof paperSchema>>;

// IMPORTANT: explicit collection name "research_papers" so that Atlas Vector
// Search index `paper_vector_index` (created against research_papers) actually
// matches what Mongoose writes. Without this, Mongoose pluralizes "Paper" to
// "papers" and the vector index never sees new documents (see git dd9c2d8).
export const PaperModel = mongoose.model("Paper", paperSchema, "research_papers");
