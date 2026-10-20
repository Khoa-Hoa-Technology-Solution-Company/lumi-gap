import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { paper: { findUnique: vi.fn() }, paperTopic: { findMany: vi.fn(), findFirst: vi.fn() }, $queryRaw: vi.fn() },
  cache: { get: vi.fn(), set: vi.fn() },
  neighbours: vi.fn(),
  topicDetailOnly: vi.fn(),
  topic: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.db }));
vi.mock("../../../infrastructure/cache.js", () => ({ cache: mocks.cache, hashKey: (value: unknown) => JSON.stringify(value) }));
vi.mock("../../../infrastructure/database/postgres-paper-search.js", () => ({ findPaperEmbeddingNeighbours: mocks.neighbours }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../trends/trend.service.js", () => ({ trendService: { topicDetailOnly: mocks.topicDetailOnly, topic: mocks.topic } }));
import { AppError } from "../../../common/exceptions/app-error.js";
import { fillFromTopicPeers, getPaperReadingContext, pickRelatedPapers, READING_CONTEXT_TTL_SECONDS, trendFigures } from "../quality.reading-context.js";

const paperId = "00000000-0000-4000-8000-000000000001";
const neighbour = (n: number, year: number, citations: number, similarity: number) => ({ id: `00000000-0000-4000-8000-00000000010${n}`, legacyMongoId: null, title: `Paper ${n}`, publicationYear: year, citationCount: citations, similarity });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.paper.findUnique.mockResolvedValue({ id: paperId, legacyMongoId: null, publicationYear: 2020, dataStatus: "active" });
  mocks.cache.get.mockResolvedValue(null);
  mocks.db.paperTopic.findMany.mockImplementation(async ({ where }: { where: { paperId: string | { in: string[] } } }) => typeof where.paperId === "string"
    ? [{ topicName: "Writing Feedback" }, { topicName: "Higher Education" }]
    : [{ paperId: neighbour(1, 0, 0, 0).id, topicName: "writing feedback" }, { paperId: neighbour(2, 0, 0, 0).id, topicName: "Writing Feedback" }, { paperId: neighbour(3, 0, 0, 0).id, topicName: "Higher Education" }]);
  mocks.db.paperTopic.findFirst.mockResolvedValue(null);
  mocks.db.$queryRaw.mockResolvedValue([]);
  mocks.neighbours.mockResolvedValue([neighbour(1, 2023, 5, 0.91), neighbour(2, 2018, 400, 0.88), neighbour(3, 2015, 50, 0.8), neighbour(4, 2024, 1, 0.95), neighbour(5, 2021, 2, 0.7), neighbour(6, 2019, 3, 0.6)]);
  mocks.topicDetailOnly.mockResolvedValue({ totalPapers: 42, growthRatePct: 12.5, cagr3yPct: 8.1, momentum: 1.2, yearlyBreakdown: [{ year: 2019, count: 3, extra: 1 }, { year: 2020, count: 5 }] });
});

describe("paper reading context", () => {
  it("places the paper on its own top topic and suggests what to read next", async () => {
    const result = await getPaperReadingContext(paperId, {});
    // The 2019 base year has 3 papers, so the 3-year CAGR is withheld.
    expect(result).toMatchObject({ paperId, requestedTopic: null, trend: { topic: "Writing Feedback", source: "paper_topic", totalPapers: 42, growthRatePct: 12.5, cagr3yPct: null, momentum: 1.2, paperYear: 2020, partialYear: null, yearlyBreakdown: [{ year: 2019, count: 3 }, { year: 2020, count: 5 }] } });
    expect(result.trend?.yearlyBreakdown[0]).not.toHaveProperty("extra");
    expect(result.related.map((item) => [item.title, item.reason])).toEqual([
      ["Paper 1", "same_topic_newer"], ["Paper 2", "same_topic_most_cited"], ["Paper 3", "same_topic_most_cited"],
      ["Paper 4", "semantic_neighbor"], ["Paper 5", "semantic_neighbor"],
    ]);
    expect(result.related[0]?.sharedTopics).toEqual(["Writing Feedback"]);
    expect(mocks.topicDetailOnly).toHaveBeenCalledWith("Writing Feedback", {});
    expect(mocks.topic).not.toHaveBeenCalled();
    expect(mocks.cache.set).toHaveBeenCalledWith(expect.stringContaining(paperId), result, READING_CONTEXT_TTL_SECONDS);
  });
  it("uses the reader's topic when it is a known topic name, in its stored spelling", async () => {
    mocks.db.paperTopic.findFirst.mockResolvedValue({ topicName: "Machine Learning" });
    const result = await getPaperReadingContext(paperId, { topic: "machine learning" });
    expect(result).toMatchObject({ requestedTopic: "machine learning", trend: { topic: "Machine Learning", source: "requested" } });
    expect(mocks.db.paperTopic.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { topicName: { equals: "machine learning", mode: "insensitive" } } }));
  });
  it("falls back to the paper's topic for an unknown query and echoes it", async () => {
    const result = await getPaperReadingContext(paperId, { query: "how to give feedback" });
    expect(result).toMatchObject({ requestedTopic: "how to give feedback", trend: { source: "paper_topic", topic: "Writing Feedback" } });
  });
  it("normalizes the topic in the cache key and serves cached results without database work", async () => {
    const cached = { paperId, requestedTopic: "AI", trend: null, related: [], computedAt: "2026-10-19T00:00:00.000Z" };
    mocks.cache.get.mockResolvedValue(cached);
    expect(await getPaperReadingContext(paperId, { topic: "  AI " })).toBe(cached);
    expect(mocks.cache.get.mock.calls[0]![0]).toContain('"topic":"ai"');
    expect(mocks.db.paperTopic.findMany).not.toHaveBeenCalled();
    expect(mocks.neighbours).not.toHaveBeenCalled();
  });
  it("hides papers that are not active", async () => {
    mocks.db.paper.findUnique.mockResolvedValue({ id: paperId, legacyMongoId: null, publicationYear: 2020, dataStatus: "archived" });
    await expect(getPaperReadingContext(paperId, {})).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.cache.get).not.toHaveBeenCalled();
  });
  it("returns an empty context when the paper has no topics, trend data or embedding", async () => {
    mocks.db.paperTopic.findMany.mockResolvedValue([]);
    mocks.neighbours.mockResolvedValue([]);
    expect(await getPaperReadingContext(paperId, {})).toMatchObject({ trend: null, related: [] });
    expect(mocks.topicDetailOnly).not.toHaveBeenCalled();
  });
  it("returns no trend when the topic has no papers in the window", async () => {
    mocks.topicDetailOnly.mockRejectedValue(AppError.notFound("No papers found"));
    expect((await getPaperReadingContext(paperId, {})).trend).toBeNull();
  });
});

describe("topic fallback and topic matching", () => {
  const peer = (n: number, year: number, citations: number, newerRank: number | null, citedRank: number) => ({ id: `00000000-0000-4000-8000-00000000020${n}`, legacyMongoId: null, title: `Peer ${n}`, publicationYear: year, citationCount: citations, topics: ["Writing Feedback", "Unrelated"], newerRank: newerRank === null ? null : BigInt(newerRank), citedRank: BigInt(citedRank) });
  const peers = [peer(1, 2024, 90, 1, 2), peer(2, 2022, 10, 2, 5), peer(3, 2021, 5, 3, 6), peer(4, 2010, 500, null, 1), peer(5, 2015, 60, null, 3), peer(6, 2012, 40, null, 4)];

  it("fills the list from papers sharing the paper's top topics when it has no embedding", async () => {
    mocks.neighbours.mockResolvedValue([]);
    mocks.db.$queryRaw.mockResolvedValue(peers);
    const { related } = await getPaperReadingContext(paperId, {});
    expect(related.map((item) => [item.title, item.reason])).toEqual([
      ["Peer 1", "same_topic_newer"], ["Peer 2", "same_topic_newer"], ["Peer 4", "same_topic_most_cited"], ["Peer 5", "same_topic_most_cited"], ["Peer 6", "same_topic_most_cited"],
    ]);
    expect(related.every((item) => item.similarity === 0)).toBe(true);
    expect(related[0]?.sharedTopics).toEqual(["Writing Feedback"]);
    expect(mocks.db.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.db.paperTopic.findMany).toHaveBeenCalledOnce();
  });
  it("tops up a short embedding list without repeating papers", async () => {
    mocks.neighbours.mockResolvedValue([{ ...neighbour(1, 2023, 5, 0.91), id: peers[0]!.id }, neighbour(4, 2024, 1, 0.95)]);
    mocks.db.$queryRaw.mockResolvedValue(peers);
    const { related } = await getPaperReadingContext(paperId, {});
    expect(related).toHaveLength(5);
    expect(new Set(related.map((item) => item.id)).size).toBe(5);
    expect(related.filter((item) => item.reason === "same_topic_newer")).toHaveLength(2);
    expect(related.slice(0, 2).map((item) => item.similarity)).not.toContain(0);
  });
  it("skips the fallback query when the embedding already gives five papers", async () => {
    await getPaperReadingContext(paperId, {});
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled();
  });
  it("uses one of the paper's own topics that contains the requested text", async () => {
    const result = await getPaperReadingContext(paperId, { topic: "writing" });
    expect(result.trend).toMatchObject({ topic: "Writing Feedback", source: "requested" });
  });
  it("prefers an exact known topic over a partial match", async () => {
    mocks.db.paperTopic.findFirst.mockResolvedValue({ topicName: "Higher Education" });
    expect((await getPaperReadingContext(paperId, { topic: "higher education" })).trend).toMatchObject({ topic: "Higher Education", source: "requested" });
  });
  it("does not pick unrelated topics or match very short text", async () => {
    expect((await getPaperReadingContext(paperId, { topic: "machine learning" })).trend).toMatchObject({ topic: "Writing Feedback", source: "paper_topic" });
    expect((await getPaperReadingContext(paperId, { topic: "ed" })).trend).toMatchObject({ source: "paper_topic" });
  });
  it("adds no more than two newer papers before the most cited ones", () => {
    const item = (id: string) => ({ id, title: id, publicationYear: 2024, citationCount: 1, similarity: 0, sharedTopics: ["T"] });
    const picked = fillFromTopicPeers([{ ...item("a"), reason: "same_topic_newer" }], { newer: [item("b"), item("c")], mostCited: [item("d"), item("b")] });
    expect(picked.map((entry) => `${entry.id}:${entry.reason}`)).toEqual(["a:same_topic_newer", "b:same_topic_newer", "d:same_topic_most_cited", "c:same_topic_newer"]);
  });
});

describe("related paper selection", () => {
  const candidate = (id: string, year: number | null, citations: number | null, similarity: number, sharedTopics: string[] = []) => ({ id, title: id, publicationYear: year, citationCount: citations, similarity, sharedTopics });
  it("never repeats a paper and caps the list at five", () => {
    const picked = pickRelatedPapers(2020, Array.from({ length: 9 }, (_, index) => candidate(`p${index}`, 2021 + index, index, 0.9 - index / 100, ["T"])));
    expect(picked).toHaveLength(5);
    expect(new Set(picked.map((item) => item.id)).size).toBe(5);
  });
  it("labels only semantic neighbours when nothing shares a topic or the year is unknown", () => {
    expect(pickRelatedPapers(null, [candidate("a", 2024, 10, 0.9)]).map((item) => item.reason)).toEqual(["semantic_neighbor"]);
  });
});

describe("trend figures and requested-topic reading lists", () => {
  it("withholds CAGR for a small base year and flags the running year", () => {
    const series = [2022, 2023, 2024, 2025, 2026].map((year, index) => ({ year, count: [4, 8, 12, 20, 3][index]! }));
    expect(trendFigures(series, 70.9, 2026)).toEqual({ cagr3yPct: null, partialYear: 2026 });
    expect(trendFigures(series.map((point) => ({ ...point, count: point.count + 10 })), 21.4, 2026)).toEqual({ cagr3yPct: 21.4, partialYear: 2026 });
    expect(trendFigures(series.slice(0, 4), 70.9, 2026).partialYear).toBeNull();
    expect(trendFigures(series, null, 2026).cagr3yPct).toBeNull();
  });
  it("draws related papers from the requested topic, not the paper's own", async () => {
    mocks.db.paperTopic.findFirst.mockResolvedValue({ topicName: "Higher Education" });
    mocks.neighbours.mockResolvedValue([]);
    mocks.db.$queryRaw.mockResolvedValue([]);
    await getPaperReadingContext(paperId, { topic: "higher education" });
    const sql = mocks.db.$queryRaw.mock.calls[0]![0] as { values: unknown[] };
    expect(sql.values).toContainEqual(["Higher Education"]);
    expect(JSON.stringify(sql.values)).not.toContain("Writing Feedback");
  });
});
