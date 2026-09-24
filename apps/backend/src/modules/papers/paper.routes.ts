import { Router, type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../../common/exceptions/app-error.js";
import { requireAuth, requireRole, optionalAuth } from "../../common/middleware/auth.js";
import { uploadSinglePdf, uploadPaperReviewPdf, assertPdfMagic } from "../../common/middleware/upload.js";
import { paperReviewController } from "./paper-review.controller.js";
import { CreatePaperSchema } from "./dto/create-paper.schema.js";
import { paperService } from "./paper.service.js";
import { comparePapers } from "./paper.compare.js";
import { PaperListQuerySchema } from "./dto/paper.schema.js";
import { CompareBodySchema } from "./dto/compare.schema.js";
import { embeddingQueue } from "../../infrastructure/queue.js";
import { env } from "../../config/env.js";
import rateLimit from "express-rate-limit";
import { validate } from "../../common/middleware/validate.js";
import { TranslatePaperBodySchema } from "./dto/translate-paper.schema.js";
import { paperTranslationController } from "./paper-translation.controller.js";

import { runEmbedding } from "../embeddings/embedding.service.js";
import { logger } from "../../infrastructure/logger.js";
import { pdfStorageService } from "../../infrastructure/pdf-storage.service.js";

export const paperRouter: Router = Router();

const translationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.TRANSLATION_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Translation limit exceeded. Try again later." },
    }),
});

const compareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.COMPARE_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Paper comparison limit exceeded. Try again later." },
    }),
});

const triggerEmbedding = () => {
  embeddingQueue.add("manual-embedding", {}).catch(() => {});
  // Keep local development convenient without making production API instances
  // perform worker CPU/network work or race the dedicated embedding worker.
  if (env.NODE_ENV !== "production") {
    runEmbedding({ maxPapers: 5, batchSize: 5 }).catch((err) => {
      logger.error({ err }, "In-process runEmbedding failed");
    });
  }
};

async function saveUploadedPdf(req: Request): Promise<string | undefined> {
  const reqFile = (req as any).file;
  if (!reqFile) return undefined;
  assertPdfMagic(reqFile.buffer);
  const stored = await pdfStorageService.savePdf(reqFile.buffer, reqFile.originalname);
  return stored.uri;
}

/**
 * AI Paper Review & Format Checking Routes
 */
paperRouter.get("/format-presets", paperReviewController.getFormatPresets);
paperRouter.post("/format-check", requireAuth, uploadPaperReviewPdf, paperReviewController.checkFormat);
paperRouter.post("/review", requireAuth, uploadPaperReviewPdf, paperReviewController.reviewPaper);
paperRouter.get("/reviews", requireAuth, paperReviewController.listReviews);
paperRouter.get("/reviews/:id", requireAuth, paperReviewController.getReviewById);
paperRouter.get("/format-checks", requireAuth, paperReviewController.listFormatChecks);

/**
 * GET /papers — keyword search + server-side filters + sort + pagination (with adminView support).
 */
paperRouter.get("/", optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdmin = (req.user?.role as string) === "admin";
    // Admin hitting / with status filter → admin list
    if (isAdmin && req.query.adminView) {
      const status = (req.query.status as string | undefined)?.trim();
      const search = (req.query.search as string | undefined)?.trim();
      const kind = req.query.kind === "pdf" ? "pdf" : "normal";
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
      const { papers, total, normalTotal, pdfTotal } = await paperService.getAllPapersAdmin({
        status,
        search,
        kind,
        page,
        pageSize,
      });
      res.json({
        success: true,
        data: papers,
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), normalTotal, pdfTotal },
      });
      return;
    }

    const parsed = PaperListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const {
      q,
      page,
      pageSize,
      yearFrom,
      yearTo,
      paperKind,
      paperKinds,
      openAccess,
      openAccessStatuses,
      provider,
      providers,
      sources,
      languages,
      citationBands,
      domains,
      fields,
      subfields,
      topics,
      domainIds,
      fieldIds,
      subfieldIds,
      topicIds,
      sort,
    } = parsed.data;
    const { papers, total } = await paperService.list({
      q,
      page,
      pageSize,
      yearFrom,
      yearTo,
      paperKinds: paperKinds ?? paperKind,
      openAccess,
      openAccessStatuses,
      provider,
      providers,
      sources,
      languages,
      citationBands,
      domains,
      fields,
      subfields,
      topics,
      domainIds,
      fieldIds,
      subfieldIds,
      topicIds,
      sort,
    });
    res.json({
      success: true,
      data: papers,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    next(error);
  }
});

/** GET /papers/my-requests — get current user's paper requests. */
paperRouter.get("/my-requests", requireAuth, async (req, res, next) => {
  try {
    if ((req.user!.role as string) === "admin") {
      throw AppError.forbidden("Admins do not have access to My Papers");
    }
    const papers = await paperService.getMyPapers(req.user!.sub);
    res.json({ success: true, data: papers });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /papers/compare — side-by-side comparison of 2-4 papers.
 * Declared BEFORE the `/:id` routes so "compare" is never captured as an :id.
 */
paperRouter.post("/compare", requireAuth, compareLimiter, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = CompareBodySchema.safeParse(req.body);
  if (!parsed.success) {
    next(parsed.error);
    return;
  }
  const data = await comparePapers(parsed.data.paperIds);
  res.json({ success: true, data });
});

/** GET /papers/translation/capabilities — lets the UI hide disabled controls. */
paperRouter.get("/translation/capabilities", paperTranslationController.capabilities);

/** POST /papers/:id/translation — translate title + abstract on demand. */
paperRouter.post(
  "/:id/translation",
  requireAuth,
  translationLimiter,
  validate(TranslatePaperBodySchema),
  paperTranslationController.translate,
);

/** GET /papers/:id/references — references resolved to public in-corpus papers. */
paperRouter.get("/:id/references", optionalAuth, async (req, res) => {
  const data = await paperService.getReferences(String(req.params.id), {
    userId: req.user?.sub,
    role: req.user?.role,
  });
  res.json({ success: true, data });
});

/** GET /papers/:id/edit — authenticated draft/rejected paper data for edit forms. */
paperRouter.get("/:id/edit", requireAuth, async (req, res, next) => {
  try {
    const paper = await paperService.getEditableById(
      String(req.params.id),
      String(req.user!.sub),
      String(req.user!.role),
    );
    res.json({ success: true, data: paper });
  } catch (error) {
    next(error);
  }
});

/** GET /papers/:id — single paper detail. */
/** GET /papers/:id/related — OpenAlex related works resolved to this corpus. */
paperRouter.get("/:id/related", optionalAuth, async (req, res) => {
  const data = await paperService.getRelatedWorks(String(req.params.id), {
    userId: req.user?.sub,
    role: req.user?.role,
  });
  res.json({ success: true, data });
});

/** GET /papers/:id — public active detail, or private owner/admin detail. */
paperRouter.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const paper = await paperService.getById(String(req.params.id), {
      userId: req.user?.sub,
      role: req.user?.role,
    });
    if (!paper) throw AppError.notFound("Paper not found");
    res.json({ success: true, data: paper });
  } catch (error) {
    next(error);
  }
});

// ── Authenticated Routes ─────────────────────────────────────────────────────

/** POST /papers — create a new paper request (charges 100 credits for regular users). */
paperRouter.post("/", requireAuth, uploadSinglePdf, async (req, res, next) => {
  try {
    if ((req.user!.role as string) === "admin") {
      throw AppError.forbidden("Admins are not allowed to submit papers");
    }

    // 1. Parse stringified JSON arrays from multipart/form-data
    try {
      if (typeof req.body.authors === "string") req.body.authors = JSON.parse(req.body.authors);
      if (typeof req.body.keywords === "string") req.body.keywords = JSON.parse(req.body.keywords);
      if (typeof req.body.topics === "string") req.body.topics = JSON.parse(req.body.topics);
    } catch {
      throw AppError.badRequest("Invalid JSON format for authors, keywords, or topics");
    }

    // 2. Validate
    const parsed = CreatePaperSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "));
    }

    // 3. Save PDF file
    const pdfPath = await saveUploadedPdf(req);

    // 4. Create paper request
    const userId = req.user!.sub;
    const isAdmin = (req.user!.role as string) === "admin";
    const paper = await paperService.create(userId, isAdmin, parsed.data, pdfPath);

    // 5. Trigger embedding worker
    triggerEmbedding();

    res.status(201).json({ success: true, data: paper });
  } catch (error) {
    next(error);
  }
});

/** GET /papers/my-requests — must be before /:id to avoid param capture */

/** GET /papers/:id/pdf-url — get a download URL for the PDF (charges credits). */
paperRouter.get("/:id/pdf-url", requireAuth, async (req, res, next) => {
  try {
    const host = req.get("host");
    const baseUrl = `${req.protocol}://${host}`;
    const result = await paperService.getPdfDownloadUrl(
      String(req.params.id),
      String(req.user!.sub),
      String(req.user!.role),
      baseUrl,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/** GET /papers/:id/download — download the PDF using a short-lived query token. */
paperRouter.get("/:id/download", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      throw AppError.unauthorized("Download token is required");
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    } catch {
      throw AppError.unauthorized("Download token is invalid or expired");
    }

    if (decoded.paperId !== id) {
      throw AppError.forbidden("Token is not valid for this paper");
    }

    const pdfPath = await paperService.getPdfStoragePath(id);
    if (!pdfPath) {
      throw AppError.notFound("PDF is not available for this paper");
    }

    const signedUrl = await pdfStorageService.getSignedDownloadUrl(pdfPath);
    if (signedUrl) {
      res.redirect(signedUrl);
      return;
    }

    const filePath = pdfStorageService.resolveLocalPath(pdfPath);
    if (!filePath) {
      throw AppError.notFound("PDF storage object is not available");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

/** POST /papers/:id/upload-pdf — upload a PDF for an existing paper request. */
paperRouter.post("/:id/upload-pdf", requireAuth, uploadSinglePdf, async (req, res, next) => {
  let pdfPath: string | undefined;
  try {
    const paperId = String(req.params.id);
    const uploaderId = String(req.user!.sub);
    const uploaderRole = String(req.user!.role);

    await paperService.assertCanUploadPdf(paperId, uploaderId, uploaderRole);
    pdfPath = await saveUploadedPdf(req);
    if (!pdfPath) throw AppError.badRequest("PDF file is required");

    const paper = await paperService.uploadPdf(
      paperId,
      uploaderId,
      uploaderRole,
      pdfPath,
    );

    res.json({ success: true, data: paper });
  } catch (error) {
    if (pdfPath) {
      await pdfStorageService.deletePdf(pdfPath).catch((cleanupError) => {
        logger.error({ cleanupError, pdfPath }, "Failed to clean up PDF after upload failure");
      });
    }
    next(error);
  }
});

/** PATCH /papers/:id/accept-pdf — requester accepts the PDF. */
paperRouter.patch("/:id/accept-pdf", requireAuth, async (req, res, next) => {
  try {
    const paper = await paperService.acceptPdf(String(req.params.id), String(req.user!.sub));
    triggerEmbedding();
    res.json({ success: true, data: paper });
  } catch (error) {
    next(error);
  }
});

/** PATCH /papers/:id/reject-pdf — requester rejects the uploaded PDF. */
paperRouter.patch("/:id/reject-pdf", requireAuth, async (req, res, next) => {
  try {
    const paper = await paperService.rejectPdf(String(req.params.id), String(req.user!.sub));
    res.json({ success: true, data: paper });
  } catch (error) {
    next(error);
  }
});

/** DELETE /papers/:id/cancel — requester cancels their pending request (refunds credits). */
paperRouter.delete("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    await paperService.cancelRequest(String(req.params.id), String(req.user!.sub));
    res.json({ success: true, message: "Paper request cancelled successfully" });
  } catch (error) {
    next(error);
  }
});

/** PATCH /papers/:id/status — admin updates paper status. */
paperRouter.patch("/:id/status", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body as { status: string; rejectionReason?: string };
    if (!status) throw AppError.badRequest("Status is required");
    const paper = await paperService.updateStatus(String(req.params.id), status, rejectionReason);
    triggerEmbedding();
    res.json({ success: true, data: paper });
  } catch (error) {
    next(error);
  }
});

/** PATCH /papers/:id — admin updates paper details, or user resubmits their rejected paper request. */
paperRouter.patch("/:id", requireAuth, uploadSinglePdf, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const userId = String(req.user!.sub);
    const userRole = String(req.user!.role);
    const isAdmin = userRole === "admin";

    // 1. Parse JSON arrays
    try {
      if (typeof req.body.authors === "string") req.body.authors = JSON.parse(req.body.authors);
      if (typeof req.body.keywords === "string") req.body.keywords = JSON.parse(req.body.keywords);
      if (typeof req.body.topics === "string") req.body.topics = JSON.parse(req.body.topics);
    } catch {
      throw AppError.badRequest("Invalid JSON format for authors, keywords, or topics");
    }

    // 2. Save new PDF file if uploaded
    const pdfPath = await saveUploadedPdf(req);

    let updated: any;
    if (isAdmin) {
      const updateInput = { ...req.body };
      if (pdfPath) {
        updateInput.pdfPath = pdfPath;
        updateInput.uploadedBy = userId;
        updateInput.uploadedAt = new Date();
      }
      updated = await paperService.update(id, updateInput);
    } else {
      updated = await paperService.resubmit(id, userId, req.body, pdfPath);
    }

    triggerEmbedding();
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/** DELETE /papers/:id/pdf — admin deletes paper PDF. */
paperRouter.delete("/:id/pdf", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const paper = await paperService.deletePaperPdf(String(req.params.id));
    res.json({ success: true, data: paper });
  } catch (error) {
    next(error);
  }
});

/** DELETE /papers/:id — requester or admin deletes paper request. */
paperRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    await paperService.deletePaper(String(req.params.id), String(req.user!.sub), String(req.user!.role));
    res.json({ success: true, message: "Paper request deleted successfully" });
  } catch (error) {
    next(error);
  }
});
