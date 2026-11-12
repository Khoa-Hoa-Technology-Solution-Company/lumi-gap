import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { mentorAccessApi } from "../api/mentor-access.api";

export function projectAccessDenied(error: unknown) {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 403 || status === 404;
}

export function useMentorProjectEntry(projectId: string | undefined, enabled = true) {
  const actorId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ["mentor-access", actorId, projectId, "workspace", 1],
    queryFn: () => mentorAccessApi.workspace(projectId!, 1),
    enabled: Boolean(actorId && projectId && enabled),
    retry: false,
    refetchInterval: enabled ? 5000 : false,
  });
}
