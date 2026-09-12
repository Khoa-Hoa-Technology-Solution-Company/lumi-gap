import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { notifyUsersSystemAnnouncement } from '../utils/notification.js';

function toLimit(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 20;
  }

  return Math.min(Math.max(parsed, 1), 100);
}

export async function getMyNotifications(req, res) {
  const limit = toLimit(req.query.limit);
  const unreadOnly = req.query.unreadOnly === 'true';
  const filter = { recipient: req.user._id };

  if (unreadOnly) {
    filter.isRead = false;
  }

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter)
      .populate('actor', 'fullName role')
      .populate('paper', 'title status')
      .sort({ createdAt: -1 })
      .limit(limit),
    Notification.countDocuments({ recipient: req.user._id, isRead: false }),
  ]);

  res.json({ notifications, unreadCount });
}

export async function markNotificationAsRead(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid notification id' });
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { isRead: true },
    { new: true }
  )
    .populate('actor', 'fullName role')
    .populate('paper', 'title status');

  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }

  res.json({ notification });
}

export async function markAllNotificationsAsRead(req, res) {
  const result = await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { $set: { isRead: true } }
  );

  res.json({ updatedCount: result.modifiedCount });
}

export async function createSystemAnnouncement(req, res) {
  const title = String(req.body.title || '').trim();
  const message = String(req.body.message || '').trim();

  if (title.length < 3 || title.length > 120) {
    return res.status(400).json({ message: 'Announcement title must be between 3 and 120 characters' });
  }

  if (message.length < 5 || message.length > 500) {
    return res.status(400).json({ message: 'Announcement message must be between 5 and 500 characters' });
  }

  const createdCount = await notifyUsersSystemAnnouncement({
    title,
    message,
    actorId: req.user._id,
  });

  res.status(201).json({ createdCount });
}
