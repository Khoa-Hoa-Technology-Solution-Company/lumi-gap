import type { Request, Response } from "express";
import type { QualityTargetKind } from "@trend/shared-types";
import { qualityService } from "./quality.service.js";
import { qualityJobs } from "./quality.jobs.js";
import { getPaperReadingContext } from "./quality.reading-context.js";
import type { EvaluateInput, RateInput, ReadingContextQueryInput, ViewQueryInput } from "./dto/quality.schema.js";

export const qualityController = {
  async evaluate(req: Request<unknown, unknown, EvaluateInput>, res: Response) {
    const data = await qualityJobs.start(req.user!.sub, req.body);
    res.status(data.status === "completed" ? 200 : 202).json({ success: true, data });
  },

  async evaluationJob(req: Request<{ jobId: string }>, res: Response) {
    const data = await qualityJobs.get(req.user!.sub, req.params.jobId);
    res.json({ success: true, data });
  },

  async rate(req: Request<unknown, unknown, RateInput>, res: Response) {
    const data = await qualityService.rate(req.user!.sub, req.body);
    res.json({ success: true, data });
  },

  async view(req: Request<{ targetKind: string; targetId: string }>, res: Response) {
    const { language = "en", projectId } = req.query as ViewQueryInput;
    const kind = req.params.targetKind as QualityTargetKind;
    // view() checks project membership before anything project-scoped is read.
    const data = await qualityService.view(req.user!.sub, kind, req.params.targetId, { projectId, language });
    data.evaluationTask = await qualityJobs.active(req.user!.sub, kind, req.params.targetId, language);
    if (projectId) data.projectEvaluationTask = await qualityJobs.active(req.user!.sub, kind, req.params.targetId, language, projectId);
    res.json({ success: true, data });
  },

  async readingContext(req: Request<{ paperId: string }>, res: Response) {
    const data = await getPaperReadingContext(req.params.paperId, req.query as ReadingContextQueryInput);
    res.json({ success: true, data });
  },

  async deleteRate(req: Request<{ ratingId: string }>, res: Response) {
    const data = await qualityService.deleteRate(
      req.user!.sub,
      req.params.ratingId,
    );
    res.json({ success: true, data });
  },

  async agreement(_req: Request, res: Response) {
    const data = await qualityService.agreement();
    res.json({ success: true, data });
  },
};
