import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateReportRequest, PreviewReportEvidenceRequest } from "@trend/shared-types";
import { reportsApi } from "../api/reports.api";

export function useReports(projectId?: string, paperId?: string) {
  return useQuery({
    queryKey: ["reports", { projectId, paperId }],
    queryFn: () => reportsApi.list({ projectId, paperId }),
    refetchInterval: (query) => {
      const hasPending = query.state?.data?.some(
        (r) => r.status === "queued" || r.status === "generating"
      );
      return hasPending ? 3000 : false;
    },
  });
}

export function useReport(id: string) {
  return useQuery({
    queryKey: ["report", id],
    queryFn: () => reportsApi.detail(id),
    enabled: !!id,
    refetchInterval: (query) => {
      // Refresh every 3 seconds if the report is still generating or queued
      const status = query.state?.data?.status;
      if (status === "queued" || status === "generating") {
        return 3000;
      }
      return false;
    },
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateReportRequest) => reportsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });
}

export function useReportEvidencePreview() {
  return useMutation({
    mutationFn: (payload: PreviewReportEvidenceRequest) => reportsApi.previewEvidence(payload),
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reportsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDeleteBatchReports() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => reportsApi.deleteBatch(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
