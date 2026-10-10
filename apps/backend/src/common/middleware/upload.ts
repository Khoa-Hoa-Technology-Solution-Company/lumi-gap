// @ts-expect-error multer's CommonJS export is callable and exposes memoryStorage at runtime.
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

export const uploadProfileCover = (multer as any)({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(AppError.badRequest("Only JPEG, PNG, or WebP cover images are allowed"));
    }
    cb(null, true);
  },
}).single("cover");

export const uploadProfileAvatar = (multer as any)({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(AppError.badRequest("Only JPEG, PNG, or WebP profile photos are allowed"));
    }
    cb(null, true);
  },
}).single("avatar");

export const uploadPositionEvidence = (multer as any)({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 6, fields: 20, fieldSize: 64 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype)) return cb(AppError.badRequest("Only PDF, JPEG or PNG supporting documents are allowed"));
    cb(null, true);
  },
}).fields([{ name: "evidence", maxCount: 1 }, { name: "additionalEvidence", maxCount: 1 }, { name: "evidenceFiles", maxCount: 6 }]);

export const uploadStagedVerificationEvidence = (multer as any)({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype)) return cb(AppError.badRequest("Only PDF, JPEG or PNG supporting documents are allowed"));
    cb(null, true);
  },
}).single("evidence");

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
