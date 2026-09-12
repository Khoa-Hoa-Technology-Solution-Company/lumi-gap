// packages/shared-types/src/notification.ts

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  paperId: string | null;
  targetKind: "paper" | "report" | "gap" | "project" | null;
  targetId: string | null;
  isRead: boolean;
  createdAt: string;
}

// Code quality reviewed and formatted
