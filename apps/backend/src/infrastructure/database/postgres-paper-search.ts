import { Prisma } from "../../generated/prisma/client.js";
import {
  citationBandRange,
  expandOpenAlexIds,
  lowercase,
  uniqueStrings,
} from "../../modules/papers/paper-filter.match.js";

import { parseDatabaseId } from "./database-id.js";
import { getPrisma } from "./prisma.js";

export const PAPER_EMBEDDING_DIMENSIONS = 768;

/** Reciprocal Rank Fusion constant (Cormack et al.). */
export const RRF_K = 60;

export type PostgresPaperSearchFilters = {
  publicationYearFrom?: number;
  publicationYearTo?: number;
  dataStatus?: string;
  paperKinds?: string[];
  openAccess?: boolean;
  openAccessStatuses?: string[];
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
  paperIds?: string[];
};

export type PostgresPaperSearchRow = {
  id: string;
  legacyMongoId: string | null;
  /** Cosine similarity 0..1 (normalized keyword rank when no embedding was used). */
  score: number;
  /** RRF fusion of vector + full-text ranks, normalized 0..1. */
  hybridScore: number;
};

function textArray(values: readonly string[]): Prisma.Sql {
  return Prisma.sql`${[...values]}::text[]`;
}

function taxonomyCondition(filters: PostgresPaperSearchFilters): Prisma.Sql | null {
  const columns: Array<[string[] | undefined, string, boolean]> = [
    [filters.topics, "topic_name", false],
    [filters.domains, "domain_name", false],
    [filters.fields, "field_name", false],
    [filters.subfields, "subfield_name", false],
    [filters.topicIds, "openalex_topic_id", true],
    [filters.domainIds, "domain_id", true],
    [filters.fieldIds, "field_id", true],
    [filters.subfieldIds, "subfield_id", true],
  ];
  const conditions: Prisma.Sql[] = [];
  for (const [input, column, openAlexId] of columns) {
    const unique = uniqueStrings(input);
    const values = openAlexId ? expandOpenAlexIds(unique) : unique;
    if (values.length) conditions.push(Prisma.sql`${Prisma.raw(`pt.${column}`)} = ANY(${textArray(values)})`);
  }
  if (!conditions.length) return null;
  // One EXISTS so every taxonomy predicate must hold on the SAME topic row.
  return Prisma.sql`EXISTS (
    SELECT 1 FROM paper_topics pt
    WHERE pt.paper_id = p.id AND ${Prisma.join(conditions, " AND ")}
  )`;
}

export function filterSql(filters: PostgresPaperSearchFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (filters.publicationYearFrom !== undefined) {
    conditions.push(Prisma.sql`p.publication_year >= ${filters.publicationYearFrom}`);
  }
  if (filters.publicationYearTo !== undefined) {
    conditions.push(Prisma.sql`p.publication_year <= ${filters.publicationYearTo}`);
  }
  if (filters.dataStatus !== undefined) conditions.push(Prisma.sql`p.data_status = ${filters.dataStatus}`);

  const paperKinds = uniqueStrings(filters.paperKinds);
  if (paperKinds.length) conditions.push(Prisma.sql`p.paper_kind = ANY(${textArray(paperKinds)})`);
  const sources = uniqueStrings(filters.sources);
  if (sources.length) conditions.push(Prisma.sql`p.journal_name = ANY(${textArray(sources)})`);

  for (const [input, column] of [
    [filters.openAccessStatuses, "p.open_access_status"],
    [filters.providers, "p.primary_provider"],
    [filters.languages, "p.language"],
  ] as const) {
    const values = lowercase(input);
    if (values.length) conditions.push(Prisma.sql`lower(${Prisma.raw(column)}) = ANY(${textArray(values)})`);
  }

  if (filters.openAccess) {
    conditions.push(Prisma.sql`(p.open_access_url IS NOT NULL AND p.open_access_url <> '')`);
  }

  const bands = uniqueStrings(filters.citationBands).flatMap((band) => {
    const range = citationBandRange(band);
    if (!range) return [];
    return [range.max === undefined
      ? Prisma.sql`p.citation_count >= ${range.min}`
      : Prisma.sql`(p.citation_count >= ${range.min} AND p.citation_count <= ${range.max})`];
  });
  if (bands.length) conditions.push(Prisma.sql`(${Prisma.join(bands, " OR ")})`);

  if (filters.paperIds?.length) {
    const uuids: string[] = [];
    const legacyIds: string[] = [];
    for (const raw of uniqueStrings(filters.paperIds)) {
      const parsed = parseDatabaseId(raw);
      if (parsed?.kind === "uuid") uuids.push(parsed.value);
      else if (parsed?.kind === "legacyMongoId") legacyIds.push(parsed.value);
    }
    const idConditions: Prisma.Sql[] = [];
    if (uuids.length) idConditions.push(Prisma.sql`p.id = ANY(${[...uuids]}::uuid[])`);
    if (legacyIds.length) idConditions.push(Prisma.sql`p.legacy_mongo_id = ANY(${textArray(legacyIds)})`);
    // Selected IDs that match nothing must yield no rows, not "no filter".
    conditions.push(idConditions.length ? Prisma.sql`(${Prisma.join(idConditions, " OR ")})` : Prisma.sql`FALSE`);
  }

  const taxonomy = taxonomyCondition(filters);
  if (taxonomy) conditions.push(taxonomy);

  return conditions.length > 0 ? Prisma.sql`AND ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

export function vectorParameter(embedding: readonly number[]): string {
  if (embedding.length !== PAPER_EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding must contain exactly ${PAPER_EMBEDDING_DIMENSIONS} values`);
  }
  if (!embedding.every(Number.isFinite)) throw new Error("Embedding contains a non-finite value");
  return `[${embedding.join(",")}]`;
}

/**
 * Vector + full-text search fused with Reciprocal Rank Fusion in one query.
 * Every filter is applied in SQL BEFORE ranking and LIMIT, so results are never
 * truncated by a post-hoc filter. Either input may be omitted (vector-only or
 * keyword-only); at least one is required.
 */
export async function searchPapersHybrid(input: {
  embedding?: readonly number[];
  query?: string;
  filters?: PostgresPaperSearchFilters;
  limit: number;
}): Promise<PostgresPaperSearchRow[]> {
  const { limit } = input;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("limit must be an integer between 1 and 500");
  }
  const query = input.query?.trim();
  const vector = input.embedding ? vectorParameter(input.embedding) : undefined;
  if (!vector && !query) throw new Error("Hybrid search requires an embedding or a query");

  const filters = filterSql(input.filters ?? {});
  const tsQuery = query ? Prisma.sql`websearch_to_tsquery('simple', ${query})` : undefined;
  const vectorLiteral = vector ? Prisma.sql`CAST(${vector} AS vector)` : undefined;

  const vecCte = vectorLiteral
    ? Prisma.sql`
      SELECT f.id, row_number() OVER (ORDER BY f.embedding <=> ${vectorLiteral}, f.id) AS rnk
      FROM (
        SELECT id, embedding FROM filtered
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorLiteral}, id
        LIMIT ${limit}
      ) f`
    : Prisma.sql`SELECT NULL::uuid AS id, NULL::bigint AS rnk WHERE FALSE`;
  const kwCte = tsQuery
    ? Prisma.sql`
      SELECT f.id, f.rank, row_number() OVER (ORDER BY f.rank DESC, f.id) AS rnk
      FROM (
        SELECT id, ts_rank_cd(search_document, ${tsQuery})::double precision AS rank FROM filtered
        WHERE search_document @@ ${tsQuery}
        ORDER BY rank DESC, id
        LIMIT ${limit}
      ) f`
    : Prisma.sql`SELECT NULL::uuid AS id, NULL::double precision AS rank, NULL::bigint AS rnk WHERE FALSE`;

  const activeLists = (vector ? 1 : 0) + (query ? 1 : 0);
  const rrfK = Prisma.raw(String(RRF_K));
  const maxRrf = Prisma.raw(String(activeLists / (RRF_K + 1)));
  const scoreSql = vectorLiteral
    ? Prisma.sql`coalesce(1 - ((p.embedding <=> ${vectorLiteral}) / 2.0), 0)::double precision`
    : Prisma.sql`coalesce(fused.kw_rank / (1 + fused.kw_rank), 0)::double precision`;

  return getPrisma().$queryRaw<PostgresPaperSearchRow[]>(Prisma.sql`
    WITH filtered AS (
      SELECT p.id, p.embedding, p.search_document
      FROM papers p
      WHERE TRUE
        ${filters}
    ),
    vec AS (${vecCte}),
    kw AS (${kwCte}),
    fused AS (
      SELECT
        coalesce(vec.id, kw.id) AS id,
        kw.rank AS kw_rank,
        coalesce(1.0 / (${rrfK} + vec.rnk), 0) + coalesce(1.0 / (${rrfK} + kw.rnk), 0) AS rrf
      FROM vec
      FULL OUTER JOIN kw ON vec.id = kw.id
    )
    SELECT
      p.id,
      p.legacy_mongo_id AS "legacyMongoId",
      ${scoreSql} AS score,
      (fused.rrf / ${maxRrf})::double precision AS "hybridScore"
    FROM fused
    JOIN papers p ON p.id = fused.id
    ORDER BY fused.rrf DESC, p.id
    LIMIT ${limit}
  `);
}
