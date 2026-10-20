/**
 * pgvector reads used by the gap pipeline: paper embeddings for MMR, and nearest papers to a gap's own text as
 * possible counter-evidence. Parameterized Prisma SQL only (CLAUDE.md §6).
 */
import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { vectorParameter } from "../../infrastructure/database/postgres-paper-search.js";

const parseVector = (text: string): number[] => text.slice(1, -1).split(",").map(Number);

/** Embeddings of the given papers (public or internal ids), keyed by the id passed in. Papers without one are absent. */
export async function loadPaperEmbeddings(ids: string[]): Promise<Map<string, number[]>> {
  const uuids: string[] = [], legacy: string[] = [];
  for (const id of ids) { const parsed = parseDatabaseId(id); if (parsed?.kind === "uuid") uuids.push(parsed.value); else if (parsed) legacy.push(parsed.value); }
  if (!uuids.length && !legacy.length) return new Map();
  const rows = await getPrisma().$queryRaw<Array<{ id: string; legacyMongoId: string | null; embedding: string }>>(Prisma.sql`
    SELECT id, legacy_mongo_id AS "legacyMongoId", embedding::text AS embedding FROM papers
    WHERE embedding IS NOT NULL AND (id = ANY(${uuids}::uuid[]) OR legacy_mongo_id = ANY(${legacy}::text[]))`);
  const vectors = new Map<string, number[]>();
  for (const row of rows) { const vector = parseVector(row.embedding); vectors.set(row.id, vector); if (row.legacyMongoId) vectors.set(row.legacyMongoId, vector); }
  return vectors;
}

export interface PossibleCounterPaper { paperId: string; similarity: number }

/**
 * Active corpus papers whose embedding is close to the gap's own text (cosine >= GAP_COUNTER_MIN_SIMILARITY), nearest
 * first, at most GAP_COUNTER_PER_GAP. They MAY already answer the gap; a person has to read them. Papers the LLM read
 * (`excludeIds`, internal ids) are skipped. No year filter: an older paper can answer the question too.
 */
export async function findPossibleCounterPapers(gapVector: number[], excludeIds: string[]): Promise<PossibleCounterPaper[]> {
  const vector = vectorParameter(gapVector);
  const rows = await getPrisma().$queryRaw<Array<{ id: string; similarity: number }>>(Prisma.sql`
    SELECT id, (1 - (embedding <=> ${vector}::vector))::double precision AS similarity FROM papers
    WHERE data_status = 'active' AND embedding IS NOT NULL AND NOT (id = ANY(${excludeIds}::uuid[]))
    ORDER BY embedding <=> ${vector}::vector, id
    LIMIT ${env.GAP_COUNTER_PER_GAP}`);
  return rows.filter((row) => row.similarity >= env.GAP_COUNTER_MIN_SIMILARITY).map((row) => ({ paperId: row.id, similarity: row.similarity }));
}
