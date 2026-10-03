import fs from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { z } from "zod";
import { env } from "../../config/env.js";
import { pdfStorageService } from "../../infrastructure/pdf-storage.service.js";
import type { SourcePage } from "./knowledge.types.js";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const extractionSchema = z.object({
  pages: z.array(z.object({ pageNumber: z.number().int().min(1).max(200), text: z.string().max(600000) })).min(1).max(200),
  pageCount: z.number().int().min(1).max(200), warnings: z.array(z.string()).max(200),
});

// IPv6 is conservatively rejected here. DNS is resolved once and the checked
// IPv4 address is pinned to the TLS request, including each redirect hop.
export function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a = -1, b = -1] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
}

export async function downloadPublicPdf(value: string, redirects = 0): Promise<Buffer> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("PDF source must be a public HTTPS URL");
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((row) => !isPublicIpv4(row.address))) throw new Error("PDF source resolved to a restricted address");
  const address = addresses[0]!;
  return new Promise<Buffer>((resolve, reject) => {
    const req = request(url, {
      method: "GET", agent: false, family: 4,
      signal: AbortSignal.timeout(30000),
      lookup: (_host, _opts, callback) => callback(null, address.address, 4),
      headers: { Accept: "application/pdf", "User-Agent": "LumiGap-RAG/1.0" },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0) && res.headers.location) {
        res.resume();
        if (redirects >= 3) return reject(new Error("PDF source has too many redirects"));
        downloadPublicPdf(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200 || Number(res.headers["content-length"] ?? 0) > MAX_PDF_BYTES) {
        res.resume(); reject(new Error("PDF source is unavailable or exceeds 25 MiB")); return;
      }
      const buffers: Buffer[] = []; let size = 0;
      res.on("data", (data: Buffer) => {
        size += data.length;
        if (size > MAX_PDF_BYTES) { res.destroy(new Error("PDF exceeds 25 MiB")); return; }
        buffers.push(data);
      });
      res.on("error", reject);
      res.on("end", () => {
        const buffer = Buffer.concat(buffers);
        if (buffer.subarray(0, 5).toString() !== "%PDF-") reject(new Error("Source did not return a PDF"));
        else resolve(buffer);
      });
    });
    req.on("error", reject); req.end();
  });
}

export async function extractPdfPages(buffer: Buffer) {
  if (!env.INTERNAL_SERVICE_KEY) throw new Error("PDF extraction requires INTERNAL_SERVICE_KEY");
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), "paper.pdf");
  const response = await fetch(`${env.AI_REVIEWER_URL}/internal/extract-text`, {
    method: "POST", headers: { "X-Internal-Key": env.INTERNAL_SERVICE_KEY }, body,
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`PDF extraction failed (HTTP ${response.status}); check extraction service and whether OCR is required`);
  const result = extractionSchema.parse(await response.json());
  if (result.pages.reduce((sum, page) => sum + page.text.length, 0) > 600000) throw new Error("Extracted PDF exceeds text limit");
  return result;
}

export async function loadPaperSource(paper: { pdfPath: string | null; openAccessUrl: string | null; abstractText: string | null }): Promise<{ pages: SourcePage[]; pageCount: number; sourceKind: string; warnings: string[] }> {
  if (paper.pdfPath) {
    const local = pdfStorageService.resolveLocalPath(paper.pdfPath);
    let buffer: Buffer;
    if (local) {
      if ((await fs.stat(local)).size > MAX_PDF_BYTES) throw new Error("Stored PDF exceeds 25 MiB");
      buffer = await fs.readFile(local);
    } else {
      const url = await pdfStorageService.getSignedDownloadUrl(paper.pdfPath);
      if (!url) throw new Error("Stored PDF cannot be resolved");
      buffer = await downloadPublicPdf(url);
    }
    return { ...await extractPdfPages(buffer), sourceKind: "uploaded_pdf" };
  }
  const warnings: string[] = [];
  if (paper.openAccessUrl) {
    try { return { ...await extractPdfPages(await downloadPublicPdf(paper.openAccessUrl)), sourceKind: "open_access_pdf" }; }
    catch { warnings.push("Open-access PDF could not be indexed; analysis covers only the abstract. Upload a text PDF to index full text."); }
  }
  if (!paper.abstractText?.trim()) throw new Error("Paper has no extractable PDF or abstract");
  return { sourceKind: "abstract", pages: [{ pageNumber: null, text: paper.abstractText }], pageCount: 0, warnings: [...warnings, "Abstract only; full manuscript conclusions and limitations may be missing."] };
}
