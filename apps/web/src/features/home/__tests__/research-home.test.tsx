// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeOverview } from "@trend/shared-types";
import { ResearchEntry } from "@/pages/home";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mocks = vi.hoisted(() => ({ query: { data: undefined as HomeOverview | undefined, isLoading: false, isError: false, refetch: vi.fn() } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ tokens: { accessToken: "local-test" } }) }));
vi.mock("@/features/home/hooks/use-home-overview", () => ({ useHomeOverview: () => mocks.query }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }) }));

let root: Root | undefined;
let container: HTMLDivElement;
function Location() { const location = useLocation(); return <output data-location>{location.pathname}{location.search}</output>; }
async function render() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<MemoryRouter initialEntries={["/home"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ResearchEntry /><Location /></MemoryRouter>));
}
async function fillQuery(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
async function chooseMenu(triggerLabel: string, itemLabel: string) {
  const trigger = container.querySelector<HTMLButtonElement>(`button[aria-label="${triggerLabel}"]`)!;
  await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find((element) => element.textContent === itemLabel)!;
  expect(item).toBeDefined();
  await act(async () => item.click());
}
const overview: HomeOverview = {
  mode: "user", generatedAt: "2026-10-02T00:00:00Z",
  summary: { totalPapers: 12, totalSearches: 4, uniqueUsers: 2 }, recentPapers: [],
  trends: { yearFrom: 2025, yearTo: 2026, lastCompleteYear: 2025, totalPapersInWindow: 12, yearlyTotalPapers: [{ year: 2025, count: 7 }, { year: 2026, count: 5 }], citationTrend: [{ year: 2025, count: 7, totalCitations: 20, avgCitations: 20 / 7 }, { year: 2026, count: 5, totalCitations: 10, avgCitations: 2 }], topics: [], risingKeywords: [], computedAt: "2026-10-02T00:00:00Z" },
};
beforeEach(() => { mocks.query.data = overview; mocks.query.isLoading = false; mocks.query.isError = false; });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); vi.clearAllMocks(); });

describe("Focused research home", () => {
  it("submits a trimmed question with encoded reserved characters and preserves research routes", async () => {
    await render();
    await fillQuery(" LLM evaluation & evidence? ");
    await submit();
    expect(container.querySelector("[data-location]")?.textContent).toBe("/literature?q=LLM%20evaluation%20%26%20evidence%3F");
    for (const route of ["/home#home-research-heading", "/trends", "/reports"]) {
      expect(container.querySelector(`a[href="${route}"]`)).not.toBeNull();
    }
    expect(container.querySelector('nav[aria-label="Research shortcuts"]')).toBeNull();
    expect(container.querySelector('a[href="/settings/submit-paper"]')).toBeNull();
  });
  it("keeps source, keyword mode and publication filters in the literature search URL", async () => {
    await render();
    await fillQuery(" evaluation & models ");
    await chooseMenu("Research source: All sources", "OpenAlex");
    await chooseMenu("Search mode: Semantic", "Keyword");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Filters"]')!.click());
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "Last 2 years"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await submit();
    const year = new Date().getFullYear();
    expect(container.querySelector("[data-location]")?.textContent).toBe(`/literature?q=evaluation%20%26%20models&mode=keyword&provider=openalex&yearFrom=${year - 1}&yearTo=${year}&openAccess=true`);
  });
  it("retains filters when collapsed and resets them before browsing", async () => {
    await render();
    const filterButton = container.querySelector<HTMLButtonElement>('button[aria-label="Filters"]')!;
    await act(async () => filterButton.click());
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(filterButton.getAttribute("aria-label")).toBe("Filters, 1 active");
    await act(async () => filterButton.click());
    expect(container.querySelector("fieldset")).toBeNull();
    await act(async () => filterButton.click());
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    await act(async () => container.querySelector<HTMLButtonElement>(".research-composer-reset")!.click());
    await submit();
    expect(container.querySelector("[data-location]")?.textContent).toBe("/literature");
  });
  it("submits from the compact input without interrupting text composition", async () => {
    await render();
    await fillQuery("Climate adaptation");
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })));
    expect(container.querySelector("[data-location]")?.textContent).toBe("/home");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(container.querySelector("[data-location]")?.textContent).toBe("/literature?q=Climate%20adaptation");
  });
  it("puts a suggested topic in the composer and focuses it", async () => {
    await render();
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Deep Learning")!.click());
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("Deep Learning");
    expect(document.activeElement).toBe(container.querySelector('input[type="search"]'));
  });
  it("keeps search available when library data fails and replaces the personal greeting with useful discovery content", async () => {
    mocks.query.data = undefined; mocks.query.isError = true;
    await render();
    expect(container.querySelector("h1")?.textContent).toBe("What are you researching today?");
    expect(container.querySelector('form[role="search"] input[type="search"]')).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("h2")).toHaveLength(5);
    expect(container.textContent).not.toMatch(/Welcome back|Test Researcher|Continue your research|Needs your attention|Recommended for you|From your research communities|Start your first research workflow/);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("The library is taking a moment.");
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Retry")!.click());
    expect(mocks.query.refetch).toHaveBeenCalledOnce();
  });
  it("passes selected paper types and opt-in AI reranking, and clears reranking in keyword mode", async () => {
    await render();
    await fillQuery("deep learning");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Paper type"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    for (const label of ["Journal Article", "Preprint"]) {
      const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')).find((element) => element.textContent === label)!;
      await act(async () => item.click());
    }
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Paper type, 2 selected"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    const rerankButton = container.querySelector<HTMLButtonElement>('.research-composer-rerank')!;
    expect(rerankButton.getAttribute("aria-pressed")).toBe("false");
    await act(async () => rerankButton.click());
    await submit();
    expect(container.querySelector("[data-location]")?.textContent).toBe("/literature?q=deep%20learning&type=article&type=preprint&rerank=true");
    await chooseMenu("Search mode: Semantic", "Keyword");
    const keywordRerankButton = container.querySelector<HTMLButtonElement>(".research-composer-rerank")!;
    expect(keywordRerankButton.disabled).toBe(true);
    expect(keywordRerankButton.getAttribute("aria-pressed")).toBe("false");
    await submit();
    expect(container.querySelector("[data-location]")?.textContent).toBe("/literature?q=deep%20learning&mode=keyword&type=article&type=preprint");
  });
  it("lets researchers explore workflow stages with the keyboard and open the matching tools", async () => {
    await render();
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement).toBe(tabs[1]);
    expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent).toContain("Record screening decisions");
    await act(async () => tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent).toContain("Inspect supporting papers");
    expect(container.querySelector('[role="tabpanel"]:not([hidden]) a')?.getAttribute("href")).toBe("/research-gaps");
    for (const route of ["/trends", "/papers/review", "/papers/format-check", "/reports", "/communities", "/forum"]) {
      expect(container.querySelector(`a[href="${route}"]`)).not.toBeNull();
    }
  });
  it("uses library data for both chart metrics and opens the selected publication year", async () => {
    await render();
    expect(container.querySelector(".home-chart-selection")?.textContent).toBe("5papers published in 2026");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="2025: 7 papers"]')!.click());
    expect(container.querySelector(".home-chart-selection")?.textContent).toBe("7papers published in 2025");
    expect(container.querySelector('.home-chart-footer a')?.getAttribute("href")).toBe("/literature?yearFrom=2025&yearTo=2025");
    await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Citations")!.click());
    expect(container.querySelector(".home-chart-selection")?.textContent).toBe("20citations to papers published in 2025");
  });
  it("changes the reading prompt and keeps the example clearly labelled", async () => {
    await render();
    const controls = container.querySelectorAll<HTMLButtonElement>(".home-lens-controls button");
    await act(async () => controls[2]!.click());
    expect(controls[2]!.getAttribute("aria-pressed")).toBe("true");
    expect(controls[0]!.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector(".home-note-annotation")?.textContent).toContain("A direction to validate");
    expect(container.querySelector(".home-note-prompts .is-focused")?.textContent).toContain("different real-world context");
    expect(container.querySelector(".home-reading-example-note")?.textContent).toContain("not a summary of a published paper");
    for (const anchor of container.querySelectorAll<HTMLAnchorElement>('.home-explore-nav a[href^="#"]')) {
      expect(container.querySelector(anchor.hash)).not.toBeNull();
    }
  });
});
