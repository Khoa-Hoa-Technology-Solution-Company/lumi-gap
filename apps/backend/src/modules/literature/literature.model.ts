import mongoose, { Schema } from "mongoose";

const picocSchema = new Schema({
  population: { type: String, trim: true, maxlength: 1000 },
  intervention: { type: String, trim: true, maxlength: 1000 },
  comparison: { type: String, trim: true, maxlength: 1000 },
  outcome: { type: String, trim: true, maxlength: 1000 },
  context: { type: String, trim: true, maxlength: 1000 },
}, { _id: false });

const literatureCorpusSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  topic: { type: String, required: true, trim: true, maxlength: 300, index: true },
  researchGoal: { type: String, trim: true, maxlength: 5000 },
  domain: { type: String, trim: true, maxlength: 300 },
  keywords: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
  picoc: { type: picocSchema, default: {} },
  searchStrategy: { type: String, trim: true, maxlength: 10000 },
  status: { type: String, enum: ["DRAFT", "ACTIVE", "ARCHIVED"], default: "DRAFT", index: true },
}, { timestamps: true });
literatureCorpusSchema.index({ ownerId: 1, createdAt: -1 });

const evidenceSchema = new Schema({
  researchProblem: { type: String, trim: true, maxlength: 5000 },
  objectives: { type: String, trim: true, maxlength: 5000 },
  population: { type: String, trim: true, maxlength: 2000 },
  context: { type: String, trim: true, maxlength: 2000 },
  intervention: { type: String, trim: true, maxlength: 2000 },
  comparison: { type: String, trim: true, maxlength: 2000 },
  outcome: { type: String, trim: true, maxlength: 2000 },
  methodology: { type: String, trim: true, maxlength: 500 },
  dataset: { type: String, trim: true, maxlength: 2000 },
  findings: { type: String, trim: true, maxlength: 10000 },
  limitations: { type: String, trim: true, maxlength: 10000 },
  futureWork: { type: String, trim: true, maxlength: 10000 },
  contributionType: { type: String, trim: true, maxlength: 500 },
  researchType: { type: String, trim: true, maxlength: 500 },
}, { _id: false });

const corpusPaperSchema = new Schema({
  corpusId: { type: Schema.Types.ObjectId, ref: "LiteratureCorpus", required: true, index: true },
  paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true, index: true },
  included: { type: Boolean, default: true, index: true },
  exclusionReason: { type: String, trim: true, maxlength: 2000 },
  evidence: { type: evidenceSchema, default: {} },
  addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
corpusPaperSchema.index({ corpusId: 1, paperId: 1 }, { unique: true });

export const LiteratureCorpusModel = mongoose.model("LiteratureCorpus", literatureCorpusSchema, "literature_corpora");
export const CorpusPaperModel = mongoose.model("CorpusPaper", corpusPaperSchema, "corpus_papers");
