import { Router } from "express";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { env } from "../../config/env.js";
import { requireResearchWorkflow } from "../authorization/authorization.middleware.js";
import { closureController } from "./closure.controller.js";
import {
  CalibrationParamsSchema,
  CalibrationQuestionParamsSchema,
  CheckDocumentParamsSchema,
  CheckParamsSchema,
  CreateCalibrationQuestionSchema,
  CreateClosureCalibrationSchema,
  CreateCoverageCheckSchema,
  DecideGapClosureSchema,
  DossierQuerySchema,
  GapChecksParamsSchema,
  ListCoverageChecksQuerySchema,
  ReviewClosureDocumentSchema,
  StartGapClosureCheckSchema,
} from "./dto/closure.schema.js";

export const closureRouter: Router = Router();

closureRouter.use(requireAuth, requireResearchWorkflow);

/** Shared by starting a check (credits + AI + OpenAlex) and coverage checks (OpenAlex lookups): per user, per hour. */
const startLimiter = createRateLimiter("gap-closure-start", {
  windowMs: 60 * 60 * 1000,
  limit: Math.max(env.GAPS_MAX_PER_HOUR * 2, 10),
  keyGenerator: (req) => req.user?.sub ?? (req.ip || "anonymous"),
  handler: (_req, res) =>
    res.status(429).json({ success: false, error: { code: "TOO_MANY_REQUESTS", message: "Closure check rate limit exceeded — try again later." } }),
});

// Checks of a gap
closureRouter.post("/gaps/:gapId/checks", startLimiter, validate(GapChecksParamsSchema, "params"), validate(StartGapClosureCheckSchema), closureController.startCheck);
closureRouter.get("/gaps/:gapId/checks", validate(GapChecksParamsSchema, "params"), closureController.listGapChecks);

// One check
closureRouter.get("/checks/:checkId", validate(CheckParamsSchema, "params"), closureController.getCheck);
closureRouter.get("/checks/:checkId/dossier", validate(CheckParamsSchema, "params"), validate(DossierQuerySchema, "query"), closureController.dossier);
closureRouter.patch("/checks/:checkId/documents/:docId", validate(CheckDocumentParamsSchema, "params"), validate(ReviewClosureDocumentSchema), closureController.reviewDocument);
closureRouter.post("/checks/:checkId/decide", validate(CheckParamsSchema, "params"), validate(DecideGapClosureSchema), closureController.decide);

// Coverage
closureRouter.post("/coverage-checks", startLimiter, validate(CreateCoverageCheckSchema), closureController.createCoverageCheck);
closureRouter.get("/coverage-checks", validate(ListCoverageChecksQuerySchema, "query"), closureController.listCoverageChecks);

// Calibration
closureRouter.post("/calibrations", validate(CreateClosureCalibrationSchema), closureController.createCalibration);
closureRouter.get("/calibrations", closureController.listCalibrations);
closureRouter.get("/calibrations/:id", validate(CalibrationParamsSchema, "params"), closureController.getCalibration);
closureRouter.post("/calibrations/:id/questions", validate(CalibrationParamsSchema, "params"), validate(CreateCalibrationQuestionSchema), closureController.addCalibrationQuestion);
closureRouter.delete("/calibrations/:id/questions/:questionId", validate(CalibrationQuestionParamsSchema, "params"), closureController.deleteCalibrationQuestion);
closureRouter.post("/calibrations/:id/run", validate(CalibrationParamsSchema, "params"), closureController.runCalibration);
closureRouter.post("/calibrations/:id/compute", validate(CalibrationParamsSchema, "params"), closureController.computeCalibration);
