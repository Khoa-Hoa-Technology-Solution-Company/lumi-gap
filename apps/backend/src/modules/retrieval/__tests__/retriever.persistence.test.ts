import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PAPER_EMBEDDING_DIMENSIONS, vectorParameter } from "../../../infrastructure/database/postgres-paper-search.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { getEmbeddingProvider } from "../../embeddings/embedding.factory.js";
import { retrieve, retrieveScored } from "../retriever.js";

vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: vi.fn() }));

const unit = (sign: 1 | -1) => Array.from({ length: PAPER_EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? sign : 0));
const queryVector = unit(1);
const farVector = unit(-1);

describe.sequential("retriever filters and hybrid search (PostgreSQL)", () => {
  const marker = crypto.randomUUID();
  const topic = `topic-${marker}`;
  const rareToken = `kw${marker.replace(/-/g, "")}`;
  const paperIds: string[] = [];
  let keywordPaperId = "";

  beforeAll(async () => {
    const prisma = getPrisma();
    for (let i = 0; i < 3; i += 1) {
      const paper = await prisma.paper.create({
        data: {
          title: `Retriever filter paper ${i} ${marker}`,
          publicationYear: 2026,
          primaryProvider: "user",
          dataStatus: "active",
        },
      });
      await prisma.paperTopic.create({ data: { paperId: paper.id, topicName: topic, position: 0 } });
      paperIds.push(paper.id);
    }
    const keywordPaper = await prisma.paper.create({
      data: { title: `Lexical only ${rareToken}`, publicationYear: 2026, primaryProvider: "user", dataStatus: "active" },
    });
    keywordPaperId = keywordPaper.id;
    for (const id of [...paperIds, keywordPaperId]) {
      await prisma.$executeRaw`UPDATE papers SET embedding = CAST(${vectorParameter(farVector)} AS vector) WHERE id = ${id}::uuid`;
    }
  });

  afterAll(async () => {
    const prisma = getPrisma();
    const ids = [...paperIds, keywordPaperId].filter(Boolean);
    await prisma.paperTopic.deleteMany({ where: { paperId: { in: ids } } });
    await prisma.paper.deleteMany({ where: { id: { in: ids } } });
  });

  it("applies multi-value topic filters before the limit", async () => {
    const results = await retrieve({ queryVector, topK: 3, filters: { topics: [topic] } });
    expect(results.map((paper) => paper.id).sort()).toEqual([...paperIds].sort());
  });

  it("filters by paperIds in SQL even when they are not the global top matches", async () => {
    const selected = paperIds.slice(0, 2);
    const results = await retrieve({ queryVector, topK: 3, poolSize: 3, filters: { paperIds: selected } });
    expect(results.map((paper) => paper.id).sort()).toEqual([...selected].sort());
  });

  it("surfaces keyword matches with a distant embedding and a positive hybridScore", async () => {
    const results = await retrieveScored({ queryVector, queryText: rareToken, topK: 5 });
    const hit = results.find((paper) => paper.id === keywordPaperId);
    expect(hit).toBeDefined();
    expect(hit?.hybridScore).toBeGreaterThan(0);
    expect(hit?.score).toBeGreaterThanOrEqual(0);
    expect(hit?.score).toBeLessThanOrEqual(1);
  });

  it("falls back to keyword-only retrieval when embedding the query fails", async () => {
    vi.mocked(getEmbeddingProvider).mockReturnValue({
      embed: vi.fn().mockRejectedValue(new Error("quota exceeded")),
    } as unknown as ReturnType<typeof getEmbeddingProvider>);
    const results = await retrieve({ queryText: rareToken, topK: 5 });
    expect(results.map((paper) => paper.id)).toContain(keywordPaperId);
  });
});
