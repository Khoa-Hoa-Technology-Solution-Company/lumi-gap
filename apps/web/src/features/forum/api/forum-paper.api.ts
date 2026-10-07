import { api } from "@/services/api-client";

export type ForumResolvedPaper = { paperId?: string; doi: string; title: string; authors: string[]; publicationYear: number; venue?: string; canAttach: boolean };
export type ForumPaperSearchResult = Omit<ForumResolvedPaper, "doi"> & { openalexId: string; doi?: string };
export const forumPaperApi = {
  async search(q: string, signal?: AbortSignal): Promise<ForumPaperSearchResult[]> { return (await api.get<{ data: ForumPaperSearchResult[] }>("/forum/papers/search", { params: { q }, signal })).data.data; },
  async attachOpenAlex(openalexId: string): Promise<ForumPaperSearchResult & { paperId: string }> {
    const paper = (await api.post<{ data: ForumPaperSearchResult }>("/forum/papers/openalex/attach", { openalexId })).data.data;
    if (!paper.paperId) throw new Error("Missing paper identifier");
    return paper as ForumPaperSearchResult & { paperId: string };
  },
  async preview(doi: string): Promise<ForumResolvedPaper> { return (await api.post<{ data: ForumResolvedPaper }>("/forum/papers/doi/preview", { doi })).data.data; },
  async attach(doi: string): Promise<ForumResolvedPaper & { paperId: string }> {
    const paper = (await api.post<{ data: ForumResolvedPaper }>("/forum/papers/doi/attach", { doi })).data.data;
    if (!paper.paperId) throw new Error("Missing paper identifier");
    return paper as ForumResolvedPaper & { paperId: string };
  },
};
