import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateTaxonomyDictionary, resolveQueryTags } from "../query-tag-resolver.js";

const m = vi.hoisted(() => ({
  topicFindMany: vi.fn(),
  keywordFindMany: vi.fn(),
  tagFindMany: vi.fn(),
  paperCount: vi.fn(),
  queryRaw: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: () => ({
    researchTopic: { findMany: m.topicFindMany },
    keyword: { findMany: m.keywordFindMany },
    tag: { findMany: m.tagFindMany },
    paper: { count: m.paperCount },
    $queryRaw: m.queryRaw,
  }),
}));
vi.mock("../../../infrastructure/cache.js", () => ({
  cache: { get: m.cacheGet, set: m.cacheSet },
  hashKey: (parts: unknown) => `h(${JSON.stringify(parts)})`,
}));
vi.mock("../../../infrastructure/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

function topic(over: Record<string, unknown>) {
  return {
    id: "t-id", level: "topic", openalexId: "T1", topicName: "x", aliases: [], openalexKeywords: [], paperCount: 10, ...over,
  };
}
function keyword(over: Record<string, unknown>) {
  return { id: "k-id", keywordName: "x", normalizedName: "x", aliases: [], paperCount: 10, ...over };
}

function customTag(over: Record<string, unknown>) {
  return { id: "g-id", slug: "x", name: "x", paperCount: 10, ...over };
}

const TOPICS = [
  topic({
    id: "t-tm", openalexId: "T10028", topicName: "Topic Modeling", aliases: ["lda"],
    openalexKeywords: ["Latent Dirichlet Allocation"], paperCount: 40,
  }),
  topic({ id: "f-cs", level: "field", openalexId: "17", topicName: "Computer Science", paperCount: 900 }),
  topic({ id: "d-ps", level: "domain", openalexId: "3", topicName: "Physical Sciences", paperCount: 2000 }),
  topic({ id: "s-ai", level: "subfield", openalexId: "1702", topicName: "Artificial Intelligence", paperCount: 700 }),
];
const KEYWORDS = [
  keyword({ id: "k-tm", keywordName: "Topic modeling", normalizedName: "topic modeling", aliases: ["topic models"], paperCount: 25 }),
  keyword({ id: "k-edu", keywordName: "Education", normalizedName: "education", paperCount: 300 }),
  keyword({ id: "k-ml", keywordName: "Machine learning", normalizedName: "machine learning", aliases: ["hoc may"], paperCount: 500 }),
  keyword({ id: "k-ai", keywordName: "AI", normalizedName: "ai", paperCount: 80 }),
  keyword({ id: "k-the", keywordName: "The", normalizedName: "the", paperCount: 5 }),
];

beforeEach(() => {
  vi.resetAllMocks();
  invalidateTaxonomyDictionary();
  m.topicFindMany.mockResolvedValue(TOPICS);
  m.keywordFindMany.mockResolvedValue(KEYWORDS);
  m.tagFindMany.mockResolvedValue([]);
  m.paperCount.mockResolvedValue(4200);
  m.queryRaw.mockResolvedValue([]);
  m.cacheGet.mockResolvedValue(null);
  m.cacheSet.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveQueryTags matching", () => {
  it("resolves a whole-query name match with full confidence and ties by paperCount", async () => {
    const result = await resolveQueryTags("Topic Modeling");

    expect(result.coversQuery).toBe(true);
    expect(result.best).toMatchObject({
      kind: "topic", id: "t-tm", openalexId: "T10028", name: "Topic Modeling", confidence: 1,
      source: "name", matchedText: "topic modeling", paperCount: 40,
      filter: { key: "topicIds", value: "T10028" },
    });
    // The keyword with the same name and confidence ranks after the larger taxonomy node.
    expect(result.detectedTags.map((t) => [t.kind, t.id, t.confidence])).toEqual([
      ["topic", "t-tm", 1],
      ["keyword", "k-tm", 1],
    ]);
    expect(result.detectedTags[1]!.filter).toEqual({ key: "keywordIds", value: "k-tm" });
  });

  it("matches admin aliases with 0.95", async () => {
    const result = await resolveQueryTags("topic models");

    expect(result.best).toMatchObject({ kind: "keyword", id: "k-tm", source: "alias", confidence: 0.95 });
    expect(result.coversQuery).toBe(true);
  });

  it("matches OpenAlex topic keywords with the lower 0.8 base, and keeps the alias source over it", async () => {
    const byKeyword = await resolveQueryTags("latent dirichlet allocation");
    expect(byKeyword.best).toMatchObject({ kind: "topic", id: "t-tm", source: "openalex-keyword", confidence: 0.8 });

    const byAlias = await resolveQueryTags("LDA");
    expect(byAlias.best).toMatchObject({ kind: "topic", id: "t-tm", source: "alias", confidence: 0.95 });
  });

  it("scales confidence by coverage when only a sub-phrase matches", async () => {
    const result = await resolveQueryTags("topic modeling for education policy");

    expect(result.coversQuery).toBe(false);
    expect(result.best).toMatchObject({ id: "t-tm", confidence: 0.5, matchedText: "topic modeling" });
    const education = result.detectedTags.find((t) => t.id === "k-edu");
    expect(education?.confidence).toBe(0.25);
  });

  it("ignores stopwords when computing coverage", async () => {
    const result = await resolveQueryTags("topic modeling in education");

    // 3 content words: "topic modeling" covers 2, "education" covers 1.
    expect(result.best).toMatchObject({ id: "t-tm", confidence: 0.667 });
    expect(result.detectedTags.find((t) => t.id === "k-edu")?.confidence).toBe(0.333);
    expect(result.coversQuery).toBe(false);

    const covered = await resolveQueryTags("the education");
    expect(covered.best).toMatchObject({ id: "k-edu", confidence: 1 });
    expect(covered.coversQuery).toBe(true);
  });

  it("normalizes Vietnamese diacritics on both sides", async () => {
    const result = await resolveQueryTags("Học máy");

    expect(result.best).toMatchObject({ kind: "keyword", id: "k-ml", source: "alias", confidence: 0.95, matchedText: "hoc may" });
    expect(result.coversQuery).toBe(true);
  });

  it("discounts very broad domain and field nodes", async () => {
    const field = await resolveQueryTags("computer science");
    expect(field.best).toMatchObject({ kind: "field", openalexId: "17", confidence: 0.9, filter: { key: "fieldIds", value: "17" } });

    const domain = await resolveQueryTags("physical sciences");
    expect(domain.best).toMatchObject({ kind: "domain", confidence: 0.9, filter: { key: "domainIds", value: "3" } });

    const subfield = await resolveQueryTags("artificial intelligence");
    expect(subfield.best).toMatchObject({ kind: "subfield", confidence: 1, filter: { key: "subfieldIds", value: "1702" } });
  });

  it("skips one-token phrases shorter than 3 characters and stopword entries", async () => {
    const short = await resolveQueryTags("ai");
    expect(short.detectedTags).toEqual([]);
    expect(short.best).toBeNull();

    const stop = await resolveQueryTags("the");
    expect(stop.detectedTags).toEqual([]);
  });

  it("dedupes an entry reached through several phrases, keeps the best, caps at 5 tags and sorts", async () => {
    m.keywordFindMany.mockResolvedValue([
      keyword({ id: "k1", keywordName: "alpha", normalizedName: "alpha", aliases: ["beta"], paperCount: 5 }),
      keyword({ id: "k2", keywordName: "beta", normalizedName: "beta", paperCount: 50 }),
      ...["g1", "g2", "g3", "g4", "g5"].map((id, i) =>
        keyword({ id, keywordName: `gamma${id}`, normalizedName: "gamma", paperCount: i + 1 })),
    ]);
    m.topicFindMany.mockResolvedValue([]);

    const result = await resolveQueryTags("alpha beta gamma");

    expect(result.detectedTags).toHaveLength(5);
    const ids = result.detectedTags.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // k1 matches "alpha" (name, 1/3) and "beta" (alias, .95/3): the higher one wins.
    const k1 = result.detectedTags.find((t) => t.id === "k1");
    expect(k1?.confidence).toBeCloseTo(0.333, 3);
    expect(k1?.source).toBe("name");
    const confidences = result.detectedTags.map((t) => t.confidence);
    expect(confidences).toEqual([...confidences].sort((a, b) => b - a));
    // Equal confidence is ordered by paperCount desc.
    expect(result.detectedTags[0]!.paperCount).toBeGreaterThanOrEqual(result.detectedTags[1]!.paperCount);
  });

  it("returns an empty result for blank, symbol-only or over-long queries without touching the catalogue", async () => {
    for (const q of ["", "   ", "!!! ???", "x".repeat(201)]) {
      expect(await resolveQueryTags(q)).toMatchObject({ detectedTags: [], best: null, coversQuery: false });
    }
    expect(m.topicFindMany).not.toHaveBeenCalled();
  });

  it("loads active keywords that own papers, and topics that own papers or are empty topic/subfield nodes", async () => {
    const result = await resolveQueryTags("education");

    expect(result.corpusSize).toBe(4200);
    expect(m.paperCount).toHaveBeenCalledWith({ where: { dataStatus: "active" } });

    expect(m.topicFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "active",
          OR: [
            { paperCount: { gte: 1 } },
            { paperCount: 0, worksCount: { gt: 0 }, level: { in: ["topic", "subfield"] } },
          ],
        },
      }),
    );
    expect(m.topicFindMany.mock.calls[0]![0].select).toMatchObject({ worksCount: true, paperCount: true });
    expect(m.keywordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active", paperCount: { gte: 1 } } }),
    );
  });
});

describe("resolveQueryTags coverage target", () => {
  const EMPTY_TOPIC = topic({
    id: "t-q", openalexId: "T99", topicName: "Quantum Gravity", aliases: ["qgrav"], openalexKeywords: ["loop quantum"],
    paperCount: 0, worksCount: 5000,
  });
  const THIN_TOPIC = topic({
    id: "t-thin", openalexId: "T77", topicName: "Graph Databases", paperCount: 4, worksCount: 900,
  });

  beforeEach(() => {
    m.topicFindMany.mockResolvedValue([...TOPICS, EMPTY_TOPIC, THIN_TOPIC]);
  });

  it("names a zero-paper topic by name without detecting or ranking it", async () => {
    const result = await resolveQueryTags("Quantum Gravity");

    expect(result.coverageTarget).toMatchObject({
      kind: "topic", id: "t-q", openalexId: "T99", name: "Quantum Gravity", paperCount: 0, worksCount: 5000,
      source: "name", confidence: 1,
    });
    expect(result.detectedTags).toEqual([]);
    expect(result.best).toBeNull();
    expect(result.coversQuery).toBe(false);
  });

  it("accepts an alias of a zero-paper topic", async () => {
    const result = await resolveQueryTags("qgrav");

    expect(result.coverageTarget).toMatchObject({ id: "t-q", source: "alias" });
    expect(result.detectedTags).toEqual([]);
  });

  it("does not index the OpenAlex keywords of a zero-paper topic", async () => {
    const result = await resolveQueryTags("loop quantum");

    expect(result.coverageTarget).toBeNull();
    expect(result.detectedTags).toEqual([]);
  });

  it("gives no target when the entry covers only part of the query", async () => {
    const result = await resolveQueryTags("quantum gravity experiments");

    expect(result.coverageTarget).toBeNull();
    expect(result.detectedTags).toEqual([]);
  });

  it("gives no target for a fuzzy match", async () => {
    m.queryRaw.mockResolvedValue([
      { kind: "topic", id: "t-q", openalex_id: "T99", name: "Quantum Gravity", paper_count: 3, works_count: 5000, similarity: 0.9 },
    ]);

    const result = await resolveQueryTags("quantum gravit");

    expect(result.best).toMatchObject({ source: "fuzzy", worksCount: 5000 });
    expect(result.coverageTarget).toBeNull();
  });

  it("gives no target for an entry reached only through an OpenAlex keyword", async () => {
    const result = await resolveQueryTags("latent dirichlet allocation");

    expect(result.best).toMatchObject({ id: "t-tm", source: "openalex-keyword" });
    expect(result.coverageTarget).toBeNull();
  });

  it("gives both a detected tag and a target for a thin entry with papers", async () => {
    const result = await resolveQueryTags("graph databases");

    expect(result.best).toMatchObject({ id: "t-thin", paperCount: 4, worksCount: 900 });
    expect(result.detectedTags.map((t) => t.id)).toEqual(["t-thin"]);
    expect(result.coverageTarget).toMatchObject({ id: "t-thin", worksCount: 900 });
    expect(result.coversQuery).toBe(true);
  });

  it("targets a keyword (no worksCount) and breaks ties like the ranking", async () => {
    m.keywordFindMany.mockResolvedValue([
      keyword({ id: "k-gd", keywordName: "Graph databases", normalizedName: "graph databases", paperCount: 9 }),
    ]);

    const result = await resolveQueryTags("graph databases");

    // Same confidence: the keyword has more local papers than the topic, as in detectedTags.
    expect(result.detectedTags.map((t) => t.id)).toEqual(["k-gd", "t-thin"]);
    expect(result.coverageTarget).toMatchObject({ kind: "keyword", id: "k-gd" });
    expect(result.coverageTarget).not.toHaveProperty("worksCount");
  });

  it("has no target when a richer exact match of another kind or source exists", async () => {
    m.topicFindMany.mockResolvedValue([
      ...TOPICS,
      topic({ id: "t-rich", openalexId: "T2", topicName: "Knowledge Graphs", openalexKeywords: ["Graph databases"], paperCount: 200 }),
    ]);
    m.keywordFindMany.mockResolvedValue([
      keyword({ id: "k-gd", keywordName: "Graph databases", normalizedName: "graph databases", paperCount: 9 }),
      keyword({ id: "k-cs", keywordName: "Computer science", normalizedName: "computer science", paperCount: 5 }),
    ]);

    expect((await resolveQueryTags("graph databases")).coverageTarget).toBeNull();
    expect((await resolveQueryTags("computer science")).coverageTarget).toBeNull();
  });

  it("never targets a field, domain or curated tag", async () => {
    m.tagFindMany.mockResolvedValue([customTag({ id: "g-e", slug: "edu", name: "Edu Tag", paperCount: 2 })]);

    expect((await resolveQueryTags("computer science")).coverageTarget).toBeNull();
    expect((await resolveQueryTags("physical sciences")).coverageTarget).toBeNull();
    expect((await resolveQueryTags("edu tag")).coverageTarget).toBeNull();
  });

  it("is null when nothing matches or the query is blank", async () => {
    expect((await resolveQueryTags("zzzz yyyy")).coverageTarget).toBeNull();
    expect((await resolveQueryTags("   ")).coverageTarget).toBeNull();
  });

  it("does not let a zero-paper entry change ranking or suppress the fuzzy fallback", async () => {
    m.topicFindMany.mockResolvedValue([
      topic({ id: "t-a", openalexId: "T1", topicName: "Shared Phrase", paperCount: 6, worksCount: 100 }),
      topic({ id: "t-0", level: "subfield", openalexId: "S1", topicName: "Shared Phrase", paperCount: 0, worksCount: 50 }),
    ]);
    const withEmpty = await resolveQueryTags("shared phrase");

    expect(withEmpty.detectedTags.map((t) => t.id)).toEqual(["t-a"]);
    expect(withEmpty.best?.id).toBe("t-a");
    expect(withEmpty.coverageTarget?.id).toBe("t-a");

    // With only the empty entry matching exactly, the trigram fallback still runs as before.
    invalidateTaxonomyDictionary();
    m.topicFindMany.mockResolvedValue([EMPTY_TOPIC]);
    m.queryRaw.mockResolvedValue([
      { kind: "keyword", id: "k-ml", openalex_id: null, name: "Quantum gravity theory", paper_count: 8, similarity: 0.7 },
    ]);
    const fuzzy = await resolveQueryTags("quantum gravity");

    expect(m.queryRaw).toHaveBeenCalledTimes(1);
    expect(fuzzy.best).toMatchObject({ id: "k-ml", source: "fuzzy" });
    expect(fuzzy.best).not.toHaveProperty("worksCount");
    expect(fuzzy.coverageTarget).toMatchObject({ id: "t-q", source: "name" });
  });

  it("selects works_count in the trigram query for taxonomy nodes", async () => {
    m.queryRaw.mockResolvedValue([]);
    await resolveQueryTags("zzzz yyyy");

    const sql = (m.queryRaw.mock.calls[0]![0] as { sql: string }).sql;
    expect(sql).toMatch(/t.works_count::int AS works_count/);
  });
});

describe("resolveQueryTags curated tags", () => {
  it("loads only active tags that own papers", async () => {
    await resolveQueryTags("education");

    expect(m.tagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active", paperCount: { gte: 1 } } }),
    );
  });

  it("resolves a custom tag by name and by slug, with a tagIds filter and no openalexId", async () => {
    m.tagFindMany.mockResolvedValue([
      customTag({ id: "g-nlp", slug: "natural-language-processing", name: "NLP Essentials", paperCount: 60 }),
    ]);

    const byName = await resolveQueryTags("NLP essentials");
    expect(byName.best).toMatchObject({
      kind: "tag", id: "g-nlp", name: "NLP Essentials", source: "name", confidence: 1, paperCount: 60,
      matchedText: "nlp essentials", filter: { key: "tagIds", value: "g-nlp" },
    });
    expect(byName.best).not.toHaveProperty("openalexId");
    expect(byName.coversQuery).toBe(true);

    const bySlug = await resolveQueryTags("natural language processing");
    expect(bySlug.best).toMatchObject({ kind: "tag", id: "g-nlp", source: "alias", confidence: 0.96 });
  });

  it("wins ties against a taxonomy node and a keyword with the same phrase", async () => {
    // The topic (40 papers) and the keyword (25) would rank by size; the tag is smaller but curated.
    m.tagFindMany.mockResolvedValue([customTag({ id: "g-tm", slug: "topic-modeling", name: "Topic Modeling", paperCount: 3 })]);

    const result = await resolveQueryTags("topic modeling");

    expect(result.detectedTags.map((t) => [t.kind, t.id])).toEqual([
      ["tag", "g-tm"],
      ["topic", "t-tm"],
      ["keyword", "k-tm"],
    ]);
    expect(result.best).toMatchObject({ kind: "tag", confidence: 1 });
  });

  it("adds a 0.01 bonus (capped at 1) when the tag matches below full confidence", async () => {
    m.tagFindMany.mockResolvedValue([customTag({ id: "g-hm", slug: "hm", name: "Hoc may", paperCount: 4 })]);
    m.keywordFindMany.mockResolvedValue([
      keyword({ id: "k-hm", keywordName: "Hoc may", normalizedName: "hoc may", paperCount: 400 }),
    ]);
    m.topicFindMany.mockResolvedValue([]);

    // Half the query is covered: keyword 0.5, tag 0.5 + 0.01.
    const result = await resolveQueryTags("hoc may sieu am");
    expect(result.detectedTags.map((t) => [t.kind, t.confidence])).toEqual([["tag", 0.51], ["keyword", 0.5]]);
  });
});

describe("resolveQueryTags fuzzy fallback", () => {
  const fuzzyRows = [
    { kind: "keyword", id: "k-ml", openalex_id: null, name: "Machine learning", paper_count: 500, similarity: 0.83 },
    { kind: "subfield", id: "s-x", openalex_id: "1702", name: "Machine Learning Systems", paper_count: 20, similarity: 0.6 },
  ];

  it("runs only when nothing matched exactly and the query has two or more tokens", async () => {
    m.queryRaw.mockResolvedValue(fuzzyRows);

    const result = await resolveQueryTags("machine learnin");

    expect(m.queryRaw).toHaveBeenCalledTimes(1);
    expect(result.best).toMatchObject({
      kind: "keyword", id: "k-ml", source: "fuzzy", confidence: 0.664, matchedText: "machine learnin",
      filter: { key: "keywordIds", value: "k-ml" },
    });
    expect(result.detectedTags[1]).toMatchObject({ kind: "subfield", confidence: 0.48, filter: { key: "subfieldIds", value: "1702" } });
    expect(result.coversQuery).toBe(false);
  });

  it("includes custom tags in the trigram query and maps them to a tagIds filter", async () => {
    m.queryRaw.mockResolvedValue([
      { kind: "tag", id: "g-ml", openalex_id: null, name: "Machine Learning Basics", paper_count: 12, similarity: 0.75 },
    ]);

    const result = await resolveQueryTags("machine learnin basics");

    const sql = (m.queryRaw.mock.calls[0]![0] as { sql: string }).sql;
    expect(sql).toMatch(/FROM tags g/);
    expect(sql).toMatch(/g\.status = 'active'/);
    expect(result.best).toMatchObject({
      kind: "tag", id: "g-ml", source: "fuzzy", confidence: 0.61, filter: { key: "tagIds", value: "g-ml" },
    });
    expect(result.best).not.toHaveProperty("openalexId");
  });

  it("is skipped for a single unmatched token and when an exact phrase matched", async () => {
    m.queryRaw.mockResolvedValue(fuzzyRows);

    await resolveQueryTags("learnin");
    await resolveQueryTags("education zzzz");

    expect(m.queryRaw).not.toHaveBeenCalled();
  });

  it("returns no tags when the trigram query finds nothing", async () => {
    const result = await resolveQueryTags("zzzz yyyy");
    expect(result).toMatchObject({ detectedTags: [], best: null, coversQuery: false });
  });
});

describe("dictionary lifecycle", () => {
  it("shares one load between concurrent queries and reuses it within the TTL", async () => {
    await Promise.all([resolveQueryTags("education"), resolveQueryTags("machine learning")]);
    await resolveQueryTags("topic modeling");

    expect(m.topicFindMany).toHaveBeenCalledTimes(1);
    expect(m.keywordFindMany).toHaveBeenCalledTimes(1);
  });

  it("reloads after TAXONOMY_DICTIONARY_TTL_SECONDS", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await resolveQueryTags("education");
    vi.setSystemTime(new Date("2026-01-01T00:05:00Z"));
    await resolveQueryTags("education policy");
    expect(m.topicFindMany).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:10:01Z"));
    await resolveQueryTags("education reform");
    expect(m.topicFindMany).toHaveBeenCalledTimes(2);
  });

  it("reloads right after invalidateTaxonomyDictionary and picks up the edit", async () => {
    expect((await resolveQueryTags("quantum computing")).best).toBeNull();

    m.keywordFindMany.mockResolvedValue([
      keyword({ id: "k-q", keywordName: "Quantum computing", normalizedName: "quantum computing", paperCount: 9 }),
    ]);
    invalidateTaxonomyDictionary();

    expect((await resolveQueryTags("quantum computing")).best).toMatchObject({ id: "k-q" });
    expect(m.keywordFindMany).toHaveBeenCalledTimes(2);
  });

  it("keeps serving the previous dictionary when a reload fails, and throws when there is none", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await resolveQueryTags("education");

    vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));
    m.topicFindMany.mockRejectedValueOnce(new Error("db down"));
    expect((await resolveQueryTags("education")).best).toMatchObject({ id: "k-edu" });

    invalidateTaxonomyDictionary();
    m.topicFindMany.mockRejectedValueOnce(new Error("db down"));
    await expect(resolveQueryTags("education")).rejects.toThrow("db down");
  });
});

describe("resolver cache", () => {
  it("stores the result under a versioned per-query key", async () => {
    await resolveQueryTags("  Topic   MODELING ");

    // Once the dictionary was invalidated in this process the key also carries the invalidation epoch.
    expect(m.cacheSet).toHaveBeenCalledWith(
      expect.stringMatching(/^search:qtags:v4:h\(.*topic modeling.*\)$/),
      expect.objectContaining({ coversQuery: true }),
      600,
    );
  });

  it("serves a cached resolution without loading the catalogue", async () => {
    const cached = { detectedTags: [], best: null, coversQuery: false, coverageTarget: null };
    m.cacheGet.mockResolvedValue(cached);

    expect(await resolveQueryTags("education")).toEqual(cached);
    expect(m.topicFindMany).not.toHaveBeenCalled();
  });

  it("tolerates Redis errors on read and write", async () => {
    m.cacheGet.mockRejectedValue(new Error("redis down"));
    m.cacheSet.mockRejectedValue(new Error("redis down"));

    const result = await resolveQueryTags("education");

    expect(result.best).toMatchObject({ id: "k-edu", confidence: 1 });
  });

  it("changes the cache key after invalidation so stale resolutions are skipped", async () => {
    await resolveQueryTags("education");
    invalidateTaxonomyDictionary();
    await resolveQueryTags("education");

    const keys = m.cacheSet.mock.calls.map((call) => call[0]);
    expect(keys[0]).not.toEqual(keys[1]);
  });
});
