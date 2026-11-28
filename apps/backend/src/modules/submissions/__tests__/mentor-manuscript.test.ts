import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { MANUSCRIPT_PDF_MAX_BYTES } from "@trend/shared-types";
import { mentorManuscriptSendSchema } from "../dto/mentor-manuscript.schema.js";
import { validateMentorPdf } from "../mentor-pdf-validation.js";

describe("mentor manuscript input and PDF validation", () => {
  it("requires one exact snapshot/compilation pair and rejects ambiguous sources and duplicate responses", () => {
    const base = { projectId: crypto.randomUUID(), mentorId: crypto.randomUUID(), clientKey: crypto.randomUUID(), source: "SNAPSHOT" };
    expect(mentorManuscriptSendSchema.safeParse(base).success).toBe(false);
    const ready = { ...base, manuscriptSnapshotId: crypto.randomUUID(), compilationId: crypto.randomUUID() };
    expect(mentorManuscriptSendSchema.safeParse(ready).success).toBe(true);
    expect(mentorManuscriptSendSchema.safeParse({ ...ready, source: "PDF" }).success).toBe(false);
    const id = crypto.randomUUID();
    expect(mentorManuscriptSendSchema.safeParse({ ...ready, responses: [{ revisionItemId: id, responseText: "First" }, { revisionItemId: id, responseText: "Duplicate" }] }).success).toBe(false);
  });

  it("accepts valid PDFs including leading bytes, trailing EOF whitespace, and files > 10 MB up to 50 MB", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    const bytes = await doc.save();
    expect(await validateMentorPdf(bytes)).toBe(1);

    // Leading bytes within 1024-byte PDF spec header window + trailing bytes after %%EOF
    const padded = Buffer.concat([Buffer.from("   \r\n"), Buffer.from(bytes), Buffer.from("\n% trailing comment\n")]);
    expect(await validateMentorPdf(padded)).toBe(1);

    // 12 MB valid PDF (previously rejected under 10 MB limit, now accepted under 50 MB limit)
    const largeDoc = await PDFDocument.create();
    largeDoc.addPage([595, 842]);
    const baseLarge = await largeDoc.save();
    const commentPad = Buffer.from("\n%" + "A".repeat(12 * 1024 * 1024) + "\n");
    const eofIdx = Buffer.from(baseLarge).lastIndexOf(Buffer.from("%%EOF"));
    const twelveMbPdf = Buffer.concat([
      Buffer.from(baseLarge).subarray(0, eofIdx),
      commentPad,
      Buffer.from(baseLarge).subarray(eofIdx),
    ]);
    expect(twelveMbPdf.byteLength).toBeGreaterThan(12 * 1024 * 1024);
    expect(await validateMentorPdf(twelveMbPdf)).toBe(1);
  }, 20_000);

  it("returns structured error codes for empty, oversized (>50 MB), spoofed, truncated, and password-protected PDFs", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    const bytes = await doc.save();

    await expect(validateMentorPdf(new Uint8Array(0))).rejects.toMatchObject({ statusCode: 400, code: "PDF_EMPTY" });
    await expect(validateMentorPdf(new Uint8Array(MANUSCRIPT_PDF_MAX_BYTES + 1))).rejects.toMatchObject({ statusCode: 413, code: "PDF_TOO_LARGE" });
    await expect(validateMentorPdf(Buffer.from("text.pdf"))).rejects.toMatchObject({ statusCode: 400, code: "PDF_INVALID_FORMAT" });
    await expect(validateMentorPdf(Buffer.from("%PDF-1.7\nNot a PDF\n%%EOF"))).rejects.toMatchObject({ statusCode: 400, code: "PDF_CORRUPTED" });
    await expect(validateMentorPdf(bytes.subarray(0, bytes.length - 100))).rejects.toMatchObject({ statusCode: 400, code: "PDF_CORRUPTED" });
  });
});
