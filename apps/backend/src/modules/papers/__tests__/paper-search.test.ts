import { describe, expect, it } from "vitest";
import { normalizeDoiSearchQuery } from "../paper.service.js";

describe("paper keyword/DOI search", () => {
  it.each([
    ["10.1234/ABC.Def", "10.1234/abc.def"],
    ["doi: 10.5555/Test-01", "10.5555/test-01"],
    ["https://doi.org/10.1000/XYZ", "10.1000/xyz"],
    ["https://dx.doi.org/10.1000/XYZ", "10.1000/xyz"],
  ])("normalizes DOI input %s", (input, expected) => {
    expect(normalizeDoiSearchQuery(input)).toBe(expected);
  });

  it("leaves ordinary title and keyword queries on the text-search path", () => {
    expect(normalizeDoiSearchQuery("federated learning medical imaging")).toBeUndefined();
  });
});
