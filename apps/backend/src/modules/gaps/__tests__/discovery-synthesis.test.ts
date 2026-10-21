import { describe, expect, it } from "vitest";
import { parseDiscoverySynthesis } from "../discovery-synthesis.js";

describe("discovery synthesis provider output", () => {
  it("accepts canonical string sections", () => {
    const value = { commonFindings: "Different outcomes [1] [2]", contradictions: "", openQuestions: "Replication? [2]" };
    expect(parseDiscoverySynthesis(value, 2)).toEqual(value);
  });
  it("normalizes provider bullet arrays and redundant citation metadata", () => {
    expect(parseDiscoverySynthesis({ commonFindings: ["Finding [1]", "Another [2]"], contradictions: [], openQuestions: ["Replication? [2]"], citingPaperNumbers: [1, 2] }, 2))
      .toEqual({ commonFindings: "Finding [1]\nAnother [2]", contradictions: "", openQuestions: "Replication? [2]" });
  });
  it("does not invent inline citations from redundant metadata", () => {
    expect(() => parseDiscoverySynthesis({ commonFindings: ["Unsupported claim"], contradictions: [], openQuestions: [], citingPaperNumbers: [1] }, 2)).toThrow("cite existing evidence");
  });
  it("rejects missing, invalid, empty and oversized output", () => {
    const base = { commonFindings: "Finding [1]", contradictions: "", openQuestions: "" };
    for (const invalid of [{}, { ...base, commonFindings: "Finding [3]" }, { ...base, commonFindings: "" }, { ...base, commonFindings: [{ text: "Finding [1]" }] }, { ...base, commonFindings: "a".repeat(10001) + " [1]" }, { ...base, unexpected: true }]) {
      expect(() => parseDiscoverySynthesis(invalid, 2)).toThrow();
    }
  });
});
