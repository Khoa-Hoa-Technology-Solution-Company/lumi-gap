import { Router } from "express";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { env } from "../../config/env.js";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import {
  ActiveGapAnalysisQuerySchema,
  AnalyzeGapSchema,
  PatchGapSchema,
  GapIdParamsSchema,
  DirectionsBodySchema,
  PreviewGapEvidenceSchema,
  GapCandidateSchema,
  GapEvidenceRecordSchema,
  GapValidationSchema,
  ValidationQueueQuerySchema,
  type ValidationQueueQuery,
} from "./dto/gaps.schema.js";
import { gapsController } from "./gaps.controller.js";
import { gapValidationService } from "./gap-validation.service.js";

export const gapsRouter: Router = Router();

// Every gap belongs to a user — auth is mandatory on the whole router.
gapsRouter.use(requireAuth);

/**
 * Per-user throttle for gap analysis. Each /analyze run costs a deep-model call,
 * so this bounds work per hour to keep the team inside the Gemini free-tier quota
 * (mirrors the report-creation limiter).
 */
const analyzeGapLimiter = createRateLimiter("gaps:analyzeGapLimiter", {
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

const evidencePreviewLimiter = createRateLimiter("gaps:evidencePreviewLimiter", {
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
const directionsLimiter = createRateLimiter("gaps:directionsLimiter", {
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
gapsRouter.get("/analyze/active", validate(ActiveGapAnalysisQuerySchema, "query"), gapsController.getActiveAnalysis);
gapsRouter.post(
  "/analyze/:id/retry",
  analyzeGapLimiter,
  validate(GapIdParamsSchema, "params"),
  gapsController.retryAnalysis,
);
gapsRouter.get("/analyze/:id", gapsController.getAnalysis);
gapsRouter.get("/", gapsController.list);
/** Experts (GAP_VALIDATION capability) see gaps whose owners requested validation, minus conflicts of interest. */
gapsRouter.get("/validation-queue", validate(ValidationQueueQuerySchema, "query"), async (req, res) => {
  const query = req.query as unknown as ValidationQueueQuery;
  const { items, total } = await gapValidationService.listValidationQueue(req.user!.sub, query);
  res.json({ success: true, data: items, meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } });
});
gapsRouter.post("/candidates", validate(GapCandidateSchema), async (req, res) => {
  const data = await gapValidationService.createCandidate(req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
});
gapsRouter.post("/:id/request-validation", validate(GapIdParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await gapValidationService.requestValidation(String(req.params.id), req.user!.sub) });
});
gapsRouter.post("/:id/evidence", validate(GapIdParamsSchema, "params"), validate(GapEvidenceRecordSchema), async (req, res) => {
  const data = await gapValidationService.addEvidence(String(req.params.id), req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
});
gapsRouter.get("/:id/evidence", validate(GapIdParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await gapValidationService.getEvidence(String(req.params.id), req.user!.sub) });
});
gapsRouter.post("/:id/validations", validate(GapIdParamsSchema, "params"), validate(GapValidationSchema), async (req, res) => {
  const data = await gapValidationService.addValidation(String(req.params.id), req.user!.sub, req.body);
  res.status(201).json({ success: true, data });
});
gapsRouter.get("/:id/validations", validate(GapIdParamsSchema, "params"), async (req, res) => {
  res.json({ success: true, data: await gapValidationService.getValidations(String(req.params.id), req.user!.sub) });
});
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
