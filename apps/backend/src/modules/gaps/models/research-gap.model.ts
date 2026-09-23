import mongoose, { type InferSchemaType, Schema } from "mongoose";

/**
 * research_gaps — one document per identified research gap. Gaps arrive from two
 * sources (CLAUDE.md polymorphic-source pattern via the `source` discriminator):
 *   - "report":     fanned out from a finished RAG report's `researchGaps`.
 *   - "standalone": produced by the dedicated gap-analysis pipeline.
 */

const researchGapSchema = new Schema(
  {
    topic: { type: String, required: true },
    normalizedTopic: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true },
    rationale: { type: String, required: true },
    gapType: {
      type: String,
      enum: ["COVERAGE_GAP", "EMPIRICAL_VALIDATION_GAP", "CONTRADICTORY_EVIDENCE_GAP", "CONTEXT_GAP", "METHODOLOGICAL_GAP", "OUTCOME_GAP", "TEMPORAL_GAP", "EMERGING_GAP", "MISSING_CONNECTION_GAP", "ASSUMPTION_GAP", "OTHER"],
      default: "OTHER",
      index: true,
    },
    scope: { type: String, trim: true, maxlength: 5000 },
    establishedKnowledge: { type: String, trim: true, maxlength: 10000 },
    observedLimitation: { type: String, trim: true, maxlength: 10000 },
    missingEvidence: { type: String, trim: true, maxlength: 10000 },
    significanceExplanation: { type: String, trim: true, maxlength: 10000 },
    suggestedResearchQuestion: { type: String, trim: true, maxlength: 5000 },
    validationStatus: {
      type: String,
      enum: ["DRAFT", "CANDIDATE", "UNDER_VALIDATION", "REFINED", "VALIDATED", "REJECTED", "ARCHIVED"],
      default: "CANDIDATE",
      index: true,
    },
    gapConfidence: { type: String, enum: ["LOW", "MODERATE", "HIGH"], default: "LOW", index: true },
    researchPriority: { type: String, enum: ["LOW", "MODERATE", "HIGH"], default: "MODERATE", index: true },
    origin: { type: String, enum: ["HUMAN", "AI_ASSISTED"], default: "AI_ASSISTED" },
    // Complete, ordered evidence pack reviewed before generation. A gap's
    // supportingPaperIds is the smaller subset cited for that specific claim.
    evidencePaperIds: { type: [Schema.Types.ObjectId], ref: "Paper", default: [] },
    supportingPaperIds: { type: [Schema.Types.ObjectId], ref: "Paper", default: [] },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    // v2 — quantitative evidence verified against the corpus (see gap-evidence.ts).
    probe: {
      topicA: { type: String },
      topicB: { type: String },
      yearFrom: { type: Number },
      yearTo: { type: Number },
    },
    intersectionCount: { type: Number },
    parentCounts: { a: { type: Number }, b: { type: Number } },
    parentTrend: { topic: { type: String }, growthRatePct: { type: Number } },
    evidenceConfidence: { type: Number, min: 0, max: 1, index: true },
    source: { type: String, enum: ["report", "standalone"], required: true },
    sourceReportId: { type: Schema.Types.ObjectId, ref: "Report" },
    // Standalone gaps link to their analysis so a retried job can clear+recreate
    // its own gaps idempotently (report-sourced gaps have no analysisId).
    analysisId: { type: Schema.Types.ObjectId, ref: "GapAnalysis", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    corpusId: { type: Schema.Types.ObjectId, ref: "LiteratureCorpus", index: true },
    status: {
      type: String,
      enum: ["active", "resolved", "dismissed"],
      default: "active",
    },
  },
  { timestamps: true },
);

researchGapSchema.index({ normalizedTopic: 1, confidence: -1 });
researchGapSchema.index({ userId: 1, createdAt: -1 });
researchGapSchema.index({ status: 1, createdAt: -1 });
researchGapSchema.index({ validationStatus: 1, gapType: 1, createdAt: -1 });

export type ResearchGapDoc = InferSchemaType<typeof researchGapSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ResearchGapModel = mongoose.model(
  "ResearchGap",
  researchGapSchema,
  "research_gaps",
);
