import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTagQueries, filterOnlyExpression, keywordQuery, loadBackfillTarget, MAX_TAG_KEYWORD_QUERIES, nodeQuery, TAG_FILTER_VALUES_PER_QUERY,
} from "../topic-backfill.queries.js";

const m = vi.hoisted(() => ({
  topicFindFirst: vi.fn(), topicFindMany: vi.fn(),
  keywordFindFirst: vi.fn(), keywordFindMany: vi.fn(),
  tagFindFirst: vi.fn(), ruleFindMany: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    researchTopic: { findFirst: m.topicFindFirst, findMany: m.topicFindMany },
    keyword: { findFirst: m.keywordFindFirst, findMany: m.keywordFindMany },
    tag: { findFirst: m.tagFindFirst },
    tagRule: { findMany: m.ruleFindMany },
  }),
}));

const ID = "00000000-0000-4000-8000-000000000001";
const N1 = "00000000-0000-4000-8000-0000000000a1";
const N2 = "00000000-0000-4000-8000-0000000000a2";
const K1 = "00000000-0000-4000-8000-0000000000b1";
const K2 = "00000000-0000-4000-8000-0000000000b2";

beforeEach(() => {
  vi.resetAllMocks();
  m.topicFindMany.mockResolvedValue([]);
  m.keywordFindMany.mockResolvedValue([]);
  m.ruleFindMany.mockResolvedValue([]);
});

describe("nodeQuery", () => {
  it("builds a most-cited filter query that only asks for papers with an abstract", () => {
    expect(nodeQuery("topic", "T10028")).toEqual({
      filterExpression: "topics.id:T10028,has_abstract:true", sort: "cited_by_count:desc",
    });
    expect(nodeQuery("subfield", "1702")).toEqual({
      filterExpression: "topics.subfield.id:1702,has_abstract:true", sort: "cited_by_count:desc",
    });
  });

  it("refuses a node without an OpenAlex id or with an id that could change the filter", () => {
    expect(nodeQuery("topic", null)).toBeNull();
    expect(nodeQuery("topic", "T1,cited_by_count:>1")).toBeNull();
    expect(nodeQuery("topic", "T1|T2")).toBeNull();
  });
});

describe("keywordQuery", () => {
  it("searches the quoted phrase in relevance order, without a sort", () => {
    expect(keywordQuery("machine learning")).toEqual({
      searchText: "\"machine learning\"", filterExpression: "has_abstract:true",
    });
  });

  it("drops wildcards and inner double quotes, and collapses spaces", () => {
    expect(keywordQuery("  deep  \"learning\"* ? ")?.searchText).toBe("\"deep learning\"");
  });

  it("returns null when nothing searchable is left", () => {
    expect(keywordQuery("?*\"\"")).toBeNull();
    expect(keywordQuery("ab")).toBeNull();
  });
});

describe("buildTagQueries", () => {
  it("groups nodes by level, finest first, joining ids with |", () => {
    const queries = buildTagQueries([
      { level: "field", openalexId: "17" },
      { level: "topic", openalexId: "T1" },
      { level: "topic", openalexId: "T2" },
      { level: "subfield", openalexId: "1702" },
      { level: "domain", openalexId: "3" },
    ], []);
    expect(queries.map((q) => q.filterExpression)).toEqual([
      "topics.id:T1|T2,has_abstract:true",
      "topics.subfield.id:1702,has_abstract:true",
      "topics.field.id:17,has_abstract:true",
      "topics.domain.id:3,has_abstract:true",
    ]);
    expect(queries.every((q) => q.sort === "cited_by_count:desc")).toBe(true);
  });

  it("chunks a level into queries of at most 50 ids, ignores duplicates and nodes without an id", () => {
    const nodes = Array.from({ length: 120 }, (_, i) => ({ level: "topic", openalexId: `T${i}` }));
    nodes.push({ level: "topic", openalexId: "T0" }, { level: "topic", openalexId: null as never });
    const queries = buildTagQueries(nodes, []);
    const sizes = queries.map((q) => q.filterExpression.split(",")[0]!.split(":")[1]!.split("|").length);
    expect(TAG_FILTER_VALUES_PER_QUERY).toBe(50);
    expect(sizes).toEqual([50, 50, 20]);
  });

  it("adds one phrase query per keyword after the node queries, at most five, skipping repeats", () => {
    const names = ["alpha", "beta", "alpha", "gamma", "delta", "epsilon", "zeta", "eta"];
    const queries = buildTagQueries([{ level: "topic", openalexId: "T1" }], names);
    expect(MAX_TAG_KEYWORD_QUERIES).toBe(5);
    expect(queries).toHaveLength(1 + 5);
    expect(queries[0]!.searchText).toBeUndefined();
    expect(queries.slice(1).map((q) => q.searchText)).toEqual(
      ["\"alpha\"", "\"beta\"", "\"gamma\"", "\"delta\"", "\"epsilon\""],
    );
  });

  it("returns nothing for a tag whose rules name nothing searchable", () => {
    expect(buildTagQueries([{ level: "topic", openalexId: null }], ["x"])).toEqual([]);
  });
});

describe("loadBackfillTarget", () => {
  it("loads a topic by id AND level, so a subfield id cannot be used as a topic", async () => {
    m.topicFindFirst.mockResolvedValue({ topicName: "Deep learning", paperCount: 4, openalexId: "T10" });
    const target = await loadBackfillTarget("topic", ID);
    expect(m.topicFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ID, level: "topic", status: "active" } }));
    expect(target).toMatchObject({ kind: "topic", name: "Deep learning", paperCount: 4 });
    expect(target!.queries).toEqual([nodeQuery("topic", "T10")]);
  });

  it("uses the subfield filter for a subfield and reports no queries for a node without an OpenAlex id", async () => {
    m.topicFindFirst.mockResolvedValueOnce({ topicName: "AI", paperCount: 0, openalexId: "1702" });
    expect((await loadBackfillTarget("subfield", ID))!.queries[0]!.filterExpression).toContain("topics.subfield.id:1702");
    m.topicFindFirst.mockResolvedValueOnce({ topicName: "AI", paperCount: 0, openalexId: null });
    expect((await loadBackfillTarget("subfield", ID))!.queries).toEqual([]);
  });

  it("returns null for an unknown, hidden, archived or merged entry", async () => {
    m.topicFindFirst.mockResolvedValue(null);
    m.keywordFindFirst.mockResolvedValue(null);
    m.tagFindFirst.mockResolvedValue(null);
    expect(await loadBackfillTarget("topic", ID)).toBeNull();
    expect(await loadBackfillTarget("keyword", ID)).toBeNull();
    expect(await loadBackfillTarget("tag", ID)).toBeNull();
    expect(m.keywordFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ID, status: "active" } }));
    expect(m.tagFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ID, status: "active" } }));
  });

  it("builds a keyword phrase query", async () => {
    m.keywordFindFirst.mockResolvedValue({ keywordName: "Federated learning", paperCount: 2 });
    const target = await loadBackfillTarget("keyword", ID);
    expect(target).toMatchObject({ name: "Federated learning", paperCount: 2 });
    expect(target!.queries).toEqual([keywordQuery("Federated learning")]);
  });

  it("translates only the include rules of a tag", async () => {
    m.tagFindFirst.mockResolvedValue({ name: "LLM in education", paperCount: 7 });
    m.ruleFindMany.mockResolvedValue([
      { researchTopicId: N1, keywordId: null },
      { researchTopicId: N2, keywordId: null },
      { researchTopicId: null, keywordId: K1 },
      { researchTopicId: null, keywordId: K2 },
    ]);
    m.topicFindMany.mockResolvedValue([{ level: "topic", openalexId: "T1" }, { level: "subfield", openalexId: "1702" }]);
    m.keywordFindMany.mockResolvedValue([{ keywordName: "chatgpt" }, { keywordName: "tutoring" }]);

    const target = await loadBackfillTarget("tag", ID);

    expect(m.ruleFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tagId: ID, effect: "include" } }));
    expect(target).toMatchObject({ kind: "tag", name: "LLM in education", paperCount: 7 });
    expect(target!.queries.map((q) => q.searchText ?? q.filterExpression)).toEqual([
      "topics.id:T1,has_abstract:true",
      "topics.subfield.id:1702,has_abstract:true",
      "\"chatgpt\"",
      "\"tutoring\"",
    ]);
  });

  it("gives a tag without include rules no queries", async () => {
    m.tagFindFirst.mockResolvedValue({ name: "Empty", paperCount: 0 });
    expect((await loadBackfillTarget("tag", ID))!.queries).toEqual([]);
    expect(m.topicFindMany).not.toHaveBeenCalled();
    expect(m.keywordFindMany).not.toHaveBeenCalled();
  });
});

describe("filterOnlyExpression", () => {
  it("returns a filter query unchanged", () => {
    const query = nodeQuery("topic", "T10028")!;
    expect(filterOnlyExpression(query)).toBe("topics.id:T10028,has_abstract:true");
  });

  it("turns a keyword query into a title_and_abstract.search filter", () => {
    expect(filterOnlyExpression(keywordQuery("prompt engineering")!)).toBe("title_and_abstract.search:\"prompt engineering\",has_abstract:true");
  });

  it("turns commas, pipes and colons in the phrase into single spaces so they cannot split the filter", () => {
    const expression = filterOnlyExpression({ searchText: "\"a,b|c:d  e\"", filterExpression: "has_abstract:true" });
    expect(expression).toBe("title_and_abstract.search:\"a b c d e\",has_abstract:true");
    // the only separator left between filters is the one the function adds
    expect(expression.split(",")).toHaveLength(2);
  });
});
