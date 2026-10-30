import type { Pagination, SortOption } from "./common.js";
import type { Paper, PaperSummary, PaperKind, DataSource } from "./paper.js";

export type SearchMode = "keyword" | "semantic" | "hybrid";

/** Sort keys honored server-side by GET /search and GET /papers (Cách 2). */
export type SearchSortKey = "relevance" | "year" | "citations";

/** meta.mode value returned by GET /search (whether LLM re-rank was applied). */
export type SearchResultMode = "semantic" | "semantic+rerank";

/**
 * A paper plus its relevance scores — the wire shape of GET /search rows.
 * `score` is vector (cosine) similarity 0..1 (normalized keyword rank for
 * papers without an embedding). `rerankScore` is the LLM
 * relevance 0..1 and is the sort key; present ONLY when rerank=true.
 */
export interface ScoredPaper extends Paper {
  score: number;
  /** RRF fusion of vector + full-text ranks, normalized 0..1. */
  hybridScore?: number;
  rerankScore?: number;
  taxonomyBoostScore?: number;
}

/** Catalogue entry a search query was resolved to (taxonomy node or keyword). */
export type DetectedTagKind = "domain" | "field" | "subfield" | "topic" | "keyword";

/** How the query text met the entry: its name, an admin alias, an OpenAlex topic keyword, or trigram similarity. */
export type DetectedTagSource = "name" | "alias" | "openalex-keyword" | "fuzzy";

/** Explicit filter param that reproduces a detected tag, so the client can pin or drop it. */
export type DetectedTagFilterKey = "domainIds" | "fieldIds" | "subfieldIds" | "topicIds" | "keywordIds";

export interface DetectedTag {
  kind: DetectedTagKind;
  /** research_topics.id or keywords.id. */
  id: string;
  /** Short OpenAlex id for taxonomy nodes ("T10028", "17"). */
  openalexId?: string;
  name: string;
  /** Active local papers under this entry. */
  paperCount: number;
  /** 0..1; how strongly the query is about this entry. */
  confidence: number;
  source: DetectedTagSource;
  /** The normalized query phrase that matched. */
  matchedText: string;
  filter: { key: DetectedTagFilterKey; value: string };
}

/**
 * - filter: the best tag covers the whole query, so results were restricted to its papers.
 * - boost: tags were found but not decisive; papers carrying them rank higher.
 * - none: no tag matched, or auto tagging was off / explicit taxonomy filters were given.
 */
export type SearchUnderstandingMode = "filter" | "boost" | "none";

/** meta.understanding of GET /search. */
export interface SearchUnderstanding {
  mode: SearchUnderstandingMode;
  detectedTags: DetectedTag[];
  /** The tag used as a hard filter (mode "filter" only). */
  appliedTag: DetectedTag | null;
  /** True when a filter was planned but returned too few papers, so the search re-ran unfiltered in boost mode. */
  fellBack: boolean;
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
