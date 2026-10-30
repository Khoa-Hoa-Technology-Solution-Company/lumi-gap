import type { Request, Response } from "express";
import type { z } from "zod";
import { contributionEvaluationService as service } from "./contribution-evaluation.service.js";
import type { evaluationBoardSchema } from "./dto/contribution-evaluation.schema.js";
import { manuscriptWritingService } from "../workspaces/manuscript-writing.service.js";
const project = (r: Request) => String(r.params.id), actor = (r: Request) => r.user!.sub, item = (r: Request) => String(r.params.itemId);
const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
export const contributionEvaluationController = {
  writingSuggestions: async (r: Request, s: Response) => send(s, await manuscriptWritingService.linked(project(r), actor(r), String(r.query.contributionIds).split(","))),
  rules: async (r: Request, s: Response) => send(s, await service.rules(project(r), actor(r))),
  createRule: async (r: Request, s: Response) => send(s, await service.createRule(project(r), actor(r), r.body), 201),
  board: async (r: Request, s: Response) => send(s, await service.board(project(r), actor(r), r.query as unknown as z.infer<typeof evaluationBoardSchema>)),
  propose: async (r: Request, s: Response) => send(s, await service.propose(project(r), actor(r), r.body), 201),
  detail: async (r: Request, s: Response) => send(s, await service.detail(project(r), actor(r), item(r))),
  decide: async (r: Request, s: Response) => send(s, await service.decide(project(r), actor(r), item(r), r.body)),
  requestRun: async (r: Request, s: Response) => send(s, await service.requestRun(project(r), actor(r), r.body), 202),
  run: async (r: Request, s: Response) => send(s, await service.run(project(r), actor(r), item(r))),
  snapshots: async (r: Request, s: Response) => send(s, await service.snapshots(project(r), actor(r), r.query as unknown as z.infer<typeof evaluationBoardSchema>)),
  snapshot: async (r: Request, s: Response) => send(s, await service.snapshot(project(r), actor(r), item(r))),
};
