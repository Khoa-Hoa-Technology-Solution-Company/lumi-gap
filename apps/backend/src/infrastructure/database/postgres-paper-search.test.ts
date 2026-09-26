import { describe, expect, it } from "vitest";

import { PAPER_EMBEDDING_DIMENSIONS, vectorParameter } from "./postgres-paper-search.js";

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
