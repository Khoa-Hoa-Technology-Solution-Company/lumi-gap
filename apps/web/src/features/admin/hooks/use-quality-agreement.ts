import { useQuery } from "@tanstack/react-query";
import type { AgreementStats } from "@trend/shared-types";
import { api } from "@/services/api-client";

/** Admin: LLM-vs-human rating agreement (MAE / within-1 / Pearson), overall + by kind. */
export function useQualityAgreement(enabled = true) {
  return useQuery({
    queryKey: ["admin", "quality-agreement"],
    queryFn: async (): Promise<AgreementStats> => {
      const res = await api.get("/quality/agreement");
      return res.data.data as AgreementStats;
    },
    enabled,
  });
}
