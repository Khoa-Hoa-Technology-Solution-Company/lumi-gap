import { describe, expect, it, vi } from "vitest";

import { buildOpenAlexPageUrl, OPENALEX_MAX_PER_PAGE, searchOpenAlexWorks, fetchOpenAlexWorkById } from "../openalex.client.js";

describe("OpenAlex Works request contract", () => {
  it("encodes interactive search on a fixed host and rejects arbitrary attach URLs", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ results: [{ id: "https://openalex.org/W123" }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    try {
      expect(await searchOpenAlexWorks("spring boot & performance")).toHaveLength(1);
      const [url, options] = request.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url.origin).toBe("https://api.openalex.org");
      expect(url.searchParams.get("search")).toBe("spring boot & performance");
      expect(url.searchParams.get("per_page")).toBe("20");
      expect(options.redirect).toBe("error");
      expect(options.signal).toBeInstanceOf(AbortSignal);
      await expect(fetchOpenAlexWorkById("http://127.0.0.1/private")).rejects.toThrow("Invalid OpenAlex");
      expect(request).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
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
