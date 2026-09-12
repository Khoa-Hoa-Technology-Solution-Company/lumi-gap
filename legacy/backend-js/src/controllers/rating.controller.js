import mongoose from 'mongoose';
import { Paper } from '../models/Paper.js';
import { PaperComment } from '../models/PaperComment.js';
import { Rating } from '../models/Rating.js';
import { syncUserPoints } from '../utils/points.js';
import {
  notifyAdminsPaperRated,
  notifyAdminsPaperRatingDeleted,
  notifyAdminsPaperRatingUpdated,
  notifyPaperCommentLiked,
  notifyPaperCommentReplied,
  notifyPaperContributorsCommented,
} from '../utils/notification.js';

const reviewablePaperStatuses = ['approved', 'downloaded', 'not-downloaded'];

function isInvalidId(id) {
  return !mongoose.Types.ObjectId.isValid(id);
}

function isReviewablePaper(paper) {
  return Boolean(paper && reviewablePaperStatuses.includes(paper.status));
}

function sendPaperNotReviewable(res) {
  return res.status(404).json({ message: 'Paper is not available for ratings and comments' });
}

function normalizeRating(value) {
  const rating = Number(value);
  return Number.isInteger(rating) ? rating : NaN;
}

async function refreshPaperRatingStats(paperId) {
  const stats = await Rating.aggregate([
    { $match: { paper: new mongoose.Types.ObjectId(paperId) } },
    {
      $group: {
        _id: '$paper',
        averageRating: { $avg: '$rating' },
        totalRatings: { $sum: 1 },
      },
    },
  ]);

  const nextStats = stats[0] || { averageRating: 0, totalRatings: 0 };

  await Paper.findByIdAndUpdate(paperId, {
    averageRating: Number(nextStats.averageRating.toFixed?.(1) || 0),
    totalRatings: nextStats.totalRatings,
  });
}

async function migrateLegacyRatingComments(paperId) {
  const legacyRatings = await Rating.find({ paper: paperId, comment: { $ne: '' } });

  for (const rating of legacyRatings) {
    await PaperComment.updateOne(
      { sourceRating: rating._id },
      {
        $setOnInsert: {
          paper: rating.paper,
          user: rating.user,
          sourceRating: rating._id,
          comment: rating.comment,
          createdAt: rating.createdAt,
        },
      },
      { upsert: true }
    );
  }
}

async function notifyPaperCommentRecipients({ paper, commenter, comment }) {
  if (!comment.trim()) {
    return;
  }

  try {
    await notifyPaperContributorsCommented({
      paperId: paper._id,
      paperTitle: paper.title,
      commenterName: commenter.fullName,
      actorId: commenter._id,
      recipientIds: [paper.requestedBy, paper.uploadedBy],
    });
  } catch (error) {
    console.error('Failed to create user notification for paper comment:', error);
  }
}

function serializeComment(comment, currentUserId) {
  const likedBy = (comment.likedBy || []).map((userId) => userId.toString());

  return {
    _id: comment._id,
    paper: comment.paper,
    parentComment: comment.parentComment || null,
    user: comment.user,
    comment: comment.comment,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    likeCount: likedBy.length,
    isLikedByCurrentUser: currentUserId ? likedBy.includes(currentUserId.toString()) : false,
  };
}

function buildCommentThread(comments, legacyComments, currentUserId) {
  const serializedComments = comments.map((comment) => ({
    ...serializeComment(comment, currentUserId),
    replies: [],
  }));
  const commentMap = new Map(serializedComments.map((comment) => [comment._id.toString(), comment]));
  const topLevelComments = [];

  for (const comment of serializedComments) {
    const parentId = comment.parentComment?.toString();
    const parent = parentId ? commentMap.get(parentId) : null;

    if (parent) {
      parent.replies.push(comment);
    } else {
      topLevelComments.push(comment);
    }
  }

  for (const comment of topLevelComments) {
    comment.replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  return [...topLevelComments, ...legacyComments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function createRating(req, res) {
  const { rating, comment = '' } = req.body;
  const { paperId } = req.params;
  const normalizedComment = String(comment).trim();

  if (isInvalidId(paperId)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const normalizedRating = normalizeRating(rating);
  if (normalizedRating < 1 || normalizedRating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  const paper = await Paper.findById(paperId);
  if (!paper) {
    return res.status(404).json({ message: 'Paper not found' });
  }
  if (!isReviewablePaper(paper)) {
    return sendPaperNotReviewable(res);
  }

  if (normalizedComment.length > 500) {
    return res.status(400).json({ message: 'Comment must be 500 characters or fewer' });
  }

  const existingRating = await Rating.findOne({ paper: paperId, user: req.user._id });
  if (existingRating) {
    return res.status(409).json({ message: 'You have already rated this paper', ratingId: existingRating._id });
  }

  const createdRating = await Rating.create({
    paper: paperId,
    user: req.user._id,
    rating: normalizedRating,
  });

  let createdComment = null;
  if (normalizedComment) {
    createdComment = await PaperComment.create({
      paper: paperId,
      user: req.user._id,
      comment: normalizedComment,
    });
  }

  await refreshPaperRatingStats(paperId);
  await syncUserPoints(req.user._id);
  await notifyPaperCommentRecipients({
    paper,
    commenter: req.user,
    comment: normalizedComment,
  });

  if (req.user.role === 'user') {
    try {
      await notifyAdminsPaperRated({
        paperId: paper._id,
        paperTitle: paper.title,
        raterName: req.user.fullName,
        actorId: req.user._id,
        rating: normalizedRating,
      });
    } catch (error) {
      console.error('Failed to create admin notification for paper rating:', error);
    }
  }

  const populatedRating = await Rating.findById(createdRating._id).populate('user', 'fullName university role');
  const populatedComment = createdComment
    ? await PaperComment.findById(createdComment._id).populate('user', 'fullName university role')
    : null;

  res.status(201).json({ rating: populatedRating, comment: populatedComment });
}

export async function getPaperRatings(req, res) {
  const { paperId } = req.params;

  if (isInvalidId(paperId)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findById(paperId).select('status');
  if (!paper) {
    return res.status(404).json({ message: 'Paper not found' });
  }
  if (!isReviewablePaper(paper)) {
    return sendPaperNotReviewable(res);
  }

  const ratings = await Rating.find({ paper: paperId })
    .populate('user', 'fullName university role')
    .sort({ createdAt: -1 });

  res.json({ ratings });
}

export async function getRatingById(req, res) {
  if (isInvalidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid rating id' });
  }

  const rating = await Rating.findById(req.params.id)
    .populate('user', 'fullName university role')
    .populate('paper', 'title doi status');

  if (!rating) {
    return res.status(404).json({ message: 'Rating not found' });
  }
  if (!isReviewablePaper(rating.paper)) {
    return sendPaperNotReviewable(res);
  }

  res.json({ rating });
}

export async function updateRating(req, res) {
  const { rating } = req.body;

  if (isInvalidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid rating id' });
  }

  const existingRating = await Rating.findById(req.params.id);
  if (!existingRating) {
    return res.status(404).json({ message: 'Rating not found' });
  }

  const paper = await Paper.findById(existingRating.paper).select('status');
  if (!isReviewablePaper(paper)) {
    return sendPaperNotReviewable(res);
  }

  if (existingRating.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You do not have permission to update this rating' });
  }

  if (rating !== undefined) {
    const normalizedRating = normalizeRating(rating);
    if (normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }
    existingRating.rating = normalizedRating;
  }

  await existingRating.save();
  await refreshPaperRatingStats(existingRating.paper);

  if (req.user.role === 'user') {
    try {
      const paper = await Paper.findById(existingRating.paper).select('title requestedBy uploadedBy');
      await notifyAdminsPaperRatingUpdated({
        paperId: existingRating.paper,
        paperTitle: paper?.title || 'Unknown paper',
        raterName: req.user.fullName,
        actorId: req.user._id,
      });

    } catch (error) {
      console.error('Failed to create admin notification for rating update:', error);
    }
  }

  const updatedRating = await Rating.findById(existingRating._id).populate('user', 'fullName university role');

  res.json({ rating: updatedRating });
}

export async function getPaperComments(req, res) {
  const { paperId } = req.params;

  if (isInvalidId(paperId)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  const paper = await Paper.findById(paperId).select('status');
  if (!paper) {
    return res.status(404).json({ message: 'Paper not found' });
  }
  if (!isReviewablePaper(paper)) {
    return sendPaperNotReviewable(res);
  }

  await migrateLegacyRatingComments(paperId);

  const comments = await PaperComment.find({ paper: paperId })
    .populate('user', 'fullName university role')
    .sort({ createdAt: -1 });

  res.json({ comments: buildCommentThread(comments, [], req.user?._id) });
}

export async function createPaperComment(req, res) {
  const { paperId } = req.params;
  const normalizedComment = String(req.body.comment || '').trim();
  const parentCommentId = req.body.parentCommentId || null;

  if (isInvalidId(paperId)) {
    return res.status(400).json({ message: 'Invalid paper id' });
  }

  if (parentCommentId && isInvalidId(parentCommentId)) {
    return res.status(400).json({ message: 'Invalid parent comment id' });
  }

  if (!normalizedComment) {
    return res.status(400).json({ message: 'Comment is required' });
  }

  if (normalizedComment.length > 500) {
    return res.status(400).json({ message: 'Comment must be 500 characters or fewer' });
  }

  const paper = await Paper.findById(paperId).select('title requestedBy uploadedBy status');
  if (!paper) {
    return res.status(404).json({ message: 'Paper not found' });
  }
  if (!isReviewablePaper(paper)) {
    return sendPaperNotReviewable(res);
  }

  let parentComment = null;
  if (parentCommentId) {
    parentComment = await PaperComment.findOne({ _id: parentCommentId, paper: paperId });
    if (!parentComment) {
      return res.status(404).json({ message: 'Parent comment not found' });
    }

    if (parentComment.parentComment) {
      return res.status(400).json({ message: 'Replies can only be added to top-level comments' });
    }
  }

  const createdComment = await PaperComment.create({
    paper: paperId,
    user: req.user._id,
    parentComment: parentComment?._id || null,
    comment: normalizedComment,
  });

  await notifyPaperCommentRecipients({
    paper,
    commenter: req.user,
    comment: normalizedComment,
  });

  if (parentComment) {
    try {
      await notifyPaperCommentReplied({
        paperId: paper._id,
        paperTitle: paper.title,
        replierName: req.user.fullName,
        actorId: req.user._id,
        commentOwnerId: parentComment.user,
      });
    } catch (error) {
      console.error('Failed to create user notification for paper comment reply:', error);
    }
  }

  const populatedComment = await PaperComment.findById(createdComment._id).populate('user', 'fullName university role');

  res.status(201).json({ comment: serializeComment(populatedComment, req.user._id) });
}

export async function togglePaperCommentLike(req, res) {
  if (isInvalidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid comment id' });
  }

  const comment = await PaperComment.findById(req.params.id).populate('user', 'fullName university role');
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }

  const paper = await Paper.findById(comment.paper).select('title status');
  if (!isReviewablePaper(paper)) {
    return sendPaperNotReviewable(res);
  }

  const userId = req.user._id.toString();
  const likedBy = comment.likedBy.map((likedUserId) => likedUserId.toString());
  let wasLiked = false;

  if (likedBy.includes(userId)) {
    comment.likedBy = comment.likedBy.filter((likedUserId) => likedUserId.toString() !== userId);
  } else {
    comment.likedBy.push(req.user._id);
    wasLiked = true;
  }

  await comment.save();

  if (wasLiked) {
    try {
      await notifyPaperCommentLiked({
        paperId: comment.paper,
        paperTitle: paper?.title || 'Unknown paper',
        likerName: req.user.fullName,
        actorId: req.user._id,
        commentOwnerId: comment.user?._id || comment.user,
      });
    } catch (error) {
      console.error('Failed to create user notification for paper comment like:', error);
    }
  }

  res.json({ comment: serializeComment(comment, req.user._id) });
}

export async function deletePaperComment(req, res) {
  if (isInvalidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid comment id' });
  }

  const comment = await PaperComment.findById(req.params.id);
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }

  if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You do not have permission to delete this comment' });
  }

  await PaperComment.deleteMany({ $or: [{ _id: comment._id }, { parentComment: comment._id }] });

  res.json({ message: 'Comment deleted successfully', commentId: comment._id });
}

export async function deleteRating(req, res) {
  if (isInvalidId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid rating id' });
  }

  const rating = await Rating.findById(req.params.id);
  if (!rating) {
    return res.status(404).json({ message: 'Rating not found' });
  }

  if (rating.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You do not have permission to delete this rating' });
  }

  const paperId = rating.paper;
  const userId = rating.user;
  const paper = await Paper.findById(paperId).select('title');
  await Rating.findByIdAndDelete(rating._id);
  await refreshPaperRatingStats(paperId);
  await syncUserPoints(userId);

  if (req.user.role === 'user') {
    try {
      await notifyAdminsPaperRatingDeleted({
        paperId,
        paperTitle: paper?.title || 'Unknown paper',
        raterName: req.user.fullName,
        actorId: req.user._id,
      });
    } catch (error) {
      console.error('Failed to create admin notification for rating deletion:', error);
    }
  }

  res.json({ message: 'Rating deleted successfully', ratingId: rating._id });
}
