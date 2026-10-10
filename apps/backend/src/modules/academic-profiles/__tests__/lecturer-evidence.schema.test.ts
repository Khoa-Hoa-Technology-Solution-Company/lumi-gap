import { describe, expect, it } from "vitest";
import { VerificationRequestSchema, LecturerEvidenceEntrySchema } from "../dto/academic-profile.schema.js";
import { validatedVerificationFile } from "../verification-evidence-file.js";
import sharp from "sharp";

describe("Lecturer evidence entry validation", () => {
  it("requires an idempotency key for staged evidence and rejects ambiguous or trusted fields", () => {
    const uploadId = "11111111-1111-4111-8111-111111111111", source = { type: "INSTITUTION_ISSUED_PROFILE", sourceKind: "DOCUMENT", uploadId };
    const input = { type: "POSITION", evidenceType: "DOCUMENT", path: "MANUAL", institutionId: uploadId, sources: [source] };
    expect(VerificationRequestSchema.safeParse(input).success).toBe(false);
    expect(VerificationRequestSchema.safeParse({ ...input, submissionKey: uploadId }).success).toBe(true);
    expect(LecturerEvidenceEntrySchema.safeParse({ ...source, documentIndex: 0 }).success).toBe(false);
    expect(VerificationRequestSchema.safeParse({ ...input, submissionKey: uploadId, verifiedAt: new Date().toISOString() }).success).toBe(false);
  });
  it("requires only the input matching its type and never accepts trusted review fields", () => {
    expect(LecturerEvidenceEntrySchema.safeParse({ type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: "https://university.edu/person" }).success).toBe(true);
    expect(LecturerEvidenceEntrySchema.safeParse({ type: "APPOINTMENT_DOCUMENT", sourceKind: "DOCUMENT", documentIndex: 0 }).success).toBe(true);
    for (const entry of [
      { type: "APPOINTMENT_DOCUMENT", sourceKind: "URL", reference: "https://university.edu" },
      { type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "DOCUMENT", documentIndex: 0 },
      { type: "STAFF_ID", sourceKind: "DOCUMENT" },
      { type: "OTHER_INSTITUTION_SOURCE", sourceKind: "URL", reference: "https://university.edu" },
      { type: "STAFF_ID", sourceKind: "DOCUMENT", documentIndex: 0, status: "VALID" },
      { type: "STAFF_ID", sourceKind: "DOCUMENT", documentIndex: 0, storageKey: "forged" },
      { type: "STAFF_ID", sourceKind: "DOCUMENT", documentIndex: 0, reference: "https://university.edu" },
    ]) expect(LecturerEvidenceEntrySchema.safeParse(entry).success).toBe(false);
  });
  it("supports custom URL and document entries with required names, bounded metadata and multipart JSON", () => {
    const entry = { type: "OTHER_INSTITUTION_SOURCE", customEvidenceName: "Teaching confirmation", additionalExplanation: "Issued by the faculty" };
    const sources = [{ ...entry, sourceKind: "URL", reference: "https://university.edu/faculty" }, { ...entry, sourceKind: "DOCUMENT", documentIndex: 0 }];
    const input = { type: "POSITION", evidenceType: "DOCUMENT", path: "MANUAL", institutionId: "11111111-1111-4111-8111-111111111111", sources: JSON.stringify(sources) };
    expect(VerificationRequestSchema.parse(input).sources).toEqual(sources);
    expect(VerificationRequestSchema.safeParse({ ...input, sources: "bad json" }).success).toBe(false);
    expect(VerificationRequestSchema.safeParse({ ...input, reference: "https://legacy.edu" }).success).toBe(false);
    expect(LecturerEvidenceEntrySchema.safeParse({ ...sources[0], customEvidenceName: "x".repeat(201) }).success).toBe(false);
  });
  it("decodes images, checks true format, and rejects corrupt or MIME-spoofed files", async () => {
    const buffer = await sharp({ create: { width: 12, height: 10, channels: 3, background: "white" } }).png().toBuffer();
    expect(await validatedVerificationFile({ buffer, size: buffer.length, originalname: "id.png", mimetype: "image/png" })).toMatchObject({ mimeType: "image/png", extension: "png" });
    await expect(validatedVerificationFile({ buffer, size: buffer.length, originalname: "id.jpg", mimetype: "image/jpeg" })).rejects.toMatchObject({ statusCode: 400 });
    const fake = Buffer.from("%PDF-1.4 this is not an image");
    await expect(validatedVerificationFile({ buffer: fake, size: fake.length, originalname: "id.png", mimetype: "image/png" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(validatedVerificationFile({ buffer: fake, size: fake.length, originalname: "id.pdf", mimetype: "application/pdf" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
