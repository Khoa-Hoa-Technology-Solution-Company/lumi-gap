// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SearchCoverageHint, TopicBackfillRun } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiteraturePage } from "@/pages/literature";
import { SearchCoverageNotice } from "../components/search-coverage-notice";

const mocks = vi.hoisted(() => ({ request: vi.fn(), getRun: vi.fn(), semantic: vi.fn(), authenticated: true }));
vi.mock("@/features/topic-backfill/api/topic-backfill.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/topic-backfill/api/topic-backfill.api")>()),
  topicBackfillApi: { request: mocks.request, getRun: mocks.getRun },
}));
vi.mock("@/features/search/api/search.api", () => ({ searchApi: { semantic: mocks.semantic } }));
vi.mock("@/features/papers/api/papers.api", () => ({ papersApi: { list: vi.fn() } }));
vi.mock("@/features/bookmarks/hooks/use-bookmarks", () => ({ useBookmarks: () => ({ data: [] }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ tokens: mocks.authenticated ? { accessToken: "test" } : null, user: mocks.authenticated ? { id: "user" } : null }) }));
vi.mock("@/components/paper-card", () => ({ PaperCard: ({ title }: { title: string }) => <p>{title}</p> }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));

const coverage = (overrides: Partial<SearchCoverageHint> = {}): SearchCoverageHint => ({
  targetKind: "topic", targetId: "topic-1", name: "Federated learning", localPapers: 3, openalexWorks: 12345,
  filter: { key: "topicIds", value: "T100" }, ...overrides,
});
const run = (overrides: Partial<TopicBackfillRun> = {}): TopicBackfillRun => ({
  id: "run-1", targetKind: "topic", targetId: "topic-1", targetName: "Federated learning", state: "queued", trigger: "search",
  maxNewPapers: 100, paperCountBefore: 3, fetchedCount: 0, insertedCount: 0, skippedCount: 0, rejectedCount: 0, pagesFetched: 0,
  errorMessage: null, startedAt: null, finishedAt: null, createdAt: "2026-10-30T00:00:00Z", ...overrides,
});
const apiError = (status: number, code?: string) => Object.assign(new Error("request failed"), { response: { status, data: { error: { code } } } });

let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  mocks.authenticated = true;
  mocks.request.mockReset();
  mocks.getRun.mockReset();
  mocks.semantic.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.useRealTimers();
});

const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
function notice(hint: SearchCoverageHint, authenticated = true) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SearchCoverageNotice coverage={hint} authenticated={authenticated} signInHref="/login?returnTo=%2Fliterature%3Fq%3Dfl" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
const show = (hint = coverage(), authenticated = true) => act(async () => root.render(notice(hint, authenticated)));
const button = (text: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent === text);
const click = async (element: Element | undefined) => { await act(async () => { (element as HTMLElement).click(); }); await tick(); };
const status = () => container.querySelector('[role="status"]')?.textContent ?? "";

describe("SearchCoverageNotice idle", () => {
  it("shows the local and OpenAlex counts with a fetch button, and requests the target on click", async () => {
    mocks.request.mockResolvedValue({ run: run(), created: true });
    mocks.getRun.mockResolvedValue(run({ state: "running" }));
    await show();
    expect(container.textContent).toContain("LumiGap has 3 papers on Federated learning.");
    expect(container.textContent).toContain("OpenAlex lists 12,345 works.");
    await click(button("Fetch more papers"));
    expect(mocks.request).toHaveBeenCalledWith({ targetKind: "topic", targetId: "topic-1" });
  });

  it("says there are no papers yet and leaves out the OpenAlex count when it is unknown", async () => {
    await show(coverage({ localPapers: 0, openalexWorks: null, targetKind: "keyword", targetId: "kw-1", name: "Quantum dots" }));
    expect(container.textContent).toContain("LumiGap has no papers on Quantum dots yet.");
    expect(container.textContent).not.toContain("OpenAlex lists");
    expect(button("Fetch more papers")).toBeDefined();
  });

  it("offers a sign-in link instead of the button to a guest", async () => {
    await show(coverage(), false);
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("Sign in to fetch more papers");
    expect(link?.getAttribute("href")).toBe("/login?returnTo=%2Fliterature%3Fq%3Dfl");
    expect(button("Fetch more papers")).toBeUndefined();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe("SearchCoverageNotice progress", () => {
  it("follows a queued run, shows live counts, stops polling when it completes and refreshes the results on demand", async () => {
    mocks.request.mockResolvedValue({ run: run(), created: true });
    mocks.getRun
      .mockResolvedValueOnce(run({ state: "running", insertedCount: 5, startedAt: "2026-10-30T00:00:01Z" }))
      .mockResolvedValue(run({ state: "completed", insertedCount: 12, finishedAt: "2026-10-30T00:00:09Z" }));
    await show();
    await click(button("Fetch more papers"));
    expect(status()).toContain("Fetching papers from OpenAlex…");
    expect(status()).not.toContain("new papers so far");
    expect(button("Fetch more papers")).toBeUndefined();
    expect(mocks.getRun).not.toHaveBeenCalled();

    await tick(3000);
    await tick(10);
    expect(mocks.getRun).toHaveBeenCalledTimes(1);
    expect(status()).toContain("5 new papers so far");

    await tick(3000);
    await tick(10);
    expect(mocks.getRun).toHaveBeenCalledTimes(2);
    expect(status()).toBe("Added 12 new papers.");

    await tick(30_000);
    expect(mocks.getRun).toHaveBeenCalledTimes(2);

    const view = [...container.querySelectorAll("a")].find((link) => link.textContent === "View these papers");
    expect(view?.getAttribute("href")).toBe("/literature?tag=topicIds%3AT100&tagLabel=Federated+learning");
  });

  it("attaches to a live run another request started", async () => {
    mocks.request.mockResolvedValue({ run: run({ state: "running", insertedCount: 2 }), created: false });
    mocks.getRun.mockResolvedValue(run({ state: "running", insertedCount: 2 }));
    await show();
    await click(button("Fetch more papers"));
    expect(status()).toContain("2 new papers so far");
  });

  it("reports a finished import without new papers and does not poll", async () => {
    mocks.request.mockResolvedValue({ run: run({ state: "completed", insertedCount: 0 }), created: true });
    await show();
    await click(button("Fetch more papers"));
    expect(status()).toBe("No new papers were found for this topic.");
    expect(container.textContent).not.toContain("View these papers");
    await tick(10_000);
    expect(mocks.getRun).not.toHaveBeenCalled();
  });

  it("explains a recent update when the request hit the cooldown", async () => {
    mocks.request.mockResolvedValue({ run: run({ state: "completed", insertedCount: 4 }), created: false });
    await show();
    await click(button("Fetch more papers"));
    expect(status()).toContain("This topic was updated recently.");
    expect(status()).toContain("Added 4 new papers.");
    expect(container.textContent).toContain("View these papers");
  });

  it("shows a failed run with a retry that requests again", async () => {
    mocks.request.mockResolvedValueOnce({ run: run({ state: "failed", errorMessage: null }), created: true });
    await show();
    await click(button("Fetch more papers"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not fetch papers. Please try again later.");
    mocks.request.mockResolvedValueOnce({ run: run({ id: "run-2", state: "completed", insertedCount: 1 }), created: true });
    await click(button("Retry"));
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(status()).toBe("Added 1 new papers.");
  });

  it("starts over when the target changes", async () => {
    mocks.request.mockResolvedValue({ run: run({ state: "completed", insertedCount: 7 }), created: true });
    await show();
    await click(button("Fetch more papers"));
    expect(status()).toBe("Added 7 new papers.");
    await show(coverage({ targetId: "topic-2", name: "Differential privacy" }));
    expect(container.textContent).toContain("LumiGap has 3 papers on Differential privacy.");
    expect(button("Fetch more papers")).toBeDefined();
    expect(container.textContent).not.toContain("Added 7");
  });
});

describe("SearchCoverageNotice errors", () => {
  it("explains the daily limit without a retry", async () => {
    mocks.request.mockRejectedValue(apiError(429, "TOPIC_BACKFILL_DAILY_LIMIT"));
    await show();
    await click(button("Fetch more papers"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("The daily limit for fetching papers has been reached. Please try again tomorrow.");
    expect(button("Retry")).toBeUndefined();
  });

  it("explains the hourly limiter, which carries no TOPIC_BACKFILL code", async () => {
    mocks.request.mockRejectedValue(apiError(429, "TOO_MANY_REQUESTS"));
    await show();
    await click(button("Fetch more papers"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Too many fetch requests. Please wait a while and try again.");
    expect(button("Retry")).toBeUndefined();
  });

  it("shows a generic failure with a retry for other errors", async () => {
    mocks.request.mockRejectedValue(apiError(500, "INTERNAL"));
    await show();
    await click(button("Fetch more papers"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not fetch papers. Please try again later.");
    expect(button("Retry")).toBeDefined();
  });

  it.each([[409, "TOPIC_NOT_THIN"], [403, "TOPIC_BACKFILL_DISABLED"]])("renders nothing after %i %s", async (statusCode, code) => {
    mocks.request.mockRejectedValue(apiError(statusCode, code));
    await show();
    await click(button("Fetch more papers"));
    expect(container.innerHTML).toBe("");
  });
});

describe("coverage notice in the search results", () => {
  const response = (mode: string, withCoverage = true) => ({
    papers: [{ id: "p1", title: "A paper", topics: [], authors: [], publicationYear: 2025, citationCount: 1, primaryProvider: "openalex" }],
    meta: { page: 1, pageSize: 10, total: 1, totalPages: 1, mode, understanding: { mode: "none", detectedTags: [], appliedTag: null, fellBack: false, ...(withCoverage ? { coverage: coverage() } : {}) } },
  });
  async function renderResults(route: string) {
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes><Route path="/literature" element={<LiteraturePage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ));
    await tick(50);
  }

  it("appears after the understanding bar in semantic mode when the response has coverage", async () => {
    mocks.semantic.mockResolvedValue(response("semantic"));
    await renderResults("/literature?q=federated");
    expect(container.querySelector('[data-testid="search-coverage"]')?.textContent).toContain("LumiGap has 3 papers on Federated learning.");
  });

  it("is absent when the response has no coverage", async () => {
    mocks.semantic.mockResolvedValue(response("semantic", false));
    await renderResults("/literature?q=federated");
    expect(container.querySelector('[data-testid="search-coverage"]')).toBeNull();
  });

  it("offers a guest the sign-in link that returns to the current search", async () => {
    mocks.authenticated = false;
    mocks.semantic.mockResolvedValue(response("semantic"));
    await renderResults("/literature?q=federated&mode=semantic");
    const link = container.querySelector('[data-testid="search-coverage"] a');
    expect(link?.getAttribute("href")).toBe("/login?returnTo=" + encodeURIComponent("/literature?q=federated&mode=semantic"));
  });
});
