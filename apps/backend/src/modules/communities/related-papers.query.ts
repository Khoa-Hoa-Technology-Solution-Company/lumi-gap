import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";

export interface RelatedPaper {
  id: string;
  title: string;
  publicationYear: number;
  citationCount: number;
  doi?: string;
}

/**
 * Papers matching any of the topics. Pure PostgreSQL full-text search (`websearch_to_tsquery('simple', ...)`),
 * ranked by `ts_rank x ln(2 + citation_count)`; never an LLM call. Shared by community pages and "For you".
 */
export async function searchPapersByTopics(topics: readonly string[], limit: number): Promise<RelatedPaper[]> {
  if (topics.length === 0) return [];
  const tsquery = Prisma.sql`(${Prisma.join(topics.map((topic) => Prisma.sql`websearch_to_tsquery('simple', ${topic}::text)`), " || ")})`;
  const rows = await getPrisma().$queryRaw<Array<{ id: string; legacy_mongo_id: string | null; title: string; publication_year: number; citation_count: number; doi: string | null }>>(Prisma.sql`
    SELECT "id", "legacy_mongo_id", "title", "publication_year", "citation_count", "doi"
    FROM "papers"
    WHERE "data_status" = 'active' AND "search_document" @@ ${tsquery}
    ORDER BY ts_rank("search_document", ${tsquery}) * ln(2 + "citation_count") DESC, "publication_year" DESC
    LIMIT ${limit}::int`);
  return rows.map((row) => ({
    id: publicDatabaseId({ id: row.id, legacyMongoId: row.legacy_mongo_id }),
    title: row.title,
    publicationYear: Number(row.publication_year),
    citationCount: Number(row.citation_count),
    doi: row.doi ?? undefined,
  }));
}
