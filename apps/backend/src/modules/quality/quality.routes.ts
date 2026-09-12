import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { qualityController } from "./quality.controller.js";
import { EvaluateSchema, RateSchema, TargetParamsSchema } from "./dto/quality.schema.js";

/**
 * Quality & Feedback routes. All require auth. `/evaluate` fires a Gemini
 * generate call, so it is throttled per user; `/agreement` is admin-only.
 */
const evalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.QUALITY_EVAL_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Evaluation rate limit exceeded — try again later." },
    }),
});

// Throttle /rate too — without it (and after the rating doc became upsert) a script
// could still hammer the endpoint to farm points across many targets or DoS the DB.
const rateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60, // generous for genuine rating; blocks spam/farming loops
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anonymous",
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Rating rate limit exceeded — try again later." },
    }),
});

export const qualityRouter: Router = Router();

qualityRouter.use(requireAuth);

qualityRouter.get("/agreement", requireRole("admin"), qualityController.agreement);
qualityRouter.post("/evaluate", evalLimiter, validate(EvaluateSchema), qualityController.evaluate);
qualityRouter.post("/rate", rateLimiter, validate(RateSchema), qualityController.rate);
qualityRouter.get("/:targetKind/:targetId", validate(TargetParamsSchema, "params"), qualityController.view);
qualityRouter.delete("/rate/:ratingId", qualityController.deleteRate);
