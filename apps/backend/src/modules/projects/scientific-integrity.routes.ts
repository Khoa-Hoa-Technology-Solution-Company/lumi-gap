import { Router } from "express";
import { z } from "zod";
import { validate } from "../../common/middleware/validate.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { workspaceParams } from "./dto/project-workspace.schema.js";
import {
  scientificIntegrityService,
  verifyCitationSchema,
  declareExternalAiSchema,
  updateMemberCreditSchema,
  confirmCreditSchema,
  updateAuthorshipSchema,
  confirmAuthorshipSchema,
} from "./scientific-integrity.service.js";

export const scientificIntegrityRouter = Router({ mergeParams: true });

const params = validate(workspaceParams, "params");
const declarationParams = validate(
  workspaceParams.extend({ declarationId: z.string().uuid() }),
  "params",
);

const integrityLimiter = createRateLimiter("projects:integrity-writes", {
  windowMs: 60 * 60 * 1000,
  limit: 120,
  keyGenerator: (req) => req.user!.sub,
});

scientificIntegrityRouter.get("/overview", params, async (req, res) => {
  const data = await scientificIntegrityService.getOverview(req.params.id as string, req.user!.sub);
  res.json({ success: true, data });
});

scientificIntegrityRouter.post(
  "/citations/verify",
  integrityLimiter,
  params,
  validate(verifyCitationSchema),
  async (req, res) => {
    const data = await scientificIntegrityService.verifyCitation(req.params.id as string, req.user!.sub, req.body);
    res.json({ success: true, data });
  },
);

scientificIntegrityRouter.post(
  "/ai-declarations",
  integrityLimiter,
  params,
  validate(declareExternalAiSchema),
  async (req, res) => {
    const data = await scientificIntegrityService.declareExternalAi(req.params.id as string, req.user!.sub, req.body);
    res.json({ success: true, data });
  },
);

scientificIntegrityRouter.delete(
  "/ai-declarations/:declarationId",
  integrityLimiter,
  declarationParams,
  async (req, res) => {
    const data = await scientificIntegrityService.deleteExternalAi(req.params.id as string, req.user!.sub, req.params.declarationId as string);
    res.json({ success: true, data });
  },
);

scientificIntegrityRouter.put(
  "/credit",
  integrityLimiter,
  params,
  validate(updateMemberCreditSchema),
  async (req, res) => {
    const data = await scientificIntegrityService.updateMemberCredit(req.params.id as string, req.user!.sub, req.body);
    res.json({ success: true, data });
  },
);

scientificIntegrityRouter.post(
  "/credit/confirm",
  integrityLimiter,
  params,
  validate(confirmCreditSchema),
  async (req, res) => {
    const data = await scientificIntegrityService.confirmCredit(req.params.id as string, req.user!.sub, req.body);
    res.json({ success: true, data });
  },
);

scientificIntegrityRouter.put(
  "/authorship",
  integrityLimiter,
  params,
  validate(updateAuthorshipSchema),
  async (req, res) => {
    const data = await scientificIntegrityService.updateAuthorship(req.params.id as string, req.user!.sub, req.body);
    res.json({ success: true, data });
  },
);

scientificIntegrityRouter.post(
  "/authorship/confirm",
  integrityLimiter,
  params,
  validate(confirmAuthorshipSchema),
  async (req, res) => {
    const data = await scientificIntegrityService.confirmAuthorship(req.params.id as string, req.user!.sub, req.body);
    res.json({ success: true, data });
  },
);
