import mongoose from 'mongoose';

const paperDownloadSchema = new mongoose.Schema(
  {
    paper: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

paperDownloadSchema.index({ paper: 1, user: 1 }, { unique: true });

export const PaperDownload = mongoose.model('PaperDownload', paperDownloadSchema);
