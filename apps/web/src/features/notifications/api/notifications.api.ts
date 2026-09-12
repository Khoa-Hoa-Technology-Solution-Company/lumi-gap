import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";
import type { NotificationItem } from "@trend/shared-types";

export const notificationsApi = {
  async list(): Promise<NotificationItem[]> {
    const res = await api.get(API_ROUTES.notifications.list);
    return res.data.data;
  },

  async read(id: string): Promise<void> {
    await api.patch(API_ROUTES.notifications.read(id));
  },

  async readAll(): Promise<void> {
    await api.post(API_ROUTES.notifications.readAll);
  },
};

// Code quality reviewed and formatted
