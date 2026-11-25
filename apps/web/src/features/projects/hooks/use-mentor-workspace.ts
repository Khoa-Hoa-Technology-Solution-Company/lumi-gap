import { useQuery } from "@tanstack/react-query";
import type { MentorWorkQuery } from "@trend/shared-types";
import { useAuthStore } from "@/stores/auth-store";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { mentorWorkspaceApi } from "../api/mentor-workspace.api";

export function useMentorWorkspace(query: MentorWorkQuery, enabled = true) {
  const actor = useAuthStore(s => s.user?.id);
  const q = useDebouncedValue(query.q, 300);
  const projectSearch = useDebouncedValue(query.projectSearch, 300);
  const params = { ...query, q, projectSearch };
  return useQuery({
    queryKey: ["mentor-workspace", actor, params], queryFn: () => mentorWorkspaceApi.read(params),
    enabled: Boolean(actor && enabled), staleTime: 10000, refetchInterval: 30000,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === actor ? previous : undefined,
    retry: false,
  });
}
