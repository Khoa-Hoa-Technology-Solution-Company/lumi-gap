import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paper: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper', index: true },
    type: {
      type: String,
      enum: [
        'paper_submitted',
        'paper_pdf_uploaded',
        'paper_rated',
        'paper_rating_updated',
        'paper_rating_deleted',
        'paper_approved',
        'paper_commented',
        'paper_comment_replied',
        'paper_comment_liked',
        'system_announcement',
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
