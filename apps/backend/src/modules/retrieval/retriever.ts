import type { ScoredPaper } from "@trend/shared-types";
import { normalizeAcademicTitle } from "../../common/text/academic-text.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { searchPapersByEmbedding, searchPapersByKeyword } from "../../infrastructure/database/postgres-paper-search.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import type { PaperStructuredAnalysis } from "../papers/paper-structured-context.js";
import {
  buildPaperMetadataMatch,
  type PaperFilterInput,
} from "../papers/paper-filter.match.js";

type PipelineStage = Record<string, unknown>;

/** @deprecated PostgreSQL uses pgvector and does not require a named Atlas index. */
export const VECTOR_INDEX = "pgvector";

export type RetrievalProjection = "search" | "report" | "gap" | "chat";

export interface RetrieveFilters extends PaperFilterInput {
  minScore?: number;
}

export interface RetrieveOptions {
  queryText?: string;
  queryVector?: number[];
  topK: number;
  poolSize?: number;
  numCandidates?: number;
  filters?: RetrieveFilters;
  projection?: RetrievalProjection;
}

export interface RetrievedPaper {
  id: string;
  title: string;
  abstractText?: string;
  publicationYear?: number;
  journalName?: string;
  citationCount?: number;
  authorNames: string[];
  score: number;
  aiAnalysis?: PaperStructuredAnalysis | null;
}

export async function retrieve(opts: RetrieveOptions): Promise<RetrievedPaper[]> {
  return (await retrievePostgres(opts)).map(toRetrievedPaper);
}

export async function retrieveScored(opts: RetrieveOptions): Promise<ScoredPaper[]> {
  return (await retrievePostgres(opts)).map(toScoredPaper);
}

async function retrievePostgres(opts: RetrieveOptions): Promise<Array<Record<string, unknown>>> {
  const limit = Math.min(500, Math.max(1, opts.poolSize ?? opts.topK));
  const filters = {
    publicationYearFrom: opts.filters?.yearFrom,
    publicationYearTo: opts.filters?.yearTo,
    dataStatus: "active",
    ...(opts.filters?.paperKinds?.length === 1 ? { paperKind: opts.filters.paperKinds[0] } : {}),
    ...(opts.filters?.openAccessStatuses?.length === 1 ? { openAccessStatus: opts.filters.openAccessStatuses[0] } : {}),
    ...(opts.filters?.providers?.length === 1 ? { primaryProvider: opts.filters.providers[0] } : opts.filters?.provider ? { primaryProvider: opts.filters.provider } : {}),
    ...(opts.filters?.languages?.length === 1 ? { language: opts.filters.languages[0] } : {}),
  };
  let hits = [] as Awaited<ReturnType<typeof searchPapersByEmbedding>>;
  const vector = opts.queryVector ?? await embedQuery(opts.queryText);
  if (vector.length === 768) hits = await searchPapersByEmbedding({ embedding: vector, filters, limit, offset: 0 });
  if (hits.length === 0 && opts.queryText?.trim()) hits = await searchPapersByKeyword({ query: opts.queryText, filters, limit, offset: 0 });
  if (!hits.length) return [];

  const prisma = getPrisma();
  const ids = hits.map((hit) => hit.id);
  const [papers, authors, topics, keywords] = await Promise.all([
    prisma.paper.findMany({ where: { id: { in: ids } } }),
    prisma.paperAuthor.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } }),
    prisma.paperTopic.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } }),
    prisma.paperKeyword.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } }),
  ]);
  const paperById = new Map(papers.map((paper) => [paper.id, paper]));
  const scoreById = new Map(hits.map((hit) => [hit.id, hit.score]));
  const authorsByPaper = groupBy(authors, (row) => row.paperId);
  const topicsByPaper = groupBy(topics, (row) => row.paperId);
  const keywordsByPaper = groupBy(keywords, (row) => row.paperId);
  return hits.flatMap((hit) => {
    const paper = paperById.get(hit.id);
    if (!paper) return [];
    const document: Record<string, unknown> = {
      ...paper,
      _id: publicDatabaseId(paper),
      score: scoreById.get(paper.id) ?? 0,
      authors: (authorsByPaper.get(paper.id) ?? []).map((author) => ({ displayName: author.displayName })),
      topics: topicsByPaper.get(paper.id) ?? [],
      keywords: (keywordsByPaper.get(paper.id) ?? []).map((keyword) => keyword.keywordName),
    };
    return matchesPostgresFilters(document, opts.filters) ? [document] : [];
  }).slice(0, Math.max(1, opts.topK));
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) { const value = key(row); const list = result.get(value) ?? []; list.push(row); result.set(value, list); }
  return result;
}

function matchesPostgresFilters(paper: Record<string, unknown>, filters: RetrieveFilters | undefined): boolean {
  if (!filters) return true;
  const includes = (values: string[] | undefined, value: unknown, lower = false) => !values?.length || values.map((item) => lower ? item.toLowerCase() : item).includes(lower ? String(value ?? "").toLowerCase() : String(value ?? ""));
  if (!includes(filters.paperKinds, paper.paperKind)) return false;
  if (!includes(filters.openAccessStatuses, paper.openAccessStatus, true)) return false;
  if (!includes(filters.providers, paper.primaryProvider, true)) return false;
  if (filters.provider && String(paper.primaryProvider).toLowerCase() !== filters.provider.toLowerCase()) return false;
  if (!includes(filters.sources, paper.journalName)) return false;
  if (!includes(filters.languages, paper.language, true)) return false;
  if (filters.openAccess && !paper.openAccessUrl) return false;
  if (filters.minScore && Number(paper.score ?? 0) < filters.minScore) return false;
  const topicRows = (paper.topics ?? []) as Array<Record<string, unknown>>;
  const topicChecks: Array<[string[] | undefined, string]> = [[filters.topics, "topicName"], [filters.domains, "domainName"], [filters.fields, "fieldName"], [filters.subfields, "subfieldName"], [filters.topicIds, "openalexTopicId"], [filters.domainIds, "domainId"], [filters.fieldIds, "fieldId"], [filters.subfieldIds, "subfieldId"]];
  if (topicChecks.some(([values, field]) => values?.length && !topicRows.some((row) => values.includes(String(row[field] ?? ""))))) return false;
  if (filters.paperIds?.length && !filters.paperIds.includes(String(paper._id))) return false;
  return true;
}

export function buildFallbackKeywordPipeline(opts: RetrieveOptions): PipelineStage[] {
  const topK = Math.max(1, opts.topK);
  const filter = buildVectorFilter(opts);
  const postMatch = buildPostMatch(opts.filters);

  const queryWords = (opts.queryText ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 5);

  const textMatch =
    queryWords.length > 0
      ? {
          $or: [
            { title: { $regex: queryWords.join("|"), $options: "i" } },
            { abstractText: { $regex: queryWords.join("|"), $options: "i" } },
          ],
        }
      : {};

  const matchStage: Record<string, unknown> = {
    ...filter,
    ...(postMatch ?? {}),
    ...textMatch,
  };

  return [
    { $match: matchStage },
    { $addFields: { score: 1.0 } },
    buildProjection(opts.projection ?? "search"),
    { $limit: topK },
  ];
}

async function embedQuery(queryText: string | undefined): Promise<number[]> {
  const q = queryText?.trim();
  if (!q) throw new Error("retrieve requires queryText or queryVector");
  return getEmbeddingProvider().embed(q);
}

export function buildVectorFilter(opts: Pick<RetrieveOptions, "filters">): Record<string, unknown> {
  const f = opts.filters ?? {};
  const filter: Record<string, unknown> = { dataStatus: "active" };
  const metadataMatch = buildPaperMetadataMatch(f, { includeActive: false });

  if (f.yearFrom !== undefined || f.yearTo !== undefined) {
    filter.publicationYear = {
      ...(f.yearFrom !== undefined ? { $gte: f.yearFrom } : {}),
      ...(f.yearTo !== undefined ? { $lte: f.yearTo } : {}),
    };
  }

  for (const path of [
    "_id",
    "paperKind",
    "openAccessStatus",
    "primaryProvider",
    "journalName",
    "language",
    "citationCount",
  ] as const) {
    if (metadataMatch[path] !== undefined) filter[path] = metadataMatch[path];
  }
  if (metadataMatch.$or !== undefined) filter.$or = metadataMatch.$or;

  const topicMatch = (
    metadataMatch.topics as { $elemMatch?: Record<string, unknown> } | undefined
  )?.$elemMatch;
  if (topicMatch) {
    // Dotted taxonomy predicates are intentionally a superset when multiple
    // values come from topics[]. buildPostMatch keeps the same-element
    // $elemMatch boundary after retrieval, so prefiltering improves recall
    // without weakening correctness.
    for (const [path, value] of Object.entries(topicMatch)) {
      filter[`topics.${path}`] = value;
    }
  }

  return filter;
}

export function buildRetrievePipeline(opts: RetrieveOptions): PipelineStage[] {
  if (!opts.queryVector || opts.queryVector.length === 0) {
    throw new Error("buildRetrievePipeline requires queryVector");
  }

  const topK = Math.max(1, opts.topK);
  const poolSize = opts.poolSize ?? Math.min(1000, Math.max(topK, topK * 10));
  const numCandidates = opts.numCandidates ?? Math.min(1000, Math.max(100, poolSize * 10));
  const postMatch = buildPostMatch(opts.filters);

  return [
    {
      $vectorSearch: {
        index: VECTOR_INDEX,
        path: "embedding",
        queryVector: opts.queryVector,
        numCandidates,
        limit: poolSize,
        filter: buildVectorFilter(opts),
      },
    },
    { $addFields: { score: { $meta: "vectorSearchScore" } } },
    ...(postMatch ? [{ $match: postMatch } as PipelineStage] : []),
    buildProjection(opts.projection ?? "search"),
    { $limit: topK },
  ];
}

function buildPostMatch(filters: RetrieveFilters | undefined): Record<string, unknown> | null {
  const f = filters ?? {};
  const m = buildPaperMetadataMatch(f, { includeActive: false });
  // Keep the full metadata predicate as the correctness boundary. The vector
  // filter is an optimization and may deliberately be a taxonomy superset.
  if (f.minScore && f.minScore > 0) m.score = { $gte: f.minScore };
  return Object.keys(m).length > 0 ? m : null;
}

function buildProjection(projection: RetrievalProjection): Record<string, unknown> {
  if (projection === "gap") {
    return {
      $project: {
        title: 1,
        abstractText: 1,
        aiAnalysis: 1,
        publicationYear: 1,
        journalName: 1,
        citationCount: 1,
        "authors.displayName": 1,
        score: 1,
      },
    };
  }
  if (projection === "report") {
    return {
      $project: {
        title: 1,
        abstractText: 1,
        publicationYear: 1,
        journalName: 1,
        citationCount: 1,
        "authors.displayName": 1,
        score: 1,
      },
    };
  }
  if (projection === "chat") {
    return {
      $project: {
        title: 1,
        abstractText: 1,
        publicationYear: 1,
        "authors.displayName": 1,
        score: 1,
      },
    };
  }
  return { $project: { embedding: 0, __v: 0 } };
}

export function toRetrievedPaper(d: Record<string, unknown>): RetrievedPaper {
  const paper: RetrievedPaper = {
    id: String(d._id),
    title: normalizeAcademicTitle(String(d.title ?? "")),
    abstractText: d.abstractText ? String(d.abstractText) : undefined,
    publicationYear: d.publicationYear as number | undefined,
    journalName: d.journalName ? String(d.journalName) : undefined,
    citationCount: d.citationCount as number | undefined,
    authorNames: ((d.authors ?? []) as Array<{ displayName?: string }>)
      .map((a) => a.displayName ?? "")
      .filter(Boolean),
    score: Number(d.score ?? 0),
  };
  if (d.aiAnalysis !== undefined) {
    paper.aiAnalysis = d.aiAnalysis as PaperStructuredAnalysis | null;
  }
  return paper;
}

export function toScoredPaper(d: Record<string, unknown>): ScoredPaper {
  const { _id, score, ...rest } = d;
  return {
    id: String(_id),
    score: Number(score),
    ...rest,
    title: normalizeAcademicTitle(rest.title as string | undefined),
  } as unknown as ScoredPaper;
}
