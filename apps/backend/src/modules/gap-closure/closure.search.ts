import type { ClosureDocumentSource } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { logger } from "../../infrastructure/logger.js";
import { searchOpenAlexWorksForClosure } from "../api-sync/providers/openalex.client.js";
import { reconstructAbstract } from "../api-sync/providers/openalex.normalizer.js";
import type { OpenAlexWork } from "../api-sync/providers/openalex.types.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { retrieve } from "../retrieval/retriever.js";
import { normalizeDoi } from "./closure.rules.js";

/**
 * Logged search of the Gap Closure Protocol (step 1). The pure helpers build and merge document drafts;
 * the two search functions THROW on failure so the runner can log the error and the check abstains
 * (an error is never the same thing as "zero results").
 */

/** A document found by one search, before it is stored in gap_closure_documents. */
export interface ClosureDocumentDraft {
  /** Paper id, else "openalex:<W id>", else "doi:<doi>". */
  dedupeKey: string;
  paperId?: string;
  openalexId?: string;
  doi?: string;
  title: string;
  abstractText?: string;
  publicationYear?: number;
  retrievedFrom: ClosureDocumentSource;
  /** Index of the search in the check's query log (`queries[queryIndex]` is the query and source that found it). */
  queryIndex: number;
  /** 1-based position in that search's result list. */
  rank: number;
}

const OPENALEX_URL_PREFIX = "https://openalex.org/";

/** "https://openalex.org/W123" -> "W123". Returns undefined for anything that is not a work id. */
export function openAlexShortId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const id = value.trim().replace(OPENALEX_URL_PREFIX, "").split("/").filter(Boolean).at(-1);
  return id && /^W\d{1,20}$/i.test(id) ? id.toUpperCase() : undefined;
}

/** Strips characters PostgreSQL text columns reject and trims. */
function cleanText(value: string | null | undefined): string | undefined {
  const text = value?.replace(/\u0000/g, "").trim();
  return text ? text : undefined;
}

/** Paper id first, then OpenAlex id, then DOI. Null when the document has no identifier at all. */
export function buildDedupeKey(ids: { paperId?: string | null; openalexId?: string | null; doi?: string | null }): string | null {
  if (ids.paperId) return ids.paperId;
  const openalexId = openAlexShortId(ids.openalexId);
  if (openalexId) return `openalex:${openalexId}`;
  const doi = ids.doi ? normalizeDoi(ids.doi) : null;
  return doi ? `doi:${doi}` : null;
}

/** An OpenAlex work as a draft; null when it has no title or no usable identifier. paperId is set later by `linkDraftsToPapers`. */
export function openAlexWorkToDraft(work: OpenAlexWork, queryIndex: number, rank: number): ClosureDocumentDraft | null {
  const title = cleanText(work.title ?? work.display_name);
  if (!title) return null;
  const openalexId = openAlexShortId(work.id);
  const doi = work.doi ? normalizeDoi(work.doi) ?? undefined : undefined;
  const dedupeKey = buildDedupeKey({ openalexId, doi });
  if (!dedupeKey) return null;
  return {
    dedupeKey,
    openalexId,
    doi,
    title,
    abstractText: cleanText(reconstructAbstract(work.abstract_inverted_index)),
    publicationYear: typeof work.publication_year === "number" && work.publication_year > 0 ? work.publication_year : undefined,
    retrievedFrom: "OPENALEX",
    queryIndex,
    rank,
  };
}

const SOURCE_ORDER: Record<ClosureDocumentSource, number> = { LOCAL: 0, OPENALEX: 1 };

/**
 * One draft per dedupe key across all searches. The first hit in (queryIndex, rank, source) order wins;
 * identifiers and the abstract that the winner lacks are filled in from later hits of the same document.
 */
export function mergeClosureDocuments(lists: ClosureDocumentDraft[][]): ClosureDocumentDraft[] {
  const all = lists.flat().map((draft, order) => ({ draft, order }));
  all.sort((a, b) => a.draft.queryIndex - b.draft.queryIndex || a.draft.rank - b.draft.rank || SOURCE_ORDER[a.draft.retrievedFrom] - SOURCE_ORDER[b.draft.retrievedFrom] || a.order - b.order);
  const merged = new Map<string, ClosureDocumentDraft>();
  for (const { draft } of all) {
    const existing = merged.get(draft.dedupeKey);
    if (!existing) { merged.set(draft.dedupeKey, { ...draft }); continue; }
    existing.paperId ??= draft.paperId;
    existing.openalexId ??= draft.openalexId;
    existing.doi ??= draft.doi;
    existing.abstractText ??= draft.abstractText;
    existing.publicationYear ??= draft.publicationYear;
  }
  return [...merged.values()];
}

/* ------------------------------------------------------------------ */
/*  Search I/O                                                         */
/* ------------------------------------------------------------------ */

export interface ClosureSearchParams {
  query: string;
  queryIndex: number;
  yearFrom?: number;
  yearTo?: number;
}

/** Corpus search: hybrid retrieval over the LumiGap papers. Falls back to text-only when the embedding fails. */
export async function searchLocalForClosure(params: ClosureSearchParams): Promise<ClosureDocumentDraft[]> {
  let queryVector: number[] | undefined;
  try { queryVector = await getEmbeddingProvider().embed(params.query); }
  catch (error) { logger.warn({ err: error }, "closure query embedding failed; using text-only retrieval"); }
  const found = await retrieve({ queryText: params.query, queryVector, topK: env.GAP_CLOSURE_LOCAL_TOP_K, filters: { yearFrom: params.yearFrom, yearTo: params.yearTo }, fullText: true });
  const ids = found.map((paper) => parseDatabaseId(paper.id)).filter((id): id is NonNullable<typeof id> => id !== null);
  const rows = ids.length
    ? await getPrisma().paper.findMany({
      where: { OR: [{ id: { in: ids.filter((id) => id.kind === "uuid").map((id) => id.value) } }, { legacyMongoId: { in: ids.filter((id) => id.kind === "legacyMongoId").map((id) => id.value) } }] },
      select: { id: true, legacyMongoId: true, doi: true, openalexId: true, publicationYear: true },
    })
    : [];
  const byPublicId = new Map<string, (typeof rows)[number]>();
  for (const row of rows) { byPublicId.set(row.id, row); if (row.legacyMongoId) byPublicId.set(row.legacyMongoId, row); }
  const drafts: ClosureDocumentDraft[] = [];
  found.forEach((paper, index) => {
    const row = byPublicId.get(paper.id.toLowerCase()) ?? byPublicId.get(paper.id);
    if (!row) return;
    const title = cleanText(paper.title);
    if (!title) return;
    drafts.push({
      dedupeKey: row.id,
      paperId: row.id,
      openalexId: openAlexShortId(row.openalexId),
      doi: row.doi ? normalizeDoi(row.doi) ?? undefined : undefined,
      title,
      abstractText: cleanText(paper.abstractText),
      publicationYear: row.publicationYear > 0 ? row.publicationYear : paper.publicationYear,
      retrievedFrom: "LOCAL",
      queryIndex: params.queryIndex,
      rank: index + 1,
    });
  });
  return drafts;
}

/** Sets paperId (and the paper-id dedupe key) on drafts whose DOI or OpenAlex id is already in `papers`. One batched query. */
export async function linkDraftsToPapers(drafts: ClosureDocumentDraft[]): Promise<ClosureDocumentDraft[]> {
  const openalexIds = [...new Set(drafts.flatMap((draft) => (draft.openalexId ? [draft.openalexId] : [])))];
  const dois = [...new Set(drafts.flatMap((draft) => (draft.doi ? [draft.doi] : [])))];
  if (!openalexIds.length && !dois.length) return drafts;
  const rows = await getPrisma().paper.findMany({
    where: { OR: [...(openalexIds.length ? [{ openalexId: { in: openalexIds } }] : []), ...(dois.length ? [{ doi: { in: dois } }] : [])] },
    select: { id: true, doi: true, openalexId: true },
  });
  const byOpenalex = new Map<string, string>(), byDoi = new Map<string, string>();
  for (const row of rows) {
    const openalexId = openAlexShortId(row.openalexId);
    if (openalexId && !byOpenalex.has(openalexId)) byOpenalex.set(openalexId, row.id);
    const doi = row.doi ? normalizeDoi(row.doi) : null;
    if (doi && !byDoi.has(doi)) byDoi.set(doi, row.id);
  }
  return drafts.map((draft) => {
    const paperId = draft.paperId ?? (draft.openalexId ? byOpenalex.get(draft.openalexId) : undefined) ?? (draft.doi ? byDoi.get(draft.doi) : undefined);
    return paperId ? { ...draft, paperId, dedupeKey: paperId } : draft;
  });
}

/** OpenAlex search; works already in the corpus get their paper id. */
export async function searchOpenAlexForClosure(params: ClosureSearchParams): Promise<ClosureDocumentDraft[]> {
  const works = await searchOpenAlexWorksForClosure({ query: params.query, perPage: env.GAP_CLOSURE_OPENALEX_PER_QUERY, yearFrom: params.yearFrom, yearTo: params.yearTo });
  const drafts = works.flatMap((work, index) => { const draft = openAlexWorkToDraft(work, params.queryIndex, index + 1); return draft ? [draft] : []; });
  return linkDraftsToPapers(drafts);
}
