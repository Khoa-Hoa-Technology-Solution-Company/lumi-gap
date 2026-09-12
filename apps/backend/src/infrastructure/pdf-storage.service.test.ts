import { describe, expect, it, vi } from "vitest";
import { buildPdfObjectKey, createPdfStorageService } from "./pdf-storage.service.js";

const pdfBuffer = Buffer.from("%PDF-1.4\nmock pdf bytes");

describe("pdf storage service", () => {
  it("builds stable safe object keys without trusting the original filename path", () => {
    const key = buildPdfObjectKey("../Unsafe Paper Name.pdf", "fixed-id");

    expect(key).toBe("papers/fixed-id-Unsafe-Paper-Name.pdf");
  });

  it("stores local PDFs under /uploads for development fallback", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const storage = createPdfStorageService({
      provider: "local",
      uploadsDir: "uploads-test",
      writeFile,
      mkdir,
    });

    const result = await storage.savePdf(pdfBuffer, "paper.pdf");

    expect(result.uri).toMatch(/^\/uploads\//);
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining("uploads-test"), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining("uploads-test"), pdfBuffer);
  });

  it("stores R2 PDFs as r2://bucket/key object references", async () => {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const storage = createPdfStorageService({
      provider: "r2",
      bucket: "papers-bucket",
      putObject,
      getSignedUrl: vi.fn(),
    });

    const result = await storage.savePdf(pdfBuffer, "paper.pdf");

    expect(result.uri).toMatch(/^r2:\/\/papers-bucket\/papers\//);
    expect(putObject).toHaveBeenCalledWith(expect.objectContaining({
      Bucket: "papers-bucket",
      Body: pdfBuffer,
      ContentType: "application/pdf",
    }));
  });
});
