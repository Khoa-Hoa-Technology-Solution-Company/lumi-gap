import { Prisma } from "../../generated/prisma/client.js";

import { getPrisma } from "./prisma.js";

export const PAPER_EMBEDDING_DIMENSIONS = 768;

export type PostgresPaperSearchFilters = {
  publicationYearFrom?: number;
  publicationYearTo?: number;
  language?: string;
  paperKind?: string;
  openAccessStatus?: string;
  primaryProvider?: string;
  dataStatus?: string;
};

export type PostgresPaperSearchRow = {
  id: string;
  legacyMongoId: string | null;
  title: string;
  abstractText: string | null;
  publicationYear: number;
  citationCount: number;
  score: number;
  totalCount: bigint;
};

function pagination(limit: number, offset: number): { limit: number; offset: number } {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("limit must be an integer between 1 and 500");
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }
  return { limit, offset };
}

function filterSql(filters: PostgresPaperSearchFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (filters.publicationYearFrom !== undefined) {
    conditions.push(Prisma.sql`p.publication_year >= ${filters.publicationYearFrom}`);
  }
  if (filters.publicationYearTo !== undefined) {
    conditions.push(Prisma.sql`p.publication_year <= ${filters.publicationYearTo}`);
  }
  if (filters.language !== undefined) conditions.push(Prisma.sql`p.language = ${filters.language}`);
  if (filters.paperKind !== undefined) conditions.push(Prisma.sql`p.paper_kind = ${filters.paperKind}`);
  if (filters.openAccessStatus !== undefined) {
    conditions.push(Prisma.sql`p.open_access_status = ${filters.openAccessStatus}`);
  }
  if (filters.primaryProvider !== undefined) {
    conditions.push(Prisma.sql`p.primary_provider = ${filters.primaryProvider}`);
  }
  if (filters.dataStatus !== undefined) conditions.push(Prisma.sql`p.data_status = ${filters.dataStatus}`);
  return conditions.length > 0 ? Prisma.sql`AND ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

export function vectorParameter(embedding: readonly number[]): string {
  if (embedding.length !== PAPER_EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding must contain exactly ${PAPER_EMBEDDING_DIMENSIONS} values`);
  }
  if (!embedding.every(Number.isFinite)) throw new Error("Embedding contains a non-finite value");
  return `[${embedding.join(",")}]`;
}

export async function searchPapersByEmbedding(input: {
  embedding: readonly number[];
  filters?: PostgresPaperSearchFilters;
  limit: number;
  offset: number;
}): Promise<PostgresPaperSearchRow[]> {
  const { limit, offset } = pagination(input.limit, input.offset);
  const vector = vectorParameter(input.embedding);
  const filters = filterSql(input.filters ?? {});
  return getPrisma().$queryRaw<PostgresPaperSearchRow[]>(Prisma.sql`
    SELECT
      p.id,
      p.legacy_mongo_id AS "legacyMongoId",
      p.title,
      p.abstract_text AS "abstractText",
      p.publication_year AS "publicationYear",
      p.citation_count AS "citationCount",
      (1 - ((p.embedding <=> CAST(${vector} AS vector)) / 2.0))::double precision AS score,
      count(*) OVER() AS "totalCount"
    FROM papers p
    WHERE p.embedding IS NOT NULL
      ${filters}
    ORDER BY p.embedding <=> CAST(${vector} AS vector), p.id
    LIMIT ${limit}
    OFFSET ${offset}
  `);
}

export async function searchPapersByKeyword(input: {
  query: string;
  filters?: PostgresPaperSearchFilters;
  limit: number;
  offset: number;
}): Promise<PostgresPaperSearchRow[]> {
  const query = input.query.trim();
  if (!query) throw new Error("Keyword query cannot be empty");
  const { limit, offset } = pagination(input.limit, input.offset);
  const filters = filterSql(input.filters ?? {});
  return getPrisma().$queryRaw<PostgresPaperSearchRow[]>(Prisma.sql`
    SELECT
      p.id,
      p.legacy_mongo_id AS "legacyMongoId",
      p.title,
      p.abstract_text AS "abstractText",
      p.publication_year AS "publicationYear",
      p.citation_count AS "citationCount",
      ts_rank_cd(p.search_document, websearch_to_tsquery('simple', ${query}))::double precision AS score,
      count(*) OVER() AS "totalCount"
    FROM papers p
    WHERE p.search_document @@ websearch_to_tsquery('simple', ${query})
      ${filters}
    ORDER BY score DESC, p.citation_count DESC, p.id
    LIMIT ${limit}
    OFFSET ${offset}
  `);
}
