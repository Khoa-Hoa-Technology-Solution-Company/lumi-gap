import { useQuery } from "@tanstack/react-query";
import { getPipelineStatus } from "../api/pipeline.api";

export function usePipelineStatus(enabled = true) {
  return useQuery({
    queryKey: ["admin", "pipeline-status"],
    queryFn: getPipelineStatus,
    enabled,
    refetchInterval: 10000, // Poll every 10 seconds
    refetchIntervalInBackground: false, // Pause polling when tab is out of focus
  });
}
