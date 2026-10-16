import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { workspaceApi } from "../api/workspace.api";

export function useWorkspaceResource<T>(id: string, section: string, queryFn: () => Promise<T>, parameters: unknown = null, enabled = true) {
  const userId = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["project-workspace", userId, id, section, parameters], queryFn, enabled: Boolean(id && userId && enabled), staleTime: 15_000, retry: 1 });
}
export function useWorkspaceOverview(id: string, enabled = true) {
  return useWorkspaceResource(id, "overview", () => workspaceApi.overview(id), null, enabled);
}
export function useWorkspaceCommand<T = void, R = unknown>(id: string, command: (input: T) => Promise<R>) {
  const userId = useAuthStore(state => state.user?.id);
  const client = useQueryClient();
  return useMutation({ mutationFn: command, onSuccess: async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["project-workspace", userId, id] }),
      client.invalidateQueries({ queryKey: ["project-research", userId, id] }),
      client.invalidateQueries({ queryKey: ["project", id] }),
      client.invalidateQueries({ queryKey: ["projects"] }),
    ]);
  } });
}
