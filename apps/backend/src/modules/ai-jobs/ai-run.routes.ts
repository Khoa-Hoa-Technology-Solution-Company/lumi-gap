import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/middleware/auth.js";
import { requirePermission } from "../../common/middleware/permission.js";
import { validate } from "../../common/middleware/validate.js";
import { objectIdSchema } from "../../common/validation/database-id.js";
import { AI_JOB_TYPES, aiRunService } from "./ai-run.service.js";

const paramsSchema = z.object({ id: objectIdSchema });
const createSchema = z.object({
  jobType: z.enum(AI_JOB_TYPES),
  projectId: objectIdSchema.optional(),
  workspaceId: objectIdSchema.optional(),
  prompt: z.string().trim().min(1).max(10000).optional(),
  evidenceIds: z.array(objectIdSchema).max(200).optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
}).refine((value) => Boolean(value.prompt?.trim() || value.evidenceIds?.length), {
  message: "An AI run requires a prompt or at least one evidence ID",
});

export const aiRunRouter: Router = Router();
aiRunRouter.use(requireAuth);

aiRunRouter.post("/", requirePermission("ai-run:create"), validate(createSchema), async (req, res) => {
  const data = await aiRunService.createAiRun(req.body, req.user!.sub, req.user!.role);
  res.status(202).json({ success: true, data });
});
aiRunRouter.get("/:id", requirePermission("ai-run:read"), validate(paramsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await aiRunService.get(String(req.params.id), req.user!.sub, req.user!.role) });
});
aiRunRouter.post("/:id/retry", requirePermission("ai-run:create"), validate(paramsSchema, "params"), async (req, res) => {
  res.status(202).json({ success: true, data: await aiRunService.retryAiJob(String(req.params.id), req.user!.sub, req.user!.role) });
});
aiRunRouter.post("/:id/cancel", requirePermission("ai-run:create"), validate(paramsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await aiRunService.cancelAiJob(String(req.params.id), req.user!.sub, req.user!.role) });
});
