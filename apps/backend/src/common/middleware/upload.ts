// @ts-ignore
import multer from "multer";
import { AppError } from "../exceptions/app-error.js";

// Use memory storage so we can decide whether to save locally or upload to cloud (S3/etc.) in the controller
const storage = (multer as any).memoryStorage();

export const uploadSinglePdf = (multer as any)({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file.mimetype !== "application/pdf") {
      return cb(AppError.badRequest("Only PDF files are allowed"));
    }
    cb(null, true);
  },
}).single("pdf");

export const uploadPaperReviewPdf = (multer as any)({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file.mimetype !== "application/pdf" && !file.originalname.toLowerCase().endsWith(".pdf")) {
      return cb(AppError.badRequest("Chỉ hỗ trợ file định dạng PDF"));
    }
    cb(null, true);
  },
}).single("file");

/**
 * Verify the uploaded bytes are actually a PDF. The multer `fileFilter` only sees the
 * client-supplied MIME type (spoofable), so the buffer is checked here AFTER upload for
 * the `%PDF` magic bytes — call this in the route before persisting the file/rewarding.
 */
export function assertPdfMagic(buffer: Buffer | undefined): void {
  if (!buffer || buffer.length < 5 || buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw AppError.badRequest("Uploaded file is not a valid PDF");
  }
}
