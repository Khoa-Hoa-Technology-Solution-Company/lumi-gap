import { describe, expect, it } from "vitest";
import { SearchQuerySchema } from "../dto/search.schema.js";

describe("SearchQuerySchema language filters", () => {
  it("rejects a whitespace-only semantic query", () => {
    const parsed = SearchQuerySchema.safeParse({ q: "   \t " });

    expect(parsed.success).toBe(false);
  });

  it("normalizes comma-separated language codes and removes duplicates", () => {
    const parsed = SearchQuerySchema.parse({
      q: "machine learning",
      languages: "EN,vi,en,ru",
    });

    expect(parsed.languages).toEqual(["en", "vi", "ru"]);
  });

  it("drops malformed language values without rejecting the search", () => {
    const parsed = SearchQuerySchema.parse({
      q: "machine learning",
      languages: "english,@@,und",
    });

    expect(parsed.languages).toEqual(["und"]);
  });

  it("normalizes the shared advanced filter vocabulary", () => {
    const parsed = SearchQuerySchema.parse({
      q: "machine learning",
      paperKinds: "article,review",
      providers: "openalex,crossref",
      domainIds: "https://openalex.org/domains/3",
      citationBands: "10-49,1000+",
    });

    expect(parsed.paperKinds).toEqual(["article", "review"]);
    expect(parsed.providers).toEqual(["openalex", "crossref"]);
    expect(parsed.domainIds).toEqual(["https://openalex.org/domains/3"]);
    expect(parsed.citationBands).toEqual(["10-49", "1000+"]);
  });
});

describe("SearchQuerySchema autoTags and keywordIds", () => {
  it("enables auto tagging by default and only an explicit false-like value disables it", () => {
    expect(SearchQuerySchema.parse({ q: "x" }).autoTags).toBe(true);
    expect(SearchQuerySchema.parse({ q: "x", autoTags: "true" }).autoTags).toBe(true);
    expect(SearchQuerySchema.parse({ q: "x", autoTags: "" }).autoTags).toBe(true);
    for (const off of ["false", "0", "off", "no", "FALSE"]) {
      expect(SearchQuerySchema.parse({ q: "x", autoTags: off }).autoTags).toBe(false);
    }
  });

  it("parses tagIds like keywordIds and caps them at 50", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(SearchQuerySchema.parse({ q: "x", tagIds: `${id},${id}` }).tagIds).toEqual([id]);
    expect(SearchQuerySchema.parse({ q: "x" }).tagIds).toBeUndefined();
    const many = Array.from({ length: 51 }, (_, i) => `t${i}`).join(",");
    expect(SearchQuerySchema.safeParse({ q: "x", tagIds: many }).success).toBe(false);
  });

  it("parses keywordIds like the other id lists and caps them at 50", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(SearchQuerySchema.parse({ q: "x", keywordIds: `${id},${id}` }).keywordIds).toEqual([id]);
    expect(SearchQuerySchema.parse({ q: "x" }).keywordIds).toBeUndefined();
    const many = Array.from({ length: 51 }, (_, i) => `k${i}`).join(",");
    expect(SearchQuerySchema.safeParse({ q: "x", keywordIds: many }).success).toBe(false);
  });
});
