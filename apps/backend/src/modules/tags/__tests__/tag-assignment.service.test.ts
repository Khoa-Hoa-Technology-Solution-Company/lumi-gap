import { beforeEach, describe, expect, it, vi } from "vitest";
import { tagAssignmentService } from "../tag-assignment.service.js";

const m = vi.hoisted(() => ({
  tagFind: vi.fn(), tagFindMany: vi.fn(),
  ruleFindMany: vi.fn(), topicFindMany: vi.fn(),
  queryRaw: vi.fn(), executeRaw: vi.fn(),
  queueAdd: vi.fn(),
  env: {
    TAG_EMBEDDING_ENABLED: true,
    TAG_EMBEDDING_MIN_SEED: 10,
    TAG_EMBEDDING_MIN_SIMILARITY: 0.82,
    TAG_EMBEDDING_MAX_PAPERS: 300,
  },
}));

vi.mock("../../../config/env.js", () => ({ env: m.env }));
vi.mock("../../../infrastructure/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../../infrastructure/queue.js", () => ({ taggingQueue: { add: m.queueAdd } }));
vi.mock("../../../infrastructure/database/prisma.js", () => {
  const client = {
    tag: { findUnique: m.tagFind, findMany: m.tagFindMany },
    tagRule: { findMany: m.ruleFindMany },
    researchTopic: { findMany: m.topicFindMany },
    $queryRaw: m.queryRaw,
    $executeRaw: m.executeRaw,
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(client),
  };
  return { getPrisma: () => client };
});

const TAG = "00000000-0000-4000-8000-0000000000aa";
const TAG2 = "00000000-0000-4000-8000-0000000000ab";
const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const T1 = "00000000-0000-4000-8000-0000000000a1";
const K1 = "00000000-0000-4000-8000-0000000000b1";
const now = new Date("2026-10-30T00:00:00.000Z");

const sqlOf = (arg: unknown): string => (arg as { sql: string }).sql.replace(/\s+/g, " ");
const executed = () => m.executeRaw.mock.calls.map((c) => sqlOf(c[0]));
const queried = () => m.queryRaw.mock.calls.map((c) => sqlOf(c[0]));

interface Fixture { seeds?: number; counts?: Array<{ source: string; n: number }> }

/** Routes $queryRaw by the SQL it is given. */
function routeQueries({ seeds = 0, counts = [] }: Fixture = {}) {
  m.queryRaw.mockImplementation(async (query: unknown) => {
    const text = sqlOf(query);
    if (text.includes("UPDATE tags")) {
      return [{ paper_count: counts.filter((c) => c.source !== "blocked").reduce((s, c) => s + c.n, 0) }];
    }
    if (text.includes("GROUP BY pt.source")) return counts;
    if (text.includes("AS n FROM paper_tags")) return [{ n: seeds }];
    return [];
  });
}

const tagRow = (over: Record<string, unknown> = {}) => ({ id: TAG, status: "active", ...over });
const includeKeyword = { id: "r1", tagId: TAG, ruleKind: "keyword", effect: "include", researchTopicId: null, keywordId: K1 };
const excludeTopic = { id: "r2", tagId: TAG, ruleKind: "topic", effect: "exclude", researchTopicId: T1, keywordId: null };

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(m.env, {
    TAG_EMBEDDING_ENABLED: true, TAG_EMBEDDING_MIN_SEED: 10,
    TAG_EMBEDDING_MIN_SIMILARITY: 0.82, TAG_EMBEDDING_MAX_PAPERS: 300,
  });
  m.tagFind.mockResolvedValue(tagRow());
  m.ruleFindMany.mockResolvedValue([includeKeyword]);
  m.topicFindMany.mockResolvedValue([]);
  m.executeRaw.mockResolvedValue(0);
  m.queueAdd.mockResolvedValue({ id: "job-1" });
  routeQueries();
});

describe("applyTag", () => {
  it("404s for an unknown tag", async () => {
    m.tagFind.mockResolvedValue(null);
    await expect(tagAssignmentService.applyTag(TAG)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("archived tag: removes rule/embedding rows only, keeps manual and blocked, and recounts", async () => {
    m.tagFind.mockResolvedValue(tagRow({ status: "archived" }));
    routeQueries({ counts: [{ source: "manual", n: 2 }, { source: "blocked", n: 1 }] });

    const result = await tagAssignmentService.applyTag(TAG);

    const writes = executed();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("DELETE FROM paper_tags");
    expect(writes[0]).toContain("source IN ('rule', 'embedding')");
    expect(queried().some((q) => q.includes("UPDATE tags"))).toBe(true);
    expect(m.ruleFindMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      tagId: TAG, ruleTagged: 0, embeddingTagged: 0, manual: 2, blocked: 1, paperCount: 2,
    });
  });

  it("inserts rule matches for active papers and never overwrites manual or blocked rows", async () => {
    m.env.TAG_EMBEDDING_ENABLED = false;
    routeQueries({ counts: [{ source: "rule", n: 5 }, { source: "manual", n: 1 }, { source: "blocked", n: 1 }] });

    const result = await tagAssignmentService.applyTag(TAG);

    const [clear, insert] = executed();
    expect(clear).toContain("DELETE FROM paper_tags");
    expect(insert).toContain("INSERT INTO paper_tags (paper_id, tag_id, source)");
    expect(insert).toContain("p.data_status = 'active'");
    expect(insert).toContain("paper_keywords");
    expect(insert).toContain("ON CONFLICT (paper_id, tag_id) DO NOTHING");
    expect(insert).not.toContain("AND NOT (");
    expect(result).toMatchObject({ ruleTagged: 5, manual: 1, blocked: 1, paperCount: 6, embeddingSkippedReason: "disabled" });
  });

  it("applies exclude rules to the rule insert", async () => {
    m.env.TAG_EMBEDDING_ENABLED = false;
    m.ruleFindMany.mockResolvedValue([includeKeyword, excludeTopic]);
    m.topicFindMany.mockResolvedValue([{ id: T1, level: "topic", openalexId: "T1" }]);
    await tagAssignmentService.applyTag(TAG);
    expect(executed()[1]).toMatch(/AND NOT \(EXISTS \(SELECT 1 FROM paper_topics/);
  });

  it("only clears and recounts when the rules include nothing", async () => {
    m.env.TAG_EMBEDDING_ENABLED = false;
    m.ruleFindMany.mockResolvedValue([excludeTopic]);
    m.topicFindMany.mockResolvedValue([{ id: T1, level: "topic", openalexId: "T1" }]);
    await tagAssignmentService.applyTag(TAG);
    expect(executed()).toHaveLength(1);
  });

  it("skips embedding expansion with a reason when too few seed papers have embeddings", async () => {
    routeQueries({ seeds: 3, counts: [{ source: "rule", n: 40 }] });

    const result = await tagAssignmentService.applyTag(TAG);

    expect(result.embeddingSkippedReason).toBe("only 3 seed papers have embeddings, need 10");
    expect(result.embeddingTagged).toBe(0);
    expect(executed().some((s) => s.includes("WITH centroid"))).toBe(false);
  });

  it("expands by embedding with the similarity threshold, skipping already-tagged and excluded papers", async () => {
    m.env.TAG_EMBEDDING_MIN_SIMILARITY = 0.9;
    m.env.TAG_EMBEDDING_MAX_PAPERS = 50;
    m.ruleFindMany.mockResolvedValue([includeKeyword, excludeTopic]);
    m.topicFindMany.mockResolvedValue([{ id: T1, level: "topic", openalexId: "T1" }]);
    routeQueries({ seeds: 25, counts: [{ source: "rule", n: 25 }, { source: "embedding", n: 7 }] });

    const result = await tagAssignmentService.applyTag(TAG);

    const call = m.executeRaw.mock.calls.map((c) => c[0] as { sql: string; values: unknown[] })
      .find((q) => q.sql.includes("WITH centroid"))!;
    const text = call.sql.replace(/\s+/g, " ");
    expect(text).toContain("AVG(p.embedding)");
    expect(text).toContain("pt.source IN ('rule', 'manual')");
    expect(text).toContain("NOT EXISTS (SELECT 1 FROM paper_tags x WHERE x.paper_id = p.id");
    expect(text).toMatch(/AND NOT \(EXISTS \(SELECT 1 FROM paper_topics/);
    expect(text).toContain("1 - (p.embedding <=> c.v) >=");
    expect(text).toContain("ORDER BY p.embedding <=> c.v");
    expect(text).toContain("ON CONFLICT (paper_id, tag_id) DO NOTHING");
    expect(call.values).toContain(0.9);
    expect(call.values).toContain(50);
    expect(result).toMatchObject({ embeddingTagged: 7, paperCount: 32, embeddingSkippedReason: null });
  });

  it("counts papers without blocked rows into tags.paper_count", async () => {
    m.env.TAG_EMBEDDING_ENABLED = false;
    await tagAssignmentService.applyTag(TAG);
    const update = queried().find((q) => q.includes("UPDATE tags"))!;
    expect(update).toContain("pt.source <> 'blocked'");
    expect(update).toContain("p.data_status = 'active'");
  });
});

describe("applyAllTags", () => {
  it("keeps going when one tag fails", async () => {
    m.env.TAG_EMBEDDING_ENABLED = false;
    m.tagFindMany.mockResolvedValue([{ id: TAG }, { id: TAG2 }]);
    m.tagFind.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === TAG) throw new Error("boom");
      return tagRow({ id: where.id });
    });

    const { results, failures } = await tagAssignmentService.applyAllTags();

    expect(failures).toEqual([{ tagId: TAG, message: "boom" }]);
    expect(results.map((r) => r.tagId)).toEqual([TAG2]);
  });
});

describe("manual curation", () => {
  it("addPapers upserts source manual (un-blocking) and recounts", async () => {
    m.queryRaw.mockImplementation(async (query: unknown) => {
      const text = sqlOf(query);
      if (text.startsWith("SELECT id FROM papers")) return [{ id: P1 }, { id: P2 }];
      if (text.includes("UPDATE tags")) return [{ paper_count: 2 }];
      return [{
        paper_id: P1, title: "A", publication_year: 2024, citation_count: 3, source: "manual", confidence: null, created_at: now,
      }];
    });

    const out = await tagAssignmentService.addPapers(TAG, [P1, P2, P1]);

    const insert = executed().find((s) => s.includes("INSERT INTO paper_tags"))!;
    expect(insert).toContain("'manual'");
    expect(insert).toContain("ON CONFLICT (paper_id, tag_id) DO UPDATE SET source = 'manual', confidence = NULL");
    expect(queried().some((q) => q.includes("UPDATE tags"))).toBe(true);
    expect(out[0]).toMatchObject({ paperId: P1, source: "manual", confidence: null, taggedAt: now.toISOString() });
  });

  it("addPapers lists the missing papers in a 404 and writes nothing", async () => {
    m.queryRaw.mockResolvedValue([{ id: P1 }]);
    await expect(tagAssignmentService.addPapers(TAG, [P1, P2])).rejects.toMatchObject({
      statusCode: 404, message: expect.stringContaining(P2),
    });
    expect(m.executeRaw).not.toHaveBeenCalled();
  });

  it("addPapers refuses an archived tag", async () => {
    m.tagFind.mockResolvedValue(tagRow({ status: "archived" }));
    await expect(tagAssignmentService.addPapers(TAG, [P1])).rejects.toMatchObject({ statusCode: 409 });
  });

  it("removePaper deletes a manual row", async () => {
    m.queryRaw.mockImplementation(async (query: unknown) => {
      const text = sqlOf(query);
      if (text.includes("DELETE FROM paper_tags")) return [{ paper_id: P1 }];
      if (text.includes("UPDATE tags")) return [{ paper_count: 0 }];
      return [];
    });
    expect(await tagAssignmentService.removePaper(TAG, P1)).toEqual({ paperId: P1, source: null });
    expect(queried().some((q) => q.includes("SET source = 'blocked'"))).toBe(false);
  });

  it("removePaper turns a rule/embedding row into blocked", async () => {
    m.queryRaw.mockImplementation(async (query: unknown) => {
      const text = sqlOf(query);
      if (text.includes("DELETE FROM paper_tags")) return [];
      if (text.includes("SET source = 'blocked'")) return [{ paper_id: P1 }];
      if (text.includes("UPDATE tags")) return [{ paper_count: 4 }];
      return [];
    });
    expect(await tagAssignmentService.removePaper(TAG, P1)).toEqual({ paperId: P1, source: "blocked" });
    expect(queried().find((q) => q.includes("SET source = 'blocked'"))).toContain("source IN ('rule', 'embedding')");
  });

  it("removePaper 404s for a blocked or untagged paper", async () => {
    m.queryRaw.mockResolvedValue([]);
    await expect(tagAssignmentService.removePaper(TAG, P1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("unblockPaper deletes the block and enqueues an apply job", async () => {
    m.queryRaw.mockResolvedValue([{ paper_id: P1 }]);
    expect(await tagAssignmentService.unblockPaper(TAG, P1)).toEqual({ jobId: "job-1", tagId: TAG });
    expect(queried()[0]).toContain("source = 'blocked'");
    expect(m.queueAdd).toHaveBeenCalledWith("apply-tag", { tagId: TAG });
  });

  it("unblockPaper 409s when the paper is not blocked and enqueues nothing", async () => {
    m.queryRaw.mockResolvedValue([]);
    await expect(tagAssignmentService.unblockPaper(TAG, P1)).rejects.toMatchObject({ statusCode: 409 });
    expect(m.queueAdd).not.toHaveBeenCalled();
  });
});

describe("listPapers", () => {
  it("orders manual, rule, embedding by confidence, blocked last, and filters by source and title", async () => {
    m.queryRaw
      .mockResolvedValueOnce([{ count: 41 }])
      .mockResolvedValueOnce([{
        paper_id: P1, title: "A", publication_year: 2024, citation_count: 3, source: "embedding", confidence: 0.91, created_at: now,
      }]);

    const out = await tagAssignmentService.listPapers(TAG, { page: 2, pageSize: 20, source: "embedding", q: "100%" });

    const [countQuery, listQuery] = m.queryRaw.mock.calls.map((c) => c[0] as { sql: string; values: unknown[] });
    const text = listQuery!.sql.replace(/\s+/g, " ");
    expect(text).toContain("CASE pt.source WHEN 'manual' THEN 0 WHEN 'rule' THEN 1 WHEN 'embedding' THEN 2 ELSE 3 END");
    expect(text).toContain("pt.confidence DESC NULLS LAST");
    expect(text).toContain("p.title ILIKE");
    expect(listQuery!.values).toContain("%100\\%%");
    expect(listQuery!.values).toContain("embedding");
    expect(listQuery!.values).toContain(20); // OFFSET for page 2
    expect(countQuery!.sql).toContain("COUNT(*)");
    expect(out.meta).toEqual({ page: 2, pageSize: 20, total: 41, totalPages: 3 });
    expect(out.data[0]).toMatchObject({ paperId: P1, source: "embedding", confidence: 0.91 });
  });
});

describe("enqueue helpers", () => {
  it("enqueueApplyTag / enqueueApplyAll return the job", async () => {
    expect(await tagAssignmentService.enqueueApplyTag(TAG)).toEqual({ jobId: "job-1", tagId: TAG });
    expect(await tagAssignmentService.enqueueApplyAll()).toEqual({ jobId: "job-1", tagId: null });
    expect(m.queueAdd).toHaveBeenNthCalledWith(1, "apply-tag", { tagId: TAG });
    expect(m.queueAdd).toHaveBeenNthCalledWith(2, "apply-all-tags", {});
  });

  it("explicit enqueue surfaces a queue outage as 503", async () => {
    m.queueAdd.mockRejectedValue(new Error("redis down"));
    await expect(tagAssignmentService.enqueueApplyAll()).rejects.toMatchObject({ statusCode: 503 });
  });
});
