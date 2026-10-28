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

/**
 * Trend reads are public and each new scope spends OpenAlex credits from the daily budget shared with sync; once it
 * runs low every user falls back to the local corpus. Throttled per account (signed in) or IP.
 */
const readLimiter = createRateLimiter("trends:readLimiter", {
  windowMs: 60 * 1000,
  limit: env.TREND_READ_MAX_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Too many trend requests. Try again in a minute." },
    }),
});
const throttledRead = [optionalAuth, readLimiter];

trendRouter.get("/", ...throttledRead, trendController.overview);
trendRouter.get("/periods", ...throttledRead, trendController.periods);
trendRouter.get("/compare", ...throttledRead, trendController.compare);
trendRouter.get("/topic-candidates", ...throttledRead, trendController.topicCandidates);
trendRouter.get("/relationships", ...throttledRead, trendController.relationships);
trendRouter.get("/explain/history", requireAuth, trendController.explainHistory);
trendRouter.get("/follows", requireAuth, trendController.listFollows);
trendRouter.get("/follows/check", requireAuth, trendController.checkFollow);
trendRouter.post("/follows", requireAuth, trendController.createFollow);
trendRouter.delete("/follows/:id", requireAuth, trendController.deleteFollow);
// optionalAuth runs first so the limiter keys signed-in users by account rather than IP.
trendRouter.post("/explain", optionalAuth, explainLimiter, trendController.explain);
trendRouter.get("/:topic", ...throttledRead, trendController.topic);
