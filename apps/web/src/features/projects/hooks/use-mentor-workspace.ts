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
  const result = useQuery({
    queryKey: ["mentor-workspace", actor, params],
    queryFn: () => mentorWorkspaceApi.read(params),
    enabled: Boolean(actor && enabled),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const debouncing = query.q !== q || query.projectSearch !== projectSearch;
  return {
    ...result,
    isFetching: result.isFetching || debouncing,
  };
}
