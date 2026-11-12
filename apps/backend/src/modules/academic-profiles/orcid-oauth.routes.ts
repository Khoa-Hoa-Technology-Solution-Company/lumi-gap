import type { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { validate } from "../../common/middleware/validate.js";
import { orcidStartSchema, orcidCallbackSchema } from "./dto/orcid-oauth.schema.js";
import { orcidOauthService } from "./orcid-oauth.service.js";

export function mountOrcidOauthRoutes(router: Router) {
  const limiter = createRateLimiter("academic-profile:orcid-oauth", { windowMs: 60000, max: 10, keyGenerator: req => req.user!.sub });
  router.use("/me/orcid", requireAuth, (_req, res, next) => { res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }); next(); });
  router.get("/me/orcid", (_req, res) => { res.json({ success: true, data: orcidOauthService.availability() }); });
  router.post("/me/orcid/start", limiter, validate(orcidStartSchema), async (req, res) => { res.json({ success: true, data: await orcidOauthService.start(req.user!.sub, req.user!.sessionId) }); });
  router.post("/me/orcid/callback", limiter, validate(orcidCallbackSchema), async (req, res) => { res.json({ success: true, data: await orcidOauthService.callback(req.user!.sub, req.user!.sessionId, req.body) }); });
}
