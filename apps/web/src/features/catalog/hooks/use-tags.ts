import { useCallback, useEffect, useRef } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TagRuleInput } from "@trend/shared-types";
import {
  tagsApi,
  type CreateTagInput,
  type TagListParams,
  type TagPapersParams,
  type UpdateTagInput,
} from "../api/catalog.api";

export const tagKeys = {
  all: ["admin", "tags"] as const,
  list: (params: TagListParams) => ["admin", "tags", "list", params] as const,
  detail: (id?: string) => ["admin", "tags", "detail", id] as const,
  preview: (id?: string) => ["admin", "tags", "preview", id] as const,
  papers: (id: string | undefined, params: TagPapersParams) => ["admin", "tags", "papers", id, params] as const,
};

export function useAdminTags(params: TagListParams) {
  return useQuery({
    queryKey: tagKeys.list(params),
    queryFn: () => tagsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTag(id?: string) {
  return useQuery({
    queryKey: tagKeys.detail(id),
    queryFn: () => tagsApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useTagPreview(id?: string) {
  return useQuery({
    queryKey: tagKeys.preview(id),
    queryFn: () => tagsApi.preview(id!),
    enabled: Boolean(id),
  });
}

export function useTagPapers(id: string | undefined, params: TagPapersParams) {
  return useQuery({
    queryKey: tagKeys.papers(id, params),
    queryFn: () => tagsApi.papers(id!, params),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

/** Tag state (paper counts, previews, member papers) changes after the background re-tagging job. */
function useInvalidateTags() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: tagKeys.all });
}

export function useCreateTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (input: CreateTagInput) => tagsApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTagInput }) => tagsApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useReplaceTagRules() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, rules }: { id: string; rules: TagRuleInput[] }) => tagsApi.replaceRules(id, rules),
    onSuccess: invalidate,
  });
}

export function useArchiveTag() {
  const invalidate = useInvalidateTags();
  return useMutation({ mutationFn: (id: string) => tagsApi.archive(id), onSuccess: invalidate });
}

export function useApplyTag() {
  const invalidate = useInvalidateTags();
  return useMutation({ mutationFn: (id: string) => tagsApi.apply(id), onSuccess: invalidate });
}

export function useApplyAllTags() {
  const invalidate = useInvalidateTags();
  return useMutation({ mutationFn: () => tagsApi.applyAll(), onSuccess: invalidate });
}

export function useAddTagPapers() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, paperIds }: { id: string; paperIds: string[] }) => tagsApi.addPapers(id, paperIds),
    onSuccess: invalidate,
  });
}

export function useRemoveTagPaper() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, paperId }: { id: string; paperId: string }) => tagsApi.removePaper(id, paperId),
    onSuccess: invalidate,
  });
}

export function useUnblockTagPaper() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: ({ id, paperId }: { id: string; paperId: string }) => tagsApi.unblockPaper(id, paperId),
    onSuccess: invalidate,
  });
}

/**
 * Creating a tag, replacing rules or changing status re-tags papers in a background worker.
 * `schedule()` refetches every tag query once the worker has had a moment to finish.
 */
export function useDelayedTagRefresh(delayMs = 3000) {
  const qc = useQueryClient();
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  return useCallback(() => {
    timers.current.push(window.setTimeout(() => { void qc.invalidateQueries({ queryKey: tagKeys.all }); }, delayMs));
  }, [qc, delayMs]);
}
