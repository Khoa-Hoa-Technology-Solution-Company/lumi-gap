import { api } from "@/services/api-client";
import type { ForumCategoryInput, ForumCategoryView } from "./forum.api";

export const forumCategoryApi = {
  async list(all = false): Promise<ForumCategoryView[]> { return (await api.get("/forum/categories", { params: all ? { all: "true" } : undefined })).data.data; },
  async create(input: ForumCategoryInput): Promise<ForumCategoryView> { return (await api.post("/forum/categories", input)).data.data; },
  async update(id: string, input: Partial<ForumCategoryInput> & { status?: "ACTIVE" | "ARCHIVED" }): Promise<ForumCategoryView> { return (await api.patch(`/forum/categories/${encodeURIComponent(id)}`, input)).data.data; },
  async moderators(id: string): Promise<Array<{ userId: string; fullName: string; assignedAt?: string }>> { return (await api.get(`/forum/categories/${encodeURIComponent(id)}/moderators`)).data.data; },
  async assignModerator(id: string, userId: string, assigned: boolean) { const url = `/forum/categories/${encodeURIComponent(id)}/moderators/${encodeURIComponent(userId)}`; if (assigned) await api.put(url); else await api.delete(url); },
  async tags(): Promise<Array<{ name: string; slug: string }>> { return (await api.get("/forum/tags")).data.data; },
};
