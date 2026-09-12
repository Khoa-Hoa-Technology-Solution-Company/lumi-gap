import type { NextFunction, Request, Response } from "express";
import { reportService } from "./report.service.js";
import {
  BatchDeleteSchema,
  CreateReportSchema,
  ListReportsQuerySchema,
  PreviewReportEvidenceSchema,
} from "./dto/report.schema.js";

/**
 * Reports endpoints. All routes sit behind requireAuth, so req.user is set.
 * Query is parsed inline (Express 5 makes req.query a read-only getter).
 */
export const reportController = {
  /** POST /api/v1/reports — 202 Accepted, work happens in the report worker. */
  async create(req: Request, res: Response, next: NextFunction) {
    const parsed = CreateReportSchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await reportService.create(req.user!.sub, parsed.data);
    res.status(202).json({ success: true, data });
  },

  /** POST /api/v1/reports/evidence-preview — returns the exact evidence pack order. */
  async previewEvidence(req: Request, res: Response, next: NextFunction) {
    const parsed = PreviewReportEvidenceSchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const data = await reportService.previewEvidence(req.user!.sub, parsed.data);
    res.json({ success: true, data });
  },

  /** GET /api/v1/reports — the caller's reports, light list. */
  async list(req: Request, res: Response, next: NextFunction) {
    const parsed = ListReportsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    const { page, pageSize } = parsed.data;
    const { reports, total } = await reportService.list(req.user!.sub, parsed.data);
    res.json({
      success: true,
      data: reports,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  },

  /** GET /api/v1/reports/:id — full report, owner only. */
  async getById(req: Request, res: Response) {
    const data = await reportService.getById(req.user!.sub, req.params.id as string);
    res.json({ success: true, data });
  },

  /** DELETE /api/v1/reports/:id — delete a single report. */
  async deleteById(req: Request, res: Response) {
    await reportService.deleteById(req.user!.sub, req.params.id as string);
    res.json({ success: true, message: "Report deleted successfully" });
  },

  /** DELETE /api/v1/reports — batch delete reports. */
  async deleteBatch(req: Request, res: Response, next: NextFunction) {
    const parsed = BatchDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
      return;
    }

    await reportService.deleteBatch(req.user!.sub, parsed.data.ids);
    res.json({ success: true, message: "Reports deleted successfully" });
  },

  /** GET /api/v1/reports/paper/:paperId/count — public, no auth. */
  async countByPaper(req: Request, res: Response) {
    const count = await reportService.countByPaper(req.params.paperId as string);
    res.json({ success: true, data: { count } });
  },
};
