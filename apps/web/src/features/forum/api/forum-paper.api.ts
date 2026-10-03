import { api } from "@/services/api-client";

export type ForumResolvedPaper = { paperId?: string; doi: string; title: string; authors: string[]; publicationYear: number; canAttach: boolean };
export const forumPaperApi = {
  async preview(doi: string): Promise<ForumResolvedPaper> { return (await api.post<{ data: ForumResolvedPaper }>("/forum/papers/doi/preview", { doi })).data.data; },
  async attach(doi: string): Promise<ForumResolvedPaper & { paperId: string }> {
    const paper = (await api.post<{ data: ForumResolvedPaper }>("/forum/papers/doi/attach", { doi })).data.data;
    if (!paper.paperId) throw new Error("Missing paper identifier");
    return paper as ForumResolvedPaper & { paperId: string };
  },
};
