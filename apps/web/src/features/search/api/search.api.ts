import type { ScoredPaper, SearchResultMode, SearchSortKey } from "@trend/shared-types";
import { api } from "@/services/api-client";
import { API_ROUTES } from "@/constants";

export type { ScoredPaper } from "@trend/shared-types";

export interface SearchParams {
  q: string;
  page?: number;
  pageSize?: number;
  yearFrom?: number;
  yearTo?: number;
  /** CSV or repeated values — server accepts both. */
  paperKind?: string[];
  paperKinds?: string[];
  openAccess?: boolean;
  openAccessStatuses?: string[];
  provider?: string;
  providers?: string[];
  sources?: string[];
  languages?: string[];
  citationBands?: string[];
  domains?: string[];
  fields?: string[];
  subfields?: string[];
  topics?: string[];
  domainIds?: string[];
  fieldIds?: string[];
  subfieldIds?: string[];
  topicIds?: string[];
  /** Cosine similarity floor 0..1 (semantic only). */
  minScore?: number;
  sort?: SearchSortKey;
  /** Opt-in LLM re-ranking — each result then carries `rerankScore`. */
  rerank?: boolean;
}

export const searchApi = {
  /** Semantic search (Phase B) — GET /api/v1/search. Same envelope as /papers,
   *  but each paper carries a relevance `score` (and `rerankScore` if rerank). */
  async semantic(params: SearchParams) {
    // Flatten array filters → CSV for the query string.
    const { paperKind, ...rest } = params;
    const query: Record<string, unknown> = { ...rest };
    if (paperKind && paperKind.length > 0) {
      query.paperKind = paperKind.join(",");
    }
    for (const key of [
      "paperKinds",
      "openAccessStatuses",
      "providers",
      "sources",
      "languages",
      "citationBands",
      "domains",
      "fields",
      "subfields",
      "topics",
      "domainIds",
      "fieldIds",
      "subfieldIds",
      "topicIds",
    ] as const) {
      const values = query[key];
      if (Array.isArray(values)) {
        if (values.length > 0) query[key] = values.join(",");
        else delete query[key];
      }
    }
    const res = await api.get(API_ROUTES.search.semantic, { params: query });
    return {
      papers: res.data.data as ScoredPaper[],
      meta: res.data.meta as {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        mode: SearchResultMode;
      },
    };
  },
};
