// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicTrendStatistics, TrendClassification, TrendDiscoverItem, TrendSnapshotProvenance, TrendsDiscoverResponse } from "@trend/shared-types";
import { TooltipProvider } from "@/components/ui/tooltip";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
vi.mock("@/i18n", () => ({
  useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")) }),
}));
const discover = vi.hoisted(() => vi.fn());
vi.mock("../api/trends.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/trends.api")>();
  return { ...actual, trendsApi: { ...actual.trendsApi, discover } };
});

import { DiscoverTab } from "../components/discover-tab";
import { TrendEvidencePanel } from "../components/trend-evidence-panel";
import { TrendVerdictBadge } from "../components/trend-verdict-badge";
import { HomeDiscoverTrends } from "@/features/home/components/home-discover-trends";

let root: Root | undefined;
let container: HTMLDivElement;
async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root!.render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TooltipProvider>{node}</TooltipProvider></MemoryRouter></QueryClientProvider>));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return container;
}
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); }); };
/** The query keeps the previous page on screen until the next one arrives (keepPreviousData). */
const waitForText = async (el: Element, text: string) => {
  for (let i = 0; i < 20 && !el.textContent?.includes(text); i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });
beforeEach(() => discover.mockReset());

const provenance: TrendSnapshotProvenance = {
  source: "openalex", snapshotId: "2ad0ad73", snapshotStatus: "active", scopeFilter: "type:article|review", workTypes: ["article", "review"], corpus: "core",
  baselineLevel: "field", yearFrom: 2016, yearTo: 2025, lastCompleteYear: 2025, firstFetchedAt: "2026-10-23T05:08:14.442Z", lastFetchedAt: "2026-10-23T05:12:26.801Z",
  activatedAt: "2026-10-23T05:12:37.586Z", collectionVersion: "p2.1-collect-v1", analyticsVersion: "p2.1-analytics-v1", historicalCountsMayChange: true,
};
const item = (over: Partial<TrendDiscoverItem> = {}): TrendDiscoverItem => ({
  rank: 1, topicId: "T10036", topicName: "Advanced Neural Network Applications",
  taxonomy: { domainId: "3", domainName: "Physical Sciences", fieldId: "17", fieldName: "Computer Science", subfieldId: "1702", subfieldName: "Artificial Intelligence" },
  baselineUnit: { level: "field", id: "17", name: "Computer Science" }, totalPapers: 138000, yearsUsed: 10,
  shareSeries: [], verdict: "rising", confidence: "high", assessability: "assessable",
  mannKendall: { s: 45, z: 4.0, tau: 1, pValue: 0.0000003, pValueMethod: "exact" }, qValue: 0.0000081, qFamilyKey: "field:17", qFamilySize: 726,
  senSlopePctPoints: 0.6, senSlopeCi95: [0.4, 0.8], relativeChangePct: 18.2,
  ggt: { meanPct: 24.5, semPct: 6.8, years: 9, conditionsMet: true, nelisThresholdGroup: "consistent_strong_growth", stabilityChecked: false },
  provenance, ...over,
});
const response = (over: Partial<TrendsDiscoverResponse> = {}): TrendsDiscoverResponse => ({
  status: "available", collection: "trending", baselineLevel: "field", provenance, rankingRule: "rule", page: 1, pageSize: 10, total: 1, items: [item()],
  excluded: { insufficientData: 22, notAssessable: 0 }, ...over,
});

describe("Discover trends tab (P2.2)", () => {
  it("10. shows the baseline, the year window, the collection time and the revision notice", async () => {
    discover.mockResolvedValue(response());
    const el = await render(<DiscoverTab />);
    const note = el.querySelector('[data-testid="discover-provenance"]')!.textContent!;
    expect(note).toContain("Data: OpenAlex snapshot · article, review · 2016–2025 · Reference population: Field");
    expect(note).toContain("2026");
    expect(el.textContent).toContain("OpenAlex revises historical counts");
    expect(discover).toHaveBeenCalledWith(expect.objectContaining({ collection: "trending", baseline: "field", page: 1 }));
  });

  it("13. links each topic to its detail page with its OpenAlex topic id", async () => {
    discover.mockResolvedValue(response());
    const el = await render(<DiscoverTab />);
    const link = el.querySelector('a[data-topic-id="T10036"]')!;
    expect(link.getAttribute("href")).toBe("/trends/Advanced%20Neural%20Network%20Applications?topicId=T10036");
  });

  it("shows the stored q with its BH family and never a recomputed value; the page changes only the request", async () => {
    discover.mockResolvedValueOnce(response({ total: 25 }));
    const el = await render(<DiscoverTab />);
    expect(el.textContent).toContain("q = < 0.001 (Benjamini–Hochberg across 726 topics)");
    discover.mockResolvedValueOnce(response({ total: 25, page: 2, items: [item({ rank: 11 })] }));
    await click([...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Next"))!);
    expect(discover).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 10 }));
    await waitForText(el, "#11");
    expect(el.textContent).toContain("#11");
  });

  it("11. Fastest growing shows mean GGT ± SEM as descriptive and never a 'consistent growth' label", async () => {
    discover.mockResolvedValue(response({ collection: "fastest_growing", items: [item()] }));
    const el = await render(<DiscoverTab />);
    await click([...el.querySelectorAll("button")].find((b) => b.textContent === "Fastest growing")!);
    expect(el.querySelector('[data-testid="discover-ggt"]')!.textContent).toBe("Mean GGT +24.5% ± 6.8% over 9 years(descriptive; stability not verified)");
    expect(el.textContent).not.toMatch(/consistent/i);
  });

  it("Trending by field groups topics under their OpenAlex field and forces the field baseline", async () => {
    discover.mockResolvedValue(response({ collection: "by_field", total: 1, items: [], fields: [{ fieldId: "17", fieldName: "Computer Science", topicsInField: 726, qFamilySize: 726, risingTopics: 120, topics: [item()] }] }));
    const el = await render(<DiscoverTab />);
    await click([...el.querySelectorAll("button")].find((b) => b.textContent === "Trending by field")!);
    expect(discover).toHaveBeenLastCalledWith(expect.objectContaining({ collection: "by_field", baseline: "field" }));
    expect(el.textContent).toContain("Computer Science");
    expect(el.textContent).toContain("726 topics · 120 rising · BH family of 726");
    expect((el.querySelector("select") as HTMLSelectElement).disabled).toBe(true);
  });

  it("8. without a snapshot it says so and shows no topic, no local numbers", async () => {
    discover.mockResolvedValue(response({ status: "unavailable", unavailableReason: "NO_ACTIVE_SNAPSHOT", provenance: null, items: [], total: 0 }));
    const el = await render(<DiscoverTab />);
    expect(el.querySelector('[data-testid="discover-unavailable"]')!.textContent).toContain("No validated OpenAlex snapshot is active.");
    expect(el.textContent).toContain("library counts are not research trends");
    expect(el.querySelector("a[data-topic-id]")).toBeNull();
  });

  it("states how many topics were not assessable or had too little data", async () => {
    discover.mockResolvedValue(response({ excluded: { insufficientData: 22, notAssessable: 30 } }));
    const el = await render(<DiscoverTab />);
    expect(el.querySelector('[data-testid="discover-excluded"]')!.textContent).toContain("Not ranked: 30 topics whose trend is not assessable");
  });
});

describe("not assessable trends are never shown as stable (P2.2 §4.2)", () => {
  const stableNoTest: TrendClassification = { verdict: "stable", confidence: null, yearsUsed: 10, totalPapers: 50_000, mannKendall: null, qValue: null, qFamilySize: null, senSlope: 0, senSlopeCi95: null, relativeChangePct: 0, reasons: ["NO_SIGNIFICANT_TREND"] };

  it("12. the verdict badge says 'Not assessable', not 'Stable', when no test ran", async () => {
    const el = await render(<TrendVerdictBadge classification={stableNoTest} />);
    expect(el.textContent).toBe("Not assessable");
    expect(el.querySelector("[data-verdict]")!.getAttribute("data-verdict")).toBe("not_assessable");
  });

  it("a tested stable verdict is still shown as Stable", async () => {
    const el = await render(<TrendVerdictBadge classification={{ ...stableNoTest, mannKendall: { s: 3, z: 0.4, tau: 0.07, pValue: 0.6, pValueMethod: "exact" } }} />);
    expect(el.textContent).toBe("Stable");
  });

  it("12. the evidence panel explains a sole member of its reference population", async () => {
    const shareSeries = [2016, 2017, 2018, 2019, 2020].map((year) => ({ year, count: 5000 + year, total: 5000 + year, sharePct: 100, corpus: "core" as const }));
    const statistics: TopicTrendStatistics = { source: "openalex", significanceLevel: 0.05, totalPapers: 25_000, yearsUsed: [2016, 2020], baseline: { level: "subfield", id: "2741", label: "Radiology" }, shareSeries, mannKendall: null, senSlopePctPoints: 0, classification: stableNoTest, impact: [], termShift: null };
    const el = await render(<TrendEvidencePanel statistics={statistics} />);
    expect(el.textContent).toContain("Trend not assessable against this baseline");
    expect(el.textContent).toContain("The topic is the whole reference population");
    expect(el.textContent).not.toContain("No clear change in its share of the field.");
  });
});

describe("homepage teaser (P2.2)", () => {
  it("shows the top rising topics with provenance when a snapshot is active", async () => {
    discover.mockResolvedValue(response({ items: [item(), item({ rank: 2, topicId: "T10001", topicName: "Second" })] }));
    const el = await render(<HomeDiscoverTrends />);
    expect(el.textContent).toContain("Rising in research (OpenAlex)");
    expect(el.querySelectorAll("li")).toHaveLength(2);
    expect(el.textContent).toContain("2016–2025");
    expect(el.textContent).toContain("historical counts may be revised");
    expect(discover).toHaveBeenCalledWith({ collection: "trending", baseline: "field", pageSize: 3 });
  });

  it("renders nothing without a snapshot (no local counts presented as trends)", async () => {
    discover.mockResolvedValue(response({ status: "unavailable", unavailableReason: "NO_ACTIVE_SNAPSHOT", provenance: null, items: [] }));
    const el = await render(<HomeDiscoverTrends />);
    expect(el.textContent).toBe("");
  });
});
