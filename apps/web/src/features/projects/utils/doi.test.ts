import { describe, expect, it } from "vitest";
import { isValidDoi, matchesExactDoi, normalizeDoi } from "./doi";

describe("project paper DOI matching", () => {
  it("normalizes bare DOI, doi prefix, and doi.org URLs", () => {
    expect(normalizeDoi(" DOI: 10.1234/AbC.def ")).toBe("10.1234/abc.def");
    expect(normalizeDoi("https://doi.org/10.1234/AbC.def")).toBe("10.1234/abc.def");
    expect(normalizeDoi("http://dx.doi.org/10.1234/AbC.def")).toBe("10.1234/abc.def");
    expect(isValidDoi("https://doi.org/10.1234/AbC.def")).toBe(true);
  });

  it("rejects unrelated URLs and malformed DOI values", () => {
    expect(normalizeDoi("https://example.com/10.1234/test")).toBe("");
    expect(isValidDoi("10.123/test")).toBe(false);
    expect(isValidDoi("10.1234/with whitespace")).toBe(false);
  });

  it("matches only the exact DOI, ignoring DOI case", () => {
    expect(matchesExactDoi("https://doi.org/10.1234/ABC", "10.1234/abc")).toBe(true);
    expect(matchesExactDoi("10.1234/abc.extra", "10.1234/abc")).toBe(false);
    expect(matchesExactDoi(undefined, "10.1234/abc")).toBe(false);
  });
});
