import type { EvaluationSummary } from "@trend/shared-types";
import { API_ROUTES } from "@/constants/api";
import { api } from "@/services/api-client";

export async function getEvaluationSummary(): Promise<EvaluationSummary> {
  const res = await api.get<{ data: EvaluationSummary }>(API_ROUTES.admin.evaluationSummary);
  return res.data.data;
}
