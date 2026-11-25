import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { EmergingPanel, type EmergingPanelProps } from "../components/emerging-tab";
import { makeEmerging } from "./emerging.fixture";

// English keys are the English text, so the real provider (which waits for its dictionary) is not needed.
vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(values?.[name] ?? "")) }),
}));

function render(props: EmergingPanelProps): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <EmergingPanel {...props} />
    </MemoryRouter>,
  );
}

describe("EmergingPanel", () => {
  it("always says it is an early signal, not a forecast, and separate from the verdicts", () => {
    const html = render({ data: makeEmerging() });
    expect(html).toContain("Early signal, not a forecast");
    expect(html).toContain("separate from the six topic verdicts");
  });

  it("lists the signals with counts, novelty, log odds ratio, z, q, a search link and a bar per year", () => {
    const html = render({ data: makeEmerging() });
    expect(html).toContain("retrieval-augmented generation");
    expect(html).toContain("4 → 1,200");
    expect(html).toContain("+5.43");
    expect(html).toContain("12.35");
    expect(html).toContain("&lt; 0.001");
    expect(html).toContain("0.012");
    expect(html).toContain('href="/home?q=YOLOv8"');
    expect(html).toContain("2026: 40 (incomplete)");
    expect(html).toContain("2016–2022");
    expect(html).toContain("200 keywords tested, 2 signals found.");
    expect(html).toContain("At least 20 papers in the recent period.");
    expect(html).not.toContain("Showing the");
  });

  it("says how many signals are shown when the list is shorter than the match count", () => {
    expect(render({ data: makeEmerging({ matchedCount: 26 }) })).toContain("Showing the 2 with the largest rise.");
  });

  it("explains that the local corpus cannot compute signals and shows no table", () => {
    const html = render({ data: makeEmerging({ dataSource: "local", keywords: [], matchedCount: 0 }) });
    expect(html).toContain("Emerging signals need OpenAlex keyword counts; the local corpus cannot compute them.");
    expect(html).not.toContain("<table");
  });

  it("shows an empty state when no keyword meets the criteria, still with the criteria", () => {
    const html = render({ data: makeEmerging({ keywords: [], matchedCount: 0 }) });
    expect(html).toContain("No keyword meets every criterion in this scope.");
    expect(html).toContain("How a signal is chosen");
    expect(html).not.toContain("<table");
  });

  it("shows the scope notice of ignored filters", () => {
    const data = makeEmerging({ scopeNotice: { ignoredFilters: [{ filter: "languages", values: ["vi"], reason: "not available" }] } });
    expect(render({ data })).toContain("Languages");
  });

  it("tells the reader the first request is slow while loading", () => {
    const html = render({ isLoading: true });
    expect(html).toContain("about 15 seconds");
    expect(html).toContain('aria-busy="true"');
  });

  it("shows an error with a retry button", () => {
    const html = render({ isError: true, onRetry: () => undefined });
    expect(html).toContain("Could not load the emerging signals");
    expect(html).toContain("Retry");
  });
});
