import { randomUUID } from "node:crypto";
import type { PaperKnowledge } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { paperAnalysisQueue } from "../../infrastructure/queue.js";
import { RAG_INDEX_VERSION, sourceFingerprint } from "./knowledge.text.js";

async function approvedPaper(input: string) {
  const parsed = parseDatabaseId(input);
  if (!parsed) throw AppError.notFound("Paper not found");
  const paper = await getPrisma().paper.findFirst({ where: { dataStatus: "active", ...(parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }) } });
  if (!paper) throw AppError.notFound("Approved paper not found");
  return paper;
}

export const knowledgeService = {
  async requestIndex(input: string, force = false, userId?: string): Promise<{ status: string }> {
    const paper = await approvedPaper(input);
    const prisma = getPrisma();
    const hash = sourceFingerprint(paper);
    const claimed = await prisma.$transaction(async (tx) => {
      // Serialize the short enqueue decision across concurrent API requests.
      // The lock function returns PostgreSQL void, which Prisma cannot decode.
      // Execute it without deserializing a result row; the transaction owns it.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rag:${paper.id}`}, 0))`;
      const existing = await tx.paperDocument.findUnique({ where: { paperId: paper.id } });
      if (existing && existing.sourceHash === hash) {
        if (!force && existing.status === "ready" && existing.indexVersion === RAG_INDEX_VERSION) return { status: "ready", document: null };
        if (["queued", "processing"].includes(existing.status) && existing.updatedAt.getTime() > Date.now() - 30 * 60 * 1000) return { status: existing.status, document: null };
      }
      const document = await tx.paperDocument.upsert({ where: { paperId: paper.id }, create: { paperId: paper.id, sourceHash: hash }, update: { sourceHash: hash, status: "queued", indexingToken: null, errorMessage: null } });
      return { status: "queued", document };
    });
    if (!claimed.document) return { status: claimed.status };
    const document = claimed.document;
    try {
      await paperAnalysisQueue.add("index-paper", { paperIds: [paper.id], force: true, maxPapers: 1, ...(userId ? { userId } : {}) }, { jobId: `rag-${paper.id}-${randomUUID()}` });
    } catch (error) {
      await prisma.paperDocument.updateMany({ where: { id: document.id, sourceHash: hash, status: "queued" }, data: { status: "failed", errorMessage: "Index queue unavailable; retry later" } });
      throw AppError.serviceUnavailable("Paper indexing queue is unavailable");
    }
    return { status: "queued" };
  },

  async get(input: string): Promise<PaperKnowledge> {
    const paper = await approvedPaper(input);
    const prisma = getPrisma();
    const doc = await prisma.paperDocument.findUnique({ where: { paperId: paper.id } });
    const base: PaperKnowledge = { paperId: publicDatabaseId(paper), status: "not_indexed", warnings: [], nodes: [], edges: [], passages: [] };
    if (!doc) return base;
    const outdated = doc.sourceHash !== sourceFingerprint(paper) || (doc.status === "ready" && doc.indexVersion !== RAG_INDEX_VERSION);
    const result: PaperKnowledge = { ...base, status: outdated ? "outdated" : doc.status as PaperKnowledge["status"], sourceKind: doc.sourceKind, pageCount: doc.pageCount, indexedAt: doc.indexedAt?.toISOString(), warnings: doc.warnings, errorMessage: doc.errorMessage ?? undefined };
    if (outdated || doc.status !== "ready") return result;
    const [count, chunks, relations] = await Promise.all([
      prisma.paperChunk.count({ where: { documentId: doc.id } }),
      prisma.paperChunk.findMany({ where: { documentId: doc.id }, orderBy: { position: "asc" }, take: 12 }),
      prisma.knowledgeRelation.findMany({ where: { chunk: { documentId: doc.id } }, include: { entity: true, chunk: { select: { pageNumber: true } } }, orderBy: { id: "asc" }, take: 100 }),
    ]);
    result.chunkCount = count;
    result.passages = chunks.map((chunk) => ({ id: chunk.id, pageNumber: chunk.pageNumber, text: chunk.text }));
    result.nodes = [...new Map(relations.map((row) => [row.entityId, { id: row.entityId, kind: row.entity.kind, name: row.entity.name }])).values()];
    result.edges = relations.map((row) => ({ id: row.id, targetId: row.entityId, kind: row.kind, quote: row.quote, chunkId: row.chunkId, pageNumber: row.chunk.pageNumber }));
    return result;
  },
};
