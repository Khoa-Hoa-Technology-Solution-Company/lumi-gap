import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { emitNotificationToRole, emitNotificationToUser } from '../config/socket.js';

async function createNotificationsForUserFilter(filter, payload, emitRole) {
  const recipients = await User.find({
    ...filter,
    $or: [{ status: 'active' }, { status: { $exists: false } }],
  }).select('_id');

  if (recipients.length === 0) {
    return 0;
  }

  const docs = recipients.map((recipient) => ({
    recipient: recipient._id,
    ...payload,
  }));

  await Notification.insertMany(docs);

  const eventPayload = {
    type: payload.type,
    title: payload.title,
    paper: payload.paper,
    count: docs.length,
    createdAt: new Date().toISOString(),
  };

  for (const doc of docs) {
    emitNotificationToUser(doc.recipient, eventPayload);
  }

  if (emitRole) {
    emitNotificationToRole(emitRole, { ...eventPayload, role: emitRole });
  }

  return docs.length;
}

async function createNotificationsForUsers(userIds, payload) {
  const uniqueIds = [
    ...new Map(
      userIds
        .filter(Boolean)
        .map((userId) => [userId.toString(), userId])
    ).values(),
  ];

  if (uniqueIds.length === 0) {
    return 0;
  }

  const recipients = await User.find({
    _id: { $in: uniqueIds },
    $or: [{ status: 'active' }, { status: { $exists: false } }],
  }).select('_id');

  if (recipients.length === 0) {
    return 0;
  }

  const docs = recipients.map((recipient) => ({
    recipient: recipient._id,
    ...payload,
  }));

  await Notification.insertMany(docs);

  const eventPayload = {
    type: payload.type,
    title: payload.title,
    paper: payload.paper,
    count: docs.length,
    createdAt: new Date().toISOString(),
  };

  for (const doc of docs) {
    emitNotificationToUser(doc.recipient, eventPayload);
  }

  return docs.length;
}

export async function notifyAdminsPaperSubmitted({ paperId, paperTitle, requesterName, actorId }) {
  return createNotificationsForUserFilter(
    { role: 'admin' },
    {
      actor: actorId,
      paper: paperId,
      type: 'paper_submitted',
      title: 'New paper request submitted',
      message: `${requesterName} submitted a new paper request: ${paperTitle}`,
    },
    'admin'
  );
}

export async function notifyAdminsPaperPdfUploaded({ paperId, paperTitle, uploaderName, actorId }) {
  return createNotificationsForUserFilter(
    { role: 'admin' },
    {
      actor: actorId,
      paper: paperId,
      type: 'paper_pdf_uploaded',
      title: 'Paper PDF uploaded',
      message: `${uploaderName} uploaded a PDF for: ${paperTitle}`,
    },
    'admin'
  );
}

export async function notifyPaperRequesterPdfUploaded({ paperId, paperTitle, uploaderName, actorId, requesterId }) {
  return createNotificationsForUsers([requesterId], {
    actor: actorId,
    paper: paperId,
    type: 'paper_pdf_uploaded',
    title: 'PDF waiting for your acceptance',
    message: `${uploaderName} uploaded a PDF for your request: ${paperTitle}`,
  });
}

export async function notifyAdminsPaperRated({ paperId, paperTitle, raterName, actorId, rating }) {
  return createNotificationsForUserFilter(
    { role: 'admin' },
    {
      actor: actorId,
      paper: paperId,
      type: 'paper_rated',
      title: 'Paper rated',
      message: `${raterName} rated "${paperTitle}" ${rating}/5`,
    },
    'admin'
  );
}

export async function notifyAdminsPaperRatingUpdated({ paperId, paperTitle, raterName, actorId }) {
  return createNotificationsForUserFilter(
    { role: 'admin' },
    {
      actor: actorId,
      paper: paperId,
      type: 'paper_rating_updated',
      title: 'Paper rating updated',
      message: `${raterName} updated a rating for: ${paperTitle}`,
    },
    'admin'
  );
}

export async function notifyAdminsPaperRatingDeleted({ paperId, paperTitle, raterName, actorId }) {
  return createNotificationsForUserFilter(
    { role: 'admin' },
    {
      actor: actorId,
      paper: paperId,
      type: 'paper_rating_deleted',
      title: 'Paper rating deleted',
      message: `${raterName} deleted a rating for: ${paperTitle}`,
    },
    'admin'
  );
}

export async function notifyUsersPaperApproved({ paperId, paperTitle, requesterName, actorId }) {
  return createNotificationsForUserFilter({ role: 'user' }, {
    actor: actorId,
    paper: paperId,
    type: 'paper_approved',
    title: 'New paper available',
    message: `${requesterName} has a newly approved paper: ${paperTitle}`,
  }, 'user');
}

export async function notifyPaperContributorsCommented({
  paperId,
  paperTitle,
  commenterName,
  actorId,
  recipientIds,
}) {
  const actorKey = actorId?.toString();
  const recipients = recipientIds.filter((recipientId) => recipientId?.toString() !== actorKey);

  return createNotificationsForUsers(recipients, {
    actor: actorId,
    paper: paperId,
    type: 'paper_commented',
    title: 'New comment on your paper',
    message: `${commenterName} commented on: ${paperTitle}`,
  });
}

export async function notifyPaperCommentReplied({
  paperId,
  paperTitle,
  replierName,
  actorId,
  commentOwnerId,
}) {
  const actorKey = actorId?.toString();
  if (!commentOwnerId || commentOwnerId.toString() === actorKey) {
    return 0;
  }

  return createNotificationsForUsers([commentOwnerId], {
    actor: actorId,
    paper: paperId,
    type: 'paper_comment_replied',
    title: 'New reply to your comment',
    message: `${replierName} replied to your comment on: ${paperTitle}`,
  });
}

export async function notifyPaperCommentLiked({
  paperId,
  paperTitle,
  likerName,
  actorId,
  commentOwnerId,
}) {
  const actorKey = actorId?.toString();
  if (!commentOwnerId || commentOwnerId.toString() === actorKey) {
    return 0;
  }

  return createNotificationsForUsers([commentOwnerId], {
    actor: actorId,
    paper: paperId,
    type: 'paper_comment_liked',
    title: 'Someone liked your comment',
    message: `${likerName} liked your comment on: ${paperTitle}`,
  });
}

export async function notifyUsersSystemAnnouncement({ title, message, actorId }) {
  return createNotificationsForUserFilter(
    { role: 'user' },
    {
      actor: actorId,
      type: 'system_announcement',
      title,
      message,
    },
    'user'
  );
}
