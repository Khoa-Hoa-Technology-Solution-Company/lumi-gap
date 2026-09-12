import { describe, expect, it } from "vitest";
import { toPaperRef } from "../paper.service.js";

describe("toPaperRef", () => {
  it("maps a lean paper doc to a PaperRef", () => {
    const ref = toPaperRef({
      _id: "abc",
      title: "T",
      publicationYear: 2024,
      authors: [{ displayName: "A", position: 0 }],
      externalIds: { doi: "10.x/y" },
    });
    expect(ref).toEqual({
      id: "abc",
      title: "T",
      publicationYear: 2024,
      authors: [{ displayName: "A", position: 0 }],
      doi: "10.x/y",
    });
  });

  it("defaults authors to [] and omits doi when absent", () => {
    const ref = toPaperRef({ _id: "x", title: "T", publicationYear: 2020 });
    expect(ref.authors).toEqual([]);
    expect(ref.doi).toBeUndefined();
  });

  it("decodes HTML entities and removes markup from legacy paper titles", () => {
    const ref = toPaperRef({
      _id: "legacy",
      title: "&lt;p&gt;AI &amp; Precision Medicine&lt;/p&gt;",
      publicationYear: 2024,
    });

    expect(ref.title).toBe("AI & Precision Medicine");
  });
});
