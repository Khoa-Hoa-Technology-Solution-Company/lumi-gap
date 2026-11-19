import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
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
  it("parses an actual PDF and rejects a renamed/spoofed or truncated file", async () => {
    const doc = await PDFDocument.create(); doc.addPage([300, 400]);
    const bytes = await doc.save();
    expect(await validateMentorPdf(bytes)).toBe(1);
    for (const invalid of [Buffer.from("text.pdf"), Buffer.from("%PDF-1.7\nNot a PDF\n%%EOF"), new Uint8Array(10 * 1024 * 1024 + 1), bytes.subarray(0, bytes.length - 100)]) await expect(validateMentorPdf(invalid)).rejects.toMatchObject({ statusCode: 400 });
  });
});
