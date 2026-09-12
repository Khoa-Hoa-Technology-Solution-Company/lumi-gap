import { describe, expect, it } from "vitest";

import { buildOpenAlexPageUrl, OPENALEX_MAX_PER_PAGE } from "../openalex.client.js";

describe("OpenAlex Works request contract", () => {
  it("uses the documented per_page parameter and clamps it to the provider maximum", () => {
    const url = buildOpenAlexPageUrl({
      searchText: "machine learning",
      yearFrom: 2020,
      cursor: "*",
      perPage: 500,
    });

    expect(url.searchParams.get("per_page")).toBe(String(OPENALEX_MAX_PER_PAGE));
    expect(url.searchParams.get("per-page")).toBeNull();
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.get("filter")).toBe("from_publication_date:2020-01-01");
  });

  it("keeps a valid smaller page size", () => {
    const url = buildOpenAlexPageUrl({
      searchText: "natural language processing",
      yearFrom: 2019,
      cursor: "next-cursor",
      perPage: 25,
    });

    expect(url.searchParams.get("per_page")).toBe("25");
    expect(url.searchParams.get("search")).toBe("natural language processing");
  });

  it("uses a seeded sample without a cursor for a bounded planned stratum", () => {
    const url = buildOpenAlexPageUrl({
      filterExpression: "primary_topic.domain.id:4,from_publication_date:2020-01-01",
      sample: 500,
      seed: 42,
      cursor: "*",
      perPage: 100,
    });

    expect(url.searchParams.get("sample")).toBe("500");
    expect(url.searchParams.get("seed")).toBe("42");
    expect(url.searchParams.get("cursor")).toBe("*");
  });
});
