import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type TriggerSyncInput } from "../api/admin.api";

export function useSyncRuns(enabled = true) {
  return useQuery({
    queryKey: ["admin", "sync-runs"],
    queryFn: adminApi.listRuns,
    enabled,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.runStatus === "running") ? 5000 : false,
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerSyncInput) => adminApi.triggerSync(input),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["admin", "sync-runs"] });
      }, 2000);
    },
  });
}
