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
