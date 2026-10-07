// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "@/pages/home";
import { LiteraturePage } from "@/pages/literature";
import { homePaperKeywords } from "../utils/home-search";

const mocks = vi.hoisted(() => ({ semantic: vi.fn(), keyword: vi.fn(), authenticated: false }));
vi.mock("@/features/search/api/search.api", () => ({ searchApi: { semantic: mocks.semantic } }));
vi.mock("@/features/papers/api/papers.api", () => ({ papersApi: { list: mocks.keyword } }));
vi.mock("@/features/bookmarks/hooks/use-bookmarks", () => ({ useBookmarks: () => ({ data: [] }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ tokens: mocks.authenticated ? { accessToken: "test" } : null, user: mocks.authenticated ? { id: "user" } : null }) }));
vi.mock("@/features/home/hooks/use-home-overview", () => ({ useHomeOverview: () => ({ data: undefined, isLoading: false, isError: true }) }));
vi.mock("@/components/paper-card", () => ({ PaperCard: ({ id, title }: { id: string; title: string }) => <Link data-testid="paper-detail-link" to={"/papers/" + id}>{title}</Link> }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));

const medicine = { id: "medicine-paper", title: "Artificial intelligence in healthcare: transforming the practice of medicine" };
const response = (papers = [medicine], total = 5) => ({ papers, meta: { page: 1, pageSize: 10, total, totalPages: Math.ceil(total / 10), mode: "semantic" } });
let root: Root, container: HTMLDivElement, client: QueryClient;
function Location() { const location = useLocation(); const navigate = useNavigate(); return <><output data-location>{location.pathname}{location.search}{location.hash}</output><button data-back onClick={() => navigate(-1)}>Back</button></>; }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.authenticated = false; mocks.semantic.mockReset().mockResolvedValue(response()); mocks.keyword.mockReset().mockResolvedValue(response());
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });
async function settle(predicate: () => boolean) {
  for (let attempt = 0; attempt < 30 && !predicate(); attempt++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  expect(predicate()).toBe(true);
}
async function render(route = "/home?q=Medicine", resultsExpected = true) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/home" element={<HomePage />} /><Route path="/literature" element={<LiteraturePage />} /></Routes><Location /></MemoryRouter></QueryClientProvider>));
  await settle(() => Boolean(container.querySelector(resultsExpected ? "#home-search-results" : 'form[role="search"]')));
}
async function submit(query: string) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

describe("literature search navigation", () => {
  it("renders keywords from the API string shape and structured keyword shape without empty or duplicate keys", () => {
    expect(homePaperKeywords(["Medicine", { keywordName: "Health care" }, "Medicine", {}, { keywordName: "" }, null])).toEqual(["Medicine", "Health care"]);
  });
  it.each([false, true])("redirects an old Home query to the dedicated results page (authenticated=%s)", async (authenticated) => {
    mocks.authenticated = authenticated;
    await render(); await settle(() => Boolean(container.querySelector('a[href="/papers/medicine-paper"]')));
    expect(mocks.semantic).toHaveBeenCalledWith(expect.objectContaining({ q: "Medicine", page: 1, pageSize: 10 }), expect.any(AbortSignal));
    expect(mocks.keyword).not.toHaveBeenCalled();
    expect(container.querySelector("#home-search-results")?.textContent).toContain("5 papers found");
    expect(container.querySelector("[data-location]")?.textContent).toBe("/literature?q=Medicine");
    expect(container.querySelector("h1")?.textContent).toBe("Literature for “Medicine”");
    expect(container.querySelector("#home-workflow")).toBeNull();
    expect(container.querySelector(".home-hero, .research-home-entry")).toBeNull();
  });
  it.each([false, true])("submits from Home and renders a different page (authenticated=%s)", async (authenticated) => {
    mocks.authenticated = authenticated;
    await render("/home", false);
    expect(container.querySelector("#home-workflow")).not.toBeNull();
    expect(container.querySelector("#home-search-results")).toBeNull();
    expect(mocks.semantic).not.toHaveBeenCalled();
    expect(mocks.keyword).not.toHaveBeenCalled();
    await submit(" Medicine ");
    await settle(() => Boolean(container.querySelector('a[href="/papers/medicine-paper"]')));
    expect(container.querySelector("[data-location]")?.textContent).toBe("/literature?q=Medicine");
    expect(container.querySelector("#home-workflow")).toBeNull();
  });
  it.each(["/literature?q=Medicine", "/literature"])("loads the results route directly: %s", async (route) => {
    await render(route);
    await settle(() => Boolean(container.querySelector('a[href="/papers/medicine-paper"]')));
    expect(container.querySelector("[data-location]")?.textContent).toBe(route);
    expect(route.includes("q=") ? mocks.semantic : mocks.keyword).toHaveBeenCalled();
    expect(container.querySelector("#home-workflow")).toBeNull();
  });
  it("returns to Home with browser Back after a search", async () => {
    await render("/home", false);
    await submit("Medicine");
    await settle(() => Boolean(container.querySelector('a[href="/papers/medicine-paper"]')));
    await act(async () => container.querySelector<HTMLButtonElement>("[data-back]")!.click());
    await settle(() => Boolean(container.querySelector("#home-workflow")));
    expect(container.querySelector("[data-location]")?.textContent).toBe("/home");
    expect(container.querySelector("#home-search-results")).toBeNull();
  });
  it("restores URL controls and passes keyword filters to the papers API", async () => {
    await render("/home?q=Medicine&mode=keyword&provider=openalex&type=article&type=preprint&yearFrom=2023&yearTo=2023&openAccess=true&fieldIds=12#home-search-results");
    await settle(() => mocks.keyword.mock.calls.length > 0);
    expect(mocks.semantic).not.toHaveBeenCalled();
    expect(mocks.keyword).toHaveBeenCalledWith(expect.objectContaining({ q: "Medicine", provider: "openalex", paperKind: ["article", "preprint"], yearFrom: 2023, yearTo: 2023, openAccess: true, fieldIds: ["12"] }), expect.any(AbortSignal));
    expect(container.querySelector('button[aria-label="Search mode: Keyword"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Research source: OpenAlex"]')).not.toBeNull();
    expect(container.querySelector("[data-location]")?.textContent).toBe("/literature?q=Medicine&mode=keyword&provider=openalex&type=article&type=preprint&yearFrom=2023&yearTo=2023&openAccess=true&fieldIds=12#home-search-results");
    await submit("Economics"); await settle(() => mocks.keyword.mock.calls.some(([request]) => request.q === "Economics"));
    expect(mocks.keyword.mock.calls.at(-1)![0]).toMatchObject({ q: "Economics", yearFrom: 2023, yearTo: 2023, fieldIds: ["12"], paperKind: ["article", "preprint"] });
  });
  it("browses papers for a year link without sending an empty semantic query", async () => {
    await render("/home?yearFrom=2023&yearTo=2023"); await settle(() => mocks.keyword.mock.calls.length > 0);
    expect(mocks.semantic).not.toHaveBeenCalled();
    expect(mocks.keyword.mock.calls[0]![0]).toMatchObject({ q: "", yearFrom: 2023, yearTo: 2023 });
  });
  it("shows a request error and retries without losing the query", async () => {
    mocks.semantic.mockRejectedValue(new Error("Backend unavailable"));
    await render(); await settle(() => Boolean(container.querySelector('#home-search-results [role="alert"]')));
    expect(container.querySelector('#home-search-results [role="alert"]')?.textContent).toContain("Could not load search results");
    mocks.semantic.mockResolvedValue(response());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("#home-search-results button")).find((button) => button.textContent === "Retry")!.click());
    await settle(() => Boolean(container.querySelector('a[href="/papers/medicine-paper"]')));
    expect(mocks.semantic).toHaveBeenCalledTimes(2);
  });
  it("shows an empty state when the API returns no matching papers", async () => {
    mocks.semantic.mockResolvedValue(response([], 0));
    await render(); await settle(() => Boolean(container.querySelector('#home-search-results h3')));
    expect(container.querySelector('#home-search-results h3')?.textContent).toBe("No matching papers found.");
    expect(container.querySelector('#home-search-results a')?.getAttribute("href")).toContain("mode=keyword");
  });
  it("fetches the next page while preserving filters and resets pagination for a new query", async () => {
    mocks.keyword.mockImplementation(async (request) => ({ ...response([{ id: "page-" + request.page, title: "Paper on page " + request.page }], 23), meta: { page: request.page, pageSize: 10, total: 23, totalPages: 3 } }));
    await render("/home?q=Medicine&mode=keyword&provider=openalex&yearFrom=2023&yearTo=2023");
    await settle(() => Boolean(container.querySelector('a[href="/papers/page-1"]')));
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("#home-search-results button")).find((button) => button.textContent === "Next")!.click());
    await settle(() => Boolean(container.querySelector('a[href="/papers/page-2"]')));
    expect(mocks.keyword.mock.calls.at(-1)![0]).toMatchObject({ page: 2, provider: "openalex", yearFrom: 2023, yearTo: 2023 });
    await submit("Economics"); await settle(() => mocks.keyword.mock.calls.at(-1)?.[0].q === "Economics");
    expect(mocks.keyword.mock.calls.at(-1)![0]).toMatchObject({ page: 1 });
  });
  it("shows loading and cancels an old query when a new search starts", async () => {
    let finishFirst!: (value: ReturnType<typeof response>) => void;
    mocks.semantic.mockImplementation((request) => request.q === "Medicine" ? new Promise((resolve) => { finishFirst = resolve; }) : Promise.resolve(response([{ id: "economics", title: "Economic research" }])));
    await render();
    expect(container.querySelector('#home-search-results [role="status"]')).not.toBeNull();
    const signal = mocks.semantic.mock.calls[0]![1] as AbortSignal;
    await submit("Economics"); await settle(() => Boolean(container.querySelector('a[href="/papers/economics"]')));
    expect(signal.aborted).toBe(true);
    await act(async () => finishFirst(response()));
    expect(container.querySelector('a[href="/papers/medicine-paper"]')).toBeNull();
    expect(container.querySelector('a[href="/papers/economics"]')).not.toBeNull();
  });
  it("requires sign-in for a rerank URL and can continue with ordinary semantic search", async () => {
    await render("/home?q=Medicine&rerank=true");
    expect(mocks.semantic).not.toHaveBeenCalled();
    expect(container.querySelector('a[href^="/login?"]')?.getAttribute("href")).toBe("/login?returnTo=%2Fliterature%3Fq%3DMedicine%26rerank%3Dtrue");
    await act(async () => Array.from(container.querySelectorAll<HTMLAnchorElement>("#home-search-results a")).find((link) => link.textContent === "Search without AI reranking")!.click());
    await settle(() => Boolean(container.querySelector('a[href="/papers/medicine-paper"]')));
    expect(mocks.semantic.mock.calls[0]![0].rerank).toBeUndefined();
  });
});
