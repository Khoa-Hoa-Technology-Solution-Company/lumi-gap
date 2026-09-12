import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bookmarksApi } from "../api/bookmarks.api";
import type { CreateBookmarkRequest } from "@trend/shared-types";

export function useBookmarks(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["bookmarks"],
    queryFn: () => bookmarksApi.list(),
    ...options,
  });
}

export function useBookmarkStatus(
  targetKind: "paper" | "report",
  targetId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["bookmark-status", targetKind, targetId],
    queryFn: () => bookmarksApi.checkStatus(targetKind, targetId!),
    enabled: !!targetId && (options?.enabled ?? true),
  });
}

export function useCreateBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBookmarkRequest) => bookmarksApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({
        queryKey: ["bookmark-status", data.targetKind, data.targetId],
      });
    },
  });
}

export function useDeleteBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, targetKind, targetId }: { id: string; targetKind: "paper" | "report"; targetId: string }) =>
      bookmarksApi.delete(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({
        queryKey: ["bookmark-status", variables.targetKind, variables.targetId],
      });
    },
  });
}

export function useUpdateBookmarkNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => bookmarksApi.updateNote(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}
