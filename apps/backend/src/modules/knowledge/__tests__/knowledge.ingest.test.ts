import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const paper = { id: "00000000-0000-4000-8000-000000000001", title: "Forest classification", abstractText: "We use Random Forest on the Adult dataset.", pdfPath: null, openAccessUrl: null, uploadedAt: null, dataStatus: "active", aiAnalysis: null };
  const document = { id: "00000000-0000-4000-8000-000000000002", status: "queued", sourceHash: "", indexVersion: null, updatedAt: new Date(0), indexingToken: null as string | null };
  const db = {
    paper: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    paperDocument: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    paperChunk: { deleteMany: vi.fn() },
    knowledgeEntity: { upsert: vi.fn() }, knowledgeRelation: { create: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn(), $executeRaw: vi.fn(),
  };
  return { db, paper, document, source: vi.fn(), llm: vi.fn(), embedBatch: vi.fn() };
});
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.db }));
vi.mock("../../../config/env.js", () => ({ env: { RAG_CHUNK_CHARS: 2400, RAG_MAX_CHUNKS: 300, GEMINI_MODEL_FAST: "test", PAPER_ANALYSIS_MAX_OUTPUT_TOKENS: 4096 } }));
vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: () => ({ dimensions: 768, embedBatch: mocks.embedBatch }) }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: mocks.llm }));
vi.mock("../knowledge.source.js", () => ({ loadPaperSource: mocks.source }));
import { indexPaper } from "../knowledge.ingest.js";
import { RAG_INDEX_VERSION, sourceFingerprint } from "../knowledge.text.js";

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(mocks.document, { status: "queued", sourceHash: "", indexVersion: null, indexingToken: null, updatedAt: new Date(0) });
  mocks.db.paper.findUniqueOrThrow.mockResolvedValue(mocks.paper);
  mocks.db.paperDocument.findUnique.mockResolvedValue(mocks.document);
  mocks.db.paperDocument.findUniqueOrThrow.mockImplementation(async () => mocks.document);
  mocks.db.paperDocument.upsert.mockImplementation(async ({ update }) => Object.assign(mocks.document, update));
  mocks.db.paperDocument.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.$queryRaw.mockResolvedValue([{ locked: true }]);
  mocks.db.$transaction.mockImplementation(async (work) => work(mocks.db));
  mocks.db.knowledgeEntity.upsert.mockResolvedValue({ id: "entity" });
  mocks.source.mockResolvedValue({ sourceKind: "uploaded_pdf", pageCount: 3, warnings: [], pages: [{ pageNumber: 3, text: mocks.paper.abstractText }] });
  mocks.embedBatch.mockResolvedValue([Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0)]);
  mocks.llm.mockImplementation(async (args) => args.validate({ analysis: { summary: "Random Forest evaluation" }, relations: [{ kind: "USES_METHOD", name: "Random Forest", quote: mocks.paper.abstractText, chunkPosition: 0 }, { kind: "REPORTS_FINDING", name: "Fake accuracy", quote: "We achieve 99% accuracy.", chunkPosition: 0 }] }));
});

describe("paper ingestion lifecycle", () => {
  it("indexes pages, validates graph quotes and publishes an atomic ready result", async () => {
    await indexPaper(mocks.paper.id);
    expect(mocks.db.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.db.knowledgeRelation.create).toHaveBeenCalledOnce();
    expect(mocks.db.knowledgeRelation.create.mock.calls[0]?.[0].data.quote).toBe(mocks.paper.abstractText);
    expect(mocks.db.paperDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ready", pageCount: 3, indexingToken: null }) }));
  });
  it("replays a current ready document without extraction, embedding or LLM calls", async () => {
    Object.assign(mocks.document, { status: "ready", sourceHash: sourceFingerprint(mocks.paper), indexVersion: RAG_INDEX_VERSION });
    await indexPaper(mocks.paper.id);
    expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.llm).not.toHaveBeenCalled();
  });
  it("marks extraction failure and keeps previous chunks intact for recovery", async () => {
    mocks.source.mockRejectedValue(new Error("OCR required"));
    await expect(indexPaper(mocks.paper.id)).rejects.toThrow("OCR required");
    expect(mocks.db.paperChunk.deleteMany).not.toHaveBeenCalled();
    expect(mocks.db.paperDocument.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
  });
  it("rejects a source edit before replacing the index", async () => {
    mocks.db.paper.findUniqueOrThrow.mockResolvedValueOnce(mocks.paper).mockResolvedValueOnce({ ...mocks.paper, abstractText: "Edited" });
    await expect(indexPaper(mocks.paper.id)).rejects.toThrow("source changed");
    expect(mocks.db.paperChunk.deleteMany).not.toHaveBeenCalled();
  });
  it("does not index drafts, acquire another worker's lease or publish bad vectors", async () => {
    mocks.db.paper.findUniqueOrThrow.mockResolvedValueOnce({ ...mocks.paper, dataStatus: "draft" });
    await expect(indexPaper(mocks.paper.id)).rejects.toThrow("approved active");
    Object.assign(mocks.document, { status: "processing", updatedAt: new Date() });
    await expect(indexPaper(mocks.paper.id)).rejects.toThrow("already running");
    mocks.document.status = "queued";
    mocks.embedBatch.mockResolvedValue([[1, 2]]);
    await expect(indexPaper(mocks.paper.id)).rejects.toThrow("Invalid passage embeddings");
    expect(mocks.db.paperChunk.deleteMany).not.toHaveBeenCalled();
  });
});
