import { afterEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ resolveLocalPath: vi.fn(), getSignedDownloadUrl: vi.fn() }));
vi.mock("../../../config/env.js", () => ({ env: { INTERNAL_SERVICE_KEY: "test-internal-key", AI_REVIEWER_URL: "http://reviewer" } }));
vi.mock("../../../infrastructure/pdf-storage.service.js", () => ({ pdfStorageService: storage }));
import { extractPdfPages, isPublicIpv4, loadPaperSource } from "../knowledge.source.js";
afterEach(() => vi.unstubAllGlobals());
describe("bounded paper sources", () => {
  it("blocks private, loopback, link-local, reserved and IPv6 addresses", () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::ffff:127.0.0.1"]) expect(isPublicIpv4(address)).toBe(false);
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
  });
  it("discloses metadata-only coverage when no PDF exists", async () => {
    const source = await loadPaperSource({ pdfPath: null, openAccessUrl: null, abstractText: "Our abstract." });
    expect(source.sourceKind).toBe("abstract"); expect(source.pages[0]?.pageNumber).toBeNull(); expect(source.warnings.join()).toContain("Abstract only");
  });
  it("falls back honestly when an open-access link is not a public PDF", async () => {
    const source = await loadPaperSource({ pdfPath: null, openAccessUrl: "http://127.0.0.1/private", abstractText: "Our abstract." });
    expect(source.sourceKind).toBe("abstract"); expect(source.warnings.join()).toContain("could not be indexed");
  });
  it("does not silently downgrade an unavailable user-uploaded PDF", async () => {
    storage.resolveLocalPath.mockReturnValue(null); storage.getSignedDownloadUrl.mockResolvedValue(null);
    await expect(loadPaperSource({ pdfPath: "r2://bucket/missing.pdf", openAccessUrl: null, abstractText: "Our abstract." })).rejects.toThrow("cannot be resolved");
  });
  it("validates the internal extractor response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pages: [{ pageNumber: -1, text: "not a valid page" }], pageCount: 1, warnings: [] }) }));
    await expect(extractPdfPages(Buffer.from("%PDF-test"))).rejects.toThrow();
  });
});
