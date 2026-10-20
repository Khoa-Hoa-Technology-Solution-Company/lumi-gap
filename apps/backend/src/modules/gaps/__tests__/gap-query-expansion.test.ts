import { describe, expect, it } from "vitest";
import { expandTopicQueries, fuseByRrf, MAX_SUBQUERIES, topicFacets } from "../gap-query-expansion.js";

describe("topicFacets", () => {
  it("splits at prepositions, conjunctions and punctuation, dropping articles", () => {
    expect(topicFacets("LLM feedback for second-language writing in higher education")).toEqual(["LLM feedback", "second-language writing", "higher education"]);
    expect(topicFacets("The role of AI, ethics and the law")).toEqual(["role", "AI", "ethics", "law"]);
  });

  it("splits Vietnamese topics too", () => {
    expect(topicFacets("phản hồi của LLM trong dạy viết tiếng Anh")).toEqual(["phản hồi", "LLM", "dạy viết tiếng Anh"]);
  });
});

describe("expandTopicQueries", () => {
  it("adds leave-one-out sub-queries after the full topic, dropping the last facet first", () => {
    expect(expandTopicQueries("LLM feedback for second-language writing in higher education")).toEqual([
      "LLM feedback for second-language writing in higher education",
      "LLM feedback second-language writing",
      "LLM feedback higher education",
      "second-language writing higher education",
    ]);
  });

  it("keeps a topic with fewer than 3 facets as one query", () => {
    expect(expandTopicQueries("federated learning in medical imaging")).toEqual(["federated learning in medical imaging"]);
    expect(expandTopicQueries("transformers")).toEqual(["transformers"]);
  });

  it("caps the number of sub-queries", () => {
    expect(expandTopicQueries("a for b in c with d and e")).toHaveLength(1 + MAX_SUBQUERIES);
  });
});

describe("fuseByRrf", () => {
  const p = (id: string, score: number) => ({ id, score });

  it("ranks a paper found by several queries first and keeps its best score", () => {
    const fused = fuseByRrf([[p("x", 0.9), p("shared", 0.7)], [p("shared", 0.8), p("y", 0.6)]], 10);
    expect(fused.map((row) => row.id)).toEqual(["shared", "x", "y"]);
    expect(fused[0]!.score).toBe(0.8);
  });

  it("returns at most limit papers and handles a single list", () => {
    expect(fuseByRrf([[p("a", 1), p("b", 1), p("c", 1)]], 2).map((row) => row.id)).toEqual(["a", "b"]);
    expect(fuseByRrf([], 5)).toEqual([]);
  });
});
