import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { filterSql, type PostgresPaperSearchFilters, type PostgresPaperSearchRow } from "../../infrastructure/database/postgres-paper-search.js";
import { RAG_INDEX_VERSION, sourceFingerprint } from "./knowledge.text.js";
import type { KnowledgeEvidence } from "./knowledge.types.js";

export async function searchKnowledgePapers(query: string, vector: number[] | undefined, filters: PostgresPaperSearchFilters, limit: number): Promise<PostgresPaperSearchRow[]> {
  const validVector = vector?.length === 768 && vector.every(Number.isFinite) ? `[${vector.join(",")}]` : null;
  if (!query.trim() && !validVector) return [];
  const relevance = validVector
    ? Prisma.sql`GREATEST(0, 1 - (c.embedding <=> ${validVector}::vector))`
    : Prisma.sql`ts_rank_cd(to_tsvector('simple', c.text), websearch_to_tsquery('simple', ${query}))`;
  const matches = validVector ? Prisma.sql`c.embedding IS NOT NULL` : Prisma.sql`to_tsvector('simple', c.text) @@ websearch_to_tsquery('simple', ${query})`;
  const rows = await getPrisma().$queryRaw<Array<{ id: string; legacyMongoId: string | null; score: number; sourceHash: string; title: string; abstractText: string | null; pdfPath: string | null; openAccessUrl: string | null; uploadedAt: Date | null }>>(Prisma.sql`
    SELECT p.id, p.legacy_mongo_id AS "legacyMongoId", p.title, p.abstract_text AS "abstractText",
      p.pdf_path AS "pdfPath", p.open_access_url AS "openAccessUrl", p.uploaded_at AS "uploadedAt",
      d.source_hash AS "sourceHash", MAX(${relevance})::float AS score
    FROM paper_chunks c JOIN paper_documents d ON d.id = c.document_id JOIN papers p ON p.id = d.paper_id
    WHERE d.status = 'ready' AND d.index_version = ${RAG_INDEX_VERSION} AND p.data_status = 'active' AND ${matches} ${filterSql(filters)}
    GROUP BY p.id, d.source_hash ORDER BY score DESC, p.id LIMIT ${limit}`);
  return rows.filter((row) => row.sourceHash === sourceFingerprint(row)).map((row) => ({ id: row.id, legacyMongoId: row.legacyMongoId, score: Number(row.score), hybridScore: Number(row.score) }));
}

export async function attachKnowledgeEvidence<T extends { id: string }>(papers: T[], query: string, vector?: number[]): Promise<Array<T & { knowledgeEvidence?: KnowledgeEvidence }>> {
  if (!papers.length) return [];
  const ids = papers.map((paper) => parseDatabaseId(paper.id)).filter((id): id is NonNullable<typeof id> => Boolean(id));
  const prisma = getPrisma();
  const docs = await prisma.paperDocument.findMany({ where: { status: "ready", indexVersion: RAG_INDEX_VERSION, paper: { dataStatus: "active", OR: ids.map((id) => id.kind === "uuid" ? { id: id.value } : { legacyMongoId: id.value }) } }, include: { paper: true } });
  // Edited/withdrawn source content must never be presented as the current paper.
  const current = docs.filter((doc) => doc.sourceHash === sourceFingerprint(doc.paper));
  const byId = new Map(current.flatMap((doc) => [[doc.paperId, doc], [publicDatabaseId(doc.paper), doc]] as const));
  const validVector = vector?.length === 768 && vector.every(Number.isFinite) ? `[${vector.join(",")}]` : null;
  return Promise.all(papers.map(async (paper) => {
    const doc = byId.get(paper.id);
    if (!doc) return paper;
    const ranking = validVector
      ? Prisma.sql`0.7 * (1 - (embedding <=> ${validVector}::vector)) + 0.3 * ts_rank_cd(to_tsvector('simple', text), websearch_to_tsquery('simple', ${query}))`
      : Prisma.sql`ts_rank_cd(to_tsvector('simple', text), websearch_to_tsquery('simple', ${query}))`;
    const chunks = await prisma.$queryRaw<Array<{ id: string; pageNumber: number | null; text: string }>>(Prisma.sql`
      SELECT id, page_number AS "pageNumber", text FROM paper_chunks WHERE document_id = ${doc.id}::uuid
      ORDER BY ${ranking} DESC NULLS LAST, position ASC LIMIT ${env.RAG_PASSAGES_PER_PAPER}`);
    const relations = await prisma.knowledgeRelation.findMany({ where: { chunkId: { in: chunks.map((chunk) => chunk.id) } }, include: { entity: true }, take: 60 });
    return { ...paper, knowledgeEvidence: { sourceKind: doc.sourceKind, contentHash: doc.contentHash!, warnings: doc.warnings, passages: chunks.map((chunk) => ({ ...chunk, relations: relations.filter((row) => row.chunkId === chunk.id).map((row) => `${row.kind} → ${row.entity.name}; source quote: ${row.quote}`) })) } };
  }));
}
