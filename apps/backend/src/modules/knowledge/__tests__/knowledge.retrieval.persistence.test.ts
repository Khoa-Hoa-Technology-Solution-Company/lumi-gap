import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma, disconnectPostgres } from "../../../infrastructure/database/prisma.js";
import { vectorParameter } from "../../../infrastructure/database/postgres-paper-search.js";
import { attachKnowledgeEvidence, searchKnowledgePapers } from "../knowledge.retrieval.js";
import { RAG_INDEX_VERSION, sourceFingerprint } from "../knowledge.text.js";

const unit = (axis: number, sign = 1) => Array.from({ length: 768 }, (_, i) => i === axis ? sign : 0);

const queryLog = vi.hoisted(() => [] as string[]);
// A real PostgreSQL client with query events measures actual SQL statements, including ORM joins.
vi.mock("../../../infrastructure/database/prisma.js", async () => {
  const { PrismaClient } = await import("../../../generated/prisma/client.js");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { env } = await import("../../../config/env.js");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }), log: [{ emit: "event", level: "query" }] });
  client.$on("query", (event) => queryLog.push(event.query));
  return { getPrisma: () => client, disconnectPostgres: () => client.$disconnect() };
});

vi.mock("../../../config/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../config/env.js")>();
  return { ...original, env: { ...original.env, RAG_PASSAGES_PER_PAPER: 3 } };
});

describe.sequential("batched knowledge retrieval (PostgreSQL/pgvector)", () => {
  const marker = randomUUID();
  const token = `rag${marker.replace(/-/g, "")}`;
  const paperIds: string[] = [];
  const chunks: string[][] = [];
  const entityIds: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    // Parallel, orthogonal, opposite, stale, inactive and non-ready documents.
    for (let i = 0; i < 6; i++) {
      const paper = await prisma.paper.create({ data: {
        title: `RAG batch ${marker} ${i}`, abstractText: "A source abstract", publicationYear: 2026,
        primaryProvider: "user", dataStatus: i === 4 ? "draft" : "active",
      } });
      paperIds.push(paper.id);
      const document = await prisma.paperDocument.create({ data: {
        paperId: paper.id, status: i === 5 ? "processing" : "ready", sourceKind: "abstract",
        sourceHash: i === 3 ? "obsolete" : sourceFingerprint(paper), contentHash: marker,
        indexVersion: RAG_INDEX_VERSION,
      } });
      const texts = i === 0 ? ["Unrelated", Array(60).fill(token).join(" "), "Parallel passage", "Orthogonal passage", "Zero vector"] : [token];
      const vectors = i === 0 ? [unit(0, -1), null, unit(0), unit(1), Array(768).fill(0)] : [i === 1 ? unit(1) : i === 2 ? unit(0, -1) : unit(0)];
      const ids: string[] = [];
      chunks.push(ids);
      for (const [position, text] of texts.entries()) {
        const chunk = await prisma.paperChunk.create({ data: { documentId: document.id, position, text, pageNumber: position + 1, contentHash: marker } });
        ids.push(chunk.id);
        const vector = vectors[position];
        if (vector) await prisma.$executeRaw`UPDATE paper_chunks SET embedding = ${vectorParameter(vector)}::vector WHERE id = ${chunk.id}::uuid`;
      }
    }
    // Each document must retain its own 60-relation allowance.
    for (let i = 0; i < 65; i++) {
      const entity = await prisma.knowledgeEntity.create({ data: { kind: "method", name: `Method ${i}`, normalizedName: `${marker}-${i}` } });
      entityIds.push(entity.id);
    }
    await prisma.knowledgeRelation.createMany({ data: [0, 1].flatMap((doc) => entityIds.map((entityId) => ({ chunkId: chunks[doc]![doc === 0 ? 2 : 0]!, entityId, kind: "USES_METHOD", quote: "A grounded method quote" }))) });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
    await prisma.knowledgeEntity.deleteMany({ where: { id: { in: entityIds } } });
    await disconnectPostgres();
  });

  it("uses the same semantic score scale as metadata and enforces source scope", async () => {
    const rows = await searchKnowledgePapers(token, unit(0), { paperIds }, 10);
    expect(rows.map((row) => row.id)).toEqual(paperIds.slice(0, 3));
    expect(rows.map((row) => row.score)).toEqual([1, 0.5, 0]);
    expect(await searchKnowledgePapers(token, unit(0), { paperIds: [] }, 10)).toEqual([]);
    expect((await searchKnowledgePapers(token, unit(0), { paperIds: [paperIds[1]!] }, 10)).map((row) => row.id)).toEqual([paperIds[1]]);
  });

  it("bounds lexical scores and falls back from an unusable query vector", async () => {
    const rows = await searchKnowledgePapers(token, undefined, { paperIds }, 10);
    expect(rows).toHaveLength(3);
    for (const row of rows) { expect(row.score).toBeGreaterThan(0); expect(row.score).toBeLessThan(1); }
    expect(await searchKnowledgePapers(token, Array(768).fill(0), { paperIds }, 10)).toEqual(rows);
  });

  it("keeps ranked top-k per document, including lexical matches without embeddings", async () => {
    const rows = await attachKnowledgeEvidence(paperIds.map((id) => ({ id })), token, unit(0));
    expect(rows.map((row) => row.id)).toEqual(paperIds);
    expect(rows[0]?.knowledgeEvidence?.passages.map((p) => p.id)).toEqual([chunks[0]![2], chunks[0]![3], chunks[0]![1]]);
    expect(rows[0]?.knowledgeEvidence?.passages.map((p) => p.pageNumber)).toEqual([3, 4, 2]);
    expect(rows[1]?.knowledgeEvidence?.passages).toHaveLength(1);
    expect(rows[2]?.knowledgeEvidence?.passages).toHaveLength(1);
    for (const row of rows.slice(3)) expect(row.knowledgeEvidence).toBeUndefined();
    const first = rows[0]!.knowledgeEvidence!.passages.flatMap((p) => p.relations);
    const second = rows[1]!.knowledgeEvidence!.passages.flatMap((p) => p.relations);
    expect(first).toHaveLength(60); expect(second).toHaveLength(60);
    expect(first[0]).toContain("source quote: A grounded method quote");
    expect((await attachKnowledgeEvidence([{ id: paperIds[0]! }], token, unit(0)))[0]?.knowledgeEvidence).toEqual(rows[0]?.knowledgeEvidence);
  });

  it("preserves lexical ranking and position ties in keyword-only mode", async () => {
    const [row] = await attachKnowledgeEvidence([{ id: paperIds[0]! }], token);
    expect(row?.knowledgeEvidence?.passages.map((p) => p.id)).toEqual([chunks[0]![1], chunks[0]![0], chunks[0]![2]]);
  });

  it("uses a constant number of SQL statements for one or many evidence papers", async () => {
    queryLog.length = 0;
    await attachKnowledgeEvidence([{ id: paperIds[0]! }], token, unit(0));
    const singleQueries = queryLog.length;
    queryLog.length = 0;
    await attachKnowledgeEvidence(paperIds.slice(0, 3).map((id) => ({ id })), token, unit(0));
    expect(queryLog.length).toBe(singleQueries);
    expect(queryLog.length).toBeLessThanOrEqual(4);
    expect(queryLog.length).toBeGreaterThanOrEqual(3);
  });
});
