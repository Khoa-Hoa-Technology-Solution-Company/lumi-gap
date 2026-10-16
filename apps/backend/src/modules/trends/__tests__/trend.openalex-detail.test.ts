import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  openAlexYearCounts: vi.fn(),
  openAlexGroupBy: vi.fn(),
  openAlexGet: vi.fn(),
}));

vi.mock("../trend.openalex-client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../trend.openalex-client.js")>()),
  ...client,
}));

const prisma = vi.hoisted(() => ({ paperTopic: { findFirst: vi.fn(), findMany: vi.fn() } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));

import {
  getOpenAlexCompare,
  getOpenAlexRelationships,
  getOpenAlexTopicCandidates,
  getOpenAlexTopicDetail,
  resolveOpenAlexTopic,
} from "../trend.openalex-detail.js";

const NOW_YEAR = new Date().getFullYear();

const topicEntity = (id: string, name: string, worksCount = 1000) => ({
  id: `https://openalex.org/${id}`,
  display_name: name,
  works_count: worksCount,
  domain: { id: "https://openalex.org/domains/3", display_name: "Physical Sciences" },
  field: { id: "https://openalex.org/fields/17", display_name: "Computer Science" },
  subfield: { id: "https://openalex.org/subfields/1702", display_name: "Artificial Intelligence" },
});

const TOPIC_MODELING = topicEntity("T10028", "Topic Modeling");
const AI_EDU = topicEntity("T14414", "Artificial Intelligence in Education");

/** Entity lookups and topic searches against a tiny fake OpenAlex. */
function mockTopicApi(search: Record<string, unknown[]> = {}) {
  client.openAlexGet.mockImplementation(async (path: string, params: Record<string, string>) => {
    if (path === "topics/T10028") return TOPIC_MODELING;
    if (path === "topics/T14414") return AI_EDU;
    if (path === "topics" && params.filter?.startsWith("display_name.search:")) {
      return { results: search[params.filter.slice("display_name.search:".length)] ?? [] };
    }
    throw new Error(`unexpected openAlexGet ${path}`);
  });
}

function mockCounts() {
  client.openAlexYearCounts.mockImplementation(async (filter: string) => {
    const band = filter.match(/cited_by_count:(\S+?)(?:,|$)/)?.[1];
    const factor = band ? 1 : filter.includes("is_in_top_10_percent") ? 0.1 : 1;
    const base = filter.includes("T14414") ? 200 : 100;
    return new Map([
      [2022, Math.round(base * factor)],
      [2024, Math.round(base * 2 * factor)],
    ]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.paperTopic.findFirst.mockResolvedValue(null);
  prisma.paperTopic.findMany.mockResolvedValue([]);
  client.openAlexGroupBy.mockResolvedValue({ groups: [], nextCursor: null });
  mockCounts();
});

describe("resolveOpenAlexTopic", () => {
  it("fetches an explicit id (short or URL) without touching the local table or searching", async () => {
    mockTopicApi();
    const fromUrl = await resolveOpenAlexTopic("whatever", "https://openalex.org/T10028");
    const fromShort = await resolveOpenAlexTopic("whatever", "t10028");

    for (const resolved of [fromUrl, fromShort]) {
      expect(resolved).toEqual({
        id: "T10028",
        name: "Topic Modeling",
        taxonomy: {
          topicId: "T10028",
          topicName: "Topic Modeling",
          domainId: "3",
          domainName: "Physical Sciences",
          fieldId: "17",
          fieldName: "Computer Science",
          subfieldId: "1702",
          subfieldName: "Artificial Intelligence",
        },
      });
    }
    expect(client.openAlexGet).toHaveBeenCalledWith("topics/T10028", expect.objectContaining({ select: expect.any(String) }));
    expect(prisma.paperTopic.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for an explicit id OpenAlex does not know, but rethrows other failures", async () => {
    client.openAlexGet.mockRejectedValueOnce(new Error("OpenAlex 404"));
    expect(await resolveOpenAlexTopic("x", "T99999999")).toBeNull();
    client.openAlexGet.mockRejectedValueOnce(new Error("OpenAlex 503"));
    await expect(resolveOpenAlexTopic("x", "T10028")).rejects.toThrow("OpenAlex 503");
  });

  it("uses the local taxonomy table before searching OpenAlex by name", async () => {
    mockTopicApi();
    prisma.paperTopic.findFirst.mockResolvedValue({ openalexTopicId: "https://openalex.org/T10028" });
    const resolved = await resolveOpenAlexTopic("topic modeling");
    expect(resolved?.id).toBe("T10028");
    expect(prisma.paperTopic.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { topicName: { equals: "topic modeling", mode: "insensitive" }, openalexTopicId: { not: null } } }),
    );
    expect(client.openAlexGet).toHaveBeenCalledTimes(1);
  });

  it("falls back to an OpenAlex name search and accepts only an exact name match", async () => {
    mockTopicApi({ "topic modeling": [topicEntity("T1", "Topic Modeling and Beyond"), TOPIC_MODELING] });
    expect((await resolveOpenAlexTopic("topic  modeling"))?.id).toBe("T10028");
    expect(client.openAlexGet).toHaveBeenCalledWith("topics", expect.objectContaining({ filter: "display_name.search:topic modeling" }));

    mockTopicApi({ "Machine learning": [topicEntity("T1", "Machine Learning in Materials Science")] });
    expect(await resolveOpenAlexTopic("Machine learning")).toBeNull();
  });

  it("still searches by name when the local table is unavailable", async () => {
    mockTopicApi({ "Topic Modeling": [TOPIC_MODELING] });
    prisma.paperTopic.findFirst.mockRejectedValue(new Error("db down"));
    expect((await resolveOpenAlexTopic("Topic Modeling"))?.id).toBe("T10028");
  });
});

describe("getOpenAlexTopicDetail", () => {
  it("returns null when the topic cannot be resolved", async () => {
    mockTopicApi();
    expect(await getOpenAlexTopicDetail("Unknown thing", {} as never)).toBeNull();
  });

  it("builds the OpenAlex filters, series, facets and top lists", async () => {
    mockTopicApi();
    client.openAlexGroupBy.mockImplementation(async (_filter: string, groupBy: string) => {
      const groups: Record<string, Array<{ key: string; name: string; count: number }>> = {
        "primary_location.source.id": [
          { key: "unknown", name: "unknown", count: 90 },
          ...Array.from({ length: 12 }, (_, i) => ({ key: `S${i + 1}`, name: `Journal ${i + 1}`, count: 50 - i })),
        ],
        "authorships.author.id": [{ key: "A1", name: "Ada", count: 9 }],
        "keywords.id": [{ key: "large-language-models", name: "Large language models", count: 7 }],
        type: [{ key: "article", name: "article", count: 80 }],
        "open_access.oa_status": [{ key: "gold", name: "gold", count: 40 }],
        language: [{ key: "en", name: "English", count: 95 }],
      };
      return { groups: groups[groupBy] ?? [], nextCursor: null };
    });

    const detail = (await getOpenAlexTopicDetail("Topic Modeling", { topicId: "T10028", yearFrom: 2021, yearTo: 2024, languages: ["EN"] } as never))!;

    const base = "type:article|review|preprint|conference-paper|book-chapter,language:en,primary_topic.id:T10028,publication_year:2021-2024";
    expect(client.openAlexYearCounts).toHaveBeenCalledWith(base);
    expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${base},citation_normalized_percentile.is_in_top_10_percent:true`);
    for (const range of ["0-9", "10-49", "50-99", "100-499", "500-999", ">999"]) {
      expect(client.openAlexYearCounts).toHaveBeenCalledWith(`${base},cited_by_count:${range}`);
    }
    for (const groupBy of ["primary_location.source.id", "authorships.author.id", "keywords.id", "type", "open_access.oa_status", "language"]) {
      expect(client.openAlexGroupBy).toHaveBeenCalledWith(base, groupBy);
    }
    // 1 entity + 2 series + 6 group_by + 6 citation bands.
    expect(client.openAlexGet.mock.calls.length + client.openAlexYearCounts.mock.calls.length + client.openAlexGroupBy.mock.calls.length).toBe(15);

    expect(detail.dataSource).toBe("openalex");
    expect(detail.topic).toBe("Topic Modeling");
    expect(detail.taxonomy).toMatchObject({ openalexTopicId: "T10028", topicId: "T10028", topicName: "Topic Modeling", fieldId: "17", fieldName: "Computer Science" });
    expect(detail.yearlyBreakdown).toEqual([
      { year: 2021, count: 0 },
      { year: 2022, count: 100 },
      { year: 2023, count: 0 },
      { year: 2024, count: 200 },
    ]);
    expect(detail.totalPapers).toBe(300);
    expect(detail.lastCompleteYear).toBe(Math.min(2024, NOW_YEAR - 1));
    expect(detail.momentum).toEqual(expect.any(Number));
    expect(detail.growthRatePct).toEqual(expect.any(Number));

    // Citation totals are never invented; PP(top 10%) comes from the percentile filter.
    expect(detail.citationTrend[1]).toEqual({ year: 2022, count: 100, totalCitations: null, avgCitations: null, topCitedCount: 10, ppTop10Pct: 10 });
    expect(detail.citationTrend[0]).toMatchObject({ year: 2021, count: 0, topCitedCount: 0, ppTop10Pct: null, totalCitations: null });

    expect(detail.topJournals).toEqual([1, 2, 3, 4, 5].map((i) => ({ id: `S${i}`, name: `Journal ${i}`, count: 51 - i })));
    expect(detail.topAuthors).toEqual([{ id: "A1", name: "Ada", count: 9 }]);
    expect(detail.topKeywords).toEqual([{ id: "large-language-models", name: "Large language models", count: 7 }]);

    expect(detail.facets.topSources).toHaveLength(10);
    expect(detail.facets.topSources[0]).toEqual({ id: "S1", name: "Journal 1", count: 50, openalexId: "S1" });
    expect(detail.facets.paperKinds).toEqual([{ id: "article", name: "article", count: 80 }]);
    expect(detail.facets.openAccessStatuses[0]!.id).toBe("gold");
    expect(detail.facets.languages[0]).toEqual({ id: "en", name: "English", count: 95 });
    expect(detail.facets.citationBands.map((band) => band.id)).toEqual(["0-9", "10-49", "50-99", "100-499", "500-999", "1000+"]);
    expect(detail.facets.citationBands.every((band) => band.count === 300)).toBe(true);
    expect(detail.facets.providers).toEqual([]);
    expect(detail.facets.domains).toEqual([]);
    expect(detail.facets.topics).toEqual([]);
    expect(Number.isNaN(Date.parse(detail.computedAt))).toBe(false);
  });

  it("drops a primary_topic scope clause so it cannot contradict the requested topic", async () => {
    mockTopicApi();
    await getOpenAlexTopicDetail("Topic Modeling", { topicId: "T10028", yearFrom: 2021, yearTo: 2024, topicIds: ["T1"], fieldIds: ["17"] } as never);
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.field.id:17,primary_topic.id:T10028,publication_year:2021-2024");
  });

  it("defaults to a ten year window and skips breakdown requests when the topic has no papers", async () => {
    mockTopicApi();
    client.openAlexYearCounts.mockResolvedValue(new Map());
    const detail = (await getOpenAlexTopicDetail("Topic Modeling", { topicId: "T10028", yearTo: 2024 } as never))!;
    expect(detail.totalPapers).toBe(0);
    expect(detail.yearlyBreakdown).toHaveLength(11);
    expect(detail.yearlyBreakdown[0]!.year).toBe(2014);
    expect(detail.facets.citationBands).toEqual([]);
    expect(client.openAlexGroupBy).not.toHaveBeenCalled();
  });

  it("lets OpenAlex errors propagate so the service can fall back as a whole", async () => {
    mockTopicApi();
    client.openAlexYearCounts.mockRejectedValue(new Error("OpenAlex 503"));
    await expect(getOpenAlexTopicDetail("Topic Modeling", { topicId: "T10028" } as never)).rejects.toThrow("OpenAlex 503");
  });
});

describe("getOpenAlexCompare", () => {
  it("compares distinct topics and ignores the compared names as a taxonomy filter", async () => {
    mockTopicApi({ "Topic Modeling": [TOPIC_MODELING], "Artificial Intelligence in Education": [AI_EDU] });
    const result = (await getOpenAlexCompare({
      topics: ["Topic Modeling", "Artificial Intelligence in Education", "Topic Modeling"],
      yearFrom: 2021,
      yearTo: 2024,
    } as never))!;

    expect(result.dataSource).toBe("openalex");
    expect(result).toMatchObject({ yearFrom: 2021, yearTo: 2024 });
    expect(result.topics.map((item) => item.topic)).toEqual(["Topic Modeling", "Artificial Intelligence in Education"]);
    expect(result.topics[0]).toMatchObject({ totalPapers: 300, taxonomy: { openalexTopicId: "T10028" } });
    expect(result.topics[1]).toMatchObject({ totalPapers: 600 });
    expect(result.topics[0]!.citationTrend[1]).toMatchObject({ totalCitations: null, avgCitations: null, ppTop10Pct: 10 });
    expect(result.topics[0]!.yearlyBreakdown).toHaveLength(4);
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.id:T14414,publication_year:2021-2024");
    // The compared names must not be turned into a primary_topic.id scope through the local table.
    expect(prisma.paperTopic.findMany).not.toHaveBeenCalled();
  });

  it("returns null when any topic cannot be resolved", async () => {
    mockTopicApi({ "Topic Modeling": [TOPIC_MODELING] });
    expect(await getOpenAlexCompare({ topics: ["Topic Modeling", "Nonexistent"], yearTo: 2024 } as never)).toBeNull();
  });
});

describe("getOpenAlexTopicCandidates", () => {
  it("searches topics by name, applies the scope and minPapers, and shapes the items", async () => {
    mockTopicApi({ "topic model": [TOPIC_MODELING, topicEntity("T5", "Tiny Topic Model")] });
    client.openAlexYearCounts.mockImplementation(async (filter: string) =>
      filter.includes("primary_topic.id:T5") ? new Map([[2024, 1]]) : new Map([[2022, 30], [2024, 60]]),
    );

    const result = await getOpenAlexTopicCandidates({ q: " topic model ", limit: 20, minPapers: 5, yearFrom: 2021, yearTo: 2024, openAccessStatuses: ["gold"] } as never);

    expect(client.openAlexGet).toHaveBeenCalledWith(
      "topics",
      expect.objectContaining({ filter: "display_name.search:topic model", per_page: "20", sort: "works_count:desc" }),
    );
    expect(client.openAlexYearCounts).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,open_access.oa_status:gold,primary_topic.id:T10028,publication_year:2021-2024");
    expect(result.dataSource).toBe("openalex");
    expect(result.query).toBe("topic model");
    expect(result.totalCandidates).toBe(1);
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0]).toMatchObject({
      topic: "Topic Modeling",
      matchedBy: "topic",
      totalPapers: 90,
      taxonomy: { openalexTopicId: "T10028", fieldName: "Computer Science" },
    });
    expect(result.topics[0]!.yearlyBreakdown).toHaveLength(4);
    expect(result.topics[0]).toHaveProperty("momentum");
    expect(result.topics[0]).toHaveProperty("growthRatePct");
    expect(result.topics[0]).toHaveProperty("cagr3yPct");
  });

  it("sorts by papers in the window and returns an empty list when nothing matches", async () => {
    mockTopicApi({ ai: [TOPIC_MODELING, AI_EDU] });
    const sorted = await getOpenAlexTopicCandidates({ q: "ai", limit: 5, minPapers: 1, yearFrom: 2021, yearTo: 2024 } as never);
    expect(sorted.topics.map((topic) => topic.topic)).toEqual(["Artificial Intelligence in Education", "Topic Modeling"]);

    mockTopicApi();
    const none = await getOpenAlexTopicCandidates({ q: "zzz", limit: 5, minPapers: 1 } as never);
    expect(none.topics).toEqual([]);
    expect(none.totalCandidates).toBe(0);
  });
});

describe("getOpenAlexRelationships", () => {
  it("returns null for an unresolved topic", async () => {
    mockTopicApi();
    expect(await getOpenAlexRelationships({ topic: "Nonexistent", limit: 5 } as never)).toBeNull();
  });

  it("groups co-assigned topics, excludes the topic itself and uses names as ids", async () => {
    mockTopicApi();
    client.openAlexGroupBy.mockResolvedValue({
      groups: [
        { key: "T10028", name: "Topic Modeling", count: 500 },
        { key: "T11", name: "Natural Language Processing", count: 120 },
        { key: "T12", name: "Machine Learning", count: 90 },
        { key: "T13", name: "Data Mining", count: 30 },
      ],
      nextCursor: null,
    });

    const result = (await getOpenAlexRelationships({ topic: "Topic Modeling", topicId: "T10028", limit: 2, yearFrom: 2021, yearTo: 2024 } as never))!;

    expect(client.openAlexGroupBy).toHaveBeenCalledWith("type:article|review|preprint|conference-paper|book-chapter,primary_topic.id:T10028,publication_year:2021-2024", "topics.id");
    expect(result.dataSource).toBe("openalex");
    expect(result).toMatchObject({ topic: "Topic Modeling", yearFrom: 2021, yearTo: 2024 });
    expect(result.nodes).toEqual([
      { id: "Topic Modeling", label: "Topic Modeling", count: 500 },
      { id: "Natural Language Processing", label: "Natural Language Processing", count: 120 },
      { id: "Machine Learning", label: "Machine Learning", count: 90 },
    ]);
    expect(result.edges).toEqual([
      { source: "Topic Modeling", target: "Natural Language Processing", count: 120 },
      { source: "Topic Modeling", target: "Machine Learning", count: 90 },
    ]);
    expect(result.nodes.some((node, index) => index > 0 && node.id === "Topic Modeling")).toBe(false);
    expect(client.openAlexYearCounts).not.toHaveBeenCalled();
  });

  it("falls back to yearly counts for the topic total when the group list lacks the topic itself", async () => {
    mockTopicApi();
    client.openAlexGroupBy.mockResolvedValue({ groups: [{ key: "T11", name: "NLP", count: 5 }], nextCursor: null });
    const result = (await getOpenAlexRelationships({ topic: "Topic Modeling", topicId: "T10028", limit: 5, yearFrom: 2021, yearTo: 2024 } as never))!;
    expect(result.nodes[0]).toEqual({ id: "Topic Modeling", label: "Topic Modeling", count: 300 });
  });
});
