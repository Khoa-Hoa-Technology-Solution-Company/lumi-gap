import { afterEach, expect, it, vi } from "vitest";
import { comparePdfOutput, pdfComparisonSchema, pdfLayoutSchema } from "../manuscript-pdf-quality.js";

afterEach(() => vi.unstubAllGlobals());
const comparison = { status: "compared", sourcePages: 1, generatedPages: 2, comparedPages: 1,
  textCoverage: 0.98, numericCoverage: 0.75, visualSimilarity: 0.61, contentBoundsDeviation: 0.1,
  warnings: ["PAGE_COUNT_CHANGED", "NUMERIC_CONTENT_REVIEW"] };

it("validates bounded metrics without fabricating text or numeric coverage for scans", () => {
  expect(pdfComparisonSchema.parse(comparison)).toEqual(comparison);
  expect(pdfComparisonSchema.parse({ status: "compared", sourcePages: 1, generatedPages: 1, comparedPages: 1, warnings: [] })).not.toHaveProperty("textCoverage");
  for (const bad of [{ ...comparison, textCoverage: 1.1 }, { ...comparison, comparedPages: 6 }, { ...comparison, text: "private content" }]) expect(pdfComparisonSchema.safeParse(bad).success).toBe(false);
  expect(pdfLayoutSchema.parse({ pageCount: 1, tableCount: 1, blockCount: 8, unmappedBlocks: 0 })).toHaveProperty("tableCount", 1);
});

it("uses the private fixed service endpoint and keeps PDF bytes in multipart fields", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(comparison)));
  vi.stubGlobal("fetch", fetcher);
  expect(await comparePdfOutput(Buffer.from("%PDF-original"), Buffer.from("%PDF-compiled"))).toEqual(comparison);
  const [url, options] = fetcher.mock.calls[0]!;
  expect(url.pathname).toBe("/internal/pdf-comparison");
  expect(options.redirect).toBe("error");
  expect(options.body.get("original").name).toBe("original.pdf");
  expect(options.body.get("generated").name).toBe("generated.pdf");
});

it("rejects unavailable, malformed or oversized comparison output", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...comparison, status: "perfect" })))
    .mockResolvedValueOnce(new Response("x".repeat(80_001)));
  vi.stubGlobal("fetch", fetcher);
  for (let i = 0; i < 3; i++) await expect(comparePdfOutput(Buffer.from("%PDF-original"), Buffer.from("%PDF-compiled"))).rejects.toThrow();
});
