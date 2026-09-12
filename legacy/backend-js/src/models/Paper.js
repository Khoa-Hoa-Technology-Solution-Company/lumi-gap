import mongoose from 'mongoose';

const allowedPaperTypes = [
  'Survey',
  'Research',
  'Preprint',
  'Conference Paper',
  'Journal Article',
  'Book Chapter',
  'Thesis',
  'Technical Report',
  'Workshop Paper',
  'Review Article',
  'Case Study',
  'Position Paper',
  'Editorial',
  'White Paper',
  'Research Note',
  'Short Communication',
  'Letter to Editor',
  'News & Views',
  'Commentary',
  'Tutorial',
  'Abstract',
  'Extended Abstract',
  'Poster Paper',
  'Data Paper',
  'Software Paper',
  'Patent',
  'Book Review',
  'Erratum',
  'Corrigendum',
  'Retraction Notice',
  'Proposal',
  'Other',
];

const paperSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    doi: { type: String, required: true, trim: true },
    paperType: { type: String, required: true, trim: true, enum: allowedPaperTypes },
    paperLink: { type: String, required: true, trim: true },
    abstract: { type: String, required: true, trim: true },
    authors: {
      type: [String],
      required: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'At least one author is required',
      },
    },
    keywords: [{ type: String, trim: true }],
    relatedSemesters: [{ type: String, trim: true }],
    applicationDomain: { type: String, trim: true },
    publishedYear: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'downloaded', 'not-downloaded', 'pending-requester-acceptance'],
      default: 'pending',
    },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pdfPath: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    metadataScore: { type: Number, default: 0, min: 0, max: 15 },
    sourceScore: { type: Number, default: 0, min: 0, max: 15 },
    duplicateScore: { type: Number, default: 20, min: 0, max: 20 },
    relevanceScore: { type: Number, default: 0, min: 0, max: 15 },
    prestigeScore: { type: Number, default: 0, min: 0, max: 20 },
    utilityScore: { type: Number, default: 0, min: 0, max: 15 },
    qualityScore: { type: Number, default: 0, min: 0, max: 100, index: true },
    qualityTier: { type: Number, default: 0, min: 0, max: 4, index: true },
    qualityTierName: { type: String, default: 'Không hợp lệ' },
    downloadCost: { type: Number, default: null },
    uploadCreditReward: { type: Number, default: 0 },
    uploadRewardedAt: { type: Date },
  },
  { timestamps: true }
);

paperSchema.index({ doi: 1 }, { unique: true });
paperSchema.index({ paperLink: 1 }, { unique: true });
paperSchema.index({
  title: 'text',
  doi: 'text',
  paperType: 'text',
  paperLink: 'text',
  abstract: 'text',
  authors: 'text',
  keywords: 'text',
  relatedSemesters: 'text',
  applicationDomain: 'text',
});

export const Paper = mongoose.model('Paper', paperSchema);
