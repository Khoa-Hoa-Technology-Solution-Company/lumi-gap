import type { Bookmark, CreateBookmarkRequest } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export const bookmarksApi = {
  async list(): Promise<Bookmark[]> {
    const res = await api.get(API_ROUTES.bookmarks.list);
    return res.data.data;
  },

  async create(data: CreateBookmarkRequest): Promise<Bookmark> {
    const res = await api.post(API_ROUTES.bookmarks.create, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(API_ROUTES.bookmarks.delete(id));
  },

  async updateNote(id: string, note?: string): Promise<Bookmark> {
    const res = await api.patch(API_ROUTES.bookmarks.updateNote(id), { note });
    return res.data.data;
  },

  async checkStatus(targetKind: "paper" | "report", targetId: string): Promise<{ bookmarked: boolean; bookmarkId?: string }> {
    const res = await api.get(API_ROUTES.bookmarks.check, {
      params: { targetKind, targetId },
    });
    return res.data.data;
  },
};
