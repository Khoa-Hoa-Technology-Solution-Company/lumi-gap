import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { AiConnectionDraftSchema, AiPreferenceSchema, SavePlatformAiConnectionSchema, SavePlatformEmbeddingConnectionSchema } from "./user-ai.schema.js";
import { platformAiService } from "./platform-ai.service.js";
import { platformEmbeddingService } from "./platform-embedding.service.js";

/** Mounted at /admin/ai-connections: the platform-wide AI and embedding connections, admins only. */
export const platformAiRouter: Router = Router();
platformAiRouter.use(requireAuth, requireSystemRole("ADMIN"));
platformAiRouter.get("/", async (_req, res) => { res.json({ success: true, data: await platformAiService.list() }); });
platformAiRouter.post("/models", validate(AiConnectionDraftSchema), async (req, res) => {
  res.json({ success: true, data: await platformAiService.models(req.body) });
});
platformAiRouter.post("/connections", validate(SavePlatformAiConnectionSchema), async (req, res) => {
  res.json({ success: true, data: await platformAiService.save(req.user!.sub, req.body) });
});
platformAiRouter.put("/active", validate(AiPreferenceSchema), async (req, res) => {
  res.json({ success: true, data: await platformAiService.activate(req.user!.sub, req.body.connectionId) });
});
platformAiRouter.delete("/connections/:id", async (req, res) => {
  await platformAiService.remove(req.user!.sub, z.string().uuid().parse(req.params.id));
  res.json({ success: true });
});
platformAiRouter.get("/embedding", async (_req, res) => { res.json({ success: true, data: await platformEmbeddingService.list() }); });
platformAiRouter.post("/embedding/connections", validate(SavePlatformEmbeddingConnectionSchema), async (req, res) => {
  res.json({ success: true, data: await platformEmbeddingService.save(req.user!.sub, req.body) });
});
platformAiRouter.put("/embedding/active", validate(AiPreferenceSchema), async (req, res) => {
  res.json({ success: true, data: await platformEmbeddingService.activate(req.user!.sub, req.body.connectionId) });
});
platformAiRouter.delete("/embedding/connections/:id", async (req, res) => {
  await platformEmbeddingService.remove(req.user!.sub, z.string().uuid().parse(req.params.id));
  res.json({ success: true });
});
