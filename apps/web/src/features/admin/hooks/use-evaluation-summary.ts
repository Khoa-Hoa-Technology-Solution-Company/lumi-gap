import { useQuery } from "@tanstack/react-query";
import { getEvaluationSummary } from "../api/evaluation.api";

export function useEvaluationSummary(enabled = true) {
  return useQuery({
    queryKey: ["admin", "evaluation-summary"],
    queryFn: getEvaluationSummary,
    enabled,
    staleTime: 60_000,
  });
}
