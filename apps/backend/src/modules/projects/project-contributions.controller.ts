import type { Request, Response } from "express";
import type { z } from "zod";
import { contributionActivityService as activity } from "./contribution-activity.service.js";
import { workContributionsService as work } from "./work-contributions.service.js";
import { allocationService as allocation } from "./allocation.service.js";
import { contributionProtectionService as protection } from "./contribution-protection.service.js";
import type { activitySchema, contributionsPageSchema } from "./dto/project-contributions.schema.js";
const id = (req: Request) => String(req.params.id), item = (req: Request) => String(req.params.itemId), actor = (req: Request) => req.user!.sub;
const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
export const projectContributionsController = {
  activity: async (req: Request, res: Response) => send(res, await activity.list(id(req), actor(req), req.query as unknown as z.infer<typeof activitySchema>)),
  list: async (req: Request, res: Response) => send(res, await work.list(id(req), actor(req), req.query as unknown as z.infer<typeof contributionsPageSchema>)),
  detail: async (req: Request, res: Response) => send(res, await work.detail(id(req), actor(req), item(req))),
  create: async (req: Request, res: Response) => send(res, await work.save(id(req), actor(req), req.body), 201),
  edit: async (req: Request, res: Response) => send(res, await work.save(id(req), actor(req), req.body, item(req))),
  submitWork: async (req: Request, res: Response) => send(res, await work.submit(id(req), actor(req), item(req), req.body.expectedVersion)),
  review: async (req: Request, res: Response) => send(res, await work.review(id(req), actor(req), item(req), req.body)),
  periods: async (req: Request, res: Response) => send(res, await allocation.periods(id(req), actor(req))),
  createPeriod: async (req: Request, res: Response) => send(res, await allocation.createPeriod(id(req), actor(req), req.body), 201),
  period: async (req: Request, res: Response) => send(res, await allocation.period(id(req), actor(req), item(req))),
  history: async (req: Request, res: Response) => send(res, await allocation.history(id(req), actor(req), item(req))),
  draft: async (req: Request, res: Response) => send(res, await allocation.draft(id(req), actor(req), item(req), req.body), 201),
  editDraft: async (req: Request, res: Response) => send(res, await allocation.edit(id(req), actor(req), item(req), req.body)),
  submitDraft: async (req: Request, res: Response) => send(res, await allocation.submit(id(req), actor(req), item(req), req.body.expectedVersion)),
  revision: async (req: Request, res: Response) => send(res, await allocation.detail(id(req), actor(req), item(req))),
  decide: async (req: Request, res: Response) => send(res, await allocation.decide(id(req), actor(req), item(req), req.body)),
  challenge: async (req: Request, res: Response) => send(res, await allocation.challenge(id(req), actor(req), item(req), req.body)),
  export: async (req: Request, res: Response) => { res.setHeader("Content-Disposition", `attachment; filename="allocation-${item(req)}.json"`); return send(res, await allocation.export(id(req), actor(req), item(req))); },
  myHistory: async (req: Request, res: Response) => send(res, await protection.getMyContributionHistory(id(req), actor(req))),
  exportMyHistory: async (req: Request, res: Response) => { res.setHeader("Content-Disposition", `attachment; filename="my-contributions-${id(req)}.json"`); return send(res, await protection.exportMyContributionHistory(id(req), actor(req))); },
  advisorContributions: async (req: Request, res: Response) => send(res, await protection.listAdvisorContributions(id(req), actor(req))),
};
