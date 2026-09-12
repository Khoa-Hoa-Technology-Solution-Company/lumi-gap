import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import {
  AnalyzeGapSchema,
  ListGapsQuerySchema,
  PatchGapSchema,
  GapIdParamsSchema,
  DirectionsBodySchema,
  PreviewGapEvidenceSchema,
} from "./dto/gaps.schema.js";
import { gapsController } from "./gaps.controller.js";

export const gapsRouter: Router = Router();

// Every gap belongs to a user — auth is mandatory on the whole router.
gapsRouter.use(requireAuth);

/**
 * Per-user throttle for gap analysis. Each /analyze run costs a deep-model call,
 * so this bounds work per hour to keep the team inside the Gemini free-tier quota
 * (mirrors the report-creation limiter).
 */
const analyzeGapLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.GAPS_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? (req.ip || "anonymous"),
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Gap analysis rate limit exceeded — try again later.",
      },
    }),
});

const evidencePreviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Math.max(env.GAPS_MAX_PER_HOUR * 5, 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? (req.ip || "anonymous"),
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Evidence preview rate limit exceeded — try again later.",
      },
    }),
});

/** Per-user throttle for the directions LLM call — protects the Gemini free-tier quota. */
const directionsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.DIRECTIONS_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? (req.ip || "anonymous"),
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Direction suggestion rate limit exceeded — try again later.",
      },
    }),
});

gapsRouter.post(
  "/evidence-preview",
  evidencePreviewLimiter,
  validate(PreviewGapEvidenceSchema),
  gapsController.previewEvidence,
);
gapsRouter.post("/analyze", analyzeGapLimiter, validate(AnalyzeGapSchema), gapsController.analyze);
gapsRouter.get("/analyze/active", gapsController.getActiveAnalysis);
gapsRouter.post(
  "/analyze/:id/retry",
  analyzeGapLimiter,
  validate(GapIdParamsSchema, "params"),
  gapsController.retryAnalysis,
);
gapsRouter.get("/analyze/:id", gapsController.getAnalysis);
gapsRouter.get("/", gapsController.list);
gapsRouter.patch("/:id", validate(PatchGapSchema), gapsController.patch);
gapsRouter.post(
  "/:id/directions",
  directionsLimiter,
  validate(GapIdParamsSchema, "params"),
  validate(DirectionsBodySchema),
  gapsController.generateDirections,
);
gapsRouter.get(
  "/:id/directions",
  validate(GapIdParamsSchema, "params"),
  gapsController.getDirections,
);
