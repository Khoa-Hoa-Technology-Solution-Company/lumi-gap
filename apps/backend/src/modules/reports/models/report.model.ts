import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * llm_analysis_reports — one document per AI analytical report.
 * Field names mirror the `AnalyticalReport` contract in @trend/shared-types.
 */

const researchGapSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    rationale: { type: String, default: "" },
    supportingPaperIds: { type: [Schema.Types.ObjectId], ref: "Paper", default: [] },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    probe: {
      topicA: { type: String },
      topicB: { type: String },
      yearFrom: { type: Number },
      yearTo: { type: Number },
    },
    intersectionCount: { type: Number },
    parentCounts: {
      a: { type: Number },
      b: { type: Number },
    },
    parentTrend: {
      topic: { type: String },
      growthRatePct: { type: Number },
    },
    evidenceConfidence: { type: Number, min: 0, max: 1 },
  },
  { _id: false },
);

const reportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    /** Optional display label (e.g. the Trends-page topic that spawned this). */
    topic: { type: String },
    query: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "generating", "ready", "failed"],
      default: "queued",
      index: true,
    },
    /** Markdown body — absent until status becomes "ready". */
    markdown: { type: String },
    groundingPaperIds: { type: [Schema.Types.ObjectId], ref: "Paper", default: [] },
    /** User-pinned evidence papers; worker places these before retrieved evidence. */
    selectedPaperIds: { type: [Schema.Types.ObjectId], ref: "Paper", default: [] },
    researchGaps: { type: [researchGapSchema], default: [] },
    modelVersion: { type: String, default: "" },
    promptVersion: { type: String, default: "" },
    /** hash(query + filters + model + promptVersion + retrievedPaperIds) — §6. */
    cacheKey: { type: String, index: true },
    yearFrom: { type: Number },
    yearTo: { type: Number },
    scopeFilters: {
      paperKinds: { type: [String], default: undefined },
      openAccessStatuses: { type: [String], default: undefined },
      providers: { type: [String], default: undefined },
      sources: { type: [String], default: undefined },
      languages: { type: [String], default: undefined },
      citationBands: { type: [String], default: undefined },
      domains: { type: [String], default: undefined },
      fields: { type: [String], default: undefined },
      subfields: { type: [String], default: undefined },
      topics: { type: [String], default: undefined },
      domainIds: { type: [String], default: undefined },
      fieldIds: { type: [String], default: undefined },
      subfieldIds: { type: [String], default: undefined },
      topicIds: { type: [String], default: undefined },
    },
    language: { type: String, enum: ["auto", "en", "vi"], default: "auto" },
    deepAnalysis: { type: Boolean, default: false },
    fast: { type: Boolean, default: false },
    errorMessage: { type: String },
    completedAt: { type: Date },
    creditTransactionId: { type: Schema.Types.ObjectId, ref: "CreditTransaction" },
    creditCost: { type: Number },
    creditAction: { type: String },
    creditRefundedAt: { type: Date },
  },
  { timestamps: true },
);

// "My reports, newest first" — the list endpoint's exact query.
reportSchema.index({ userId: 1, createdAt: -1 });

export type ReportDoc = InferSchemaType<typeof reportSchema> & { _id: mongoose.Types.ObjectId };
export type ReportHydrated = mongoose.HydratedDocument<InferSchemaType<typeof reportSchema>>;

// Explicit collection name — see CLAUDE.md gotcha dd9c2d8.
export const ReportModel = mongoose.model("Report", reportSchema, "llm_analysis_reports");
