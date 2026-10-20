import { describe, expect, it } from "vitest";

import { buildManuscriptText } from "../pre-review-input.js";

describe("buildManuscriptText", () => {
  it("marks each page and keeps short text whole", () => {
    const text = buildManuscriptText([{ pageNumber: 1, text: "Intro" }, { pageNumber: 2, text: "Method" }]);
    expect(text).toBe("[[PAGE 1]]\nIntro\n\n[[PAGE 2]]\nMethod");
  });

  it("numbers pages by position when the extractor gives no page number", () => {
    expect(buildManuscriptText([{ pageNumber: null, text: "Only" }])).toBe("[[PAGE 1]]\nOnly");
  });

  it("trims long text to max, keeping the start and the end around a marker", () => {
    const pages = [
      { pageNumber: 1, text: `START ${"a".repeat(500)}` },
      { pageNumber: 2, text: "b".repeat(500) },
      { pageNumber: 3, text: `${"c".repeat(500)} END` },
    ];
    const text = buildManuscriptText(pages, 1000);
    expect(text).toHaveLength(1000);
    expect(text).toContain("[... middle pages omitted ...]");
    expect(text.startsWith("[[PAGE 1]]\nSTART")).toBe(true);
    expect(text.endsWith("END")).toBe(true);
  });
});
