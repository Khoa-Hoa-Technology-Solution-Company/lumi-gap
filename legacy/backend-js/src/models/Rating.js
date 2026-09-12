import mongoose from 'mongoose';

const ratingSchema = new mongoose.Schema(
  {
    paper: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

ratingSchema.index({ paper: 1, user: 1 }, { unique: true });

export const Rating = mongoose.model('Rating', ratingSchema);
