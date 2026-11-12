import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { researchCatalogService } from "./research-catalog.service.js";

const querySchema = z.object({ q: z.string().trim().max(120).default(""), level: z.enum(["domain", "field", "subfield", "topic", "keyword", "skill"]).default("topic"), parentId: z.string().uuid().optional(), ids: z.string().max(1200).regex(/^[a-f0-9,-]*$/i).optional() }).strict();
export const researchCatalogRouter: Router = Router();
researchCatalogRouter.use(requireAuth, createRateLimiter("research-catalog:read", { windowMs: 60_000, limit: 120, keyGenerator: req => req.user!.sub, standardHeaders: true, legacyHeaders: false }));
researchCatalogRouter.get("/", validate(querySchema, "query"), async (req, res) => {
  res.json({ success: true, data: await researchCatalogService.search(querySchema.parse(req.query)) });
});
