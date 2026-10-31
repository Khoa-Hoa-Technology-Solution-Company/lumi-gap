import type { DetectedTag } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env.js";
import { searchService } from "../search.service.js";

const m = vi.hoisted(() => ({
  retrieveScored: vi.fn(),
  resolveQueryTags: vi.fn(),
  cachedGenerate: vi.fn(),
}));

vi.mock("../../retrieval/retriever.js", () => ({ retrieveScored: m.retrieveScored }));
vi.mock("../../taxonomy/query-tag-resolver.js", () => ({ resolveQueryTags: m.resolveQueryTags }));
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerate: m.cachedGenerate }));
vi.mock("../../llm/gemini.client.js", () => ({ generateJSON: vi.fn() }));
vi.mock("../../user-ai/user-ai.runtime.js", () => ({ aiModel: () => "test-model" }));
vi.mock("../../credits/credit.service.js", () => ({ creditService: {} }));
vi.mock("../../../infrastructure/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const tag = (over: Partial<DetectedTag> = {}): DetectedTag => ({
  kind: "topic",
  id: "t-tm",
  openalexId: "T10028",
  name: "Topic Modeling",
  paperCount: 40,
  confidence: 1,
  source: "name",
  matchedText: "topic modeling",
  filter: { key: "topicIds", value: "T10028" },
  ...over,
});

const resolution = (best: DetectedTag, coversQuery = true, extra: DetectedTag[] = []) => ({
  detectedTags: [best, ...extra],
  best,
  coversQuery,
});

function hit(id: string, extra: Record<string, unknown> = {}) {
  return { id, title: id, score: 0.5, hybridScore: 0.5, topics: [], keywords: [], ...extra };
}
const hits = (n: number) => Array.from({ length: n }, (_, i) => hit(`p${i}`));

const base = { q: "topic modeling", page: 1, pageSize: 20 };
const env2 = env as unknown as Record<string, unknown>;
const original = {
  SEARCH_AUTO_TAGS: env.SEARCH_AUTO_TAGS,
  TOPIC_BACKFILL_SEARCH_ENABLED: env.TOPIC_BACKFILL_SEARCH_ENABLED,
  TOPIC_BACKFILL_THIN_MAX_PAPERS: env.TOPIC_BACKFILL_THIN_MAX_PAPERS,
};
function restoreEnv() {
  env2.SEARCH_AUTO_TAGS = original.SEARCH_AUTO_TAGS;
  env2.TOPIC_BACKFILL_SEARCH_ENABLED = original.TOPIC_BACKFILL_SEARCH_ENABLED;
  env2.TOPIC_BACKFILL_THIN_MAX_PAPERS = original.TOPIC_BACKFILL_THIN_MAX_PAPERS;
}

beforeEach(() => {
  vi.resetAllMocks();
  restoreEnv();
  m.retrieveScored.mockResolvedValue(hits(30));
  m.resolveQueryTags.mockResolvedValue({ detectedTags: [], best: null, coversQuery: false });
});

afterEach(() => {
  restoreEnv();
});

const filtersOf = (call: number) => m.retrieveScored.mock.calls[call]![0].filters;

describe("searchService.semantic query understanding", () => {
  it("filter mode: a decisive tag is added as a hard filter", async () => {
    m.resolveQueryTags.mockResolvedValue(resolution(tag()));

    const result = await searchService.semantic(base);

    expect(m.retrieveScored).toHaveBeenCalledTimes(1);
    expect(filtersOf(0).topicIds).toEqual(["T10028"]);
    expect(result.understanding).toMatchObject({ mode: "filter", fellBack: false, appliedTag: { id: "t-tm" } });
    expect(result.understanding.detectedTags).toHaveLength(1);
    expect(result.total).toBe(30);
  });

  it("only boosts a tag that covers most of the corpus", async () => {
    m.resolveQueryTags.mockResolvedValue({ ...resolution(tag({ paperCount: 4114 })), corpusSize: 4200 });

    const result = await searchService.semantic(base);

    expect(filtersOf(0).topicIds).toBeUndefined();
    expect(result.understanding).toMatchObject({ mode: "boost", appliedTag: null });
  });

  it("filter mode with a keyword sends keywordIds", async () => {
    const kw = tag({ kind: "keyword", id: "k-1", openalexId: undefined, filter: { key: "keywordIds", value: "k-1" } });
    m.resolveQueryTags.mockResolvedValue(resolution(kw));

    await searchService.semantic(base);

    expect(filtersOf(0).keywordIds).toEqual(["k-1"]);
    expect(filtersOf(0).topicIds).toBeUndefined();
  });

  it("filter mode with a curated tag sends tagIds", async () => {
    const curated = tag({ kind: "tag", id: "g-1", openalexId: undefined, filter: { key: "tagIds", value: "g-1" } });
    m.resolveQueryTags.mockResolvedValue(resolution(curated));

    await searchService.semantic(base);

    expect(filtersOf(0).tagIds).toEqual(["g-1"]);
    expect(filtersOf(0).topicIds).toBeUndefined();
  });

  it("boost mode lifts papers whose tagIds carry the detected curated tag", async () => {
    const curated = tag({ kind: "tag", id: "g-1", openalexId: undefined, confidence: 0.6, filter: { key: "tagIds", value: "g-1" } });
    m.resolveQueryTags.mockResolvedValue(resolution(curated, false));
    m.retrieveScored.mockResolvedValue([
      hit("plain", { score: 0.5, hybridScore: 0.5 }),
      hit("tagged", { score: 0.5, hybridScore: 0.49, tagIds: ["g-1"] }),
    ]);

    const result = await searchService.semantic(base);

    expect(result.understanding.mode).toBe("boost");
    expect(result.papers.map((p) => p.id)).toEqual(["tagged", "plain"]);
  });

  it("falls back to an unfiltered boost search when the filtered pool is too small", async () => {
    const best = tag();
    m.resolveQueryTags.mockResolvedValue(resolution(best));
    m.retrieveScored
      .mockResolvedValueOnce(hits(env.SEARCH_TAG_FALLBACK_MIN_RESULTS - 1))
      .mockResolvedValueOnce([
        hit("plain", { score: 0.5, hybridScore: 0.5 }),
        hit("tagged", { score: 0.5, hybridScore: 0.49, topics: [{ topicName: "t", openalexTopicId: "T10028" }] }),
      ]);

    const result = await searchService.semantic(base);

    expect(m.retrieveScored).toHaveBeenCalledTimes(2);
    expect(filtersOf(0).topicIds).toEqual(["T10028"]);
    expect(filtersOf(1).topicIds).toBeUndefined();
    expect(result.understanding).toMatchObject({ mode: "boost", fellBack: true, appliedTag: null });
    expect(result.understanding.detectedTags).toEqual([best]);
    // The tag boost (0.05) outweighs the 0.01 hybrid gap, so the tagged paper moves up.
    expect(result.papers.map((p) => p.id)).toEqual(["tagged", "plain"]);
    expect(result.papers[0]!.taxonomyBoostScore).toBeGreaterThanOrEqual(0.05);
  });

  it("boost mode: a tag that does not cover the query is not a filter but raises matching papers", async () => {
    m.resolveQueryTags.mockResolvedValue(resolution(tag({ confidence: 0.5 }), false));
    m.retrieveScored.mockResolvedValue([
      hit("plain", { hybridScore: 0.5 }),
      hit("tagged", { hybridScore: 0.49, topics: [{ topicName: "t", openalexTopicId: "T10028" }] }),
    ]);

    const result = await searchService.semantic({ ...base, q: "topic modeling for policy" });

    expect(m.retrieveScored).toHaveBeenCalledTimes(1);
    expect(filtersOf(0).topicIds).toBeUndefined();
    expect(result.understanding).toMatchObject({ mode: "boost", fellBack: false, appliedTag: null });
    const tagged = result.papers.find((p) => p.id === "tagged")!;
    expect(tagged.taxonomyBoostScore).toBeCloseTo(0.025, 3);
    expect(result.papers.find((p) => p.id === "plain")!.taxonomyBoostScore).toBe(0);
    expect(result.papers[0]!.id).toBe("tagged");
  });

  it.each([
    ["confidence below the threshold", { confidence: env.SEARCH_TAG_FILTER_MIN_CONFIDENCE - 0.01 }],
    ["too few papers under the tag", { paperCount: env.SEARCH_TAG_FILTER_MIN_PAPERS - 1 }],
  ])("does not filter on %s", async (_label, over) => {
    m.resolveQueryTags.mockResolvedValue(resolution(tag(over)));

    const result = await searchService.semantic(base);

    expect(filtersOf(0).topicIds).toBeUndefined();
    expect(result.understanding.mode).toBe("boost");
  });

  it("does not filter a fuzzy best match", async () => {
    m.resolveQueryTags.mockResolvedValue(resolution(tag({ source: "fuzzy", confidence: 0.9 }), false));

    expect((await searchService.semantic(base)).understanding.mode).toBe("boost");
  });

  it("returns mode none when nothing was detected", async () => {
    const result = await searchService.semantic(base);

    expect(result.understanding).toEqual({ mode: "none", detectedTags: [], appliedTag: null, fellBack: false });
    expect(m.retrieveScored).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["topicIds", { topicIds: ["T1"] }],
    ["subfieldIds", { subfieldIds: ["1702"] }],
    ["fieldIds", { fieldIds: ["17"] }],
    ["domainIds", { domainIds: ["3"] }],
    ["topics", { topics: ["Topic Modeling"] }],
    ["subfields", { subfields: ["AI"] }],
    ["fields", { fields: ["CS"] }],
    ["domains", { domains: ["Physical Sciences"] }],
    ["keywordIds", { keywordIds: ["123e4567-e89b-42d3-a456-426614174000"] }],
    ["tagIds", { tagIds: ["123e4567-e89b-42d3-a456-426614174001"] }],
  ])("explicit %s disables auto tags", async (_name, explicit) => {
    m.resolveQueryTags.mockResolvedValue(resolution(tag()));

    const result = await searchService.semantic({ ...base, ...explicit });

    expect(m.resolveQueryTags).not.toHaveBeenCalled();
    expect(result.understanding.mode).toBe("none");
    expect(filtersOf(0).topicIds).toEqual((explicit as { topicIds?: string[] }).topicIds);
  });

  it("autoTags=false disables auto tags", async () => {
    m.resolveQueryTags.mockResolvedValue(resolution(tag()));

    const result = await searchService.semantic({ ...base, autoTags: false });

    expect(m.resolveQueryTags).not.toHaveBeenCalled();
    expect(result.understanding.mode).toBe("none");
    expect(filtersOf(0).topicIds).toBeUndefined();
  });

  it("SEARCH_AUTO_TAGS=false disables auto tags", async () => {
    env2.SEARCH_AUTO_TAGS = false;
    m.resolveQueryTags.mockResolvedValue(resolution(tag()));

    const result = await searchService.semantic(base);

    expect(m.resolveQueryTags).not.toHaveBeenCalled();
    expect(result.understanding.mode).toBe("none");
  });

  it("degrades to plain search when the resolver throws", async () => {
    m.resolveQueryTags.mockRejectedValue(new Error("catalogue unavailable"));

    const result = await searchService.semantic(base);

    expect(result.understanding.mode).toBe("none");
    expect(result.total).toBe(30);
  });

  it("passes an explicit tagIds filter through to the retriever", async () => {
    const ids = ["123e4567-e89b-42d3-a456-426614174000"];
    await searchService.semantic({ ...base, tagIds: ids });

    expect(filtersOf(0).tagIds).toEqual(ids);
  });

  it("passes an explicit keywordIds filter through to the retriever", async () => {
    const ids = ["123e4567-e89b-42d3-a456-426614174000"];
    await searchService.semantic({ ...base, keywordIds: ids });

    expect(filtersOf(0).keywordIds).toEqual(ids);
  });

  it("rerank path: applies the same filter and puts the applied tag into the rerank cache key", async () => {
    m.resolveQueryTags.mockResolvedValue(resolution(tag()));
    m.cachedGenerate.mockImplementation(async (args: { keyParts: { filters: Record<string, unknown> } }) => {
      const scores: Record<string, number> = {};
      for (const id of (args.keyParts as unknown as { candidateIds: string[] }).candidateIds) scores[id] = 0.9;
      return scores;
    });

    const result = await searchService.semantic({ ...base, rerank: true, userId: "u1" });

    expect(filtersOf(0).topicIds).toEqual(["T10028"]);
    expect(result.reranked).toBe(true);
    expect(result.understanding).toMatchObject({ mode: "filter", appliedTag: { id: "t-tm" } });
    const keyParts = m.cachedGenerate.mock.calls[0]![0].keyParts;
    expect(keyParts.filters.autoTagFilter).toEqual({ key: "topicIds", value: "T10028" });
    expect(keyParts.filters.topicIds).toEqual([]);
  });

  it("rerank path: an empty filtered pool falls back and reports it", async () => {
    m.resolveQueryTags.mockResolvedValue(resolution(tag()));
    m.retrieveScored.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await searchService.semantic({ ...base, rerank: true, userId: "u1" });

    expect(result).toMatchObject({ papers: [], total: 0, reranked: false });
    expect(result.understanding).toMatchObject({ mode: "boost", fellBack: true });
  });
});

describe("searchService.semantic thin-coverage hint", () => {
  const thin = (over: Partial<DetectedTag> = {}) => tag({ paperCount: 25, worksCount: 4000, ...over });
  const resolved = (best: DetectedTag | null, coverageTarget: DetectedTag | null, coversQuery = true) => ({
    detectedTags: best ? [best] : [],
    best,
    coversQuery,
    coverageTarget,
  });
  const expectedHint = {
    targetKind: "topic", targetId: "t-tm", name: "Topic Modeling", localPapers: 25, openalexWorks: 4000,
    filter: { key: "topicIds", value: "T10028" },
  };

  it("filter mode: a thin topic can still filter and carries the hint", async () => {
    const t = thin();
    m.resolveQueryTags.mockResolvedValue(resolved(t, t));

    const result = await searchService.semantic(base);

    expect(filtersOf(0).topicIds).toEqual(["T10028"]);
    expect(result.understanding).toMatchObject({ mode: "filter", fellBack: false });
    expect(result.understanding.coverage).toEqual(expectedHint);
  });

  it("boost mode carries the hint", async () => {
    const t = thin({ paperCount: 5, confidence: 0.5 });
    m.resolveQueryTags.mockResolvedValue(resolved(t, t, false));

    const result = await searchService.semantic(base);

    expect(result.understanding.mode).toBe("boost");
    expect(result.understanding.coverage).toEqual({ ...expectedHint, localPapers: 5 });
  });

  it("mode none carries the hint for an entry with no local papers", async () => {
    m.resolveQueryTags.mockResolvedValue(resolved(null, thin({ paperCount: 0 })));

    const result = await searchService.semantic(base);

    expect(result.understanding).toEqual({
      mode: "none", detectedTags: [], appliedTag: null, fellBack: false,
      coverage: { ...expectedHint, localPapers: 0 },
    });
    expect(m.retrieveScored).toHaveBeenCalledTimes(1);
  });

  it("survives the unfiltered fallback", async () => {
    const t = thin();
    m.resolveQueryTags.mockResolvedValue(resolved(t, t));
    m.retrieveScored.mockResolvedValueOnce(hits(1)).mockResolvedValueOnce(hits(3));

    const result = await searchService.semantic(base);

    expect(result.understanding).toMatchObject({ mode: "boost", fellBack: true });
    expect(result.understanding.coverage).toEqual(expectedHint);
  });

  it("survives the rerank path", async () => {
    const t = thin();
    m.resolveQueryTags.mockResolvedValue(resolved(t, t));
    m.cachedGenerate.mockImplementation(async (args: { keyParts: { candidateIds: string[] } }) =>
      Object.fromEntries(args.keyParts.candidateIds.map((id) => [id, 0.9])));

    const result = await searchService.semantic({ ...base, rerank: true, userId: "u1" });

    expect(result.understanding.coverage).toEqual(expectedHint);
  });

  it("a keyword has openalexWorks null and needs no works comparison", async () => {
    const kw = tag({ kind: "keyword", id: "k-1", name: "Graph databases", openalexId: undefined, paperCount: 7, filter: { key: "keywordIds", value: "k-1" } });
    m.resolveQueryTags.mockResolvedValue(resolved(kw, kw));

    const result = await searchService.semantic(base);

    expect(result.understanding.coverage).toEqual({
      targetKind: "keyword", targetId: "k-1", name: "Graph databases", localPapers: 7, openalexWorks: null,
      filter: { key: "keywordIds", value: "k-1" },
    });
  });

  it("is absent when the feature is disabled", async () => {
    env2.TOPIC_BACKFILL_SEARCH_ENABLED = false;
    const t = thin();
    m.resolveQueryTags.mockResolvedValue(resolved(t, t));

    const result = await searchService.semantic(base);

    expect(result.understanding).not.toHaveProperty("coverage");
    expect(result.understanding.mode).toBe("filter");
  });

  it("is absent when there is no coverage target", async () => {
    m.resolveQueryTags.mockResolvedValue(resolved(thin(), null));

    expect(await searchService.semantic(base)).not.toHaveProperty("understanding.coverage");
  });

  it("is absent when the topic is not thin", async () => {
    env2.TOPIC_BACKFILL_THIN_MAX_PAPERS = 30;
    const t = thin({ paperCount: 30 });
    m.resolveQueryTags.mockResolvedValue(resolved(t, t));

    expect((await searchService.semantic(base)).understanding).not.toHaveProperty("coverage");

    env2.TOPIC_BACKFILL_THIN_MAX_PAPERS = 100;
    const result = await searchService.semantic(base);
    expect(result.understanding.coverage).toMatchObject({ localPapers: 30 });
  });

  it.each([
    ["worksCount equals paperCount", { paperCount: 10, worksCount: 10 }],
    ["worksCount is below paperCount", { paperCount: 10, worksCount: 4 }],
    ["worksCount is unknown", { paperCount: 10, worksCount: undefined }],
  ])("is absent when %s", async (_label, over) => {
    const t = thin(over);
    m.resolveQueryTags.mockResolvedValue(resolved(t, t));

    expect((await searchService.semantic(base)).understanding).not.toHaveProperty("coverage");
  });

  it("is absent for a target of another kind", async () => {
    const t = thin({ kind: "field", filter: { key: "fieldIds", value: "17" } });
    m.resolveQueryTags.mockResolvedValue(resolved(t, t));

    expect((await searchService.semantic(base)).understanding).not.toHaveProperty("coverage");
  });

  it("is absent when auto tags are off, even for a thin target", async () => {
    const t = thin();
    m.resolveQueryTags.mockResolvedValue(resolved(t, t));

    const result = await searchService.semantic({ ...base, autoTags: false });
    const explicit = await searchService.semantic({ ...base, topicIds: ["T1"] });

    expect(m.resolveQueryTags).not.toHaveBeenCalled();
    expect(result.understanding).toEqual({ mode: "none", detectedTags: [], appliedTag: null, fellBack: false });
    expect(explicit.understanding).not.toHaveProperty("coverage");
  });
});
