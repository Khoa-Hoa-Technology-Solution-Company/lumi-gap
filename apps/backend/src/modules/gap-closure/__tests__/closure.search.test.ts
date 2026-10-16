import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), retrieve: vi.fn(), openAlexSearch: vi.fn(), embed: vi.fn() }));

vi.mock("../../../config/env.js", () => ({ env: { GAP_CLOSURE_LOCAL_TOP_K: 7, GAP_CLOSURE_OPENALEX_PER_QUERY: 4 } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ paper: { findMany: mocks.findMany } }) }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../../api-sync/providers/openalex.client.js", () => ({ searchOpenAlexWorksForClosure: mocks.openAlexSearch }));
vi.mock("../../embeddings/embedding.factory.js", () => ({ getEmbeddingProvider: () => ({ embed: mocks.embed }) }));
vi.mock("../../retrieval/retriever.js", () => ({ retrieve: mocks.retrieve }));

import { buildDedupeKey, linkDraftsToPapers, mergeClosureDocuments, openAlexShortId, openAlexWorkToDraft, searchLocalForClosure, searchOpenAlexForClosure, type ClosureDocumentDraft } from "../closure.search.js";

const draft = (over: Partial<ClosureDocumentDraft>): ClosureDocumentDraft => ({ dedupeKey: "k", title: "T", retrievedFrom: "LOCAL", queryIndex: 0, rank: 1, ...over });

beforeEach(() => { vi.clearAllMocks(); });

describe("openAlexShortId", () => {
  it("strips the URL prefix and accepts only work ids", () => {
    expect(openAlexShortId("https://openalex.org/W2741809807")).toBe("W2741809807");
    expect(openAlexShortId("w123")).toBe("W123");
    expect(openAlexShortId("https://openalex.org/A123")).toBeUndefined();
    expect(openAlexShortId(null)).toBeUndefined();
  });
});

describe("buildDedupeKey", () => {
  it("prefers the paper id, then the OpenAlex id, then the DOI", () => {
    expect(buildDedupeKey({ paperId: "p-1", openalexId: "W1", doi: "10.1234/x" })).toBe("p-1");
    expect(buildDedupeKey({ openalexId: "https://openalex.org/W9", doi: "10.1234/x" })).toBe("openalex:W9");
    expect(buildDedupeKey({ doi: "https://doi.org/10.1234/ABC" })).toBe("doi:10.1234/abc");
  });
  it("returns null without any usable identifier", () => {
    expect(buildDedupeKey({})).toBeNull();
    expect(buildDedupeKey({ doi: "not a doi" })).toBeNull();
  });
});

describe("openAlexWorkToDraft", () => {
  it("normalizes ids, rebuilds the abstract and records source, query index and rank", () => {
    const result = openAlexWorkToDraft({ id: "https://openalex.org/W5", doi: "https://doi.org/10.1234/ABC", title: " A title ", publication_year: 2023, abstract_inverted_index: { Hello: [0], world: [1] } }, 3, 2);
    expect(result).toEqual({ dedupeKey: "openalex:W5", openalexId: "W5", doi: "10.1234/abc", title: "A title", abstractText: "Hello world", publicationYear: 2023, retrievedFrom: "OPENALEX", queryIndex: 3, rank: 2 });
  });
  it("falls back to the DOI key and drops works without a title or identifier", () => {
    expect(openAlexWorkToDraft({ doi: "10.1234/x", title: "T" }, 0, 1)?.dedupeKey).toBe("doi:10.1234/x");
    expect(openAlexWorkToDraft({ id: "https://openalex.org/W5" }, 0, 1)).toBeNull();
    expect(openAlexWorkToDraft({ title: "T" }, 0, 1)).toBeNull();
  });
  it("removes NUL characters that PostgreSQL text rejects", () => {
    expect(openAlexWorkToDraft({ id: "W5", title: "A\u0000B" }, 0, 1)?.title).toBe("AB");
  });
});

describe("mergeClosureDocuments", () => {
  it("keeps the first (queryIndex, rank) hit of every dedupe key", () => {
    const merged = mergeClosureDocuments([
      [draft({ dedupeKey: "a", queryIndex: 2, rank: 1, retrievedFrom: "OPENALEX" }), draft({ dedupeKey: "b", queryIndex: 2, rank: 2 })],
      [draft({ dedupeKey: "a", queryIndex: 0, rank: 5, retrievedFrom: "LOCAL" }), draft({ dedupeKey: "c", queryIndex: 1, rank: 1 })],
    ]);
    expect(merged.map((d) => [d.dedupeKey, d.queryIndex, d.rank])).toEqual([["a", 0, 5], ["c", 1, 1], ["b", 2, 2]]);
    expect(merged.find((d) => d.dedupeKey === "a")?.retrievedFrom).toBe("LOCAL");
  });
  it("prefers LOCAL on a tie and fills identifiers the winner lacks", () => {
    const merged = mergeClosureDocuments([
      [draft({ dedupeKey: "p1", paperId: "p1", retrievedFrom: "OPENALEX", doi: "10.1234/x", openalexId: "W1" })],
      [draft({ dedupeKey: "p1", paperId: "p1", retrievedFrom: "LOCAL" })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ retrievedFrom: "LOCAL", doi: "10.1234/x", openalexId: "W1" });
  });
  it("does not mutate its input", () => {
    const first = draft({ dedupeKey: "a" });
    mergeClosureDocuments([[first], [draft({ dedupeKey: "a", doi: "10.1234/x" })]]);
    expect(first.doi).toBeUndefined();
  });
});

describe("linkDraftsToPapers", () => {
  it("sets paperId and the paper-id dedupe key from one batched query by OpenAlex id or DOI", async () => {
    mocks.findMany.mockResolvedValue([{ id: "paper-1", doi: "10.1234/a", openalexId: "W1" }, { id: "paper-2", doi: "10.1234/b", openalexId: null }]);
    const out = await linkDraftsToPapers([
      draft({ dedupeKey: "openalex:W1", openalexId: "W1", retrievedFrom: "OPENALEX" }),
      draft({ dedupeKey: "openalex:W2", openalexId: "W2", doi: "10.1234/b", retrievedFrom: "OPENALEX" }),
      draft({ dedupeKey: "openalex:W3", openalexId: "W3", retrievedFrom: "OPENALEX" }),
    ]);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(out.map((d) => [d.dedupeKey, d.paperId])).toEqual([["paper-1", "paper-1"], ["paper-2", "paper-2"], ["openalex:W3", undefined]]);
  });
  it("skips the query when there is nothing to match", async () => {
    await linkDraftsToPapers([draft({})]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});

describe("searchLocalForClosure", () => {
  const found = [{ id: "11111111-1111-4111-8111-111111111111", title: "Paper one", abstractText: "About X", publicationYear: 2020, authorNames: [], score: 1 }];
  const row = { id: "11111111-1111-4111-8111-111111111111", legacyMongoId: null, doi: "10.1234/One", openalexId: "W77", publicationYear: 2020 };

  it("embeds the query, retrieves with the closure top-K and maps results to paper-id drafts", async () => {
    mocks.embed.mockResolvedValue([0.1]);
    mocks.retrieve.mockResolvedValue(found);
    mocks.findMany.mockResolvedValue([row]);
    const out = await searchLocalForClosure({ query: "q", queryIndex: 4, yearFrom: 2018, yearTo: 2024 });
    expect(mocks.retrieve).toHaveBeenCalledWith({ queryText: "q", queryVector: [0.1], topK: 7, filters: { yearFrom: 2018, yearTo: 2024 }, fullText: true });
    expect(out).toEqual([{ dedupeKey: row.id, paperId: row.id, openalexId: "W77", doi: "10.1234/one", title: "Paper one", abstractText: "About X", publicationYear: 2020, retrievedFrom: "LOCAL", queryIndex: 4, rank: 1 }]);
  });

  it("falls back to text-only retrieval when the embedding fails", async () => {
    mocks.embed.mockRejectedValue(new Error("quota"));
    mocks.retrieve.mockResolvedValue(found);
    mocks.findMany.mockResolvedValue([row]);
    const out = await searchLocalForClosure({ query: "q", queryIndex: 0 });
    expect(mocks.retrieve.mock.calls[0]![0].queryVector).toBeUndefined();
    expect(out).toHaveLength(1);
  });

  it("propagates a retrieval failure so the runner can log it", async () => {
    mocks.embed.mockResolvedValue([0.1]);
    mocks.retrieve.mockRejectedValue(new Error("db down"));
    await expect(searchLocalForClosure({ query: "q", queryIndex: 0 })).rejects.toThrow("db down");
  });
});

describe("searchOpenAlexForClosure", () => {
  it("passes the per-query size and years, and links works already in the corpus", async () => {
    mocks.openAlexSearch.mockResolvedValue([{ id: "https://openalex.org/W1", doi: "https://doi.org/10.1234/a", title: "One" }, { title: "No id" }]);
    mocks.findMany.mockResolvedValue([{ id: "paper-1", doi: "10.1234/a", openalexId: "W1" }]);
    const out = await searchOpenAlexForClosure({ query: "q", queryIndex: 1, yearFrom: 2019 });
    expect(mocks.openAlexSearch).toHaveBeenCalledWith({ query: "q", perPage: 4, yearFrom: 2019, yearTo: undefined });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ paperId: "paper-1", dedupeKey: "paper-1", retrievedFrom: "OPENALEX", queryIndex: 1, rank: 1 });
  });

  it("propagates a search failure instead of returning an empty list", async () => {
    mocks.openAlexSearch.mockRejectedValue(new Error("429"));
    await expect(searchOpenAlexForClosure({ query: "q", queryIndex: 0 })).rejects.toThrow("429");
  });
});
