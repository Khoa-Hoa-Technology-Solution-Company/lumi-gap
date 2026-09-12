import { useMutation, useQuery } from "@tanstack/react-query";
import { papersApi, type PapersListParams } from "../api/papers.api";

export function usePapers(params: PapersListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["papers", params],
    queryFn: () => papersApi.list(params),
    enabled: options?.enabled ?? true,
  });
}

export function usePaper(id: string | undefined) {
  return useQuery({
    queryKey: ["paper", id],
    queryFn: () => papersApi.detail(id!),
    enabled: !!id,
  });
}

export function usePaperReferences(id: string | undefined) {
  return useQuery({
    queryKey: ["paperReferences", id],
    queryFn: () => papersApi.references(id!),
    enabled: !!id,
  });
}

export function usePaperRelatedWorks(id: string | undefined) {
  return useQuery({
    queryKey: ["paperRelatedWorks", id],
    queryFn: () => papersApi.related(id!),
    enabled: !!id,
  });
}

export function useTranslatePaper(id: string | undefined) {
  return useMutation({
    mutationFn: (targetLanguage: string) => papersApi.translate(id!, targetLanguage),
  });
}

export function usePaperTranslationCapabilities() {
  return useQuery({
    queryKey: ["paperTranslationCapabilities"],
    queryFn: () => papersApi.translationCapabilities(),
    staleTime: 5 * 60 * 1000,
  });
}
