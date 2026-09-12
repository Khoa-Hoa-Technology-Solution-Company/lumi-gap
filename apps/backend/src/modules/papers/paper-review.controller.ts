import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/exceptions/app-error.js";
import { paperReviewService } from "./paper-review.service.js";

export const paperReviewController = {
  /**
   * GET /api/v1/papers/format-presets
   */
  async getFormatPresets(_req: Request, res: Response, next: NextFunction) {
    try {
      const presets = await paperReviewService.getFormatPresets();
      res.json({ success: true, data: presets });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/papers/format-check
   */
  async checkFormat(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file;
      if (!file) {
        throw AppError.badRequest("Vui lòng tải lên file PDF");
      }

      const presetName = (req.body.presetName as string) || "IEEE Conference · A4";
      const result = await paperReviewService.checkFormat({
        userId: req.user!.sub,
        fileBuffer: file.buffer,
        fileName: file.originalname,
        presetName,
      });

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/papers/review
   */
  async reviewPaper(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file;
      if (!file) {
        throw AppError.badRequest("Vui lòng tải lên file PDF bài báo");
      }

      const strictness = (req.body.strictness as "lenient" | "balanced" | "strict") || "balanced";
      const usePersonalKey = req.body.usePersonalKey === "true" || req.body.usePersonalKey === true;

      const result = await paperReviewService.reviewPaper({
        userId: req.user!.sub,
        fileBuffer: file.buffer,
        fileName: file.originalname,
        strictness,
        usePersonalKey,
      });

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/papers/reviews
   */
  async listReviews(req: Request, res: Response, next: NextFunction) {
    try {
      const reviews = await paperReviewService.getReviewHistory(req.user!.sub);
      res.json({ success: true, data: reviews });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/papers/reviews/:id
   */
  async getReviewById(req: Request, res: Response, next: NextFunction) {
    try {
      const review = await paperReviewService.getReviewById(req.user!.sub, String(req.params.id));
      res.json({ success: true, data: review });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/papers/format-checks
   */
  async listFormatChecks(req: Request, res: Response, next: NextFunction) {
    try {
      const history = await paperReviewService.getFormatHistory(req.user!.sub);
      res.json({ success: true, data: history });
    } catch (err) {
      next(err);
    }
  },
};
