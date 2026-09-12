import type { Pagination, SortOption } from "./common.js";
import type { Paper, PaperSummary, PaperKind, DataSource } from "./paper.js";

export type SearchMode = "keyword" | "semantic" | "hybrid";

/** Sort keys honored server-side by GET /search and GET /papers (Cách 2). */
export type SearchSortKey = "relevance" | "year" | "citations";

/** meta.mode value returned by GET /search (whether LLM re-rank was applied). */
export type SearchResultMode = "semantic" | "semantic+rerank";

/**
 * A paper plus its relevance scores — the wire shape of GET /search rows.
 * `score` is vector (cosine) similarity 0..1. `rerankScore` is the LLM
 * relevance 0..1 and is the sort key; present ONLY when rerank=true.
 */
export interface ScoredPaper extends Paper {
  score: number;
  rerankScore?: number;
  taxonomyBoostScore?: number;
}

export interface SearchFilters {
  yearFrom?: number;
  yearTo?: number;
  openAccessOnly?: boolean;
  journalIds?: string[];
  authorIds?: string[];
  topics?: string[];
  /** ISO 639 language codes from the source provider; `und` means unknown. */
  languages?: string[];
  minCitationCount?: number;
  // Cách 2 — server-side filters honored by GET /search and GET /papers.
  paperKinds?: PaperKind[];
  provider?: DataSource;
  minScore?: number; // 0..1 — semantic cosine-similarity floor (semantic only)
}

export interface SearchRequest {
  query: string;
  mode?: SearchMode;
  filters?: SearchFilters;
  pagination?: Pagination;
  sort?: SortOption<"relevance" | "year" | "citations" | "aiScore">;
}

export interface SearchResponse {
  papers: PaperSummary[];
  total: number;
  page: number;
  pageSize: number;
  mode: SearchMode;
  queryRewriteSuggestions?: string[];
}
