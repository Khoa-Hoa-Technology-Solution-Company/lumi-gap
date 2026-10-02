import { describe, expect, it } from "vitest";

import { PAPER_EMBEDDING_DIMENSIONS, buildHybridSearchSql, filterSql, vectorParameter } from "./postgres-paper-search.js";

describe("PostgreSQL vector query input", () => {
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
