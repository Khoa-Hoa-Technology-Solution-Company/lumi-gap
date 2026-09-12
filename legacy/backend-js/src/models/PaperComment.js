import mongoose from 'mongoose';

const paperCommentSchema = new mongoose.Schema(
  {
    paper: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'PaperComment', default: null },
    sourceRating: { type: mongoose.Schema.Types.ObjectId, ref: 'Rating' },
    comment: { type: String, trim: true, required: true, maxlength: 500 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

paperCommentSchema.index({ paper: 1, createdAt: -1 });
paperCommentSchema.index({ parentComment: 1, createdAt: 1 });
paperCommentSchema.index(
  { sourceRating: 1 },
  { unique: true, partialFilterExpression: { sourceRating: { $type: 'objectId' } } }
);

export const PaperComment = mongoose.model('PaperComment', paperCommentSchema);
