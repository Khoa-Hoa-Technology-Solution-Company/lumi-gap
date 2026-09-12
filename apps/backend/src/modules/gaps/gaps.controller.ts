import type { Request, Response } from "express";
import { gapsService } from "./gaps.service.js";
import type {
  AnalyzeGapDto,
  PatchGapDto,
  PreviewGapEvidenceDto,
} from "./dto/gaps.schema.js";
import { ListGapsQuerySchema } from "./dto/gaps.schema.js";

/**
 * Research gaps endpoints. All routes sit behind requireAuth, so req.user is
 * set. Validation is handled by validate() middleware in gaps.routes.ts — req.body
 * and req.query are already parsed and typed when these handlers run.
 */
export const gapsController = {
  /** POST /api/v1/gaps/evidence-preview — retrieve evidence without charging credits. */
  async previewEvidence(req: Request<unknown, unknown, PreviewGapEvidenceDto>, res: Response) {
    const data = await gapsService.previewEvidence(req.user!.sub, req.body);
    res.json({ success: true, data });
  },

  /** POST /api/v1/gaps/analyze — 202 Accepted, work happens in the gaps worker. */
  async analyze(req: Request<unknown, unknown, AnalyzeGapDto>, res: Response) {
    const analysisId = await gapsService.enqueue(req.user!.sub, req.body);
    res.status(202).json({ success: true, data: { analysisId } });
  },

  /** GET /api/v1/gaps/analyze/:id — poll the analysis status, owner only. */
  async getAnalysis(req: Request, res: Response) {
    const data = await gapsService.getAnalysis(req.user!.sub, req.params["id"] as string);
    res.json({ success: true, data });
  },

  /** GET /api/v1/gaps/analyze/active — latest queued/analyzing run for resume UX. */
  async getActiveAnalysis(req: Request, res: Response) {
    const data = await gapsService.getActiveAnalysis(req.user!.sub);
    res.json({ success: true, data });
  },

  /** POST /api/v1/gaps/analyze/:id/retry — repeat a failed run with identical inputs. */
  async retryAnalysis(req: Request, res: Response) {
    const analysisId = await gapsService.retryAnalysis(
      req.user!.sub,
      req.params["id"] as string,
    );
    res.status(202).json({ success: true, data: { analysisId } });
  },

  /** GET /api/v1/gaps — paginated, filterable list of gaps. */
  async list(req: Request, res: Response) {
    const parsed = ListGapsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error });
      return;
    }
    const query = parsed.data;
    const { gaps, total } = await gapsService.list(req.user!.sub, query);
    const { page, pageSize } = query;
    res.json({
      success: true,
      data: gaps,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  },

  /** PATCH /api/v1/gaps/:id — resolve / dismiss a gap, owner only. */
  async patch(req: Request, res: Response) {
    const data = await gapsService.patchStatus(req.user!.sub, req.params["id"] as string, req.body as PatchGapDto);
    res.json({ success: true, data });
  },

  /** POST /api/v1/gaps/:id/directions — on-demand AI research-direction suggestions (advisory). */
  async generateDirections(req: Request, res: Response) {
    const data = await gapsService.generateDirections(
      req.user!.sub,
      req.params["id"] as string,
      (req.body as { force?: boolean }).force,
    );
    res.json({ success: true, data });
  },

  /** GET /api/v1/gaps/:id/directions — cached directions (or null). */
  async getDirections(req: Request, res: Response) {
    const data = await gapsService.getDirections(req.user!.sub, req.params["id"] as string);
    res.json({ success: true, data });
  },
};
