import { describe, expect, it } from "vitest";

import { PAPER_EMBEDDING_DIMENSIONS, buildHybridSearchSql, filterSql, isUsableSearchVector, vectorParameter } from "./postgres-paper-search.js";

describe("PostgreSQL vector query input", () => {
  it.each([1e100, 1e30, 1e-30, Number.MIN_VALUE, 0, NaN, Infinity])("rejects cosine vectors unusable in float32: %s", (value) => {
    expect(isUsableSearchVector([value, ...Array(767).fill(0)])).toBe(false);
  });

  it("accepts ordinary embeddings and representable non-unit vectors", () => {
    for (const value of [0.25, 1e-10, 1e10]) expect(isUsableSearchVector(Array(768).fill(value))).toBe(true);
    expect(isUsableSearchVector(undefined)).toBe(false);
    expect(isUsableSearchVector([1])).toBe(false);
  });

  it("serializes exactly 768 finite dimensions", () => {
    const vector = vectorParameter(Array.from({ length: PAPER_EMBEDDING_DIMENSIONS }, () => 0.25));
    expect(vector.startsWith("[0.25,0.25")).toBe(true);
    expect(vector.endsWith("]")).toBe(true);
  });

  it("rejects the wrong dimension and non-finite values", () => {
    expect(() => vectorParameter([0.1])).toThrow(/exactly 768/);
    const invalid = Array.from({ length: PAPER_EMBEDDING_DIMENSIONS }, () => 0.1);
    invalid[5] = Number.NaN;
    expect(() => vectorParameter(invalid)).toThrow(/non-finite/);
  });
});

function render(filters: Parameters<typeof filterSql>[0]) {
  const sql = filterSql(filters);
  return { text: sql.sql.replace(/\s+/g, " ").trim(), values: sql.values };
}

describe("filterSql", () => {
  it("returns an empty fragment for no filters", () => {
    expect(render({}).text).toBe("");
  });

  it("binds multi-value filters as ANY with lowercased case-insensitive values", () => {
    const { text, values } = render({ languages: ["EN", "vi"], paperKinds: ["article", "review"] });
    expect(text).toContain("lower(p.language) = ANY(");
    expect(text).toContain("p.paper_kind = ANY(");
    expect(values).toContainEqual(["en", "vi"]);
    expect(values).toContainEqual(["article", "review"]);
  });

  it("puts every taxonomy predicate in a single EXISTS", () => {
    const { text } = render({ topics: ["AI"], domains: ["CS"] });
    expect(text.match(/EXISTS/g)).toHaveLength(1);
    expect(text).toContain("pt.topic_name = ANY(");
    expect(text).toContain("pt.domain_name = ANY(");
  });

  it("filters by keyword ids with a single EXISTS over paper_keywords and ignores non-UUID values", () => {
    const a = "123e4567-e89b-42d3-a456-426614174000";
    const b = "123E4567-E89B-42D3-A456-426614174001";
    const { text, values } = render({ keywordIds: [a, "not-a-uuid", b, a] });
    expect(text).toContain(
      "EXISTS ( SELECT 1 FROM paper_keywords pk WHERE pk.paper_id = p.id AND pk.keyword_id = ANY(",
    );
    expect(text).toContain("::uuid[]");
    expect(values).toContainEqual([a, b.toLowerCase()]);
  });

  it("matches nothing when keyword ids were requested but none is a UUID, and nothing when empty", () => {
    expect(render({ keywordIds: ["nope"] }).text).toContain("FALSE");
    expect(render({ keywordIds: [] }).text).toBe("");
    expect(render({ keywordIds: undefined }).text).toBe("");
  });

  it("combines keyword ids with taxonomy filters (AND)", () => {
    const { text } = render({ topicIds: ["T1"], keywordIds: ["123e4567-e89b-42d3-a456-426614174000"] });
    expect(text.match(/EXISTS/g)).toHaveLength(2);
    expect(text).toContain("paper_topics pt");
    expect(text).toContain("paper_keywords pk");
  });

  it("filters by tag ids with an EXISTS over paper_tags that skips blocked rows", () => {
    const a = "123e4567-e89b-42d3-a456-426614174000";
    const b = "123E4567-E89B-42D3-A456-426614174001";
    const { text, values } = render({ tagIds: [a, "not-a-uuid", b, a] });
    expect(text).toContain(
      "EXISTS ( SELECT 1 FROM paper_tags ptg WHERE ptg.paper_id = p.id AND ptg.tag_id = ANY(",
    );
    expect(text).toContain("::uuid[]) AND ptg.source <> 'blocked' )");
    expect(values).toContainEqual([a, b.toLowerCase()]);
  });

  it("matches nothing when tag ids were requested but none is a UUID, and nothing when empty", () => {
    expect(render({ tagIds: ["nope"] }).text).toContain("FALSE");
    expect(render({ tagIds: [] }).text).toBe("");
    expect(render({ tagIds: undefined }).text).toBe("");
  });

  it("combines tag ids with keyword ids (AND)", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const { text } = render({ keywordIds: [id], tagIds: [id] });
    expect(text.match(/EXISTS/g)).toHaveLength(2);
    expect(text).toContain("paper_keywords pk");
    expect(text).toContain("paper_tags ptg");
  });

  it("splits paperIds into uuid and legacy id predicates, and matches nothing for invalid ids", () => {
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    const legacy = "0123456789abcdef01234567";
    const { text, values } = render({ paperIds: [uuid, legacy] });
    expect(text).toContain("p.id = ANY(");
    expect(text).toContain("p.legacy_mongo_id = ANY(");
    expect(values).toContainEqual([uuid]);
    expect(values).toContainEqual([legacy]);
    expect(render({ paperIds: ["not-an-id"] }).text).toContain("FALSE");
  });

  it("ORs citation bands", () => {
    const { text } = render({ citationBands: ["0-9", "1000+"] });
    expect(text).toContain("p.citation_count >= ");
    expect(text).toContain(" OR ");
  });

  it("filters openAccess on a non-empty url", () => {
    expect(render({ openAccess: true }).text).toContain("p.open_access_url <> ''");
  });
});

describe("buildHybridSearchSql", () => {
  const embedding = Array.from({ length: PAPER_EMBEDDING_DIMENSIONS }, () => 0.1);

  it("builds an un-materialized fused vector + keyword query", () => {
    const { sql } = buildHybridSearchSql({ embedding, query: "transformers", limit: 10 });
    expect(sql).toContain("NOT MATERIALIZED");
    expect(sql).toContain("websearch_to_tsquery");
    expect(sql).toContain("<=>");
  });

  it("omits the vector branch for keyword-only search", () => {
    const { sql } = buildHybridSearchSql({ query: "transformers", limit: 10 });
    expect(sql).not.toContain("<=>");
  });

  it("requires an embedding or a query", () => {
    expect(() => buildHybridSearchSql({ limit: 10 })).toThrow(/requires an embedding or a query/);
  });

  it("rejects an out-of-range limit", () => {
    expect(() => buildHybridSearchSql({ query: "x", limit: 0 })).toThrow(/limit must be/);
  });
});
