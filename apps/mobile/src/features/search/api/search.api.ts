import type { ScoredPaper } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export type { ScoredPaper } from "@trend/shared-types";

export interface SearchParams {
  q: string;
  page?: number;
  pageSize?: number;
  /** Opt-in LLM re-ranking — each result then carries `rerankScore`. */
  rerank?: boolean;
}

export const searchApi = {
  /** Semantic search (Phase B) — GET /api/v1/search. */
  async semantic(params: SearchParams) {
    const res = await api.get(API_ROUTES.search.semantic, { params });
    return {
      papers: res.data.data as ScoredPaper[],
      meta: res.data.meta as {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      },
    };
  },
};
