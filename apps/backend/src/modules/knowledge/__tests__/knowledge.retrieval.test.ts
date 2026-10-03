import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ paperDocument: { findMany: vi.fn() }, knowledgeRelation: { findMany: vi.fn() }, $queryRaw: vi.fn() }));
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
    db.$queryRaw.mockResolvedValue([{ id: "chunk", pageNumber: 5, text: "A grounded method passage" }]);
    db.knowledgeRelation.findMany.mockResolvedValue([{ chunkId: "chunk", kind: "USES_METHOD", entity: { name: "Random Forest" }, quote: "We use Random Forest" }]);
    const rows = await attachKnowledgeEvidence([{ id: paper.legacyMongoId }], "method");
    expect(rows[0]?.knowledgeEvidence?.passages[0]?.pageNumber).toBe(5);
    const where = db.paperDocument.findMany.mock.calls[0]?.[0].where;
    expect(where.paper.dataStatus).toBe("active"); expect(where.paper.OR).toEqual([{ legacyMongoId: paper.legacyMongoId }]);
    expect(db.$queryRaw.mock.calls[0]?.[0].values).toContain("document");
    expect(rows[0]?.knowledgeEvidence?.passages[0]?.relations[0]).toContain("Random Forest");
  });
  it("does not expose outdated chunk evidence", async () => {
    db.paperDocument.findMany.mockResolvedValue([{ id: "document", paperId: paper.id, paper, sourceHash: "obsolete" }]);
    expect(await attachKnowledgeEvidence([{ id: paper.id }], "query")).toEqual([{ id: paper.id }]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
