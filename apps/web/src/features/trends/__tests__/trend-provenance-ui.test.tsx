// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TopicTrendStatistics, TrendClassification } from "@trend/shared-types";
import { TrendFigures } from "../components/trend-verdict-badge";
import { TrendEvidencePanel } from "../components/trend-evidence-panel";
import { DataSourceBadge } from "../components/trend-data-source";
import { TooltipProvider } from "@/components/ui/tooltip";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs one to mount.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
// English UI with {{placeholders}} filled, so the rendered sentence is checked as the user reads it.
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values?: Record<string, unknown>) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? "")),
  }),
}));

let root: Root | undefined;
let container: HTMLDivElement;

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><TooltipProvider>{node}</TooltipProvider></MemoryRouter>));
  return container.textContent ?? "";
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
});

const base: TrendClassification = {
  verdict: "rising",
  confidence: "medium",
  yearsUsed: 10,
  totalPapers: 1200,
  mannKendall: { s: 31, z: 2.7, tau: 0.69, pValue: 0.0067, pValueMethod: "exact" },
  qValue: null,
  qFamilySize: null,
  senSlope: 0.12,
  senSlopeCi95: [0.05, 0.2],
  relativeChangePct: 8.4,
  reasons: ["SIGNIFICANT_INCREASE"],
};

describe("which probability a verdict used (P0.2)", () => {
  it("shows a list verdict as a BH q-value with the size of its family", async () => {
    const text = await render(<TrendFigures classification={{ ...base, qValue: 0.0123, qFamilySize: 37 }} source="openalex" />);
    expect(text).toContain("q = 0.012 (Benjamini–Hochberg across 37 topics)");
    expect(text).not.toContain("not adjusted");
  });

  it("shows a single-topic verdict as an unadjusted p-value", async () => {
    const text = await render(<TrendFigures classification={base} source="openalex" />);
    expect(text).toContain("p = 0.007 (one topic, not adjusted for multiple tests)");
    expect(text).not.toContain("Benjamini–Hochberg");
  });

  it("prints very small probabilities as a bound, not as 0.000", async () => {
    const text = await render(<TrendFigures classification={{ ...base, qValue: 0.00004, qFamilySize: 12 }} source="openalex" />);
    expect(text).toContain("q < 0.001 (Benjamini–Hochberg across 12 topics)");
  });

  it("labels the p-value row of the topic statistics as one topic, not adjusted", async () => {
    const statistics: TopicTrendStatistics = {
      source: "openalex",
      significanceLevel: 0.05,
      totalPapers: 1200,
      yearsUsed: [2016, 2025],
      baseline: { level: "field", label: "Computer Science" },
      shareSeries: [
        { year: 2016, count: 100, total: 10_000, sharePct: 1 },
        { year: 2025, count: 140, total: 10_000, sharePct: 1.4 },
      ],
      mannKendall: { n: 10, s: 31, variance: 125, z: 2.7, pValue: 0.0067, pValueMethod: "exact", tau: 0.69 },
      senSlopePctPoints: 0.12,
      classification: base,
      impact: [],
      termShift: null,
    };
    const text = await render(<TrendEvidencePanel statistics={statistics} />);
    expect(text).toContain("p-value (one topic, not adjusted)");
    expect(text).toContain("0.007");
  });
});

describe("DataSourceBadge with provenance (P0.6)", () => {
  it("shows when the OpenAlex counts were fetched, from fetchedAt", async () => {
    const fetchedAt = "2026-10-21T08:15:00.000Z";
    const expected = new Date(fetchedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const text = await render(<DataSourceBadge source="openalex" provenance={{ source: "openalex", fetchedAt, cacheVersion: "v3", corpus: "core" }} />);
    expect(text).toContain("Data: OpenAlex (whole database)");
    expect(text).toContain(`OpenAlex data fetched ${expected}`);
    expect(text).toContain("2026");
  });

  it("shows no fetch time for local data or when fetchedAt is missing or invalid", async () => {
    expect(await render(<DataSourceBadge source="local" provenance={{ source: "local", fetchedAt: null, cacheVersion: null, corpus: null }} />)).not.toContain("fetched");
    await act(async () => root!.unmount()); root = undefined; container.remove();
    expect(await render(<DataSourceBadge source="openalex" />)).not.toContain("fetched");
    await act(async () => root!.unmount()); root = undefined; container.remove();
    expect(await render(<DataSourceBadge source="openalex" provenance={{ source: "openalex", fetchedAt: "not a date", cacheVersion: "v3", corpus: "core" }} />)).not.toContain("fetched");
  });
});

describe("reference population and GGT in the evidence panel (P1.1, P1.3)", () => {
  const statistics = (over: Partial<TopicTrendStatistics> = {}): TopicTrendStatistics => ({
    source: "openalex",
    significanceLevel: 0.05,
    totalPapers: 330,
    yearsUsed: [2020, 2021, 2022],
    baseline: { level: "field", id: "17", label: "Computer Science" },
    shareSeries: [
      { year: 2020, count: 100, total: 10_000, sharePct: 1 },
      { year: 2021, count: 110, total: 10_000, sharePct: 1.1 },
      { year: 2022, count: 120, total: 10_000, sharePct: 1.2 },
    ],
    mannKendall: null,
    senSlopePctPoints: null,
    classification: { ...base, verdict: "insufficient", confidence: null, reasons: [] },
    impact: [],
    termShift: null,
    ...over,
  });
  const ggt = {
    annual: [
      { year: 2020, ggtPct: null, unitGrowthPct: null, baselineGrowthPct: null, nullReason: "MISSING_PREVIOUS_YEAR" as const },
      { year: 2021, ggtPct: 10, unitGrowthPct: 10, baselineGrowthPct: 0, nullReason: null },
      { year: 2022, ggtPct: 9.0909, unitGrowthPct: 9.0909, baselineGrowthPct: 0, nullReason: null },
    ],
    n: 2, meanPct: 9.545, sdPct: 0.643, semPct: 0.455,
    conditions: { allAnnualBelow100Pct: true, minUnitPapersPerYear: 100, atLeast50PapersEveryYear: true },
    yearToYearChanges: [{ year: 2022, deltaPctPoints: -0.909 }],
    nelisClass: "consistent_growth" as const,
    stabilityChecked: false as const,
  };

  it("names the population at every level, the fallback and the unclassified share", async () => {
    expect(await render(<TrendEvidencePanel statistics={statistics({ baseline: { level: "domain", id: "3", label: "Physical Sciences" } })} />)).toContain("Domain: Physical Sciences");
    await act(async () => root!.unmount()); root = undefined; container.remove();
    const text = await render(<TrendEvidencePanel statistics={statistics({ baseline: { level: "global", fallbackFrom: "subfield", label: "All works with a primary topic", unclassifiedSharePct: 2 } })} />);
    expect(text).toContain("This topic has no subfield, so all works with a primary topic are used.");
    expect(text).toContain("Works without a primary topic (outside the population)2.0%");
  });

  it("shows mean GGT ± SEM, the class and the annual values as descriptive information", async () => {
    const text = await render(<TrendEvidencePanel statistics={statistics({ ggt })} />);
    expect(text).toContain("General Growth Tendency (GGT)");
    expect(text).toContain("Mean GGT ± SEM (2 years)+9.5% ± 0.5%");
    // P2.2: the threshold band by its bounds, never the paper's "Consistent growth" while stability is unchecked.
    expect(text).toContain("Mean GGT between 5% and 15%");
    expect(text).toContain("Nelis threshold band (stability not verified)");
    expect(text).not.toMatch(/consistent/i);
    expect(text).toContain("2021: +10.0% · 2022: +9.1%");
    expect(text).toContain("Descriptive: it does not change the verdict.");
    expect(text).toContain("not applied");
  });

  it("explains why no class is given", async () => {
    const text = await render(<TrendEvidencePanel statistics={statistics({ ggt: { ...ggt, nelisClass: null, conditions: { ...ggt.conditions, minUnitPapersPerYear: 40, atLeast50PapersEveryYear: false } } })} />);
    expect(text).toContain("Not given: a year has fewer than 50 papers");
  });

  it("renders without GGT (responses saved before P1)", async () => {
    expect(await render(<TrendEvidencePanel statistics={statistics()} />)).not.toContain("General Growth Tendency");
  });
});
