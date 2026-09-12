import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { papersApi, type PaperSubmitFile, type PapersListParams, type SubmitPaperInput } from "../api/papers.api";

export function usePapers(params: PapersListParams) {
  return useQuery({
    queryKey: ["papers", params],
    queryFn: () => papersApi.list(params),
  });
}

export function useInfinitePapers(params: Omit<PapersListParams, 'page'>) {
  return useInfiniteQuery({
    queryKey: ["papers", "infinite", params],
    queryFn: ({ pageParam = 1 }) => papersApi.list({ ...params, page: pageParam }),
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.page < lastPage.meta.totalPages) {
        return lastPage.meta.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });
}

export function usePaper(id: string | undefined) {
  return useQuery({
    queryKey: ["paper", id],
    queryFn: () => papersApi.detail(id!),
    enabled: !!id,
  });
}

export function usePaperReferences(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["paper", id, "references"],
    queryFn: () => papersApi.references(id!),
    enabled: !!id && enabled,
  });
}

export function useMyPapers() {
  return useQuery({
    queryKey: ["papers", "my-requests"],
    queryFn: () => papersApi.myRequests(),
  });
}

export function useCreatePaper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitPaperInput) => papersApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["papers"] });
    },
  });
}

export function useUpdatePaper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SubmitPaperInput }) => papersApi.update(id, input),
    onSuccess: (paper) => {
      void queryClient.invalidateQueries({ queryKey: ["papers"] });
      void queryClient.invalidateQueries({ queryKey: ["paper", paper.id] });
    },
  });
}

export function useUploadPaperPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: PaperSubmitFile }) => papersApi.uploadPdf(id, file),
    onSuccess: (paper) => {
      void queryClient.invalidateQueries({ queryKey: ["papers", "my-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["paper", paper.id] });
    },
  });
}

export function useAcceptPaperPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => papersApi.acceptPdf(id),
    onSuccess: (paper) => {
      void queryClient.invalidateQueries({ queryKey: ["papers", "my-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["paper", paper.id] });
    },
  });
}

export function useRejectPaperPdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => papersApi.rejectPdf(id),
    onSuccess: (paper) => {
      void queryClient.invalidateQueries({ queryKey: ["papers", "my-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["paper", paper.id] });
    },
  });
}

export function useCancelPaperRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => papersApi.cancel(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["papers", "my-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["papers"] });
    },
  });
}
