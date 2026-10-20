import type { Request, Response } from "express";
import { calibrationService } from "./calibration.service.js";
import { closureService } from "./closure.service.js";
import { coverageService } from "./coverage.service.js";
import type {
  CreateCalibrationQuestionDto,
  CreateClosureCalibrationDto,
  CreateCoverageCheckDto,
  DecideGapClosureDto,
  DossierQuery,
  ListCoverageChecksQuery,
  ReviewClosureDocumentDto,
  StartGapClosureCheckDto,
} from "./dto/closure.schema.js";

type Params = Record<string, string>;
const param = (req: Request, name: string) => String(req.params[name]);

/**
 * Gap Closure Protocol endpoints. Thin: validation happens in closure.routes.ts (validate()), rules and access
 * checks live in the services. Every response uses the { success, data, meta? } envelope.
 */
export const closureController = {
  /** POST /gaps/:gapId/checks — 202, the work happens in the gaps worker. */
  async startCheck(req: Request<Params, unknown, StartGapClosureCheckDto>, res: Response) {
    const data = await closureService.startCheck(req.user!.sub, param(req, "gapId"), req.body);
    res.status(202).json({ success: true, data });
  },
  async listGapChecks(req: Request, res: Response) {
    res.json({ success: true, data: await closureService.listGapChecks(req.user!.sub, param(req, "gapId")) });
  },
  async getCheck(req: Request, res: Response) {
    res.json({ success: true, data: await closureService.getCheck(req.user!.sub, param(req, "checkId")) });
  },
  async reviewDocument(req: Request<Params, unknown, ReviewClosureDocumentDto>, res: Response) {
    res.json({ success: true, data: await closureService.reviewDocument(req.user!.sub, param(req, "checkId"), param(req, "docId"), req.body) });
  },
  async decide(req: Request<Params, unknown, DecideGapClosureDto>, res: Response) {
    res.json({ success: true, data: await closureService.decide(req.user!.sub, param(req, "checkId"), req.body) });
  },
  /** GET /checks/:checkId/dossier?format=json|markdown */
  async dossier(req: Request, res: Response) {
    const { format } = req.query as unknown as DossierQuery;
    const data = format === "markdown"
      ? await closureService.getDossierMarkdown(req.user!.sub, param(req, "checkId"))
      : await closureService.getDossier(req.user!.sub, param(req, "checkId"));
    res.json({ success: true, data });
  },

  async createCoverageCheck(req: Request<Params, unknown, CreateCoverageCheckDto>, res: Response) {
    res.status(201).json({ success: true, data: await coverageService.create(req.user!.sub, req.body) });
  },
  async listCoverageChecks(req: Request, res: Response) {
    res.json({ success: true, data: await coverageService.list(req.user!.sub, req.query as unknown as ListCoverageChecksQuery) });
  },

  async createCalibration(req: Request<Params, unknown, CreateClosureCalibrationDto>, res: Response) {
    res.status(201).json({ success: true, data: await calibrationService.create(req.user!.sub, req.body) });
  },
  async listCalibrations(_req: Request, res: Response) {
    res.json({ success: true, data: await calibrationService.list() });
  },
  async getCalibration(req: Request, res: Response) {
    res.json({ success: true, data: await calibrationService.get(param(req, "id")) });
  },
  async addCalibrationQuestion(req: Request<Params, unknown, CreateCalibrationQuestionDto>, res: Response) {
    res.status(201).json({ success: true, data: await calibrationService.addQuestion(req.user!.sub, param(req, "id"), req.body) });
  },
  async deleteCalibrationQuestion(req: Request, res: Response) {
    await calibrationService.deleteQuestion(req.user!.sub, param(req, "id"), param(req, "questionId"));
    res.json({ success: true, data: null });
  },
  async runCalibration(req: Request, res: Response) {
    res.json({ success: true, data: await calibrationService.run(req.user!.sub, param(req, "id")) });
  },
  async computeCalibration(req: Request, res: Response) {
    res.json({ success: true, data: await calibrationService.compute(req.user!.sub, param(req, "id")) });
  },
};
