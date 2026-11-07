import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "../api/notifications.api";
import { useAuthStore } from "@/stores/auth-store";

export function useNotifications(options?: { enabled?: boolean }) {
  const actorId = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ["notifications", actorId],
    queryFn: () => notificationsApi.list(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    ...options,
    enabled: Boolean(actorId) && options?.enabled !== false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.read(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.readAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// Code quality reviewed and formatted
