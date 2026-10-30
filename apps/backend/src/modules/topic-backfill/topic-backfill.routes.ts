import { Router } from "express";
import { requireAuth, requireSystemRole } from "../../common/middleware/auth.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { validate } from "../../common/middleware/validate.js";
import { env } from "../../config/env.js";
import {
  AdminBackfillRequestSchema, BackfillRunParamsSchema, ListBackfillRunsQuerySchema, SearchBackfillRequestSchema,
} from "./dto/topic-backfill.schema.js";
import { topicBackfillController } from "./topic-backfill.controller.js";

/** Signed-in users: ask for an import from a thin search result and follow its progress. Mounted at /topic-backfill. */
export const topicBackfillRouter: Router = Router();

/** Each request can start an OpenAlex import, so the budget is per user and per hour. */
const requestLimiter = createRateLimiter("topic-backfill-request", {
  windowMs: 60 * 60 * 1000,
  limit: env.TOPIC_BACKFILL_USER_MAX_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? (req.ip || "anonymous"),
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      error: { code: "TOO_MANY_REQUESTS", message: "Import request rate limit exceeded — try again later." },
    }),
});

topicBackfillRouter.use(requireAuth);
topicBackfillRouter.post("/", requestLimiter, validate(SearchBackfillRequestSchema), topicBackfillController.requestFromSearch);
topicBackfillRouter.get("/runs/:id", validate(BackfillRunParamsSchema, "params"), topicBackfillController.getRun);

/** Admins: any catalogue entry including tags, a bigger budget, no thin check, cooldown or daily cap. Mounted at /admin/topic-backfill. */
export const adminTopicBackfillRouter: Router = Router();

adminTopicBackfillRouter.use(requireAuth, requireSystemRole("ADMIN"));
adminTopicBackfillRouter.post("/", validate(AdminBackfillRequestSchema), topicBackfillController.requestFromAdmin);
adminTopicBackfillRouter.get("/runs", validate(ListBackfillRunsQuerySchema, "query"), topicBackfillController.listRuns);
