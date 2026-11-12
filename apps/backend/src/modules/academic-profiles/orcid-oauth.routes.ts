import type { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { validate } from "../../common/middleware/validate.js";
import { orcidStartSchema, orcidCallbackSchema } from "./dto/orcid-oauth.schema.js";
import { orcidOauthService, orcidOAuthService } from "./orcid-oauth.service.js";
import { OrcidConnectStartSchema } from "./dto/academic-profile.schema.js";
import { resolveOAuthReturnOrigin } from "../auth/google-oidc.service.js";

export function mountOrcidOauthRoutes(router: Router) {
  const limiter = createRateLimiter("academic-profile:orcid-oauth", { windowMs: 60000, max: 10, keyGenerator: req => req.user!.sub });
  router.use("/me/orcid", requireAuth, (_req, res, next) => { res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }); next(); });
  router.get("/me/orcid", async (req, res) => { res.json({ success: true, data: await orcidOAuthService.status(req.user!.sub) }); });
  router.post("/me/orcid/start", limiter, validate(orcidStartSchema), async (req, res) => { res.json({ success: true, data: await orcidOauthService.start(req.user!.sub, req.user!.sessionId) }); });
  router.post("/me/orcid/connect", limiter, validate(OrcidConnectStartSchema), async (req, res) => { res.json({ success: true, data: await orcidOAuthService.start(req.user!.sub, req.user!.sessionId, req.body) }); });
  router.get("/me/orcid/connect", limiter, validate(OrcidConnectStartSchema, "query"), async (req, res) => { res.json({ success: true, data: await orcidOAuthService.start(req.user!.sub, req.user!.sessionId, req.query) }); });
  router.post("/me/orcid/callback", limiter, validate(orcidCallbackSchema), async (req, res) => {
    const result = await orcidOauthService.callback(req.user!.sub, req.user!.sessionId, req.body);
    res.json({ success: true, data: { ...result, ...(result.cancelled ? {} : { link: result.identity, returnTo: "/profile" }) } });
  });
  router.delete("/me/orcid", limiter, async (req, res) => { res.json({ success: true, data: await orcidOAuthService.disconnect(req.user!.sub) }); });
  // A provider redirect never links an account anonymously. The frontend resumes
  // the original session and completes the same single-use authenticated flow.
  router.get("/orcid/callback", validate(orcidCallbackSchema, "query"), (req, res) => {
    const target = new URL("/integrations/orcid/callback", resolveOAuthReturnOrigin());
    for (const key of ["state", "code", "error"] as const) if (typeof req.query[key] === "string") target.searchParams.set(key, req.query[key]);
    res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
    res.redirect(302, target.href);
  });
}
