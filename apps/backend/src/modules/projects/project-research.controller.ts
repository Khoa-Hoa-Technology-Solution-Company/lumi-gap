import type { Request, Response } from "express";
import { AppError } from "../../common/exceptions/app-error.js";
import { researchPageSchema } from "./dto/project-research.schema.js";
import { projectEvidenceService as evidence } from "./project-evidence.service.js";
import { projectScreeningService as screening } from "./project-screening.service.js";
import { projectSourcesService as sources } from "./project-sources.service.js";
import { projectGapResearchService as gaps } from "./project-gap-research.service.js";
const id = (req: Request) => String(req.params.id), item = (req: Request) => String(req.params.itemId), actor = (req: Request) => req.user!.sub;
const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
export const projectResearchController = {
  suggestions: async (req: Request, res: Response) => send(res, await evidence.suggestions(id(req), actor(req), item(req))),
  library: async (req: Request, res: Response) => send(res, await screening.library(id(req), actor(req), researchPageSchema.parse(req.query))),
  policy: async (req: Request, res: Response) => send(res, await screening.policy(id(req), actor(req), req.body)),
  assign: async (req: Request, res: Response) => send(res, await screening.assign(id(req), actor(req), item(req), req.body)),
  vote: async (req: Request, res: Response) => send(res, await screening.vote(id(req), actor(req), item(req), req.body)),
  resolve: async (req: Request, res: Response) => send(res, await screening.resolve(id(req), actor(req), item(req), req.body)),
  screeningHistory: async (req: Request, res: Response) => send(res, await screening.history(id(req), actor(req), item(req))),
  import: async (req: Request, res: Response) => send(res, await sources.import(id(req), actor(req), req.body), 201),
  organize: async (req: Request, res: Response) => send(res, await sources.organize(id(req), actor(req), item(req), req.body)),
  upload: async (req: Request, res: Response) => { const file = (req as Request & { file?: { buffer: Buffer } }).file; if (!file) throw AppError.badRequest("Choose a legally held PDF"); return send(res, await sources.upload(id(req), actor(req), item(req), file.buffer), 201); },
  file: async (req: Request, res: Response) => { const file = await sources.file(id(req), actor(req), item(req)); res.set({ "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="research-source.pdf"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }); return res.send(Buffer.from(file.content)); },
  evidence: async (req: Request, res: Response) => send(res, await evidence.list(id(req), actor(req), researchPageSchema.parse(req.query))),
  createEvidence: async (req: Request, res: Response) => send(res, await evidence.create(id(req), actor(req), req.body), 201),
  editEvidence: async (req: Request, res: Response) => send(res, await evidence.update(id(req), actor(req), item(req), req.body)),
  reviewEvidence: async (req: Request, res: Response) => send(res, await evidence.review(id(req), actor(req), item(req), req.body)),
  evidenceHistory: async (req: Request, res: Response) => send(res, await evidence.history(id(req), actor(req), item(req))),
  gap: async (req: Request, res: Response) => send(res, await gaps.detail(id(req), actor(req), item(req))),
  guidance: async (req: Request, res: Response) => send(res, await gaps.guidance(id(req), actor(req), item(req), req.body)),
  reviseGap: async (req: Request, res: Response) => send(res, await gaps.revise(id(req), actor(req), item(req), req.body)),
  assessGap: async (req: Request, res: Response) => send(res, await gaps.assess(id(req), actor(req), item(req), req.body)),
  linkGap: async (req: Request, res: Response) => send(res, await gaps.link(id(req), actor(req), item(req), req.body)),
  deriveQuestion: async (req: Request, res: Response) => send(res, await gaps.derive(id(req), actor(req), item(req), req.body)),
};
