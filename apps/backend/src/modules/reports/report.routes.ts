import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { requireAuth } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { reportController } from "./report.controller.js";
import { PaperIdParamSchema } from "./dto/report.schema.js";

export const reportRouter: Router = Router();

/** Public: count AI reports that cite a specific paper. No auth needed. */
reportRouter.get(
  "/paper/:paperId/count",
  validate(PaperIdParamSchema, "params"),
  reportController.countByPaper
);

// Every report belongs to a user — auth is mandatory on the whole router.
reportRouter.use(requireAuth);

/**
 * Per-user throughput throttle for report creation. The pending-count guard in
 * the service bounds CONCURRENT work; this bounds work per hour so one account
 * can't drain the team's daily Gemini quota by submit-wait-submit looping.
 */
const createReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.REPORT_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? (req.ip || "anonymous"),
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Report creation rate limit exceeded — try again later.",
      },
    }),
});

reportRouter.post("/", createReportLimiter, reportController.create);
reportRouter.post("/evidence-preview", reportController.previewEvidence);
reportRouter.get("/", reportController.list);
reportRouter.get("/:id", reportController.getById);
reportRouter.delete("/", reportController.deleteBatch);
reportRouter.delete("/:id", reportController.deleteById);
