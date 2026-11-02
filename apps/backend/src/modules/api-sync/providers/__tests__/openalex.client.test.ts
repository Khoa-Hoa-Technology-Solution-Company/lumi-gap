import { afterEach, describe, expect, it, vi } from "vitest";

import { buildOpenAlexPageUrl, fetchWithRetry, isNonRetryableOpenAlexError, OpenAlexRequestError, OPENALEX_MAX_PER_PAGE, openAlexSearchText, searchOpenAlexWorks, searchOpenAlexWorksForClosure, fetchOpenAlexWorkById } from "../openalex.client.js";

describe("OpenAlex Works request contract", () => {
  it("drops the wildcards OpenAlex rejects from a research-question search", async () => {
    expect(openAlexSearchText("Does X improve Y?  * test ")).toBe("Does X improve Y test");
    const request = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    try {
      await searchOpenAlexWorksForClosure({ query: "Does feedback help novices?", perPage: 5 });
      const [url] = request.mock.calls[0] as unknown as [string];
      expect(new URL(url).searchParams.get("search")).toBe("Does feedback help novices");
    } finally { vi.unstubAllGlobals(); }
  });

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

  it("sends sort only when asked, and keeps it beside a filter and cursor", () => {
    const sorted = buildOpenAlexPageUrl({
      filterExpression: "topics.id:T10028,has_abstract:true",
      sort: "cited_by_count:desc",
      cursor: "*",
      perPage: 100,
    });
    expect(sorted.searchParams.get("sort")).toBe("cited_by_count:desc");
    expect(sorted.searchParams.get("filter")).toBe("topics.id:T10028,has_abstract:true");
    expect(buildOpenAlexPageUrl({ searchText: "x", cursor: "*" }).searchParams.has("sort")).toBe(false);
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

describe("fetchWithRetry error classification", () => {
  const ok = () => new Response(JSON.stringify({ results: [{ id: "W1" }] }), { status: 200 });
  const run = async (promise: Promise<unknown>) => {
    const settled = promise.then((value) => ({ value }), (error: unknown) => ({ error }));
    await vi.runAllTimersAsync();
    return settled;
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([400, 401, 403, 404])("fails a %i immediately as non-retryable", async (status) => {
    vi.useFakeTimers();
    const request = vi.fn(async () => new Response("bad filter", { status }));
    vi.stubGlobal("fetch", request);
    const outcome = await run(fetchWithRetry("https://api.openalex.org/works?x=1")) as { error?: unknown };
    expect(outcome.error).toBeInstanceOf(OpenAlexRequestError);
    const error = outcome.error as OpenAlexRequestError;
    expect(error.name).toBe("OpenAlexRequestError");
    expect(error.status).toBe(status);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe(`OpenAlex ${status}: bad filter`);
    expect(isNonRetryableOpenAlexError(error)).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("truncates a long error body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(2000), { status: 400 })));
    const outcome = await run(fetchWithRetry("https://api.openalex.org/works")) as { error: OpenAlexRequestError };
    expect(outcome.error.message).toBe(`OpenAlex 400: ${"x".repeat(500)}`);
  });

  it("retries a 500 and succeeds", async () => {
    vi.useFakeTimers();
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("oops", { status: 500 }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", request);
    const outcome = await run(fetchWithRetry("https://api.openalex.org/works")) as { value?: { results: unknown[] } };
    expect(outcome.value?.results).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("gives up on a persistent 429 after MAX_RETRIES retries as retryable", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", request);
    const outcome = await run(fetchWithRetry("https://api.openalex.org/works")) as { error: OpenAlexRequestError };
    expect(outcome.error).toBeInstanceOf(OpenAlexRequestError);
    expect(outcome.error.status).toBe(429);
    expect(outcome.error.retryable).toBe(true);
    expect(isNonRetryableOpenAlexError(outcome.error)).toBe(false);
    expect(request).toHaveBeenCalledTimes(4); // MAX_RETRIES (3) retries + the first call
  });

  it("retries a network error and succeeds", async () => {
    vi.useFakeTimers();
    const request = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", request);
    const outcome = await run(fetchWithRetry("https://api.openalex.org/works")) as { value?: { results: unknown[] } };
    expect(outcome.value?.results).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("wraps a persistent network error as retryable and keeps the cause", async () => {
    vi.useFakeTimers();
    const cause = new TypeError("fetch failed");
    const request = vi.fn(async () => { throw cause; });
    vi.stubGlobal("fetch", request);
    const outcome = await run(fetchWithRetry("https://api.openalex.org/works")) as { error: OpenAlexRequestError };
    expect(outcome.error).toBeInstanceOf(OpenAlexRequestError);
    expect(outcome.error.retryable).toBe(true);
    expect(outcome.error.cause).toBe(cause);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("classifies errors for job runners", () => {
    expect(isNonRetryableOpenAlexError(new OpenAlexRequestError("x", { status: 400, retryable: false }))).toBe(true);
    expect(isNonRetryableOpenAlexError(new OpenAlexRequestError("x", { status: 503, retryable: true }))).toBe(false);
    expect(isNonRetryableOpenAlexError(new Error("OpenAlex 400: nope"))).toBe(false);
    expect(isNonRetryableOpenAlexError(undefined)).toBe(false);
    expect(isNonRetryableOpenAlexError("OpenAlex 400")).toBe(false);
  });
});
