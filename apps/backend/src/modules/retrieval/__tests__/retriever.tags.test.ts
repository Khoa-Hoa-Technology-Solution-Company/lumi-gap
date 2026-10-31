import { beforeEach, describe, expect, it, vi } from "vitest";
import { retrieveScored } from "../retriever.js";

const m = vi.hoisted(() => ({
  searchPapersHybrid: vi.fn(),
  paperFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("../../../infrastructure/database/postgres-paper-search.js", () => ({
  isUsableSearchVector: () => false,
  searchPapersHybrid: m.searchPapersHybrid,
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    paper: { findMany: m.paperFindMany },
    paperAuthor: { findMany: async () => [] },
    paperTopic: { findMany: async () => [] },
    paperKeyword: { findMany: async () => [] },
    $queryRaw: m.queryRaw,
  }),
}));
vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: vi.fn() }));
vi.mock("../../knowledge/knowledge.retrieval.js", () => ({ searchKnowledgePapers: vi.fn() }));
vi.mock("../../../infrastructure/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.resetAllMocks();
  m.searchPapersHybrid.mockResolvedValue([
    { id: P1, legacyMongoId: null, score: 0.9, hybridScore: 0.5 },
    { id: P2, legacyMongoId: null, score: 0.8, hybridScore: 0.4 },
  ]);
  m.paperFindMany.mockResolvedValue([
    { id: P1, title: "One", legacyMongoId: null },
    { id: P2, title: "Two", legacyMongoId: null },
  ]);
  m.queryRaw.mockResolvedValue([]);
});

describe("retriever curated tags", () => {
  it("attaches the active, non-blocked tag ids of each paper using one extra query", async () => {
    m.queryRaw.mockResolvedValue([
      { paper_id: P1, tag_id: T1 },
      { paper_id: P1, tag_id: T2 },
      { paper_id: P2, tag_id: T2 },
    ]);

    const papers = await retrieveScored({ queryText: "x", topK: 10, keywordOnly: true });

    expect(m.queryRaw).toHaveBeenCalledTimes(1);
    const sql = (m.queryRaw.mock.calls[0]![0] as { sql: string; values: unknown[] });
    expect(sql.sql).toMatch(/ptg\.source <> 'blocked'/);
    expect(sql.sql).toMatch(/tg\.status = 'active'/);
    expect(sql.values).toContainEqual([P1, P2]);
    expect(papers.map((p) => [p.id, p.tagIds])).toEqual([[P1, [T1, T2]], [P2, [T2]]]);
  });

  it("gives papers without tags an empty list", async () => {
    const papers = await retrieveScored({ queryText: "x", topK: 10, keywordOnly: true });

    expect(papers.map((p) => p.tagIds)).toEqual([[], []]);
  });

  it("passes the tagIds filter to the SQL search", async () => {
    await retrieveScored({ queryText: "x", topK: 10, keywordOnly: true, filters: { tagIds: [T1] } });

    expect(m.searchPapersHybrid.mock.calls[0]![0].filters.tagIds).toEqual([T1]);
  });
});
