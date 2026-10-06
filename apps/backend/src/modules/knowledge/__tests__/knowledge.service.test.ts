import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const paper = { id: "00000000-0000-4000-8000-000000000001", title: "Forest classification", abstractText: "Random Forest evaluation", pdfPath: null, openAccessUrl: null, uploadedAt: null, dataStatus: "active" };
  const db = {
    paper: { findFirst: vi.fn() },
    paperDocument: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(), $executeRaw: vi.fn(),
  };
  return { paper, db, add: vi.fn() };
});
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.db }));
vi.mock("../../../infrastructure/queue.js", () => ({ paperAnalysisQueue: { add: mocks.add } }));
import { knowledgeService } from "../knowledge.service.js";
import { RAG_INDEX_VERSION, sourceFingerprint } from "../knowledge.text.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.paper.findFirst.mockResolvedValue(mocks.paper);
  mocks.db.$transaction.mockImplementation(async (work) => work(mocks.db));
  mocks.db.paperDocument.upsert.mockResolvedValue({ id: "document" });
  mocks.db.paperDocument.updateMany.mockResolvedValue({ count: 1 });
});

describe("knowledge indexing requests", () => {
  it("serializes the enqueue decision and adds a targeted worker job", async () => {
    await expect(knowledgeService.requestIndex(mocks.paper.id)).resolves.toEqual({ status: "queued" });
    expect(mocks.db.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.db.paperDocument.upsert).toHaveBeenCalledOnce();
    expect(mocks.add).toHaveBeenCalledWith("index-paper", { paperIds: [mocks.paper.id], force: true, maxPapers: 1 }, expect.objectContaining({ jobId: expect.stringContaining(`rag-${mocks.paper.id}-`) }));
  });

  it("does not enqueue a current ready index unless explicitly refreshed", async () => {
    mocks.db.paperDocument.findUnique.mockResolvedValue({ status: "ready", sourceHash: sourceFingerprint(mocks.paper), indexVersion: RAG_INDEX_VERSION, updatedAt: new Date() });
    await expect(knowledgeService.requestIndex(mocks.paper.id)).resolves.toEqual({ status: "ready" });
    expect(mocks.add).not.toHaveBeenCalled();
    await expect(knowledgeService.requestIndex(mocks.paper.id, true)).resolves.toEqual({ status: "queued" });
    expect(mocks.add).toHaveBeenCalledOnce();
  });

  it.each(["queued", "processing"])("does not duplicate a recent %s request even when forced", async (status) => {
    mocks.db.paperDocument.findUnique.mockResolvedValue({ status, sourceHash: sourceFingerprint(mocks.paper), updatedAt: new Date() });
    await expect(knowledgeService.requestIndex(mocks.paper.id, true)).resolves.toEqual({ status });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("records queue failure so the user can retry", async () => {
    mocks.add.mockRejectedValue(new Error("Redis offline"));
    await expect(knowledgeService.requestIndex(mocks.paper.id)).rejects.toThrow("queue is unavailable");
    expect(mocks.db.paperDocument.updateMany).toHaveBeenCalledWith({ where: { id: "document", sourceHash: sourceFingerprint(mocks.paper), status: "queued" }, data: { status: "failed", errorMessage: "Index queue unavailable; retry later" } });
  });

  it("rejects unknown or unapproved papers before enqueueing", async () => {
    mocks.db.paper.findFirst.mockResolvedValue(null);
    await expect(knowledgeService.requestIndex(mocks.paper.id)).rejects.toThrow("Approved paper not found");
    expect(mocks.db.paper.findFirst).toHaveBeenCalledWith({ where: { dataStatus: "active", id: mocks.paper.id } });
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
