import { Router } from "express";
import { env } from "../../config/env.js";
import { optionalAuth, requireAuth } from "../../common/middleware/auth.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { trendController } from "./trend.controller.js";

export const trendRouter: Router = Router();

/** Explain is open to anonymous users and each new scope is an uncached LLM call, so throttle per user (or IP). */
const explainLimiter = createRateLimiter("trends:explainLimiter", {
  windowMs: 60 * 60 * 1000,
  limit: env.TREND_EXPLAIN_MAX_PER_HOUR,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Trend explanation limit exceeded. Try again later." },
    }),
});

trendRouter.get("/", trendController.overview);
trendRouter.get("/periods", trendController.periods);
trendRouter.get("/compare", trendController.compare);
trendRouter.get("/topic-candidates", trendController.topicCandidates);
trendRouter.get("/relationships", trendController.relationships);
trendRouter.get("/explain/history", requireAuth, trendController.explainHistory);
trendRouter.get("/follows", requireAuth, trendController.listFollows);
trendRouter.get("/follows/check", requireAuth, trendController.checkFollow);
trendRouter.post("/follows", requireAuth, trendController.createFollow);
trendRouter.delete("/follows/:id", requireAuth, trendController.deleteFollow);
// optionalAuth runs first so the limiter keys signed-in users by account rather than IP.
trendRouter.post("/explain", optionalAuth, explainLimiter, trendController.explain);
trendRouter.get("/:topic", trendController.topic);
