import { beforeEach, describe, expect, it, vi } from "vitest";
import { taxonomyBackfillService } from "../taxonomy-backfill.service.js";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn(), executeRaw: vi.fn() }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ $queryRaw: mocks.queryRaw, $executeRaw: mocks.executeRaw }) }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const paperId = "00000000-0000-4000-8000-000000000001";
const kw = (id: string, normalized: string, extra: Record<string, unknown> = {}) => ({ id, normalized_name: normalized, status: "active", merged_into_id: null, ...extra });

// $queryRaw/$executeRaw receive either a Prisma.Sql (function call form) or a template strings array (tag form).
const sqlOf = (call: unknown[]) => (Array.isArray(call[0]) ? (call[0] as string[]).join("?") : (call[0] as { sql: string }).sql).replace(/\s+/g, " ");
const valuesOf = (call: unknown[]) => (Array.isArray(call[0]) ? call.slice(1) : (call[0] as { values: unknown[] }).values);
const calls = (fn: typeof mocks.queryRaw) => fn.mock.calls.map((call) => ({ sql: sqlOf(call), values: valuesOf(call) }));

/** Routes $queryRaw by the statement it receives, so tests only declare the tables they care about. */
function routeQueries(routes: { names?: string[]; exact?: unknown[]; alias?: unknown[]; inserted?: unknown[]; byId?: unknown[] }) {
  mocks.queryRaw.mockImplementation(async (...args: unknown[]) => {
    const sql = sqlOf(args);
    if (sql.includes("SELECT DISTINCT keyword_name")) return (routes.names ?? []).map((keyword_name) => ({ keyword_name }));
    if (sql.includes("aliases &&")) return routes.alias ?? [];
    if (sql.includes("WHERE id = ANY")) return routes.byId ?? [];
    if (sql.includes("normalized_name = ANY")) {
      // The first lookup is the exact one; the re-select after the insert happens once an INSERT ran.
      return mocks.executeRaw.mock.calls.some((call) => sqlOf(call).includes("INSERT INTO keywords")) ? routes.inserted ?? [] : routes.exact ?? [];
    }
    return [];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.executeRaw.mockResolvedValue(0);
  mocks.queryRaw.mockResolvedValue([]);
});

describe("linkPaperTaxonomy keyword resolution", () => {
  it("issues the topic UPDATE and the keyword UPDATE scoped to the paper", async () => {
    routeQueries({ names: ["Deep Learning"], exact: [kw("k1", "deep learning")] });
    mocks.executeRaw.mockResolvedValue(1);
    await taxonomyBackfillService.linkPaperTaxonomy({ $queryRaw: mocks.queryRaw, $executeRaw: mocks.executeRaw } as never, paperId);
    const executes = calls(mocks.executeRaw);
    expect(executes[0]!.sql).toContain("UPDATE paper_topics");
    expect(executes[0]!.values).toContain(paperId);
    const update = executes.find((call) => call.sql.includes("UPDATE paper_keywords"))!;
    expect(update.values).toContain(paperId);
    expect(update.values).toEqual(expect.arrayContaining([["Deep Learning"], ["k1"]]));
    expect(executes.some((call) => call.sql.includes("INSERT INTO keywords"))).toBe(false);
  });

  it("skips the keyword work for a paper with no unlinked keywords", async () => {
    routeQueries({ names: [] });
    await taxonomyBackfillService.linkPaperTaxonomy({ $queryRaw: mocks.queryRaw, $executeRaw: mocks.executeRaw } as never, paperId);
    expect(calls(mocks.executeRaw)).toHaveLength(1);
    expect(calls(mocks.queryRaw)).toHaveLength(1);
  });

  it("does not write counts or taxonomy nodes", async () => {
    routeQueries({ names: ["x"], exact: [kw("k1", "x")] });
    await taxonomyBackfillService.linkPaperTaxonomy({ $queryRaw: mocks.queryRaw, $executeRaw: mocks.executeRaw } as never, paperId);
    expect(calls(mocks.executeRaw).some((call) => /paper_count|INSERT INTO research_topics/.test(call.sql))).toBe(false);
  });
});

describe("linkKeywords resolver", () => {
  it("normalizes spellings so Deep-Learning meets deep learning, and prefers the normalized_name match", async () => {
    routeQueries({ names: ["Deep-Learning", "deep learning"], exact: [kw("k1", "deep learning")], alias: [kw("k9", "other", { aliases: ["deep learning"] })] });
    const result = await taxonomyBackfillService.linkKeywords();
    const [lookup] = calls(mocks.queryRaw).filter((call) => call.sql.includes("normalized_name = ANY"));
    expect(lookup!.values[0]).toEqual(["deep learning"]);
    // Resolved by exact name, so the alias lookup never runs.
    expect(calls(mocks.queryRaw).some((call) => call.sql.includes("aliases &&"))).toBe(false);
    const update = calls(mocks.executeRaw).find((call) => call.sql.includes("UPDATE paper_keywords"))!;
    expect(update.values).toEqual([["Deep-Learning", "deep learning"], ["k1", "k1"]]);
    expect(result.keywordsCreated).toBe(0);
  });

  it("falls back to an alias match before inserting", async () => {
    routeQueries({ names: ["ML"], alias: [kw("k2", "machine learning", { aliases: ["ml"] })] });
    await taxonomyBackfillService.linkKeywords();
    expect(calls(mocks.executeRaw).some((call) => call.sql.includes("INSERT INTO keywords"))).toBe(false);
    const update = calls(mocks.executeRaw).find((call) => call.sql.includes("UPDATE paper_keywords"))!;
    expect(update.values).toEqual([["ML"], ["k2"]]);
  });

  it("inserts a new keyword with the first-seen display spelling and re-selects it", async () => {
    mocks.executeRaw.mockResolvedValue(1);
    routeQueries({ names: ["Graph Neural Networks", "graph-neural-networks"], inserted: [kw("k3", "graph neural networks")] });
    const result = await taxonomyBackfillService.linkKeywords();
    const insert = calls(mocks.executeRaw).find((call) => call.sql.includes("INSERT INTO keywords"))!;
    expect(insert.sql).toContain("ON CONFLICT (normalized_name) DO NOTHING");
    expect(insert.values).toEqual([["Graph Neural Networks"], ["graph neural networks"]]);
    const update = calls(mocks.executeRaw).find((call) => call.sql.includes("UPDATE paper_keywords"))!;
    expect(update.values).toEqual([["Graph Neural Networks", "graph-neural-networks"], ["k3", "k3"]]);
    expect(result.keywordsCreated).toBe(1);
  });

  it("follows merged_into_id to the surviving keyword", async () => {
    routeQueries({
      names: ["nlp"],
      exact: [kw("old", "nlp", { status: "merged", merged_into_id: "mid" })],
      byId: [kw("mid", "natural language processing")],
    });
    await taxonomyBackfillService.linkKeywords();
    const update = calls(mocks.executeRaw).find((call) => call.sql.includes("UPDATE paper_keywords"))!;
    expect(update.values).toEqual([["nlp"], ["mid"]]);
  });

  it("stops following a merge cycle instead of hanging", async () => {
    routeQueries({
      names: ["a"],
      exact: [kw("ka", "a", { status: "merged", merged_into_id: "kb" })],
      byId: [kw("kb", "b", { status: "merged", merged_into_id: "ka" })],
    });
    await taxonomyBackfillService.linkKeywords();
    expect(calls(mocks.queryRaw).filter((call) => call.sql.includes("WHERE id = ANY")).length).toBeLessThanOrEqual(5);
    expect(calls(mocks.executeRaw).some((call) => call.sql.includes("UPDATE paper_keywords"))).toBe(true);
  });

  it("drops names that normalize to nothing and does not touch the database for them", async () => {
    routeQueries({ names: ["!!!", "   "] });
    const result = await taxonomyBackfillService.linkKeywords();
    expect(result).toEqual({ keywordsCreated: 0, keywordLinks: 0 });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("pages by keyword_name and stops on a short page", async () => {
    const pages = [[{ keyword_name: "a" }, { keyword_name: "b" }], [{ keyword_name: "c" }]];
    mocks.queryRaw.mockImplementation(async (...args: unknown[]) => {
      const sql = sqlOf(args);
      if (sql.includes("SELECT DISTINCT keyword_name")) return pages.shift() ?? [];
      return sql.includes("normalized_name = ANY") ? [kw("k1", "a"), kw("k2", "b"), kw("k3", "c")] : [];
    });
    await taxonomyBackfillService.linkKeywords({ batchSize: 2 });
    const pageCalls = calls(mocks.queryRaw).filter((call) => call.sql.includes("SELECT DISTINCT keyword_name"));
    expect(pageCalls).toHaveLength(2);
    expect(pageCalls[0]!.values).toEqual(["", 2]);
    expect(pageCalls[1]!.values).toEqual(["b", 2]);
  });
});

describe("backfillAll", () => {
  it("runs nodes, topic links, keyword links and counts in order and returns the summary", async () => {
    const order: string[] = [];
    const spies = [
    vi.spyOn(taxonomyBackfillService, "ensureNodesFromPapers").mockImplementation(async () => { order.push("nodes"); return 7; }),
    vi.spyOn(taxonomyBackfillService, "linkTopics").mockImplementation(async () => { order.push("topics"); return 5; }),
    vi.spyOn(taxonomyBackfillService, "linkKeywords").mockImplementation(async () => { order.push("keywords"); return { keywordsCreated: 3, keywordLinks: 11 }; }),
    vi.spyOn(taxonomyBackfillService, "refreshCounts").mockImplementation(async () => { order.push("counts"); }),
    ];
    try {
      await expect(taxonomyBackfillService.backfillAll()).resolves.toEqual({ nodesCreated: 7, topicLinks: 5, keywordsCreated: 3, keywordLinks: 11 });
    } finally { spies.forEach((spy) => spy.mockRestore()); }
    expect(order).toEqual(["nodes", "topics", "keywords", "counts"]);
  });
});

describe("set-based SQL", () => {
  it("ensureNodesFromPapers inserts domain, field, subfield then topic with ON CONFLICT DO NOTHING", async () => {
    mocks.executeRaw.mockResolvedValue(2);
    await expect(taxonomyBackfillService.ensureNodesFromPapers()).resolves.toBe(8);
    const inserts = calls(mocks.executeRaw).filter((call) => call.sql.includes("INSERT INTO research_topics"));
    expect(inserts).toHaveLength(4);
    expect(inserts.map((call) => call.values.find((value) => ["domain", "field", "subfield", "topic"].includes(value as string)))).toEqual(["domain", "field", "subfield", "topic"]);
    for (const insert of inserts) expect(insert.sql).toContain("ON CONFLICT (level, openalex_id) DO NOTHING");
  });

  it("linkTopics returns the updated row count", async () => {
    mocks.executeRaw.mockResolvedValue(42);
    await expect(taxonomyBackfillService.linkTopics()).resolves.toBe(42);
    expect(calls(mocks.executeRaw)[0]!.sql).toContain("pt.topic_id IS DISTINCT FROM rt.id");
  });

  it("refreshCounts updates keywords, taxonomy nodes and tags counting only active papers", async () => {
    await taxonomyBackfillService.refreshCounts();
    const sql = calls(mocks.executeRaw).map((call) => call.sql);
    expect(sql).toHaveLength(3);
    expect(sql[0]).toContain("UPDATE keywords");
    expect(sql[1]).toContain("UPDATE research_topics");
    expect(sql[2]).toContain("UPDATE tags");
    for (const statement of sql) expect(statement).toContain("data_status = 'active'");
  });
});
