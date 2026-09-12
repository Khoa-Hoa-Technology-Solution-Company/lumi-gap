import type { ScoredPaper } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";
import { creditService } from "../credits/credit.service.js";
import { generateJSON } from "../llm/gemini.client.js";
import { cachedGenerate } from "../llm/llm.run.js";
import { retrieveScored } from "../retrieval/retriever.js";
import type { SearchSortKey } from "../papers/dto/paper-filters.schema.js";
import type { TrendCitationBand } from "../trends/trend.filters.js";
import {
  buildRerankPrompt,
  buildRerankChargeKey,
  RERANK_PROMPT_VERSION,
  RERANK_SYSTEM_PROMPT,
  rerankGrade,
  toCompleteScoreMap,
  type RerankCandidate,
  type RerankLlmOutput,
} from "./search.rerank.js";
import {
  annotateTaxonomyBoost,
  effectiveRelevanceScore,
} from "./search.taxonomy.js";

export type { ScoredPaper } from "@trend/shared-types";

export interface SemanticSearchParams {
  q: string;
  page: number;
  pageSize: number;
  yearFrom?: number;
  yearTo?: number;
  // Cách 2 — server-side filters applied AFTER the vector search.
  paperKinds?: string[];
  openAccess?: boolean;
  openAccessStatuses?: string[];
  provider?: string;
  providers?: string[];
  sources?: string[];
  languages?: string[];
  citationBands?: TrendCitationBand[] | string[];
  domains?: string[];
  fields?: string[];
  subfields?: string[];
  topics?: string[];
  domainIds?: string[];
  fieldIds?: string[];
  subfieldIds?: string[];
  topicIds?: string[];
  minScore?: number;
  sort?: SearchSortKey;
  /** Opt-in LLM re-ranking of the top candidate pool. */
  rerank?: boolean;
  userId?: string;
}

export interface SemanticSearchResult {
  papers: ScoredPaper[];
  total: number;
  reranked: boolean;
}

/**
 * Hard ceiling on the in-memory result horizon. The pool size is FIXED (never
 * grows with the requested page) so `total` is deterministic for a given
 * query+filters, and `limit` can never exceed `$vectorSearch` numCandidates
 * (≤1000) — which otherwise makes Atlas throw on deep pagination. Semantic
 * relevance past the top few hundred hits is noise, so capping here is correct.
 */
const MAX_POOL = 500;

export const searchService = {
  /**
   * Semantic search: embed the query into a 768-dim vector, then find the
   * nearest paper vectors via Atlas $vectorSearch (cosine similarity).
   *
   * Filters that the vector index can apply (year, dataStatus) go INTO the
   * $vectorSearch filter. Filters it cannot (paperKind, openAccess, provider,
   * minScore) are applied as a $match over a bounded candidate POOL, then the
   * survivors are sorted + paginated. `total` therefore reflects the FILTERED
   * pool, so the count, the filters and the pager all agree.
   *
   * With `rerank`, that pool is additionally re-scored by an LLM for true query
   * relevance and re-ordered before pagination.
   */
  async semantic(params: SemanticSearchParams): Promise<SemanticSearchResult> {
    const { q, page, pageSize, sort = "relevance", rerank } = params;

    if (rerank) {
      return rerankedSearch({ q, page, pageSize, params });
    }

    // Plain semantic path: pull a FIXED-size filtered pool, sort, paginate in
    // memory. Pool size does NOT grow with `page` — so `total` is stable and a
    // deep `page` can't push $vectorSearch limit past numCandidates (Atlas 500).
    const poolSize = resolveSearchPoolSize(params, pageSize);
    const pool = annotateTaxonomyBoost(q, await fetchScoredPool(q, params, poolSize));
    const sorted = sortPapers(pool, sort);
    const { items, total } = slicePage(sorted, page, pageSize);
    return { papers: items, total, reranked: false };
  },
};

/**
 * Re-ranked path: pull a fixed candidate POOL (filtered), LLM-score it, re-order
 * by relevance, then paginate in memory. The pool is bounded (RERANK_CANDIDATES)
 * — re-ranking refines the head of the results, which is where relevance matters.
 */
async function rerankedSearch(args: {
  q: string;
  page: number;
  pageSize: number;
  params: SemanticSearchParams;
}): Promise<SemanticSearchResult> {
  const { q, page, pageSize, params } = args;

  // FIXED candidate pool (covers a full first page of any pageSize, but does NOT
  // grow with `page`) — so a deep `page` can't inflate the Gemini prompt / token
  // cost, and `total` stays deterministic. Rerank refines the head; paginating
  // past the head is meaningless and is clamped in paginatePool.
  const poolSize = resolveSearchPoolSize(params, Math.max(env.RERANK_CANDIDATES, pageSize));
  const pool = annotateTaxonomyBoost(q, await fetchScoredPool(q, params, poolSize));
  if (pool.length === 0) return { papers: [], total: 0, reranked: false };

  const rerankHead = pool.slice(0, env.RERANK_CANDIDATES);
  const candidates: RerankCandidate[] = rerankHead.map((p) => ({
    id: p.id,
    title: p.title,
    abstractText: (p as { abstractText?: string }).abstractText,
  }));

  const model = env.GEMINI_MODEL_FAST;
  if (!params.userId) {
    throw AppError.unauthorized("Authentication is required for AI re-ranking");
  }

  const rerankKeyParts = {
    query: q.trim().toLowerCase(),
    filters: getSearchFilterKeyParts(params),
    candidateIds: candidates.map((c) => c.id).sort(),
  };
  let ownedTxId: { toString(): string } | undefined;

  const prompt = buildRerankPrompt(q, candidates);
  let scoreMap: Record<string, number>;
  try {
    scoreMap = await cachedGenerate<Record<string, number>>({
      task: "rerank",
      promptVersion: RERANK_PROMPT_VERSION,
      keyParts: rerankKeyParts,
      model,
      inputHash: prompt,
      // Cached AI work is free. Charge only when this request is the one that
      // must call the provider, not before checking Redis.
      onCacheMiss: async () => {
        const charge = await creditService.chargeCreditsCheckedOwned({
          userId: params.userId!,
          action: "search_rerank",
          amount: 5,
          targetKind: "search",
          idempotencyKey: buildRerankChargeKey({
            userId: params.userId!,
            fingerprint: rerankKeyParts,
          }),
          metadata: {
            promptVersion: RERANK_PROMPT_VERSION,
            model,
            candidateCount: candidates.length,
          },
        });
        if (charge.created) ownedTxId = charge.transaction?._id;
      },
      validate: (candidate) => {
        if (Object.keys(candidate).length === 0) {
          throw new Error("Rerank returned no valid scores");
        }
        return candidate;
      },
      generate: async (routedModel) => {
        const output = await generateJSON<RerankLlmOutput>(prompt, {
          model: routedModel,
          system: RERANK_SYSTEM_PROMPT,
          temperature: 0,
          // ~RERANK_CANDIDATES score objects + flash's reasoning headroom; 1024
          // truncates at 20 candidates (caught live by the MAX_TOKENS guard).
          maxOutputTokens: 4096,
        });
        return toCompleteScoreMap(output, candidates);
      },
    });
  } catch (err) {
    if (ownedTxId) {
      await creditService.refundCreditsOnce({
        transactionId: ownedTxId.toString(),
        reason: "Rerank LLM generation failed",
      });
    }
    // Re-rank is an enhancement, not a hard dependency — degrade gracefully.
    logger.warn({ err }, "rerank LLM call failed; falling back to vector order");
    return paginatePool(pool, page, pageSize, false);
  }

  // Coverage validation above guarantees every candidate has an LLM score.
  // Rank by coarse grade first: tiny raw-score differences are not calibrated
  // enough to justify a different order. Semantic and taxonomy relevance break
  // ties deterministically.
  for (const p of rerankHead) p.rerankScore = scoreMap[p.id]!;
  const rerankedHead = [...rerankHead].sort((a, b) =>
    (rerankGrade(b.rerankScore) - rerankGrade(a.rerankScore))
    || (effectiveRelevanceScore(b) - effectiveRelevanceScore(a))
    || b.score - a.score
  );
  pool.splice(0, rerankHead.length, ...rerankedHead);

  // An all-empty score map (negative-cache hit or total LLM omission) means no
  // real re-ranking happened — report it honestly as plain semantic order.
  const reranked = Object.keys(scoreMap).length > 0;
  return paginatePool(pool, page, pageSize, reranked);
}

function paginatePool(
  pool: ScoredPaper[],
  page: number,
  pageSize: number,
  reranked: boolean,
): SemanticSearchResult {
  const { items, total } = slicePage(pool, page, pageSize);
  return { papers: items, total, reranked };
}

/**
 * Slice the requested page without silently substituting another page. An
 * out-of-range page is truthfully empty while metadata continues to describe
 * the page the client requested.
 */
export function slicePage<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number } {
  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total };
}

function sortPapers(papers: ScoredPaper[], sort: SearchSortKey): ScoredPaper[] {
  const arr = [...papers];
  if (sort === "year") {
    arr.sort((a, b) => (b.publicationYear ?? 0) - (a.publicationYear ?? 0));
  } else if (sort === "citations") {
    arr.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
  } else {
    arr.sort((a, b) => effectiveRelevanceScore(b) - effectiveRelevanceScore(a) || b.score - a.score);
  }
  return arr;
}

async function fetchScoredPool(
  queryText: string,
  params: SemanticSearchParams,
  poolSize: number,
): Promise<ScoredPaper[]> {
  return retrieveScored({
    queryText,
    topK: poolSize,
    poolSize,
    filters: {
      yearFrom: params.yearFrom,
      yearTo: params.yearTo,
      paperKinds: params.paperKinds,
      openAccess: params.openAccess,
      openAccessStatuses: params.openAccessStatuses,
      provider: params.provider,
      providers: params.providers,
      sources: params.sources,
      languages: params.languages,
      citationBands: params.citationBands,
      domains: params.domains,
      fields: params.fields,
      subfields: params.subfields,
      topics: params.topics,
      domainIds: params.domainIds,
      fieldIds: params.fieldIds,
      subfieldIds: params.subfieldIds,
      topicIds: params.topicIds,
      minScore: params.minScore,
    },
    projection: "search",
  });
}

function resolveSearchPoolSize(params: SemanticSearchParams, minimum: number): number {
  // Scope filters from Trends are applied after vector search because nested
  // taxonomy fields are not vector-index-safe filters. Pull a wider candidate
  // pool so a legitimate scoped result is not dropped simply because the
  // global top-200 semantic candidates were mostly from another domain/source.
  if (hasPostVectorScopeFilters(params)) return MAX_POOL;
  return Math.min(MAX_POOL, Math.max(env.SEARCH_FILTER_POOL, minimum));
}

function hasPostVectorScopeFilters(params: SemanticSearchParams): boolean {
  return [
    params.paperKinds,
    params.openAccessStatuses,
    params.providers,
    params.sources,
    params.languages,
    params.citationBands,
    params.domains,
    params.fields,
    params.subfields,
    params.topics,
    params.domainIds,
    params.fieldIds,
    params.subfieldIds,
    params.topicIds,
  ].some((values) => Array.isArray(values) && values.length > 0)
    || Boolean(params.openAccess)
    || Boolean(params.provider);
}

function getSearchFilterKeyParts(params: SemanticSearchParams): Record<string, unknown> {
  return {
    yearFrom: params.yearFrom ?? null,
    yearTo: params.yearTo ?? null,
    paperKinds: params.paperKinds ?? [],
    openAccess: params.openAccess ?? false,
    openAccessStatuses: params.openAccessStatuses ?? [],
    provider: params.provider ?? null,
    providers: params.providers ?? [],
    sources: params.sources ?? [],
    languages: params.languages ?? [],
    citationBands: params.citationBands ?? [],
    domains: params.domains ?? [],
    fields: params.fields ?? [],
    subfields: params.subfields ?? [],
    topics: params.topics ?? [],
    domainIds: params.domainIds ?? [],
    fieldIds: params.fieldIds ?? [],
    subfieldIds: params.subfieldIds ?? [],
    topicIds: params.topicIds ?? [],
    minScore: params.minScore ?? 0,
  };
}
