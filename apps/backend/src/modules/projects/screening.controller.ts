import { libraryAssessmentService as library } from "./library-assessment.service.js";
import { projectAnalysisSetService as sets } from "./project-analysis-set.service.js";
import type { Request, Response } from "express";
import { screeningService as service } from "./screening.service.js";
import { screeningAiService as ai } from "./screening-ai.service.js";
import { screeningPageSchema, screeningHistorySchema } from "./dto/screening.schema.js";
const project = (r: Request) => String(r.params.id), actor = (r: Request) => r.user!.sub, round = (r: Request) => String(r.params.roundId);
const send = (r: Response, data: unknown, status = 200) => r.status(status).json({ success: true, data });
export const screeningController = {
  assess: async (r: Request, res: Response) => send(res, await library.assess(project(r), actor(r), String(r.params.paperId), r.body)),
  defer: async (r: Request, res: Response) => send(res, await library.defer(project(r), actor(r), round(r), r.body)),
  createSet: async (r: Request, res: Response) => send(res, await sets.create(project(r), actor(r), r.body), 201),
  getSet: async (r: Request, res: Response) => send(res, await sets.get(project(r), actor(r), String(r.params.setId))),
  listSets: async (r: Request, res: Response) => send(res, await sets.list(project(r), actor(r), screeningPageSchema.parse(r.query).page)),
  config: async (r: Request, res: Response) => send(res, await service.config(project(r), actor(r))),
  configure: async (r: Request, res: Response) => send(res, await service.configure(project(r), actor(r), r.body)),
  board: async (r: Request, res: Response) => send(res, await service.board(project(r), actor(r), screeningPageSchema.parse(r.query))),
  start: async (r: Request, res: Response) => send(res, await service.start(project(r), actor(r), r.body)),
  assign: async (r: Request, res: Response) => send(res, await service.assign(project(r), actor(r), r.body)),
  detail: async (r: Request, res: Response) => send(res, await service.detail(project(r), actor(r), round(r))),
  submit: async (r: Request, res: Response) => send(res, await service.submit(project(r), actor(r), round(r), r.body)),
  resolve: async (r: Request, res: Response) => send(res, await service.resolve(project(r), actor(r), round(r), r.body)),
  finalizer: async (r: Request, res: Response) => send(res, await service.finalizer(project(r), actor(r), round(r), r.body)),
  proposal: async (r: Request, res: Response) => send(res, await service.proposal(project(r), actor(r), String(r.params.paperId), r.body)),
  reopen: async (r: Request, res: Response) => send(res, await service.reopen(project(r), actor(r), round(r), r.body)),
  unblind: async (r: Request, res: Response) => send(res, await service.unblind(project(r), actor(r), round(r), r.body)),
  comment: async (r: Request, res: Response) => send(res, await service.comment(project(r), actor(r), round(r), r.body)),
  history: async (r: Request, res: Response) => { const query = screeningHistorySchema.parse(r.query); return send(res, await service.history(project(r), actor(r), round(r), query.page, query.kind)); },
  rounds: async (r: Request, res: Response) => send(res, await service.rounds(project(r), actor(r), String(r.params.paperId), screeningPageSchema.parse(r.query).page)),
  analytics: async (r: Request, res: Response) => send(res, await service.analytics(project(r), actor(r))),
  ai: async (r: Request, res: Response) => send(res, await ai.get(project(r), actor(r), round(r))),
  requestAi: async (r: Request, res: Response) => send(res, await ai.request(project(r), actor(r), round(r), r.body.clientKey), 202),
};
