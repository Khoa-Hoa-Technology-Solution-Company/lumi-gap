import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  taxonomyApi,
  type KeywordListParams,
  type NodeListParams,
  type UpdateKeywordInput,
  type UpdateNodeInput,
} from "../api/catalog.api";

export const taxonomyKeys = {
  all: ["admin", "taxonomy"] as const,
  stats: ["admin", "taxonomy", "stats"] as const,
  nodes: (params: NodeListParams) => ["admin", "taxonomy", "nodes", params] as const,
  node: (id?: string) => ["admin", "taxonomy", "node", id] as const,
  keywords: (params: KeywordListParams) => ["admin", "taxonomy", "keywords", params] as const,
};

export function useTaxonomyStats() {
  return useQuery({ queryKey: taxonomyKeys.stats, queryFn: taxonomyApi.stats });
}

export function useTaxonomyNodes(params: NodeListParams, enabled = true) {
  return useQuery({
    queryKey: taxonomyKeys.nodes(params),
    queryFn: () => taxonomyApi.listNodes(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTaxonomyNode(id?: string) {
  return useQuery({
    queryKey: taxonomyKeys.node(id),
    queryFn: () => taxonomyApi.getNode(id!),
    enabled: Boolean(id),
  });
}

export function useUpdateTaxonomyNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNodeInput }) => taxonomyApi.updateNode(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: taxonomyKeys.all }),
  });
}

export function useCatalogKeywords(params: KeywordListParams, enabled = true) {
  return useQuery({
    queryKey: taxonomyKeys.keywords(params),
    queryFn: () => taxonomyApi.listKeywords(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useUpdateCatalogKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateKeywordInput }) => taxonomyApi.updateKeyword(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: taxonomyKeys.all }),
  });
}

export function useMergeCatalogKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetId }: { id: string; targetId: string }) => taxonomyApi.mergeKeyword(id, targetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: taxonomyKeys.all }),
  });
}
