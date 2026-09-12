import { API_ROUTES } from "@/constants";
import { api } from "@/services/api-client";

export type NotificationTargetKind = "paper" | "report" | "gap" | "project";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  paperId: string | null;
  targetKind: NotificationTargetKind | null;
  targetId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface RegisterDeviceTokenRequest {
  token: string;
  platform: "android" | "ios" | "web" | "unknown";
  deviceName?: string;
}

export const notificationsApi = {
  async list(): Promise<AppNotification[]> {
    const res = await api.get(API_ROUTES.notifications.list);
    return res.data.data;
  },

  async registerDeviceToken(payload: RegisterDeviceTokenRequest): Promise<void> {
    await api.post(API_ROUTES.notifications.registerDeviceToken, payload);
  },

  async markRead(id: string): Promise<void> {
    await api.patch(API_ROUTES.notifications.markRead(id));
  },

  async markAllRead(): Promise<void> {
    await api.post(API_ROUTES.notifications.markAllRead);
  },
};
