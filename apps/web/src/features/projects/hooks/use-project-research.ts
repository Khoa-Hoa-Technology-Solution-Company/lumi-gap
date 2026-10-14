import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
export function useResearchResource<T>(id: string, key: readonly unknown[], load: () => Promise<T>, enabled = true) {
  const actorId = useAuthStore(state => state.user?.id);
  return useQuery({ queryKey: ["project-research", actorId, id, ...key], queryFn: load, enabled: Boolean(actorId && id && enabled) });
}
export function useResearchCommand(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ["project-research"] }), client.invalidateQueries({ queryKey: ["project", id] }), client.invalidateQueries({ queryKey: ["project-workspace"] }), client.invalidateQueries({ queryKey: ["gaps"] })]);
  } });
}
