import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddCorpusPaperRequest, CreateLiteratureCorpusRequest } from "@trend/shared-types";
import { literatureApi } from "../api/literature.api";

export function useLiteratureCorpora() {
  return useQuery({ queryKey: ["literature", "corpora"], queryFn: literatureApi.list });
}

export function useLiteratureCorpus(id?: string) {
  return useQuery({ queryKey: ["literature", "corpora", id], queryFn: () => literatureApi.detail(id!), enabled: Boolean(id) });
}

export function useLiteratureEvidenceMap(id?: string) {
  return useQuery({ queryKey: ["literature", "corpora", id, "evidence-map"], queryFn: () => literatureApi.evidenceMap(id!), enabled: Boolean(id) });
}

export function useCreateLiteratureCorpus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLiteratureCorpusRequest) => literatureApi.create(input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["literature", "corpora"] }),
  });
}

export function useAddCorpusPaper(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCorpusPaperRequest) => literatureApi.addPaper(id, input),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["literature", "corpora"] });
      client.invalidateQueries({ queryKey: ["literature", "corpora", id] });
    },
  });
}

export function useRemoveCorpusPaper(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (paperId: string) => literatureApi.removePaper(id, paperId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["literature", "corpora"] });
      client.invalidateQueries({ queryKey: ["literature", "corpora", id] });
    },
  });
}
