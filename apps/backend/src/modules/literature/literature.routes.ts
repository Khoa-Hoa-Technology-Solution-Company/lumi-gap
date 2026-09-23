import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { literatureService } from "./literature.service.js";
import { addCorpusPaperSchema, corpusIdParamsSchema, corpusPaperParamsSchema, createCorpusSchema } from "./literature.schema.js";

export const literatureRouter: Router = Router();
literatureRouter.use(requireAuth);

literatureRouter.get("/corpora", async (req, res) => {
  res.json({ success: true, data: await literatureService.list(req.user!.sub) });
});
literatureRouter.post("/corpora", validate(createCorpusSchema), async (req, res) => {
  const data = await literatureService.create(req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
});
literatureRouter.get("/corpora/:id", validate(corpusIdParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await literatureService.detail(String(req.params.id), req.user!.sub) });
});
literatureRouter.post("/corpora/:id/papers", validate(corpusIdParamsSchema, "params"), validate(addCorpusPaperSchema), async (req, res) => {
  const data = await literatureService.addPaper(String(req.params.id), req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
});
literatureRouter.delete("/corpora/:id/papers/:paperId", validate(corpusPaperParamsSchema, "params"), async (req, res) => {
  await literatureService.removePaper(String(req.params.id), String(req.params.paperId), req.user!.sub);
  res.json({ success: true, data: { deleted: true } });
});
literatureRouter.get("/corpora/:id/evidence-map", validate(corpusIdParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await literatureService.evidenceMap(String(req.params.id), req.user!.sub) });
});
