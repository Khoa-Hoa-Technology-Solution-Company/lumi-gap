import { unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../llm/llm.run.js", () => ({ cachedGenerateJSON: vi.fn() }));
vi.mock("../../user-ai/user-ai.runtime.js", () => ({ withUserAi: vi.fn() }));
import { applyPdfLabels, validatePdfLabels, improvePdfStructure, pdfBlocksSchema } from "../manuscript-pdf-structure.js";
import { cachedGenerateJSON } from "../../llm/llm.run.js";
import { withUserAi } from "../../user-ai/user-ai.runtime.js";
import { pdfImportSchema } from "../manuscript-pdf-import.js";
vi.mock("../../../infrastructure/queue.js", () => ({ aiJobsQueue: {}, notificationQueue: {} }));
vi.mock("../../../infrastructure/redis.js", () => ({ redis: {} }));
const blocks = [{ id: "p1b0", kind: "paragraph" as const, text: "Research results: 50% & 92.5" }];
const text = "\\LGparagraph{p1b0}{Research results: 50\\% \\& 92.5}\n";
const archive = (source = text) => Buffer.from(zipSync({ "main.tex": new TextEncoder().encode("\\documentclass{article}\\begin{document}\\input{pages/page-1.tex}\\end{document}"), "pages/page-1.tex": new TextEncoder().encode(source), "source-map.txt": new TextEncoder().encode("source provenance") })).toString("base64");
describe("PDF AI structural refinement", () => {
  it("accepts page 100 and bounds optional AI context across a long document", async () => {
    const longBlocks = Array.from({ length: 1000 }, (_, index) => ({ id: `p${Math.floor(index / 10) + 1}b${index}`, kind: "paragraph" as const, text: "Research evidence" }));
    expect(pdfBlocksSchema.parse(longBlocks)).toHaveLength(1000);
    expect(pdfBlocksSchema.safeParse(Array.from({ length: 5001 }, () => longBlocks[0])).success).toBe(false);
    vi.mocked(withUserAi).mockImplementation(async (_actor, handler) => handler());
    vi.mocked(cachedGenerateJSON).mockImplementationOnce(async options => {
      const sent = JSON.parse(options.prompt).blocks;
      expect(sent).toHaveLength(500);
      expect(sent.at(-1).id).toMatch(/^p100b/);
      expect(() => options.validate!({ labels: [{ id: "p1b1", kind: "heading" }] })).toThrow();
      return { labels: [] };
    });
    await improvePdfStructure("actor", "long-document", archive(), longBlocks);
  });
  it("uses per-user AI and a document-scoped expiring cache, never generated source text", async () => {
    vi.mocked(withUserAi).mockImplementation(async (_actor, handler) => handler());
    vi.mocked(cachedGenerateJSON).mockResolvedValueOnce({ labels: [{ id: "p1b0", kind: "heading" }] });
    const result = await improvePdfStructure("actor-id", "document-digest", archive(), blocks);
    expect(withUserAi).toHaveBeenCalledWith("actor-id", expect.any(Function));
    expect(cachedGenerateJSON).toHaveBeenCalledWith(expect.objectContaining({ task: "extract", keyParts: { actor: "actor-id", digest: "document-digest" }, ttlSeconds: 3600, validate: expect.any(Function) }));
    expect(result.preview).toBe(text.replace("LGparagraph", "LGheading"));
  });
  it("changes only a known block label and preserves exact research text and provenance", () => {
    const result = applyPdfLabels(archive(), blocks, { labels: [{ id: "p1b0", kind: "heading" }] });
    const files = unzipSync(Buffer.from(result.archive, "base64"));
    expect(new TextDecoder().decode(files["pages/page-1.tex"])).toBe(text.replace("LGparagraph", "LGheading"));
    expect(new TextDecoder().decode(files["source-map.txt"])).toBe("source provenance");
    expect(result.preview).toContain("50\\% \\& 92.5");
  });
  it("allows only semantic label changes for totals, notes and information groups", () => {
    for (const kind of ["metadata", "total", "note", "footer"] as const) {
      const result = applyPdfLabels(archive(), blocks, { labels: [{ id: "p1b0", kind }] });
      expect(result.preview).toBe(text.replace("LGparagraph", `LG${kind}`));
      expect(result.preview).toContain("50\\% \\& 92.5");
    }
    expect(() => validatePdfLabels({ labels: [{ id: "p1b0", kind: "table" }] }, blocks)).toThrow();
  });
  it("rejects invented IDs, duplicate labels, injected text, invalid commands and source mismatch", () => {
    for (const raw of [{ labels: [{ id: "unknown", kind: "heading" }] }, { labels: [{ id: "p1b0", kind: "heading", text: "invented" }] }, { labels: [{ id: "p1b0", kind: "input" }] }, { labels: [{ id: "p1b0", kind: "heading" }, { id: "p1b0", kind: "paragraph" }] }]) expect(() => validatePdfLabels(raw, blocks)).toThrow();
    expect(() => applyPdfLabels(archive("mismatched source"), blocks, { labels: [{ id: "p1b0", kind: "heading" }] })).toThrow();
  });
  it("requires explicit structured mode for AI and rejects unexpected multipart fields", () => {
    const input = { title: "Paper", clientKey: "a22a17d3-0de7-4d65-b260-278c78d10d7b" };
    expect(pdfImportSchema.safeParse(input).success).toBe(true);
    expect(pdfImportSchema.safeParse({ ...input, ai: "true" }).success).toBe(false);
    expect(pdfImportSchema.safeParse({ ...input, mode: "structured", ai: "true" }).success).toBe(true);
    expect(pdfImportSchema.safeParse({ ...input, mode: "structured", url: "https://example.com/private.pdf" }).success).toBe(false);
  });
});
