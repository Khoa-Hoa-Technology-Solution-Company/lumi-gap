import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { filterSql, isUsableSearchVector, type PostgresPaperSearchFilters, type PostgresPaperSearchRow } from "../../infrastructure/database/postgres-paper-search.js";
import { RAG_INDEX_VERSION, sourceFingerprint } from "./knowledge.text.js";
import type { KnowledgeEvidence } from "./knowledge.types.js";

function vectorLiteral(vector?: number[]): string | null {
  return isUsableSearchVector(vector)
    ? `[${vector.join(",")}]` : null;
}

export async function searchKnowledgePapers(query: string, vector: number[] | undefined, filters: PostgresPaperSearchFilters, limit: number): Promise<PostgresPaperSearchRow[]> {
  const validVector = vectorLiteral(vector);
  if (!query.trim() && !validVector) return [];
  // Match metadata retrieval's (1 + cosine) / 2 and rank / (1 + rank) scales.
  const relevance = validVector
    ? Prisma.sql`COALESCE(1 - (NULLIF(c.embedding <=> ${validVector}::vector, 'NaN'::float8) / 2.0), 0)`
    : Prisma.sql`ts_rank_cd(to_tsvector('simple', c.text), websearch_to_tsquery('simple', ${query}), 32)`;
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
  if (!ids.length) return papers;
  const prisma = getPrisma();
  const docs = await prisma.paperDocument.findMany({ where: { status: "ready", indexVersion: RAG_INDEX_VERSION, paper: { dataStatus: "active", OR: ids.map((id) => id.kind === "uuid" ? { id: id.value } : { legacyMongoId: id.value }) } }, include: { paper: true } });
  // Edited/withdrawn source content must never be presented as the current paper.
  const current = docs.filter((doc) => doc.sourceHash === sourceFingerprint(doc.paper));
  if (!current.length) return papers;
  const byId = new Map(current.flatMap((doc) => [[doc.paperId, doc], [publicDatabaseId(doc.paper), doc]] as const));
  const documentIds = current.map((doc) => doc.id);
  const validVector = vectorLiteral(vector);
  const lexical = Prisma.sql`ts_rank_cd(to_tsvector('simple', text), websearch_to_tsquery('simple', ${query}), 32)`;
  const ranking = validVector
    ? Prisma.sql`0.7 * COALESCE(1 - (NULLIF(embedding <=> ${validVector}::vector, 'NaN'::float8) / 2.0), 0) + 0.3 * ${lexical}`
    : lexical;
  type Chunk = { documentId: string; id: string; pageNumber: number | null; text: string };
  // LATERAL applies top-k independently to each authorized document in one query.
  const chunks = await prisma.$queryRaw<Chunk[]>(Prisma.sql`
    SELECT d.id AS "documentId", c.id, c.page_number AS "pageNumber", c.text
    FROM paper_documents d CROSS JOIN LATERAL (
      SELECT id, page_number, text, position, ${ranking} AS score FROM paper_chunks WHERE document_id = d.id
      ORDER BY score DESC NULLS LAST, position ASC LIMIT ${env.RAG_PASSAGES_PER_PAPER}
    ) c WHERE d.id = ANY(${documentIds}::uuid[]) ORDER BY d.id, c.score DESC NULLS LAST, c.position`);
  type Relation = { chunkId: string; kind: string; name: string; quote: string };
  const relations = chunks.length ? await prisma.$queryRaw<Relation[]>(Prisma.sql`
    SELECT r.* FROM paper_documents d CROSS JOIN LATERAL (
      SELECT r.chunk_id AS "chunkId", r.kind, e.name, r.quote
      FROM knowledge_relations r JOIN knowledge_entities e ON e.id = r.entity_id
      JOIN paper_chunks c ON c.id = r.chunk_id
      WHERE c.document_id = d.id AND r.chunk_id = ANY(${chunks.map((chunk) => chunk.id)}::uuid[])
      ORDER BY c.position, r.id LIMIT 60
    ) r WHERE d.id = ANY(${documentIds}::uuid[])`) : [];
  const relationsByChunk = new Map<string, string[]>();
  for (const row of relations) {
    const list = relationsByChunk.get(row.chunkId) ?? [];
    list.push(`${row.kind} → ${row.name}; source quote: ${row.quote}`);
    relationsByChunk.set(row.chunkId, list);
  }
  const chunksByDocument = new Map<string, KnowledgeEvidence["passages"]>();
  for (const { documentId, ...chunk } of chunks) {
    const list = chunksByDocument.get(documentId) ?? [];
    list.push({ ...chunk, relations: relationsByChunk.get(chunk.id) ?? [] });
    chunksByDocument.set(documentId, list);
  }
  return papers.map((paper) => {
    const doc = byId.get(parseDatabaseId(paper.id)?.value ?? paper.id);
    return doc ? { ...paper, knowledgeEvidence: { sourceKind: doc.sourceKind, contentHash: doc.contentHash!, warnings: doc.warnings, passages: chunksByDocument.get(doc.id) ?? [] } } : paper;
  });
}
