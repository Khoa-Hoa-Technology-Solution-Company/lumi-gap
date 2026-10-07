import type { ScoredPaper } from "@trend/shared-types";
import { normalizeAcademicTitle } from "../../common/text/academic-text.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { PAPER_EMBEDDING_DIMENSIONS, searchPapersHybrid, type PostgresPaperSearchFilters } from "../../infrastructure/database/postgres-paper-search.js";
import { logger } from "../../infrastructure/logger.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import type { PaperStructuredAnalysis } from "../papers/paper-structured-context.js";
import type { PaperFilterInput } from "../papers/paper-filter.match.js";
import { searchKnowledgePapers } from "../knowledge/knowledge.retrieval.js";

export interface RetrieveFilters extends PaperFilterInput {
  minScore?: number;
}

export interface RetrieveOptions {
  fullText?: boolean;
  queryText?: string;
  queryVector?: number[];
  topK: number;
  poolSize?: number;
  filters?: RetrieveFilters;
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
  const query = opts.queryText?.trim() || undefined;
  const embedding = await resolveQueryVector(opts, query);
  if (!embedding && !query) return [];
  const metadataHits = await searchPapersHybrid({
    embedding,
    query,
    filters: toSqlFilters(opts.filters),
    limit,
  });
  const passageHits = opts.fullText ? await searchKnowledgePapers(query ?? "", embedding, toSqlFilters(opts.filters), limit) : [];
  const combined = new Map<string, (typeof metadataHits)[number]>();
  for (const list of [metadataHits, passageHits]) {
    list.forEach((hit, index) => {
      const previous = combined.get(hit.id);
      combined.set(hit.id, { ...hit, score: Math.max(previous?.score ?? 0, hit.score), hybridScore: (previous?.hybridScore ?? 0) + 1 / (60 + index + 1) });
    });
  }
  const hits = passageHits.length ? [...combined.values()].sort((a, b) => b.hybridScore - a.hybridScore).slice(0, limit) : metadataHits;
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
  const hitById = new Map(hits.map((hit) => [hit.id, hit]));
  const authorsByPaper = groupBy(authors, (row) => row.paperId);
  const topicsByPaper = groupBy(topics, (row) => row.paperId);
  const keywordsByPaper = groupBy(keywords, (row) => row.paperId);
  return hits.flatMap((hit) => {
    const paper = paperById.get(hit.id);
    if (!paper) return [];
    const document: Record<string, unknown> = {
      ...paper,
      _id: publicDatabaseId(paper),
      score: hitById.get(paper.id)?.score ?? 0,
      hybridScore: hitById.get(paper.id)?.hybridScore ?? 0,
      authors: (authorsByPaper.get(paper.id) ?? []).map((author) => ({ displayName: author.displayName })),
      topics: topicsByPaper.get(paper.id) ?? [],
      keywords: (keywordsByPaper.get(paper.id) ?? []).map((keyword) => keyword.keywordName),
    };
    // minScore depends on the computed score, so it is the one JS-side cut; it
    // only trims the tail of an already-ranked list.
    return Number(document.score) >= (opts.filters?.minScore ?? 0) ? [document] : [];
  }).slice(0, Math.max(1, opts.topK));
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) { const value = key(row); const list = result.get(value) ?? []; list.push(row); result.set(value, list); }
  return result;
}

function toSqlFilters(filters: RetrieveFilters | undefined): PostgresPaperSearchFilters {
  const f = filters ?? {};
  const providers = f.providers?.length ? f.providers : f.provider ? [f.provider] : undefined;
  return {
    publicationYearFrom: f.yearFrom,
    publicationYearTo: f.yearTo,
    dataStatus: "active",
    paperKinds: f.paperKinds,
    openAccess: f.openAccess,
    openAccessStatuses: f.openAccessStatuses,
    providers,
    sources: f.sources,
    languages: f.languages,
    citationBands: f.citationBands,
    domains: f.domains,
    fields: f.fields,
    subfields: f.subfields,
    topics: f.topics,
    domainIds: f.domainIds,
    fieldIds: f.fieldIds,
    subfieldIds: f.subfieldIds,
    topicIds: f.topicIds,
    paperIds: f.paperIds,
  };
}

/** Returns the query embedding, or undefined to degrade to keyword-only search. */
async function resolveQueryVector(opts: RetrieveOptions, query: string | undefined): Promise<number[] | undefined> {
  if (opts.queryVector?.length) return opts.queryVector.length === PAPER_EMBEDDING_DIMENSIONS ? opts.queryVector : undefined;
  if (!query) throw new Error("retrieve requires queryText or queryVector");
  try {
    return await getEmbeddingProvider().embed(query);
  } catch (error) {
    logger.warn({ err: error }, "Query embedding failed; falling back to keyword-only retrieval");
    return undefined;
  }
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
