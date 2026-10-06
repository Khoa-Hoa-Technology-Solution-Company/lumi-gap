import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { z } from "zod";
import { AiConnectionDraftSchema, SaveAiConnectionSchema, AiPreferenceSchema } from "./user-ai.schema.js";
import { userAiService } from "./user-ai.service.js";

export const userAiRouter = Router();
userAiRouter.use(requireAuth);
userAiRouter.get("/", async (req, res) => { res.json({ success: true, data: await userAiService.list(req.user!.sub) }); });
userAiRouter.post("/models", validate(AiConnectionDraftSchema), async (req, res) => {
  res.json({ success: true, data: await userAiService.models(req.user!.sub, req.body) });
});
userAiRouter.post("/connections", validate(SaveAiConnectionSchema), async (req, res) => {
  res.json({ success: true, data: await userAiService.save(req.user!.sub, req.body) });
});
userAiRouter.put("/active", validate(AiPreferenceSchema), async (req, res) => {
  res.json({ success: true, data: await userAiService.activate(req.user!.sub, req.body.connectionId) });
});
userAiRouter.delete("/connections/:id", async (req, res) => {
  await userAiService.remove(req.user!.sub, z.string().uuid().parse(req.params.id));
  res.json({ success: true });
});
