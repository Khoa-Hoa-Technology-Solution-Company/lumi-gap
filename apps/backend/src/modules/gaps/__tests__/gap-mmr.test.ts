import { describe, expect, it } from "vitest";
import { cosine, selectByMmr } from "../gap-mmr.js";

// Three near-duplicates of one branch (a1..a3) and one paper from another branch (b), slightly less relevant.
const vectors = new Map<string, number[]>([
  ["a1", [1, 0, 0]],
  ["a2", [0.99, 0.1, 0]],
  ["a3", [0.98, 0.15, 0]],
  ["b", [0, 1, 0]],
]);
const candidates = [
  { id: "a1", relevance: 0.95 },
  { id: "a2", relevance: 0.94 },
  { id: "a3", relevance: 0.93 },
  { id: "b", relevance: 0.85 },
];
const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

describe("cosine", () => {
  it("is 1 for parallel vectors, 0 for orthogonal ones and for a zero vector", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1, 10);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("selectByMmr", () => {
  it("keeps retrieval order when lambda is 1", () => {
    expect(ids(selectByMmr(candidates, vectors, 2, 1))).toEqual(["a1", "a2"]);
  });

  it("picks the other branch before a near-duplicate", () => {
    expect(ids(selectByMmr(candidates, vectors, 2, 0.7))).toEqual(["a1", "b"]);
  });

  it("counts pinned papers as already picked without returning them", () => {
    // a1 is the user's choice, so the first retrieved pick already avoids its branch.
    expect(ids(selectByMmr(candidates, vectors, 1, 0.7, ["a1"]))).toEqual(["b"]);
  });

  it("treats a paper without an embedding as not redundant and stops when the pool is empty", () => {
    const pool = [...candidates, { id: "noVector", relevance: 0.5 }];
    expect(ids(selectByMmr(pool, vectors, 10, 0.7))).toHaveLength(5);
    expect(ids(selectByMmr([], vectors, 3, 0.7))).toEqual([]);
  });
});
