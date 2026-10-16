import { describe, expect, it } from "vitest";
import { DOCS_SECTIONS, docsPath } from "../docs-section-ids";
import { DOCS_SOURCES, DOCS_SOURCE_ROLES, isDocsSourceId } from "../docs-sources";
import { DOCS_MODULES, getDocsSections, resolveDocsLanguage } from "../docs-registry";
import type { DocsBlock, DocsLanguage, DocsSectionContent } from "../docs.types";
import { TREND_DOC_CONSTANTS } from "../content/trends/trend-doc-constants";
import { citedSourceIds, linkTargets, parseRichText } from "../utils/docs-rich-text";
import { filterGlossaryEntries } from "../components/docs-glossary";

const LANGUAGES: DocsLanguage[] = ["vi", "en"];

/** Every rich string of a block tree, with the source ids it references explicitly. */
function walkBlocks(blocks: DocsBlock[], visit: (text: string) => void, sourceIds: string[]) {
  for (const block of blocks) {
    switch (block.kind) {
      case "paragraph":
        visit(block.text);
        break;
      case "formula":
        block.legend?.forEach((item) => visit(item.meaning));
        break;
      case "table":
        block.rows.flat().forEach(visit);
        break;
      case "callout":
        if (block.text) visit(block.text);
        block.items?.forEach(visit);
        break;
      case "list":
        block.items.forEach(visit);
        break;
      case "example":
        walkBlocks(block.blocks, visit, sourceIds);
        break;
      case "sources":
        sourceIds.push(...block.ids);
        if (block.text) visit(block.text);
        break;
      case "glossary":
        for (const entry of block.entries) {
          visit(entry.definition);
          if (entry.example) visit(entry.example);
        }
        break;
      case "heading":
      case "bibliography":
        break;
    }
  }
}

function sectionTexts(section: DocsSectionContent) {
  const texts: string[] = [];
  const sourceIds: string[] = [];
  if (section.summary) texts.push(section.summary);
  walkBlocks(section.body, (text) => texts.push(text), sourceIds);
  return { texts, sourceIds };
}

describe("docs registry", () => {
  const allIds = DOCS_MODULES.flatMap((module) => [...module.sectionIds]);

  it("has unique module ids and unique section ids", () => {
    const moduleIds = DOCS_MODULES.map((module) => module.id);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("registers every exported section id exactly once", () => {
    expect([...allIds].sort()).toEqual(Object.values(DOCS_SECTIONS).sort());
  });

  it("gives every section Vietnamese and English content with a heading and a body", () => {
    for (const module of DOCS_MODULES) {
      for (const language of LANGUAGES) {
        const content = module.content[language];
        expect(content, `${module.id}/${language}`).toBeDefined();
        expect(content.groupHeading.trim()).not.toBe("");
        expect(Object.keys(content.sections).sort()).toEqual([...module.sectionIds].sort());
        for (const id of module.sectionIds) {
          const section = content.sections[id];
          expect(section?.heading.trim(), `${module.id}/${language}/${id}`).toBeTruthy();
          expect(section?.body.length, `${module.id}/${language}/${id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("only references existing sources, in source blocks and in [@id] citations", () => {
    for (const module of DOCS_MODULES) {
      for (const language of LANGUAGES) {
        for (const id of module.sectionIds) {
          const { texts, sourceIds } = sectionTexts(module.content[language].sections[id]);
          const cited = [...sourceIds, ...texts.flatMap(citedSourceIds)];
          const unknown = cited.filter((sourceId) => !isDocsSourceId(sourceId));
          expect(unknown, `${module.id}/${language}/${id}`).toEqual([]);
        }
      }
    }
  });

  it("links only to registered sections and in-section anchors that exist", () => {
    const anchorsBySection = new Map<string, Set<string>>();
    for (const module of DOCS_MODULES) {
      for (const id of module.sectionIds) {
        const anchors = new Set<string>();
        for (const block of module.content.vi.sections[id].body) if (block.kind === "heading") anchors.add(block.id);
        anchorsBySection.set(id, anchors);
      }
    }
    for (const module of DOCS_MODULES) {
      for (const language of LANGUAGES) {
        for (const id of module.sectionIds) {
          for (const href of sectionTexts(module.content[language].sections[id]).texts.flatMap(linkTargets)) {
            if (!href.startsWith("/docs/")) continue;
            const [path, anchor] = href.slice("/docs/".length).split("#");
            expect(anchorsBySection.has(path!), href).toBe(true);
            if (anchor) expect(anchorsBySection.get(path!)?.has(anchor), href).toBe(true);
          }
        }
      }
    }
  });

  it("uses the same in-section anchors in every language", () => {
    for (const module of DOCS_MODULES) {
      for (const id of module.sectionIds) {
        const anchors = (language: DocsLanguage) =>
          module.content[language].sections[id].body.flatMap((block) => (block.kind === "heading" ? [block.id] : []));
        expect(anchors("en"), `${module.id}/${id}`).toEqual(anchors("vi"));
      }
    }
  });

  it("keeps glossary entry ids unique and with at least 20 terms", () => {
    for (const language of LANGUAGES) {
      const section = getDocsSections(language).find((item) => item.id === DOCS_SECTIONS.glossary)!;
      const entries = section.body.flatMap((block) => (block.kind === "glossary" ? block.entries : []));
      expect(entries.length).toBeGreaterThanOrEqual(20);
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    }
  });

  it("falls back to English for languages without their own content", () => {
    expect(resolveDocsLanguage("vi")).toBe("vi");
    expect(resolveDocsLanguage("fr")).toBe("en");
    expect(getDocsSections("ja")[0]!.heading).toBe(getDocsSections("en")[0]!.heading);
  });
});

describe("docs sources", () => {
  it("keys every source by its own id and has a known role", () => {
    for (const [key, source] of Object.entries(DOCS_SOURCES)) {
      expect(source.id).toBe(key);
      expect(DOCS_SOURCE_ROLES).toContain(source.role);
      expect(source.url).toMatch(/^https:\/\//);
      if (source.doi) expect(source.url).toBe(`https://doi.org/${source.doi}`);
    }
  });
});

describe("docs rich text", () => {
  it("parses bold, escapes, code, links and citations", () => {
    expect(parseRichText("**p\\*** and `x` [a](/docs/glossary) [@mann-1945]")).toEqual([
      { type: "strong", children: [{ type: "text", value: "p*" }] },
      { type: "text", value: " and " },
      { type: "code", value: "x" },
      { type: "text", value: " " },
      { type: "link", href: "/docs/glossary", children: [{ type: "text", value: "a" }] },
      { type: "text", value: " " },
      { type: "cite", sourceId: "mann-1945" },
    ]);
  });

  it("does not treat a lone asterisk as emphasis", () => {
    expect(parseRichText("p* < 0.05 and S > 0")).toEqual([{ type: "text", value: "p* < 0.05 and S > 0" }]);
  });

  it("builds deep links", () => {
    expect(docsPath(DOCS_SECTIONS.trendVerdict)).toBe("/docs/trend-verdict");
    expect(docsPath(DOCS_SECTIONS.trendMannKendall, "ties")).toBe("/docs/trend-mann-kendall#ties");
  });
});

describe("glossary search", () => {
  it("matches without diacritics", () => {
    const entries = getDocsSections("vi").find((item) => item.id === DOCS_SECTIONS.glossary)!
      .body.flatMap((block) => (block.kind === "glossary" ? block.entries : []));
    expect(filterGlossaryEntries(entries, "thi phan").map((entry) => entry.id)).toContain("share");
    expect(filterGlossaryEntries(entries, "")).toHaveLength(entries.length);
  });
});

describe("trend worked example", () => {
  // Mirrors the hand computation on the worked-example page.
  const shares = [1.2, 1.25, 1.24, 1.35, 1.4, 1.5];
  const years = [2019, 2020, 2021, 2022, 2023, 2024];

  it("matches S, Var(S), Z, p, Sen's slope, CI95 and r shown in the docs", () => {
    const n = shares.length;
    let s = 0;
    const slopes: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        s += Math.sign(shares[j]! - shares[i]!);
        slopes.push((shares[j]! - shares[i]!) / (years[j]! - years[i]!));
      }
    }
    slopes.sort((a, b) => a - b);
    const variance = (n * (n - 1) * (2 * n + 5)) / 18;
    const z = (s - 1) / Math.sqrt(variance);
    const b = slopes[7]!;
    const c = 1.959964 * Math.sqrt(variance);
    const rank = (k: number) => slopes[Math.floor(k) - 1]! + (k - Math.floor(k)) * (slopes[Math.floor(k)]! - slopes[Math.floor(k) - 1]!);

    expect(s).toBe(13);
    expect(variance).toBeCloseTo(28.33, 2);
    expect(z).toBeCloseTo(2.254, 3);
    expect(b).toBeCloseTo(0.05, 10);
    expect(rank((slopes.length - c) / 2)).toBeCloseTo(0.029, 3);
    expect(rank((slopes.length + c) / 2 + 1)).toBeCloseTo(0.096, 3);
    expect((b / 1.3) * 100).toBeCloseTo(3.85, 2);
    expect(n).toBeGreaterThanOrEqual(TREND_DOC_CONSTANTS.minYears);
    expect(n).toBeLessThan(TREND_DOC_CONSTANTS.highConfidenceMinYears);
  });
});
