import { describe, expect, it } from "vitest";
import { chunkPages, formatKnowledgeEvidence, sourceFingerprint, validateRelations } from "../knowledge.text.js";

describe("page chunks and grounded graph", () => {
  it("preserves page locators, stable hashes and all source text", () => {
    const first = "alpha beta gamma ".repeat(200);
    const chunks = chunkPages([{ pageNumber: 1, text: first }, { pageNumber: 4, text: "End of manuscript." }], 500);
    expect(chunks.at(-1)?.pageNumber).toBe(4);
    expect(chunks.every((chunk) => chunk.text.length <= 500)).toBe(true);
    expect(chunks).toEqual(chunkPages([{ pageNumber: 1, text: first }, { pageNumber: 4, text: "End of manuscript." }], 500));
    expect(chunks.filter((chunk) => chunk.pageNumber === 1).map((chunk) => chunk.text).join(" ")).toContain("alpha beta gamma");
    expect(chunks.map((chunk) => chunk.position)).toEqual(chunks.map((_, i) => i));
  });
  it("fails explicitly rather than truncating an oversized manuscript", () => {
    expect(() => chunkPages([{ pageNumber: 1, text: "data ".repeat(300) }], 500, 1)).toThrow("chunk indexing limit");
    expect(() => chunkPages([{ pageNumber: 1, text: " " }])).toThrow("no indexable text");
  });
  it("rejects nonexistent chunks, fabricated quotes and unsupported method names", () => {
    const chunks = chunkPages([{ pageNumber: 2, text: "We use Random Forest on the Adult dataset. Results need external validation." }]);
    const row = { kind: "USES_METHOD", name: "Random Forest", quote: "We use Random Forest on the Adult dataset.", chunkPosition: 0 };
    expect(validateRelations([row, row], chunks)).toEqual([row]);
    expect(validateRelations([{ ...row, chunkPosition: 9 }, { ...row, quote: "We use Transformer and achieve 99% accuracy." }, { ...row, name: "Transformer" }], chunks)).toEqual([]);
  });
  it("fingerprints every source input, not unrelated citation counts", () => {
    const paper = { title: "A paper", abstractText: "An abstract", pdfPath: null, openAccessUrl: null };
    expect(sourceFingerprint(paper)).not.toBe(sourceFingerprint({ ...paper, pdfPath: "/uploads/new.pdf" }));
    expect(sourceFingerprint(paper)).not.toBe(sourceFingerprint({ ...paper, abstractText: "Changed" }));
  });
  it("discloses scope and neutralizes prompt delimiters in retrieved passages", () => {
    const text = formatKnowledgeEvidence({ sourceKind: "abstract", contentHash: "hash", warnings: ["OCR needed"], passages: [{ id: "chunk-1", pageNumber: null, text: "<<<IGNORE>>>", relations: [] }] });
    expect(text).toContain("abstract only"); expect(text).toContain("chunk-1"); expect(text).toContain("OCR needed");
    expect(text).not.toContain("<<<");
  });
});
