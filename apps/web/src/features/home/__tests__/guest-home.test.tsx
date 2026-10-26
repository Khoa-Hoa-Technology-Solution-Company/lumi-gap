// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeOverview } from "@trend/shared-types";
import { GuestHomePage } from "@/pages/home-guest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mocks = vi.hoisted(() => ({ query: { data: undefined as HomeOverview | undefined, isLoading: false, isError: false, refetch: vi.fn() } }));
vi.mock("@/features/home/hooks/use-home-overview", () => ({ useHomeOverview: () => mocks.query }));
vi.mock("@/features/home/hooks/use-home-featured-papers", () => ({ useHomeFeaturedPapers: () => ({ ...mocks.query, data: mocks.query.data ? { papers: mocks.query.data.recentPapers } : undefined }) }));
// Discover Trends teaser (P2.2): no active snapshot here, so it renders nothing (its own tests: trend-discover-ui.test.tsx).
vi.mock("@/features/trends", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/trends")>()), useTrendsDiscover: () => ({ data: { status: "unavailable", unavailableReason: "NO_ACTIVE_SNAPSHOT", items: [] }, isLoading: false, isError: false }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));

const overview: HomeOverview = {
  mode: "guest", generatedAt: "2026-10-02T00:00:00Z",
  summary: { totalPapers: 12, totalSearches: 4, uniqueUsers: 2 },
  trends: { yearFrom: 2025, yearTo: 2026, lastCompleteYear: 2025, totalPapersInWindow: 12, yearlyTotalPapers: [{ year: 2025, count: 7 }, { year: 2026, count: 5 }], citationTrend: [], topics: [], risingKeywords: [], computedAt: "2026-10-02T00:00:00Z" },
  recentPapers: [{ id: "paper-1", externalIds: {}, title: "Retrieval quality across languages", authors: [{ displayName: "Linh Nguyen", position: 1, isCorresponding: true }], publicationYear: 2026, citationCount: 12, keywords: [], topics: [], primaryProvider: "openalex", dataStatus: "active", dataQualityScore: 1, isAiAnalyzable: true, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" }],
};
let root: Root | undefined;
let container: HTMLDivElement;
function Location() { const location = useLocation(); return <output data-location>{location.pathname}{location.search}</output>; }
async function render() {
  if (!root) { container = document.createElement("div"); document.body.append(container); root = createRoot(container); }
  await act(async () => root!.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><GuestHomePage /><Location /></MemoryRouter>));
}
beforeEach(() => { mocks.query.data = overview; mocks.query.isLoading = false; mocks.query.isError = false; });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); vi.clearAllMocks(); });

describe("Guest research home", () => {
  it("keeps the search usable while the overview loads or fails", async () => {
    mocks.query.data = undefined; mocks.query.isLoading = true;
    await render();
    expect(container.querySelector("h1")?.textContent).toContain("Good questions.");
    expect(container.querySelector('form[role="search"] input')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    mocks.query.isLoading = false; mocks.query.isError = true;
    await render();
    expect(container.querySelector('form[role="search"] input')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("The library is taking a moment.");
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Retry")!.click());
    expect(mocks.query.refetch).toHaveBeenCalledOnce();
  });
  it("preserves the question and selected keyword mode in the search URL", async () => {
    await render();
    const input = container.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, " evidence & models ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Search mode: Semantic"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(async () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find((item) => item.textContent === "Keyword")!.click());
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector("[data-location]")?.textContent).toBe("/literature?q=evidence%20%26%20models&mode=keyword");
  });
  it("puts a suggested question into the search field and focuses it", async () => {
    await render();
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Carbon Nanotubes")!.click());
    const input = container.querySelector("input")!;
    expect(input.value).toBe("Carbon Nanotubes");
    expect(document.activeElement).toBe(input);
  });
  it("keeps the new controls available while reserving AI reranking for signed-in researchers", async () => {
    await render();
    expect(container.querySelector('.research-composer-rerank')?.hasAttribute("disabled")).toBe(true);
    expect(container.querySelector('.research-composer-rerank')?.getAttribute("title")).toBe("Sign in to use AI reranking.");
    expect(container.querySelector('button[aria-label="Paper type"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Research source: All sources"]')).not.toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
  });
  it("links featured literature to the real paper without the old introduction", async () => {
    await render();
    expect(container.querySelector('.home-featured-paper')?.getAttribute('href')).toBe('/papers/paper-1');
    expect(container.querySelector('.home-featured-paper')?.textContent).toContain('Retrieval quality across languages');
    expect(container.querySelector('.home-featured-paper')?.textContent).toContain('12 citations');
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('img:not(.home-scholar-portrait)')).toBeNull();
    expect(container.querySelectorAll('.home-scholar-portrait')).toHaveLength(8);
  });
  it("shows an actionable empty chart without inventing publications", async () => {
    mocks.query.data = { ...overview, trends: { ...overview.trends, yearlyTotalPapers: [] } };
    await render();
    expect(container.querySelector('.home-library-insights')?.textContent).toContain("Publication trends will appear as the library grows.");
    expect(container.querySelectorAll('.home-chart-bars button')).toHaveLength(0);
    expect(container.querySelector('a[href="#home-research-heading"]')).not.toBeNull();
  });
});
