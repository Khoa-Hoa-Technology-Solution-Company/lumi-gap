import sharp from "sharp";
import { AppError } from "../../common/exceptions/app-error.js";
import type { EvidenceUpload } from "./lecturer-verification.service.js";

export async function validatedVerificationFile(file: EvidenceUpload) {
  if (!file.buffer.length || file.buffer.length > 10 * 1024 * 1024 || file.size !== file.buffer.length) throw AppError.badRequest("Choose a PDF, JPEG or PNG of up to 10 MB.");
  if (file.mimetype === "application/pdf") {
    if (!/^%PDF-\d\.\d/.test(file.buffer.subarray(0, 8).toString("latin1")) || !file.buffer.subarray(-1024).includes(Buffer.from("%%EOF"))) throw AppError.badRequest("Uploaded file is not a valid PDF");
    return { buffer: file.buffer, mimeType: "application/pdf" as const, extension: "pdf" };
  }
  if (!["image/png", "image/jpeg"].includes(file.mimetype)) throw AppError.badRequest("Choose a PDF, JPEG or PNG of up to 10 MB.");
  try {
    const image = sharp(file.buffer, { failOn: "warning", limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== (file.mimetype === "image/png" ? "png" : "jpeg") || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) throw new Error("Invalid image");
    // Decode and re-encode to reject corrupt/spoofed images and strip metadata.
    const buffer = await (file.mimetype === "image/png" ? image.png() : image.jpeg({ quality: 95 })).toBuffer();
    if (buffer.length > 10 * 1024 * 1024) throw new Error("Image too large");
    return { buffer, mimeType: file.mimetype as "image/png" | "image/jpeg", extension: file.mimetype === "image/png" ? "png" : "jpg" };
  } catch { throw AppError.badRequest("Uploaded file is not a valid JPEG or PNG image."); }
}
