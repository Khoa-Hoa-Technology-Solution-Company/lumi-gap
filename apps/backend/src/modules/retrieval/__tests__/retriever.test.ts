import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import {
  buildRetrievePipeline,
  buildVectorFilter,
  toScoredPaper,
  toRetrievedPaper,
  type RetrieveOptions,
} from "../retriever.js";

describe("buildVectorFilter", () => {
  it("pushes narrow metadata filters into the filtered vector index", () => {
    const paperId = "507f1f77bcf86cd799439011";
    expect(
      buildVectorFilter({
        filters: {
          yearFrom: 2021,
          yearTo: 2024,
          topics: ["LLM", "RAG"],
          languages: ["EN"],
          sources: ["Nature"],
          citationBands: ["100-499"],
          paperIds: [paperId],
        },
      }),
    ).toEqual({
      dataStatus: "active",
      publicationYear: { $gte: 2021, $lte: 2024 },
      _id: { $in: [new mongoose.Types.ObjectId(paperId)] },
      journalName: { $in: ["Nature"] },
      language: { $in: ["en"] },
      citationCount: { $gte: 100, $lte: 499 },
      "topics.topicName": { $in: ["LLM", "RAG"] },
    });
  });

  it("defaults to active papers", () => {
    expect(buildVectorFilter({})).toEqual({ dataStatus: "active" });
  });
});

describe("buildRetrievePipeline", () => {
  const base: RetrieveOptions = {
    queryVector: [0.1, 0.2, 0.3],
    topK: 12,
    filters: {
      paperIds: ["507f1f77bcf86cd799439011"],
      paperKinds: ["journal-article"],
      openAccess: true,
      openAccessStatuses: ["gold"],
      provider: "openalex",
      languages: ["EN", "vi"],
      topics: ["LLM"],
      domainIds: ["https://openalex.org/domains/1"],
      minScore: 0.71,
    },
  };

  it("oversamples before post-vector filters and limits to topK afterwards", () => {
    const pipeline = buildRetrievePipeline(base);

    expect(pipeline[0]).toEqual({
      $vectorSearch: {
        index: "paper_vector_index",
        path: "embedding",
        queryVector: base.queryVector,
        numCandidates: 1000,
        limit: 120,
        filter: {
          dataStatus: "active",
          _id: { $in: [new mongoose.Types.ObjectId("507f1f77bcf86cd799439011")] },
          paperKind: { $in: ["journal-article"] },
          openAccessStatus: { $in: ["gold"] },
          primaryProvider: "openalex",
          language: { $in: ["en", "vi"] },
          "topics.topicName": { $in: ["LLM"] },
          "topics.domainId": { $in: ["https://openalex.org/domains/1", "1"] },
        },
      },
    });
    expect(pipeline).toContainEqual({ $addFields: { score: { $meta: "vectorSearchScore" } } });
    expect(pipeline).toContainEqual({
      $match: expect.objectContaining({
        _id: { $in: [new mongoose.Types.ObjectId("507f1f77bcf86cd799439011")] },
        paperKind: { $in: ["journal-article"] },
        openAccessUrl: { $type: "string", $ne: "" },
        openAccessStatus: { $in: ["gold"] },
        primaryProvider: "openalex",
        language: { $in: ["en", "vi"] },
        topics: {
          $elemMatch: {
            topicName: { $in: ["LLM"] },
            domainId: { $in: ["https://openalex.org/domains/1", "1"] },
          },
        },
        score: { $gte: 0.71 },
      }),
    });
    expect(pipeline.at(-1)).toEqual({ $limit: 12 });
  });

  it("uses caller supplied pool and candidate sizes when provided", () => {
    const pipeline = buildRetrievePipeline({
      queryVector: [1, 0],
      topK: 5,
      poolSize: 30,
      numCandidates: 90,
      projection: "gap",
    });

    expect(pipeline[0]).toMatchObject({
      $vectorSearch: {
        limit: 30,
        numCandidates: 90,
      },
    });
    expect(pipeline).toContainEqual({
      $project: {
        title: 1,
        abstractText: 1,
        aiAnalysis: 1,
        publicationYear: 1,
        journalName: 1,
        citationCount: 1,
        "authors.displayName": 1,
        score: 1,
      },
    });
  });
});

describe("toRetrievedPaper", () => {
  it("normalizes Mongo aggregation docs into shared evidence shape", () => {
    expect(
      toRetrievedPaper({
        _id: "paper-1",
        title: "A paper",
        abstractText: "Abstract",
        publicationYear: 2025,
        journalName: "Journal",
        citationCount: 42,
        authors: [{ displayName: "Alice" }, { displayName: "" }, { displayName: "Bob" }],
        score: 0.88,
      }),
    ).toEqual({
      id: "paper-1",
      title: "A paper",
      abstractText: "Abstract",
      publicationYear: 2025,
      journalName: "Journal",
      citationCount: 42,
      authorNames: ["Alice", "Bob"],
      score: 0.88,
    });
  });

  it("normalizes encoded title markup in retrieved evidence", () => {
    expect(
      toRetrievedPaper({
        _id: "paper-encoded",
        title: "&lt;i&gt;Grounded &amp; Reliable&lt;/i&gt;",
        score: 0.8,
      }).title,
    ).toBe("Grounded & Reliable");
  });
});

describe("toScoredPaper", () => {
  it("normalizes encoded title markup in search results", () => {
    const paper = toScoredPaper({
      _id: "paper-encoded",
      title: "&lt;b&gt;Semantic &amp; Keyword Search&lt;/b&gt;",
      score: 0.91,
    });

    expect(paper.title).toBe("Semantic & Keyword Search");
    expect(paper.score).toBe(0.91);
  });
});
