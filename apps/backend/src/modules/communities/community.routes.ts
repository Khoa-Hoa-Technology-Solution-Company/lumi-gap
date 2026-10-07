import { Router } from "express";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { env } from "../../config/env.js";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";
import { requirePermission } from "../../common/middleware/permission.js";
import { validate } from "../../common/middleware/validate.js";
import { communityController } from "./community.controller.js";
import {
  communityCreateSchema,
  communityStatusSchema,
  communityUpdateSchema,
  idParamsSchema,
  listQuerySchema,
  lookupParamsSchema,
  memberParamsSchema,
  reviewSchema,
  suggestQuerySchema,
  transferOwnershipSchema,
  updateMemberSchema,
} from "./dto/community.schema.js";

export const communityRouter: Router = Router();

/** Every uncached query costs one Gemini embedding call, so throttle per user (or IP when anonymous). */
const suggestionLimiter = createRateLimiter("communities:suggestionLimiter", {
  windowMs: 60 * 1000,
  limit: env.COMMUNITY_SUGGEST_MAX_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Community suggestion limit exceeded. Try again shortly." },
    }),
});

communityRouter.get("/", optionalAuth, validate(listQuerySchema, "query"), communityController.list);
communityRouter.post("/", requireAuth, validate(communityCreateSchema), communityController.create);
communityRouter.get("/facets", optionalAuth, communityController.facets);
communityRouter.get("/recommendations", requireAuth, communityController.recommendations);
communityRouter.get("/suggestions", optionalAuth, suggestionLimiter, validate(suggestQuerySchema, "query"), communityController.suggestions);
communityRouter.get("/:idOrSlug", optionalAuth, validate(lookupParamsSchema, "params"), communityController.get);
communityRouter.patch("/:id", requireAuth, validate(idParamsSchema, "params"), validate(communityUpdateSchema), communityController.update);
communityRouter.patch("/:id/status", requireAuth, validate(idParamsSchema, "params"), validate(communityStatusSchema), communityController.setStatus);
communityRouter.post("/:id/resubmit", requireAuth, validate(idParamsSchema, "params"), communityController.resubmit);
communityRouter.post("/:id/transfer-ownership", requireAuth, validate(idParamsSchema, "params"), validate(transferOwnershipSchema), communityController.transferOwnership);
communityRouter.get("/:id/members/public", optionalAuth, validate(idParamsSchema, "params"), communityController.publicMembers);
communityRouter.get("/:id/related-papers", optionalAuth, validate(idParamsSchema, "params"), communityController.relatedPapers);
communityRouter.get("/:id/related-gaps", optionalAuth, validate(idParamsSchema, "params"), communityController.relatedGaps);
communityRouter.post("/:id/review", requireAuth, validate(idParamsSchema, "params"), validate(reviewSchema), communityController.review);
communityRouter.post("/:id/join", requireAuth, requirePermission("community:join"), validate(idParamsSchema, "params"), communityController.join);
communityRouter.delete("/:id/membership", requireAuth, validate(idParamsSchema, "params"), communityController.leave);
communityRouter.post("/:id/summary", requireAuth, requirePermission("ai-run:create"), validate(idParamsSchema, "params"), communityController.requestSummary);
communityRouter.get("/:id/summary", requireAuth, validate(idParamsSchema, "params"), communityController.summaryStatus);
communityRouter.get("/:id/members", requireAuth, validate(idParamsSchema, "params"), communityController.listMembers);
communityRouter.patch("/:id/members/:userId", requireAuth, validate(memberParamsSchema, "params"), validate(updateMemberSchema), communityController.updateMember);
