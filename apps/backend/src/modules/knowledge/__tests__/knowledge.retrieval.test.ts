import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ paperDocument: { findMany: vi.fn() }, $queryRaw: vi.fn() }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => db }));
vi.mock("../../../config/env.js", () => ({ env: { RAG_PASSAGES_PER_PAPER: 3 } }));
import { attachKnowledgeEvidence, searchKnowledgePapers } from "../knowledge.retrieval.js";
import { sourceFingerprint } from "../knowledge.text.js";
import { filterSql } from "../../../infrastructure/database/postgres-paper-search.js";
const paper = { id: "00000000-0000-4000-8000-000000000001", legacyMongoId: "a".repeat(24), title: "Active paper", abstractText: "An abstract", pdfPath: null, openAccessUrl: null, uploadedAt: null };
beforeEach(() => vi.resetAllMocks());
describe("RAG retrieval scope and provenance", () => {
  it("explicit empty project scopes select no papers", () => {
    expect(filterSql({ paperIds: [] }).text).toContain("FALSE");
    expect(filterSql({}).text).not.toContain("FALSE");
  });
  it("parameterizes the query and applies paper/year/active filters to full-text retrieval", async () => {
    db.$queryRaw.mockResolvedValue([{ ...paper, sourceHash: sourceFingerprint(paper), score: 0.9 }]);
    const query = "'); DROP TABLE papers; --";
    const rows = await searchKnowledgePapers(query, undefined, { paperIds: [paper.id], publicationYearFrom: 2022 }, 4);
    expect(rows).toHaveLength(1);
    const sql = db.$queryRaw.mock.calls[0]?.[0];
    expect(sql.text).toContain("p.data_status = 'active'");
    expect(sql.text).toContain("p.id = ANY"); expect(sql.text).toContain("p.publication_year >=");
    expect(sql.text).not.toContain(query); expect(sql.values).toContain(query);
  });
  it("removes stale indexes from candidate retrieval", async () => {
    db.$queryRaw.mockResolvedValue([{ ...paper, sourceHash: "obsolete", score: 0.9 }]);
    expect(await searchKnowledgePapers("methods", undefined, {}, 4)).toEqual([]);
  });
  it("attaches only selected-paper chunks and preserves legacy ID compatibility", async () => {
    db.paperDocument.findMany.mockResolvedValue([{ id: "document", paperId: paper.id, paper, sourceHash: sourceFingerprint(paper), sourceKind: "uploaded_pdf", contentHash: "content", warnings: [] }]);
    db.$queryRaw.mockResolvedValueOnce([{ documentId: "document", id: "chunk", pageNumber: 5, text: "A grounded method passage" }]);
    db.$queryRaw.mockResolvedValueOnce([{ chunkId: "chunk", kind: "USES_METHOD", name: "Random Forest", quote: "We use Random Forest" }]);
    const rows = await attachKnowledgeEvidence([{ id: paper.legacyMongoId }], "method");
    expect(rows[0]?.knowledgeEvidence?.passages[0]?.pageNumber).toBe(5);
    const where = db.paperDocument.findMany.mock.calls[0]?.[0].where;
    expect(where.paper.dataStatus).toBe("active"); expect(where.paper.OR).toEqual([{ legacyMongoId: paper.legacyMongoId }]);
    expect(db.$queryRaw.mock.calls[0]?.[0].values).toContainEqual(["document"]);
    expect(rows[0]?.knowledgeEvidence?.passages[0]?.relations[0]).toContain("Random Forest");
  });
  it("batches passages and relations while preserving paper order and provenance", async () => {
    const other = { ...paper, id: "00000000-0000-4000-8000-000000000002", legacyMongoId: null, title: "Second paper" };
    db.paperDocument.findMany.mockResolvedValue([paper, other].map((p, index) => ({ id: `doc-${index}`, paperId: p.id, paper: p, sourceHash: sourceFingerprint(p), sourceKind: "abstract", contentHash: `content-${index}`, warnings: [] })));
    db.$queryRaw.mockResolvedValueOnce([
      { documentId: "doc-0", id: "chunk-0", pageNumber: 1, text: "First passage" },
      { documentId: "doc-1", id: "chunk-1", pageNumber: 2, text: "Second passage" },
    ]).mockResolvedValueOnce([{ chunkId: "chunk-1", kind: "USES_METHOD", name: "Second method", quote: "Second passage" }]);
    const rows = await attachKnowledgeEvidence([{ id: other.id }, { id: paper.id }, { id: paper.legacyMongoId }, { id: "invalid" }], "method");
    expect(rows.map((row) => row.id)).toEqual([other.id, paper.id, paper.legacyMongoId, "invalid"]);
    expect(rows[0]?.knowledgeEvidence?.passages[0]).toMatchObject({ text: "Second passage", relations: [expect.stringContaining("Second method")] });
    expect(rows[1]?.knowledgeEvidence?.passages[0]).toMatchObject({ text: "First passage", relations: [] });
    expect(rows[2]?.knowledgeEvidence).toEqual(rows[1]?.knowledgeEvidence);
    expect(rows[3]?.knowledgeEvidence).toBeUndefined();
    expect(db.paperDocument.findMany).toHaveBeenCalledOnce();
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(db.$queryRaw.mock.calls[1]?.[0].text).toContain("LIMIT 60");
  });
  it("does not query the database when all paper IDs are invalid", async () => {
    expect(await attachKnowledgeEvidence([{ id: "invalid" }], "query")).toEqual([{ id: "invalid" }]);
    expect(db.paperDocument.findMany).not.toHaveBeenCalled();
  });
  it("does not use zero or malformed query vectors for semantic retrieval", async () => {
    db.$queryRaw.mockResolvedValue([]);
    for (const vector of [Array(768).fill(0), Array(768).fill(NaN), [1]]) {
      await searchKnowledgePapers("method", vector, {}, 4);
      expect(db.$queryRaw.mock.lastCall?.[0].text).not.toContain("<=>");
    }
    expect(await searchKnowledgePapers(" ", Array(768).fill(0), {}, 4)).toEqual([]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it("does not expose outdated chunk evidence", async () => {
    db.paperDocument.findMany.mockResolvedValue([{ id: "document", paperId: paper.id, paper, sourceHash: "obsolete" }]);
    expect(await attachKnowledgeEvidence([{ id: paper.id }], "query")).toEqual([{ id: paper.id }]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
