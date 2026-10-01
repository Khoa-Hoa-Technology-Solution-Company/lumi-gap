import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../../theme/globals.css", import.meta.url), "utf8");

describe("Forum native-zoom reflow", () => {
  it("uses the available reading width rather than viewport breakpoints for topic columns", () => {
    expect(css).toMatch(/\.forum-topics\s*\{\s*container: forum-topics \/ inline-size;/);
    expect(css).toContain("--forum-reading-width: 69.375rem;");
    for (const width of [30, 42, 45, 54, 60]) {
      expect(css).toContain(`@container forum-topics (min-width: ${width}rem)`);
    }
    expect(css).toMatch(/\.forum-topic-row,\s*\.forum-topic-head\s*\{\s*grid-template-columns: minmax\(0, 1fr\) var\(--forum-row-metrics-width\);/);
    expect(css).toMatch(/\.forum-topic-row \.forum-topic-metrics\s*\{\s*grid-template-columns: var\(--forum-row-metrics-columns\);/);
    expect(css).toMatch(/\.forum-topic-head-metrics\s*\{\s*grid-template-columns: var\(--forum-row-metrics-columns\);/);
  });

  it("keeps secondary columns hidden until the content area can accommodate them", () => {
    const queries = css.slice(css.indexOf("@container forum-topics (min-width: 30rem)"));
    const compact = queries.slice(0, queries.indexOf("@container forum-topics (min-width: 42rem)"));
    const medium = queries.slice(queries.indexOf("@container forum-topics (min-width: 42rem)"), queries.indexOf("@container forum-topics (min-width: 45rem)"));
    const wide = queries.slice(queries.indexOf("@container forum-topics (min-width: 60rem)"));
    expect(compact).toMatch(/\.forum-topic-helpful\s*\{\s*display: none;/);
    expect(medium).toContain("--forum-row-metrics-width: 19.5rem;");
    expect(medium).toMatch(/\.forum-topic-views,\s*\.forum-topic-helpful,\s*\.forum-topic-head-views\s*\{\s*display: block;/);
    expect(wide).toMatch(/\.forum-topic-participants\s*\{\s*display: flex;/);
  });

  it("does not intercept browser zoom or counter-scale the interface", () => {
    const sources = [
      "../components/forum-layout.tsx",
      "../components/forum-sidebar.tsx",
      "../components/forum-card.tsx",
      "../../../pages/forum/forum-list.tsx",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
    expect(sources).not.toMatch(/onWheel|addEventListener\(["']wheel|devicePixelRatio|visualViewport|style=\{\{\s*zoom/);
    const forumStyles = css.slice(css.indexOf(".forum-workspace {"), css.indexOf(".lumigap-toaster[data-sonner-theme=\"dark\"] [data-close-button]:hover"));
    expect(forumStyles).not.toMatch(/\bzoom\s*:|transform\s*:\s*scale/);
  });
});
