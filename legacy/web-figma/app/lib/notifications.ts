import { apiRequest } from './api';

type NotificationActor = {
  _id: string;
  fullName: string;
  role: 'user' | 'admin';
};

type NotificationPaper = {
  _id: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected' | 'downloaded' | 'not-downloaded' | 'pending-requester-acceptance';
};

export type AppNotification = {
  _id: string;
  actor: NotificationActor;
  paper?: NotificationPaper;
  type:
    | 'paper_submitted'
    | 'paper_pdf_uploaded'
    | 'paper_rated'
    | 'paper_rating_updated'
    | 'paper_rating_deleted'
    | 'paper_approved'
    | 'paper_commented'
    | 'paper_comment_replied'
    | 'paper_comment_liked'
    | 'system_announcement';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export async function getMyNotifications(limit = 8) {
  return apiRequest<{ notifications: AppNotification[]; unreadCount: number }>(
    `/notifications?limit=${limit}`,
    { auth: true }
  );
}

export async function markNotificationAsRead(notificationId: string) {
  return apiRequest<{ notification: AppNotification }>(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
    auth: true,
  });
}

export async function markAllNotificationsAsRead() {
  return apiRequest<{ updatedCount: number }>('/notifications/read-all', {
    method: 'POST',
    auth: true,
  });
}

export async function postSystemAnnouncement(payload: { title: string; message: string }) {
  return apiRequest<{ createdCount: number }>('/notifications/announcements', {
    method: 'POST',
    auth: true,
    body: payload,
  });
}
