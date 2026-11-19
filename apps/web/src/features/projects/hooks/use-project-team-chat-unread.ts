import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProjectTeamChatMessage } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { projectTeamChatApi } from "../api/project-team-chat.api";

export function useProjectTeamChatUnread(projectId?: string) {
  const currentUser = useAuthStore((s) => s.user);
  const userId = currentUser?.id;

  const queryKey = useMemo(
    () => ["project-team-chat", projectId, userId] as const,
    [projectId, userId]
  );

  const query = useQuery({
    queryKey,
    queryFn: () => (projectId ? projectTeamChatApi.listMessages(projectId, { limit: 50 }) : Promise.resolve([])),
    enabled: Boolean(projectId && userId),
    staleTime: 10000,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const messages = query.data ?? [];

  const unreadCount = useMemo(() => {
    if (!userId || !messages.length) return 0;
    return messages.filter(
      (m: ProjectTeamChatMessage) =>
        !m.isDeleted &&
        m.sender?.id !== userId &&
        !m.readBy?.some((r) => r.id === userId)
    ).length;
  }, [messages, userId]);

  return {
    unreadCount,
    hasUnread: unreadCount > 0,
    isLoading: query.isLoading,
  };
}
