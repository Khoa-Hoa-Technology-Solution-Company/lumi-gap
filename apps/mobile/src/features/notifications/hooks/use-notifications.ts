import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, type RegisterDeviceTokenRequest } from "../api/notifications.api";

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list(),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useRegisterDeviceToken() {
  return useMutation({
    mutationFn: (payload: RegisterDeviceTokenRequest) => notificationsApi.registerDeviceToken(payload),
  });
}
