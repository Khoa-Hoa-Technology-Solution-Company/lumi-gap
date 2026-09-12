import mongoose from 'mongoose';
import { Paper } from '../models/Paper.js';
import { PaperDownload } from '../models/PaperDownload.js';
import { Rating } from '../models/Rating.js';
import { User } from '../models/User.js';

export const REQUEST_PAPER_COST = 100;
export const REDOWNLOAD_COST = 5;
export const RATING_POINTS = 5;
export const INVALID_PAPER_PENALTY = 0;
export const INVALID_PDF_PENALTY = 0;

const validPaperStatuses = ['approved', 'not-downloaded', 'downloaded'];

function createEmptyPointStats() {
  return {
    uploadedPapers: 0,
    uploadedPdfs: 0,
    ratingsGiven: 0,
    rejectedPapers: 0,
    rejectedPdfs: 0,
    penaltyPoints: 0,
    requestedPapers: 0,
    uploadCreditReward: 0,
    points: 0,
  };
}

function normalizeUserIds(userIds) {
  const uniqueIds = new Map();

  for (const userId of userIds) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) continue;
    const objectId = new mongoose.Types.ObjectId(userId);
    uniqueIds.set(objectId.toString(), objectId);
  }

  return [...uniqueIds.values()];
}

function finalizePointStats(stats) {
  stats.uploadedPapers = stats.requestedPapers;
  stats.points =
    stats.uploadCreditReward +
    stats.ratingsGiven * RATING_POINTS -
    stats.rejectedPapers * INVALID_PAPER_PENALTY -
    stats.rejectedPdfs * INVALID_PDF_PENALTY -
    stats.penaltyPoints;
  return stats;
}

export async function calculateUserPointStatsBatch(userIds) {
  const objectIds = normalizeUserIds(userIds);
  const statsByUserId = new Map(objectIds.map((userId) => [userId.toString(), createEmptyPointStats()]));

  if (objectIds.length === 0) {
    return statsByUserId;
  }

  const [users, requestedPaperStats, uploadedPdfStats, ratingStats] = await Promise.all([
    User.find({ _id: { $in: objectIds } }).select('_id penaltyPoints').lean(),
    Paper.aggregate([
      { $match: { requestedBy: { $in: objectIds } } },
      {
        $group: {
          _id: '$requestedBy',
          requestedPapers: {
            $sum: { $cond: [{ $in: ['$status', validPaperStatuses] }, 1, 0] },
          },
          rejectedPapers: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
          },
        },
      },
    ]),
    Paper.aggregate([
      {
        $match: {
          uploadedBy: { $in: objectIds },
          status: { $in: ['downloaded', 'rejected'] },
          pdfPath: { $exists: true, $ne: '' },
        },
      },
      {
        $group: {
          _id: '$uploadedBy',
          uploadedPdfs: {
            $sum: { $cond: [{ $eq: ['$status', 'downloaded'] }, 1, 0] },
          },
          rejectedPdfs: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
          },
          uploadCreditReward: {
            $sum: { $cond: [{ $eq: ['$status', 'downloaded'] }, { $ifNull: ['$uploadCreditReward', 0] }, 0] },
          },
        },
      },
    ]),
    Rating.aggregate([
      { $match: { user: { $in: objectIds } } },
      { $group: { _id: { user: '$user', paper: '$paper' } } },
      {
        $lookup: {
          from: Paper.collection.name,
          localField: '_id.paper',
          foreignField: '_id',
          as: 'paper',
        },
      },
      { $match: { 'paper.0': { $exists: true } } },
      { $group: { _id: '$_id.user', ratingsGiven: { $sum: 1 } } },
    ]),
  ]);

  for (const user of users) {
    statsByUserId.get(user._id.toString()).penaltyPoints = user.penaltyPoints || 0;
  }

  for (const stats of requestedPaperStats) {
    Object.assign(statsByUserId.get(stats._id.toString()), {
      requestedPapers: stats.requestedPapers,
      rejectedPapers: stats.rejectedPapers,
    });
  }

  for (const stats of uploadedPdfStats) {
    Object.assign(statsByUserId.get(stats._id.toString()), {
      uploadedPdfs: stats.uploadedPdfs,
      rejectedPdfs: stats.rejectedPdfs,
      uploadCreditReward: stats.uploadCreditReward,
    });
  }

  for (const stats of ratingStats) {
    statsByUserId.get(stats._id.toString()).ratingsGiven = stats.ratingsGiven;
  }

  for (const stats of statsByUserId.values()) {
    finalizePointStats(stats);
  }

  return statsByUserId;
}

export async function calculateUserPointStats(userId) {
  const statsByUserId = await calculateUserPointStatsBatch([userId]);
  return statsByUserId.get(userId.toString()) || createEmptyPointStats();
}

export async function syncUserPoints(userId) {
  const stats = await calculateUserPointStats(userId);

  await User.findByIdAndUpdate(userId, { points: stats.points }, { runValidators: true });

  return stats;
}

export async function recordInvalidPdfUpload(userId) {
  await User.findByIdAndUpdate(userId, { $inc: { penaltyPoints: INVALID_PDF_PENALTY } });
  return syncUserPoints(userId);
}

export async function chargePaperRequestCredit(userId) {
  await User.findByIdAndUpdate(userId, { $inc: { credits: -REQUEST_PAPER_COST } });
}

export async function refundPaperRequestCredit(userId) {
  await User.findByIdAndUpdate(userId, { $inc: { credits: REQUEST_PAPER_COST } });
}

export async function rewardPaperUploadCredit(userId, reward) {
  if (!userId || !reward) return;
  await User.findByIdAndUpdate(userId, { $inc: { credits: reward } });
}

export async function chargePaperDownloadCredit({ userId, paper }) {
  if (!userId || !paper) return { cost: 0, isRepeatDownload: false };

  const existingDownload = await PaperDownload.findOne({ user: userId, paper: paper._id });
  const cost = existingDownload ? REDOWNLOAD_COST : paper.downloadCost || 0;

  if (cost > 0) {
    await User.findByIdAndUpdate(userId, { $inc: { credits: -cost } });
  }

  if (!existingDownload) {
    await PaperDownload.create({ user: userId, paper: paper._id, cost });
  }

  return { cost, isRepeatDownload: Boolean(existingDownload) };
}
