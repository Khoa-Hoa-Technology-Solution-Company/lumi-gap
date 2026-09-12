import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBookmarkRequest } from "@trend/shared-types";
import { bookmarksApi } from "../api/bookmarks.api";

export function useBookmarks() {
  return useQuery({
    queryKey: ["bookmarks"],
    queryFn: () => bookmarksApi.list(),
  });
}

export function useCreateBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBookmarkRequest) => bookmarksApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["bookmark-status"] });
    },
  });
}

export function useDeleteBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bookmarksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["bookmark-status"] });
    },
  });
}

export function useUpdateBookmarkNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => bookmarksApi.updateNote(id, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });
}

export function useBookmarkStatus(targetKind: "paper" | "report", targetId?: string) {
  return useQuery({
    queryKey: ["bookmark-status", targetKind, targetId],
    queryFn: () => bookmarksApi.checkStatus(targetKind, targetId!),
    enabled: !!targetId,
  });
}
