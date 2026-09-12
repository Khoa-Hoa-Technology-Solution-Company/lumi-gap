import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Notification } from '../models/Notification.js';
import { Paper } from '../models/Paper.js';
import { PaperComment } from '../models/PaperComment.js';
import { PaperDownload } from '../models/PaperDownload.js';
import { Rating } from '../models/Rating.js';
import { deletePdfFromS3, isS3Path } from './s3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../../uploads');

async function deleteStoredPdf(pdfPath) {
  if (!pdfPath) return;

  if (isS3Path(pdfPath)) {
    await deletePdfFromS3(pdfPath);
    return;
  }

  try {
    await fs.unlink(path.resolve(uploadsDir, path.basename(pdfPath)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function refreshPaperRatingStats(paperIds) {
  for (const paperId of paperIds) {
    const [stats] = await Rating.aggregate([
      { $match: { paper: paperId } },
      {
        $group: {
          _id: '$paper',
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    await Paper.findByIdAndUpdate(paperId, {
      averageRating: stats?.averageRating || 0,
      totalRatings: stats?.totalRatings || 0,
    });
  }
}

export async function deletePapersWithRelatedData(filter) {
  const papers = await Paper.find(filter).select('_id requestedBy uploadedBy pdfPath');
  if (papers.length === 0) return [];

  const paperIds = papers.map((paper) => paper._id);
  const ratings = await Rating.find({ paper: { $in: paperIds } }).select('user');
  const affectedUserIds = new Set(ratings.map((rating) => rating.user.toString()));

  for (const paper of papers) {
    if (paper.requestedBy) affectedUserIds.add(paper.requestedBy.toString());
    if (paper.uploadedBy) affectedUserIds.add(paper.uploadedBy.toString());
  }

  await Promise.all(papers.map((paper) => deleteStoredPdf(paper.pdfPath)));
  await Promise.all([
    Paper.deleteMany({ _id: { $in: paperIds } }),
    Rating.deleteMany({ paper: { $in: paperIds } }),
    PaperComment.deleteMany({ paper: { $in: paperIds } }),
    PaperDownload.deleteMany({ paper: { $in: paperIds } }),
    Notification.deleteMany({ paper: { $in: paperIds } }),
  ]);

  return [...affectedUserIds];
}

export async function deleteUserRelatedData(userId) {
  const affectedUserIds = await deletePapersWithRelatedData({ requestedBy: userId });
  const ratings = await Rating.find({ user: userId }).select('paper');
  const ratedPaperIds = ratings.map((rating) => rating.paper);

  await Promise.all([
    Rating.deleteMany({ user: userId }),
    PaperComment.deleteMany({ user: userId }),
    PaperComment.updateMany({}, { $pull: { likedBy: userId } }),
    PaperDownload.deleteMany({ user: userId }),
    Notification.deleteMany({ $or: [{ recipient: userId }, { actor: userId }] }),
    Paper.updateMany({ uploadedBy: userId }, { $unset: { uploadedBy: '', uploadedAt: '' } }),
  ]);

  await refreshPaperRatingStats(ratedPaperIds);

  return affectedUserIds.filter((affectedUserId) => affectedUserId !== userId.toString());
}
