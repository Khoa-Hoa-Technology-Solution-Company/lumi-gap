import type { Request, Response } from "express";
import type { FeasibilityTargetKind } from "@trend/shared-types";
import { matrixQuerySchema } from "./dto/project-literature.schema.js";
import { projectFeasibilityService as feasibility } from "./project-feasibility.service.js";
import { projectLimitationService as limitations } from "./project-limitation.service.js";
import { projectMatrixService as matrix } from "./project-matrix.service.js";

const id = (req: Request) => String(req.params.id), item = (req: Request) => String(req.params.itemId), actor = (req: Request) => req.user!.sub;
const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const target = (req: Request) => ({ kind: String(req.params.targetKind) as FeasibilityTargetKind, targetId: String(req.params.targetId) });

/** Literature matrix, limitation identification and feasibility: thin HTTP handlers. */
export const projectLiteratureController = {
  matrix: async (req: Request, res: Response) => { res.set("Cache-Control", "private, no-store"); return send(res, await matrix.matrix(id(req), actor(req), matrixQuerySchema.parse(req.query))); },
  criteria: async (req: Request, res: Response) => send(res, await matrix.criteria(id(req), actor(req))),
  createCriterion: async (req: Request, res: Response) => send(res, await matrix.createCriterion(id(req), actor(req), req.body), 201),
  updateCriterion: async (req: Request, res: Response) => send(res, await matrix.updateCriterion(id(req), actor(req), item(req), req.body)),
  archiveCriterion: async (req: Request, res: Response) => send(res, await matrix.archiveCriterion(id(req), actor(req), item(req), req.body)),
  reorderCriteria: async (req: Request, res: Response) => send(res, await matrix.reorderCriteria(id(req), actor(req), req.body)),

  limitations: async (req: Request, res: Response) => send(res, await limitations.list(id(req), actor(req))),
  createLimitation: async (req: Request, res: Response) => send(res, await limitations.create(id(req), actor(req), req.body), 201),
  updateLimitation: async (req: Request, res: Response) => send(res, await limitations.update(id(req), actor(req), item(req), req.body)),
  limitationStatus: async (req: Request, res: Response) => send(res, await limitations.setStatus(id(req), actor(req), item(req), req.body)),
  promoteLimitation: async (req: Request, res: Response) => send(res, await limitations.promote(id(req), actor(req), item(req), req.body), 201),

  feasibility: async (req: Request, res: Response) => { const { kind, targetId } = target(req); return send(res, await feasibility.get(id(req), actor(req), kind, targetId)); },
  saveFeasibility: async (req: Request, res: Response) => { const { kind, targetId } = target(req); return send(res, await feasibility.save(id(req), actor(req), kind, targetId, req.body)); },
};
