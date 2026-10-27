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
  it("returns a finite neutral value for malformed vectors", () => {
    for (const vector of [[], [1], [NaN, 1], [Infinity, 1], [Number.MAX_VALUE, 1]]) {
      expect(cosine(vector, [1, 0])).toBe(0);
    }
    expect(cosine([1, 0], [-1, 0])).toBe(-1);
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

  it("matches the exhaustive MMR definition across deterministic randomized inputs", () => {
    let seed = 1729;
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
    for (let run = 0; run < 30; run++) {
      const pool = Array.from({ length: 40 }, (_, i) => ({ id: String(i), relevance: random() }));
      const embeddings = new Map(pool.filter(() => random() > 0.1).map((row) => [row.id, Array.from({ length: 16 }, () => random() * 2 - 1)]));
      const pinned = run % 2 ? ["0", "1"] : [];
      const lambda = [0, 0.3, 0.7, 1][run % 4]!;
      const remaining = pool.filter((row) => !pinned.includes(row.id));
      const picked = [...pinned];
      const expected: typeof pool = [];
      while (expected.length < 12 && remaining.length) {
        let best = 0, bestScore = -Infinity;
        remaining.forEach((row, index) => {
          const redundancy = picked.length ? Math.max(...picked.map((id) => {
            const a = embeddings.get(row.id), b = embeddings.get(id);
            return a && b ? (1 + cosine(a, b)) / 2 : 0;
          })) : 0;
          const score = lambda * row.relevance - (1 - lambda) * redundancy;
          if (score > bestScore) { best = index; bestScore = score; }
        });
        const [chosen] = remaining.splice(best, 1);
        expected.push(chosen!); picked.push(chosen!.id);
      }
      expect(selectByMmr(pool, embeddings, 12, lambda, pinned)).toEqual(expected);
      expect(pool).toHaveLength(40);
    }
  });

  it("preserves tie order, excludes repeated and pinned IDs, and leaves inputs untouched", () => {
    const pool = Object.freeze([Object.freeze({ id: "first", relevance: 0.5 }), { id: "second", relevance: 0.5 }, { id: "first", relevance: 0.5 }]);
    expect(ids(selectByMmr([...pool], new Map(), 5, 0.7))).toEqual(["first", "second"]);
    expect(ids(selectByMmr([...pool], new Map(), 5, 0.7, ["first", "first"]))).toEqual(["second"]);
    expect(pool).toHaveLength(3);
  });

  it("treats malformed embeddings as missing and prevents NaN relevance poisoning", () => {
    const badVectors = new Map<string, readonly number[]>([...["zero", "nan", "infinite", "mismatch"].map((id) => [id, [NaN, 1]] as const), ["pinned", [1, 0]] as const]);
    badVectors.set("zero", [0, 0]); badVectors.set("infinite", [Infinity, 1]); badVectors.set("mismatch", [1]);
    const pool = [
      { id: "nan", relevance: NaN }, { id: "zero", relevance: 0.9 },
      { id: "infinite", relevance: 0.8 }, { id: "mismatch", relevance: 0.7 },
    ];
    expect(ids(selectByMmr(pool, badVectors, 4, 0.7, ["pinned"]))).toEqual(["zero", "infinite", "mismatch", "nan"]);
  });

  it("validates selection parameters", () => {
    expect(selectByMmr(candidates, vectors, 0, 0.7)).toEqual([]);
    for (const k of [-1, NaN, Infinity, 1.5]) expect(() => selectByMmr(candidates, vectors, k, 0.7)).toThrow(RangeError);
    for (const lambda of [-0.1, 1.1, NaN, Infinity]) expect(() => selectByMmr(candidates, vectors, 2, lambda)).toThrow(RangeError);
  });
});
